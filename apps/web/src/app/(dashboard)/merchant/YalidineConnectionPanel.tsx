'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectYalidineWebhook,
  getYalidineWebhookStatus,
  prepareYalidineWebhookEndpoint,
  saveYalidineApiCredentials,
  saveYalidineWebhookSecret,
  setYalidineWebhookTestMode,
} from './yalidine-actions';

type Status = {
  prepared: boolean;
  connected: boolean;
  apiConnected: boolean;
  lastApiSyncAt: string | null;
  apiLastError: string | null;
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
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let active = true;
    getYalidineWebhookStatus()
      .then((result) => {
        if (!active) return;
        if (result.success) setStatus(result.status);
        else {
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

  async function handlePrepare() {
    setPreparing(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const result = await prepareYalidineWebhookEndpoint();
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
      const result = await saveYalidineApiCredentials(apiId, apiToken);
      if (!result.success || !result.status) {
        setMessage(result.error || 'تعذر ربط حساب Guepex API.');
        setMessageIsError(true);
        return;
      }
      setStatus(result.status);
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
      const result = await saveYalidineWebhookSecret(secret);
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
                maxLength={512}
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="API Token"
                dir="ltr"
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="dz-btn" disabled={saving || !apiId.trim() || !apiToken.trim()}>
              {saving ? 'جارٍ التحقق والحفظ...' : status.apiConnected ? 'تحديث بيانات API' : 'التحقق وربط Guepex API'}
            </button>
            <p className="dz-int-guided-note" style={{ fontSize: '13px', lineHeight: 1.8 }}>
              تنبيه الخصوصية: Guepex يحجب الاسم الكامل ورقم الهاتف والعنوان في ردود قراءة API. يمكن مزامنة اسم محجوب والمنتج والحالة، لكن رقم الهاتف الحقيقي يجب أن يكون محفوظاً في الطلب الأصلي داخل تاجر تراك؛ لا يمكن إرسال SMS أو Telegram إلى رقم محجوب.
            </p>
          </form>

          {!status.prepared ? (
            <button type="button" className="dz-btn" disabled={preparing} onClick={handlePrepare}>
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
                    maxLength={512}
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder="الصق مفتاح التوقيع هنا"
                    dir="ltr"
                    autoComplete="new-password"
                  />
                </label>
                <button type="submit" className="dz-btn" disabled={saving || !secret.trim()}>
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
