
from pathlib import Path
import re
import unicodedata

SOURCE = Path("apps/web/src/app/(dashboard)/merchant/actions.ts")
OUTPUT = SOURCE.with_name("actions.repaired.ts")

# Build a reversible Windows-1252 character-to-byte map.
cp1252_reverse = {}

for byte in range(256):
    try:
        character = bytes([byte]).decode("cp1252")
    except UnicodeDecodeError:
        character = chr(byte)

    cp1252_reverse[character] = byte

# Only examine non-ASCII runs containing common mojibake markers.
suspect_markers = re.compile(r"[ÙØðâÃÂ]")
non_ascii_runs = re.compile(r"[^\x00-\x7F]+")

source_bytes = SOURCE.read_bytes()
original = source_bytes.decode("utf-8")

changes = []

def repair(match):
    chunk = match.group()

    if not suspect_markers.search(chunk):
        return chunk

    try:
        raw = bytes(cp1252_reverse[ch] for ch in chunk)
        decoded = raw.decode("utf-8")
    except (KeyError, UnicodeDecodeError):
        return chunk

    # Only accept a result containing Arabic or Unicode symbols.
    valid_result = any(
        "\u0600" <= ch <= "\u06FF"
        or unicodedata.category(ch) == "So"
        for ch in decoded
    )

    if not valid_result:
        return chunk

    changes.append((chunk, decoded))
    return decoded

repaired = non_ascii_runs.sub(repair, original)

if not changes:
    print("No recoverable mojibake sequences found.")
    raise SystemExit(0)

OUTPUT.write_bytes(repaired.encode("utf-8"))

print(f"Recovered sequences: {len(changes)}")
print(f"Review file: {OUTPUT}")

print("\nFirst 20 replacements:")
for before, after in changes[:20]:
    print(f"\nBEFORE: {before}")
    print(f"AFTER:  {after}")
