'use client';

import React, { useEffect, useState } from 'react';
import {
  disconnectYalidineWebhook,
  getYalidineWebhookStatus,
  prepareYalidineWebhookEndpoint,
  saveYalidineWebhookSecret,
} from './yalidine-actions';

type Status = {
  prepared: boolean;
  connected: boolean;
  endpointUrl: string | null;
  connectedAt: string | null;
  lastWebhookReceivedAt: string | null;
  lastWebhookProcessedAt: string | null;
  lastError: string | null;
};

const emptyStatus: Status = {
  prepared: false,
  connected: false,
  endpointUrl: null,
  connectedAt: null,
  lastWebhookReceivedAt: null,
  lastWebhookProcessedAt: null,
  lastError: null,
};

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ar-DZ')
  : 'لم يصل بعد';

export function YalidineConnectionPanel() {
  const [status, setStatus] = useState<Status>(emptyStatus);
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
      setMessage('تم حفظ مفتاح التوقيع مشفّراً. شغّل الاختبار من لوحة شركة التوصيل ثم فعّل Webhook هناك.');
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

  async function handleDisconnect() {
    if (!window.confirm('هل فصلت Webhook أو عطّلته من لوحة شركة التوصيل؟ سيؤدي هذا إلى حذف رابط الاستقبال ومفتاحه المحفوظ في تاجر تراك.')) return;
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
      setMessage('تم حذف إعدادات الربط من تاجر تراك. تأكد من تعطيل Webhook من لوحة شركة التوصيل أيضاً.');
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
          <h4>ربط تحديثات Yalidine</h4>
          <p style={{ fontSize: '16px', lineHeight: 1.8 }}>
            أنشئ Webhook في لوحة شركة التوصيل. يتحقق تاجر تراك من توقيع كل إشعار ويحفظه قبل معالجته.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="dz-int-guided-note">جارٍ تحميل حالة الربط...</p>
      ) : (
        <>
          <div className="dz-int-guided-meta">
            <span>إعداد تاجر تراك</span>
            <strong>{status.connected ? 'مفتاح التوقيع محفوظ' : status.prepared ? 'الرابط جاهز — بانتظار مفتاح التوقيع' : 'لم يتم إعداد الرابط'}</strong>
            {status.prepared && (
              <>
                <span>آخر إشعار استلمه تاجر تراك</span>
                <strong>{formatDate(status.lastWebhookReceivedAt)}</strong>
                <span>آخر إشعار تمت معالجته</span>
                <strong>{formatDate(status.lastWebhookProcessedAt)}</strong>
              </>
            )}
          </div>

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

              <ol className="dz-int-guided-steps">
                <li>افتح لوحة حساب Yalidine / Guepex، ثم صفحة <strong>Webhooks</strong>.</li>
                <li>اضغط <strong>Ajouter</strong>، واكتب اسماً مثل <strong>TajerTrack</strong>، ثم الصق رابط الاستقبال أعلاه وأضف بريد التنبيهات المطلوب.</li>
                <li>فعّل الحدثين <code dir="ltr">parcel_created</code> و<code dir="ltr">parcel_status_updated</code>. هذان الحدثان هما المستخدمان حالياً لإنشاء سجل الشحنة وتحديث مسارها.</li>
                <li>احفظ Webhook. ستتحقق لوحة الشركة من الرابط عبر CRC تلقائياً، وسيظهر مفتاح التوقيع على بطاقة Webhook.</li>
                <li>انسخ مفتاح التوقيع من البطاقة والصقه في الخانة أدناه، ثم شغّل <strong>Faire des tests</strong> من لوحة الشركة. بعد نجاح الاختبار، غيّر حالة Webhook إلى <strong>Actif</strong>.</li>
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

              {status.connected && (
                <button type="button" className="dz-support-copy" disabled={disconnecting} onClick={handleDisconnect}>
                  {disconnecting ? 'جارٍ فصل الربط...' : 'فصل Yalidine من تاجر تراك'}
                </button>
              )}
            </>
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
