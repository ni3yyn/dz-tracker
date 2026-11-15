'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  completeYalidineCompanionPairing,
  createYalidineCompanionPairingChallenge,
  disconnectYalidineWebhook,
  getYalidineCompanionStatus,
  getYalidineWebhookStatus,
  recordYalidineCompanionHeartbeat,
  prepareYalidineWebhookEndpoint,
  requestYalidineApiSync,
  saveYalidineApiCredentials,
  saveYalidineWebhookSecret,
  setYalidineWebhookTestMode,
} from './yalidine-actions';
import {
  activateCompanionPairing,
  getCompanionPresence,
  signCompanionPairing,
  signCompanionProof,
} from '../../../lib/yalidine-companion-client';

type Status = {
  prepared: boolean;
  connected: boolean;
  apiConnected: boolean;
  lastApiSyncAt: string | null;
  apiLastError: string | null;
  apiSyncRequestedAt: string | null;
  endpointUrl: string | null;
  connectedAt: string | null;
  lastWebhookReceivedAt: string | null;
  lastWebhookProcessedAt: string | null;
  testMode: boolean;
  lastError: string | null;
};

const emptyStatus: Status = {
  prepared: false,
  connected: false,
  apiConnected: false,
  lastApiSyncAt: null,
  apiLastError: null,
  apiSyncRequestedAt: null,
  endpointUrl: null,
  connectedAt: null,
  lastWebhookReceivedAt: null,
  lastWebhookProcessedAt: null,
  testMode: false,
  lastError: null,
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ar-DZ')
  : 'لم يصل بعد';

export function YalidineConnectionPanel() {
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [apiId, setApiId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncingApi, setSyncingApi] = useState(false);
  const [activeRefreshRequestedAt, setActiveRefreshRequestedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [companion, setCompanion] = useState<{ installed: boolean; paired: boolean; installationId: string | null; version: string | null; note: string }>({ installed: false, paired: false, installationId: null, version: null, note: '' });
  const [checkingCompanion, setCheckingCompanion] = useState(true);
  const [pairingCompanion, setPairingCompanion] = useState(false);

  useEffect(() => {
    let active = true;
    async function inspectCompanion() {
      setCheckingCompanion(true);
      try {
        const presence = await getCompanionPresence();
        if (!active) return;
        if (!presence?.installationId) {
          setCompanion({ installed: false, paired: false, installationId: null, version: null, note: '' });
          return;
        }

        const serverState = await getYalidineCompanionStatus(presence.installationId);
        if (!active) return;
        if (!serverState.success) {
          setCompanion({
            installed: true,
            paired: false,
            installationId: presence.installationId,
            version: presence.version || null,
            note: serverState.error || 'تعذر التحقق من ربط الإضافة.',
          });
          return;
        }

        if (!serverState.paired) {
          setCompanion({
            installed: true,
            paired: false,
            installationId: presence.installationId,
            version: presence.version || null,
            note: 'الإضافة مثبتة، لكنها غير مربوطة بهذا المتجر.',
          });
          return;
        }

        const proof = await signCompanionProof('status');
        const heartbeat = await recordYalidineCompanionHeartbeat(proof);
        if (!active) return;
        setCompanion({
          installed: true,
          paired: Boolean(heartbeat.success && heartbeat.installationId === presence.installationId),
          installationId: presence.installationId,
          version: presence.version || serverState.version || null,
          note: heartbeat.success ? 'تم التحقق من الإضافة وتوقيعها بنجاح.' : (heartbeat.error || 'تعذر التحقق من توقيع الإضافة.'),
        });
      } catch (error: any) {
        if (!active) return;
        setCompanion({
          installed: false,
          paired: false,
          installationId: null,
          version: null,
          note: error?.message || 'لم يتم العثور على إضافة TajerTrack Companion.',
        });
      } finally {
        if (active) setCheckingCompanion(false);
      }
    }
    void inspectCompanion();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getYalidineWebhookStatus()
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setStatus(result.status);
          if (result.status.apiSyncRequestedAt) {
            setActiveRefreshRequestedAt(result.status.apiSyncRequestedAt);
          }
        } else {
          setMessage(result.error || 'تعذر تحميل حالة الربط.');
          setMessageIsError(true);
        }
      })
      .catch(() => {
        if (active) {
          setMessage('تعذر تحميل حالة الربط. حدّث الصفحة وحاول مجدداً.');
          setMessageIsError(true);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activeRefreshRequestedAt) return;

    setSyncingApi(true);
    let active = true;
    let requestInFlight = false;
    const refreshStatus = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const result = await getYalidineWebhookStatus();
        if (!active || !result.success) return;

        setStatus(result.status);
        if (result.status.apiSyncRequestedAt) return;

        const requestedAtMs = Date.parse(activeRefreshRequestedAt);
        const completedAtMs = Date.parse(result.status.lastApiSyncAt || '');
        const completedSuccessfully =
          Number.isFinite(requestedAtMs) &&
          Number.isFinite(completedAtMs) &&
          completedAtMs >= requestedAtMs;

        if (completedSuccessfully) {
          setMessage('اكتمل تحديث Guepex وتم تطبيق تحديثات الطلبات وسجل الحالات.');
          setMessageIsError(false);
        } else {
          const detail = result.status.apiLastError;
          setMessage(detail
            ? 'فشل تحديث Guepex: ' + detail
            : 'انتهى طلب التحديث دون تسجيل مزامنة ناجحة. راجع سجل العامل وحاول مجدداً.');
          setMessageIsError(true);
        }

        setSyncingApi(false);
        setActiveRefreshRequestedAt(null);
      } catch {
        // Keep showing the pending state; the next poll will retry.
      } finally {
        requestInFlight = false;
      }
    };

    void refreshStatus();
    const timer = window.setInterval(() => { void refreshStatus(); }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeRefreshRequestedAt]);

  async function handlePairCompanion() {
    setPairingCompanion(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const presence = await getCompanionPresence();
      if (!presence?.installationId) throw new Error('لم يتم العثور على إضافة TajerTrack Companion.');
      const challengeResult = await createYalidineCompanionPairingChallenge();
      if (!challengeResult.success || !challengeResult.challenge || !challengeResult.merchantId) {
        throw new Error(challengeResult.error || 'تعذر إنشاء طلب ربط الإضافة.');
      }

      const signed = await signCompanionPairing(challengeResult.challenge, challengeResult.merchantId);
      if (signed.installationId !== presence.installationId) {
        throw new Error('تغيّر تثبيت الإضافة أثناء عملية الربط. أعد المحاولة.');
      }
      const completed = await completeYalidineCompanionPairing({
        installationId: signed.installationId,
        publicKey: signed.publicKey,
        signature: signed.signature,
        challenge: challengeResult.challenge,
        version: signed.version,
      });
      if (!completed.success) throw new Error(completed.error || 'تعذر إكمال ربط الإضافة.');

      const activated = await activateCompanionPairing(challengeResult.merchantId);
      if (!activated?.success) throw new Error('تم حفظ الربط، لكن تعذر تفعيل الإضافة. أعد تحميل الصفحة وتحقق من حالتها.');

      const proof = await signCompanionProof('status');
      const heartbeat = await recordYalidineCompanionHeartbeat(proof);
      if (!heartbeat.success) throw new Error(heartbeat.error || 'تم الربط لكن فشل التحقق الأخير من الإضافة.');

      setCompanion({
        installed: true,
        paired: true,
        installationId: signed.installationId,
        version: signed.version || null,
        note: 'الإضافة مثبتة ومربوطة بهذا المتجر.',
      });
      setMessage('تم ربط TajerTrack Companion بنجاح. يمكنك الآن ربط Guepex API وWebhook.');
      setMessageIsError(false);
    } catch (error: any) {
      setCompanion((current) => ({ ...current, paired: false, note: error?.message || 'تعذر ربط الإضافة.' }));
      setMessage(error?.message || 'تعذر ربط إضافة TajerTrack Companion.');
      setMessageIsError(true);
    } finally {
      setPairingCompanion(false);
    }
  }

  async function getVerifiedCompanionProof(purpose: string) {
    if (!companion.installed || !companion.paired) {
      throw new Error('ثبّت إضافة TajerTrack Companion واربطها بهذا المتجر أولاً.');
    }
    const proof = await signCompanionProof(purpose);
    if (proof.installationId !== companion.installationId) {
      setCompanion((current) => ({ ...current, paired: false, note: 'تغيّر تثبيت الإضافة. أعد التحقق والربط.' }));
      throw new Error('تثبيت الإضافة الحالي لا يطابق التثبيت المربوط. أعد التحقق من الإضافة.');
    }
    return proof;
  }

  async function handleRefreshApi() {
    if (!status.apiConnected || syncingApi) return;
    setSyncingApi(true);
    setMessage('');
    setMessageIsError(false);

    try {
      const result = await requestYalidineApiSync();
      if (!result.success || !result.requestedAt) {
        setSyncingApi(false);
        setMessage(result.error || 'تعذر طلب تحديث Guepex.');
        setMessageIsError(true);
        return;
      }

      setActiveRefreshRequestedAt(result.requestedAt);
      setStatus((current) => ({
        ...current,
        apiSyncRequestedAt: result.requestedAt!,
        apiLastError: null,
      }));
      setMessage('تم إرسال طلب التحديث. سيبقى قيد المعالجة حتى يطبق العامل تغييرات الطرود وسجل الحالات.');
    } catch {
      setSyncingApi(false);
      setMessage('تعذر طلب تحديث Guepex. تحقق من الاتصال وحاول مجدداً.');
      setMessageIsError(true);
    }
  }

  async function handlePrepare() {
    if (!companion.paired) { setMessage('ثبّت إضافة TajerTrack Companion واربطها أولاً.'); setMessageIsError(true); return; }
    setPreparing(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const proof = await getVerifiedCompanionProof('prepare-webhook');
      const result = await prepareYalidineWebhookEndpoint(proof);
      if (!result.success || !result.endpointUrl) {
        setMessage(result.error || 'تعذر إنشاء رابط الاستقبال.');
        setMessageIsError(true);
        return;
      }
      setStatus((current) => ({
        ...current,
        prepared: true,
        endpointUrl: result.endpointUrl!,
        connected: Boolean(result.alreadyConnected),
      }));
      setMessage(result.alreadyConnected
        ? 'رابط الاستقبال موجود ومفتاح التوقيع محفوظ بالفعل.'
        : 'تم تجهيز الرابط. أضفه في لوحة شركة التوصيل، ثم احفظ مفتاح التوقيع هنا.');
    } catch {
      setMessage('تعذر تجهيز الرابط. تحقق من الاتصال ثم حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setPreparing(false);
    }
  }

  async function handleSaveApi(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const proof = await getVerifiedCompanionProof('save-api');
      const result = await saveYalidineApiCredentials(apiId, apiToken, proof);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر ربط حساب Guepex API.');
        setMessageIsError(true);
        return;
      }
      setStatus(result.status);
      if (result.status.apiSyncRequestedAt) {
        setActiveRefreshRequestedAt(result.status.apiSyncRequestedAt);
      }
      setApiId('');
      setApiToken('');
      setMessage('تم التحقق من بيانات Guepex وحفظها مشفّرة. ستبدأ مزامنة الطرود تلقائياً كل بضع دقائق.');
    } catch {
      setMessage('تعذر ربط حساب Guepex API. تحقق من البيانات وحاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSecret(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const proof = await getVerifiedCompanionProof('save-webhook');
      const result = await saveYalidineWebhookSecret(secret, proof);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر حفظ مفتاح التوقيع.');
        setMessageIsError(true);
        return;
      }
      setStatus(result.status);
      setSecret('');
      setMessage('تم حفظ مفتاح التوقيع مشفّراً. فعّل وضع الاختبار الآمن قبل تشغيل الاختبارات من لوحة شركة التوصيل.');
    } catch {
      setMessage('تعذر حفظ مفتاح التوقيع. حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!status.endpointUrl) return;
    try {
      await navigator.clipboard.writeText(status.endpointUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage('تعذر النسخ تلقائياً. حدّد الرابط وانسخه يدوياً.');
      setMessageIsError(true);
    }
  }

  async function handleTestMode(enabled: boolean) {
    setMessage('');
    setMessageIsError(false);
    setSaving(true);
    try {
      const result = await setYalidineWebhookTestMode(enabled);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر تغيير وضع الاختبار.');
        setMessageIsError(true);
        return;
      }
      setStatus(result.status);
      setMessage(enabled
        ? 'وضع الاختبار مفعّل: سيتم التحقق من الإشعارات دون إنشاء أو تعديل طلبات.'
        : 'تم إيقاف وضع الاختبار. الإشعارات الحقيقية ستُرسل الآن إلى معالجة الطلبات.');
    } catch {
      setMessage('تعذر تغيير وضع الاختبار. حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('سيؤدي هذا إلى حذف بيانات API ومفتاح Webhook ورابط الاستقبال المحفوظة في تاجر تراك. هل تريد المتابعة؟')) return;
    setDisconnecting(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const result = await disconnectYalidineWebhook();
      if (!result.success) {
        setMessage(result.error || 'تعذر فصل الربط.');
        setMessageIsError(true);
        return;
      }
      setStatus(emptyStatus);
      setSecret('');
      setApiId('');
      setApiToken('');
      setMessage('تم حذف بيانات ربط Yalidine / Guepex من تاجر تراك. تأكد من تعطيل Webhook من لوحة شركة التوصيل أيضاً.');
    } catch {
      setMessage('تعذر فصل الربط. حاول مجدداً.');
      setMessageIsError(true);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <article className="dz-int-guided-panel">
      <div className="dz-int-guided-panel-title">
        <span className="dz-int-guided-number">02</span>
        <div>
          <h4>ربط Yalidine / Guepex</h4>
          <p style={{ fontSize: '16px', lineHeight: 1.8 }}>
            اربط API للمزامنة الدورية وWebhook للتحديثات الفورية. كلاهما يعملان معاً لمنع فقدان الشحنات أو حالاتها.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p>
      ) : (
        <>
          <section style={{ margin: '0 0 18px', padding: '14px 0', borderTop: '1px solid var(--border-soft, #e5e7eb)', borderBottom: '1px solid var(--border-soft, #e5e7eb)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: 4 }}>إضافة TajerTrack Companion</strong>
                <span className="dz-int-guided-note" style={{ fontSize: 13, margin: 0 }}>
                  {checkingCompanion ? 'جارٍ التحقق من الإضافة...' : companion.paired ? 'مثبتة ومربوطة بهذا المتجر' : companion.installed ? 'الإضافة مثبتة — يلزم ربطها بهذا المتجر' : 'يجب تثبيت الإضافة وربطها قبل إدخال بيانات API أو إعداد Webhook'}
                </span>
                {companion.version && <span className="dz-int-guided-note" style={{ display: 'block', fontSize: 12, marginTop: 4 }} dir="ltr">Version {companion.version}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="dz-support-copy" disabled={checkingCompanion || pairingCompanion} onClick={() => window.location.reload()}>
                  إعادة التحقق
                </button>
                {!companion.installed && (
                  <a className="dz-btn" href="/downloads/tajertrack-companion.zip" download="tajertrack-companion.zip">
                    تنزيل الإضافة
                  </a>
                )}
                {companion.installed && !companion.paired && (
                  <button type="button" className="dz-btn" disabled={checkingCompanion || pairingCompanion} onClick={handlePairCompanion}>
                    {pairingCompanion ? 'جارٍ ربط الإضافة...' : 'ربط الإضافة بهذا المتجر'}
                  </button>
                )}
              </div>
            </div>
            {!companion.installed && !checkingCompanion && (
              <ol className="dz-int-guided-steps" style={{ marginTop: 12 }}>
                <li>نزّل الملف وفك ضغطه في مجلد على جهازك.</li>
                <li>افتح <code dir="ltr">chrome://extensions</code> أو <code dir="ltr">edge://extensions</code> وفعّل <strong>Developer mode</strong>.</li>
                <li>اضغط <strong>Load unpacked</strong> واختر المجلد الذي يحتوي على <code dir="ltr">manifest.json</code>.</li>
                <li>ارجع إلى هذه الصفحة واضغط «إعادة التحقق»، ثم اربط الإضافة بالمتجر.</li>
              </ol>
            )}
            {companion.note && <p className="dz-int-guided-note" role="status" style={{ fontSize: 13, margin: '8px 0 0' }}>{companion.note}</p>}
          </section>

          <div className="dz-int-guided-meta">
            <span>حالة حساب Guepex API</span>
            <strong>{status.apiConnected ? 'متصل — المزامنة التلقائية مفعّلة' : 'لم يتم ربط API ID و API Token'}</strong>
            {status.apiConnected && (
              <>
                <span>آخر مزامنة من API</span>
                <strong>{formatDate(status.lastApiSyncAt)}</strong>
              </>
            )}
            {status.apiLastError && (
              <>
                <span>آخر خطأ في مزامنة API</span>
                <strong style={{ color: '#b42318' }}>{status.apiLastError}</strong>
              </>
            )}
            <span>حالة Webhook</span>
            <strong>{status.connected ? 'مفتاح التوقيع محفوظ' : status.prepared ? 'الرابط جاهز — بانتظار مفتاح التوقيع' : 'غير مربوط'}</strong>
            {status.prepared && (
              <>
                <span>آخر إشعار استلمه تاجر تراك</span>
                <strong>{formatDate(status.lastWebhookReceivedAt)}</strong>
                <span>آخر إشعار تمت معالجته</span>
                <strong>{formatDate(status.lastWebhookProcessedAt)}</strong>
                <span>وضع استقبال الاختبارات</span>
                <strong>{status.testMode ? 'مفعّل — لن تُنشأ طلبات من عينات الاختبار' : 'متوقف — تُعالج الأحداث الحقيقية'}</strong>
              </>
            )}
          </div>

          {status.apiConnected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '12px 0 16px' }}>
              <button
                type="button"
                className="dz-btn"
                disabled={syncingApi || Boolean(status.apiSyncRequestedAt)}
                onClick={handleRefreshApi}
                aria-live="polite"
              >
                <RefreshCw size={16} aria-hidden="true" style={{ marginInlineEnd: 7, verticalAlign: 'middle' }} />
                {syncingApi || status.apiSyncRequestedAt ? 'جارٍ تحديث الطرود...' : 'تحديث الطرود الآن'}
              </button>
              {status.apiSyncRequestedAt && (
                <span className="dz-int-guided-note" role="status" style={{ fontSize: 13, margin: 0 }}>
                  طلب التحديث قيد المعالجة بواسطة العامل
                </span>
              )}
            </div>
          )}

          <form onSubmit={handleSaveApi} style={{ display: 'grid', gap: '10px', margin: '14px 0 20px' }}>
            <div>
              <strong>بيانات Guepex API</strong>
              <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
                أدخل API ID و API Token من لوحة التطوير. يتحقق تاجر تراك منهما عبر قراءة الطرود فقط، ويحفظهما مشفّرين. تُستخدم المزامنة لاكتشاف الشحنات ومراجعة الحالات عند فوات Webhook.
              </p>
            </div>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span><b>API ID</b></span>
              <input
                className="input"
                type="password"
                required
                disabled={!companion.paired || saving}
                maxLength={128}
                value={apiId}
                onChange={(event) => setApiId(event.target.value)}
                placeholder="API ID"
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
              <span><b>API Token</b></span>
              <input
                className="input"
                type="password"
                required
                disabled={!companion.paired || saving}
                maxLength={512}
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="API Token"
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="dz-btn" disabled={!companion.paired || saving || !apiId.trim() || !apiToken.trim()}>
              {saving ? 'جارٍ التحقق والحفظ...' : status.apiConnected ? 'تحديث بيانات API' : 'التحقق وربط Guepex API'}
            </button>
            <p className="dz-int-guided-note" style={{ fontSize: '13px', lineHeight: 1.8 }}>
              ملاحظة الخصوصية: تحجب Guepex الاسم ورقم الهاتف جزئياً في ردود القراءة. يعرض تاجر تراك الاسم والرقم المحجوبين كمرجع بصري فقط، ولا يستخدم الرقم المحجوب للتواصل. يُحفظ الهاتف الحقيقي إذا وصل كاملاً في Webhook أو وُجد في الطلب الأصلي المطابق عبر order_id. أما الطرود المنشأة مباشرة في لوحة Guepex دون طلب أصلي مطابق أو هاتف كامل في Webhook، فلا تكشف واجهة القراءة رقمها الحقيقي.
            </p>
          </form>

          {!status.prepared ? (
            <button type="button" className="dz-btn" disabled={!companion.paired || checkingCompanion || preparing} onClick={handlePrepare}>
              {preparing ? 'جارٍ تجهيز الرابط...' : 'إنشاء رابط الاستقبال'}
            </button>
          ) : (
            <>
              <div className="dz-int-guided-copy">
                <div><small>رابط Webhook الخاص بمتجرك</small><code dir="ltr">{status.endpointUrl}</code></div>
                <button type="button" onClick={handleCopy}>{copied ? 'تم النسخ' : 'نسخ الرابط'}</button>
              </div>

              {status.connected && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '12px 0' }}>
                    <button type="button" className="dz-btn" disabled={saving || status.testMode} onClick={() => handleTestMode(true)}>
                      تفعيل وضع الاختبار الآمن
                    </button>
                    <button type="button" className="dz-support-copy" disabled={saving || !status.testMode} onClick={() => handleTestMode(false)}>
                      إيقاف وضع الاختبار
                    </button>
                  </div>
                  <p className="dz-int-guided-note" style={{ fontSize: '14px', lineHeight: 1.8 }}>
                    فعّل وضع الاختبار قبل الضغط على Faire des tests. ستُقبل العينات الموقّعة ويُسجّل وقت وصولها، لكن لن تُنشئ طلبات تجريبية أو تغيّر حالات طلباتك.
                  </p>
                </>
              )}
              <ol className="dz-int-guided-steps">
                <li>افتح لوحة حساب Yalidine / Guepex، ثم صفحة <strong>Webhooks</strong>.</li>
                <li>اضغط <strong>Ajouter</strong>، واكتب اسماً مثل <strong>TajerTrack</strong>، ثم الصق رابط الاستقبال أعلاه وأضف بريد التنبيهات المطلوب.</li>
                <li>فعّل الأحداث <code dir="ltr">parcel_created</code> و<code dir="ltr">parcel_edited</code> و<code dir="ltr">parcel_status_updated</code> حتى تصل بيانات الإنشاء والتعديلات والحالات.</li>
                <li>احفظ Webhook. ستتحقق لوحة الشركة من الرابط عبر CRC تلقائياً، وسيظهر مفتاح التوقيع على بطاقة Webhook.</li>
                <li>انسخ مفتاح التوقيع من البطاقة والصقه في الخانة أدناه، ثم فعّل وضع الاختبار الآمن أعلاه. شغّل <strong>Faire des tests</strong> من لوحة الشركة. بعد نجاح الاختبار، أوقف وضع الاختبار ثم غيّر حالة Webhook إلى <strong>Actif</strong>.</li>
              </ol>

              <form onSubmit={handleSaveSecret} style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                <label style={{ display: 'grid', gap: '7px', fontSize: '16px', lineHeight: 1.6 }}>
                  <span><b>مفتاح توقيع Webhook</b></span>
                  <small style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                    انسخه من بطاقة Webhook في حسابك. سيُحفظ مشفّراً ولا يظهر مجدداً بعد الحفظ.
                  </small>
                  <input
                    className="input"
                    type="password"
                    required
                    disabled={!companion.paired || saving}
                    maxLength={512}
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder="الصق مفتاح التوقيع هنا"
                    dir="ltr"
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit" className="dz-btn" disabled={!companion.paired || saving || !secret.trim()}>
                  {saving ? 'جارٍ حفظ المفتاح...' : status.connected ? 'تحديث مفتاح التوقيع' : 'حفظ مفتاح التوقيع'}
                </button>
              </form>

            </>
          )}
          {(status.connected || status.apiConnected) && (
            <button type="button" className="dz-support-copy" disabled={disconnecting} onClick={handleDisconnect}>
              {disconnecting ? 'جارٍ فصل الربط...' : 'فصل Yalidine من تاجر تراك'}
            </button>
          )}
        </>
      )}

      {status.lastError && <p className="dz-int-guided-note" role="status" style={{ color: '#b42318' }}>{status.lastError}</p>}
      {message && (
        <p className="dz-int-guided-note" role="status" aria-live="polite" style={messageIsError ? { color: '#b42318', background: '#fff4f2', borderRadius: '9px', padding: '10px 12px' } : { fontSize: '14px', lineHeight: 1.8 }}>
          {message}
        </p>
      )}
    </article>
  );
}
