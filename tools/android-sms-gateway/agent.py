#!/usr/bin/env python3
"""TajerTrack Android SIM SMS gateway agent (Termux + Termux:API).

This phone is a replaceable transport device. TajerTrack owns the order queue
and deduplication; this script only claims and submits one tracking-link SMS.
"""

import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("TAJERTRACK_BASE_URL", "https://tajertrack.vercel.app").rstrip("/")
DEVICE_TOKEN = os.environ.get("TAJERTRACK_DEVICE_TOKEN", "").strip()
POLL_SECONDS = max(5, int(os.environ.get("TAJERTRACK_POLL_SECONDS", "10")))
DB_PATH = Path(os.environ.get("TAJERTRACK_SMS_DB", str(Path.home() / ".tajertrack_sms_gateway.sqlite3")))
CLAIM_PATH = "/api/internal/sms-gateway/claim"
REPORT_PATH = "/api/internal/sms-gateway/report"


class GatewayError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def api_post(path, payload):
    data = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        BASE_URL + path,
        data=data,
        headers={
            "Authorization": "Bearer " + DEVICE_TOKEN,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "TajerTrack-Android-SMSGateway/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise GatewayError("HTTP %s: %s" % (error.code, detail), error.code)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise GatewayError("Network error: %s" % error)


def open_database():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DB_PATH), timeout=20)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS sms_jobs (
            job_id TEXT PRIMARY KEY,
            attempt_count INTEGER NOT NULL,
            state TEXT NOT NULL,
            reported INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        )
    """)
    connection.commit()
    return connection


def set_local_state(db, job_id, attempt_count, state, reported=False):
    db.execute(
        """INSERT INTO sms_jobs(job_id, attempt_count, state, reported, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(job_id) DO UPDATE SET
             attempt_count=excluded.attempt_count,
             state=excluded.state,
             reported=excluded.reported,
             updated_at=excluded.updated_at""",
        (job_id, attempt_count, state, 1 if reported else 0, int(time.time())),
    )
    db.commit()


def report_state(db, job_id, attempt_count, state, error=None):
    try:
        api_post(REPORT_PATH, {"jobId": job_id, "status": state, "error": error})
        set_local_state(db, job_id, attempt_count, state, reported=True)
        return True
    except GatewayError as error:
        print("[gateway] Result report pending: %s" % error)
        set_local_state(db, job_id, attempt_count, state, reported=False)
        if error.status == 401:
            raise
        return False


def reconcile_unreported(db):
    rows = db.execute(
        "SELECT job_id, attempt_count, state FROM sms_jobs WHERE reported = 0 ORDER BY updated_at ASC LIMIT 100"
    ).fetchall()
    for job_id, attempt_count, state in rows:
        # If the process died while the Android command was in flight, there is
        # no safe way to know whether the network accepted it. Never resend it.
        if state == "sending":
            state = "unknown"
            set_local_state(db, job_id, attempt_count, state, reported=False)
        report_state(db, job_id, attempt_count, state)


def send_job(db, job):
    job_id = job.get("id")
    phone = job.get("phone")
    message = job.get("message")
    attempt_count = int(job.get("attemptCount") or 1)

    if not job_id or not phone or not message:
        print("[gateway] Ignoring malformed job.")
        return

    previous = db.execute(
        "SELECT attempt_count, state, reported FROM sms_jobs WHERE job_id = ?",
        (job_id,),
    ).fetchone()

    if previous and int(previous[0]) >= attempt_count:
        previous_attempt, previous_state, reported = previous
        if not reported:
            state = "unknown" if previous_state == "sending" else previous_state
            report_state(db, job_id, previous_attempt, state)
        return

    # Persist 'sending' BEFORE invoking Android. A crash after this point is
    # reconciled as unknown rather than blindly sending the same SMS again.
    set_local_state(db, job_id, attempt_count, "sending", reported=False)

    try:
        result = subprocess.run(
            ["termux-sms-send", "-n", phone, message],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if result.returncode == 0:
            print("[gateway] Android accepted SMS submission for job %s." % job_id)
            report_state(db, job_id, attempt_count, "submitted")
        else:
            detail = (result.stderr or result.stdout or "termux-sms-send exited with code %s" % result.returncode).strip()
            print("[gateway] Android SMS command failed: %s" % detail)
            report_state(db, job_id, attempt_count, "failed", detail[:500])
    except subprocess.TimeoutExpired:
        print("[gateway] SMS command timed out; outcome is unknown, so it will not be resent automatically.")
        report_state(db, job_id, attempt_count, "unknown", "termux-sms-send timed out; delivery outcome is unknown.")
    except FileNotFoundError:
        print("[gateway] termux-sms-send is missing. Install Termux:API and run: pkg install termux-api")
        report_state(db, job_id, attempt_count, "failed", "termux-sms-send command not found; install Termux:API.")


def acquire_wake_lock():
    try:
        subprocess.run(["termux-wake-lock"], capture_output=True, timeout=5, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("[gateway] termux-wake-lock unavailable; Android may suspend polling while idle.")


def main():
    if not DEVICE_TOKEN or len(DEVICE_TOKEN) < 32:
        print("Set TAJERTRACK_DEVICE_TOKEN to the 32+ character secret configured in Vercel.")
        return 2
    if not BASE_URL.startswith("https://"):
        print("TAJERTRACK_BASE_URL must be an HTTPS URL.")
        return 2

    db = open_database()
    acquire_wake_lock()
    print("[gateway] TajerTrack Android SMS gateway is running.")
    print("[gateway] Backend: %s | Poll interval: %ss | Local journal: %s" % (BASE_URL, POLL_SECONDS, DB_PATH))

    try:
        while True:
            try:
                reconcile_unreported(db)
                response = api_post(CLAIM_PATH, {})
                job = response.get("job")
                if job:
                    send_job(db, job)
                else:
                    time.sleep(POLL_SECONDS)
            except GatewayError as error:
                print("[gateway] %s" % error)
                if error.status == 401:
                    print("[gateway] Device token rejected. Stopping to avoid repeated unauthorized requests.")
                    return 3
                if error.status == 503:
                    time.sleep(max(POLL_SECONDS, 20))
                else:
                    time.sleep(POLL_SECONDS)
            except KeyboardInterrupt:
                print("\n[gateway] Stopping.")
                return 0
            except Exception as error:
                print("[gateway] Unexpected error: %s" % error)
                time.sleep(POLL_SECONDS)
    finally:
        try:
            subprocess.run(["termux-wake-unlock"], capture_output=True, timeout=5, check=False)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        db.close()


if __name__ == "__main__":
    sys.exit(main())
