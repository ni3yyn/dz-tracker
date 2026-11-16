'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type SenderLine = {
  device_id: string;
  display_name: string | null;
  enabled: boolean;
  operator_code: string | null;
  last_seen_at: string | null;
  connected_at: string | null;
};

type Operator = {
  code: 'djezzy' | 'mobilis' | 'ooredoo';
  name: string;
  prefix: string;
};

const OPERATORS: Operator[] = [
  { code: 'djezzy', name: 'Djezzy', prefix: '07' },
  { code: 'mobilis', name: 'Mobilis', prefix: '06' },
  { code: 'ooredoo', name: 'Ooredoo', prefix: '05' },
];

export function SmsGatewayCarrierLines({
  available,
  devices,
  legacyDevice,
  downloadUrl,
}: {
  available: boolean;
  devices: SenderLine[];
  legacyDevice: { display_name: string; enabled: boolean } | null;
  downloadUrl: string | null;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(devices);
  const [busyOperator, setBusyOperator] = useState<string | null>(null);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<{ operator: string; url: string } | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => setLines(devices), [devices]);

  async function createInvite(operatorCode: Operator['code']) {
    setBusyOperator(operatorCode);
    setNotice('');
    setInviteUrl(null);
    try {
      const response = await fetch('/api/mobile/sms-gateway/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorCode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.inviteUrl !== 'string') {
        throw new Error(payload.error || 'تعذر إنشاء رابط الدعوة.');
      }
      setInviteUrl({ operator: operatorCode, url: payload.inviteUrl });
      setNotice('الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر إنشاء رابط الدعوة.');
    } finally {
      setBusyOperator(null);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl.url);
      setNotice('تم نسخ رابط الدعوة. أرسله إلى الهاتف الذي سيستخدم هذه الشريحة.');
    } catch {
      setNotice('تعذر النسخ تلقائياً. حدّد الرابط وانسخه يدوياً.');
    }
  }

  async function shareInvite() {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'دعوة ربط TajerTrack Phone',
          text: 'افتح هذا الرابط على الهاتف الذي سيستخدم شريحة شبكة الإرسال.',
          url: inviteUrl.url,
        });
      } catch {
        // The share sheet may be dismissed; keep the invite visible.
      }
    } else {
      await copyInvite();
    }
  }

  async function manageLine(deviceId: string, action: 'enable' | 'disable' | 'revoke') {
    setBusyDevice(deviceId);
    setNotice('');
    try {
      const response = await fetch('/api/mobile/sms-gateway/device/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.error || 'تعذر تحديث خط الإرسال.');
      }
      setLines((current) => action === 'revoke'
        ? current.filter((line) => line.device_id !== deviceId)
        : current.map((line) => line.device_id === deviceId
          ? { ...line, enabled: action === 'enable' }
          : line
        ));
      setInviteUrl(null);
      setNotice(
        action === 'revoke'
          ? 'تم إلغاء ربط هذا الجهاز. يمكنك الآن إنشاء دعوة جديدة للشبكة نفسها.'
          : action === 'enable'
            ? 'تم تفعيل خط الإرسال.'
            : 'تم إيقاف خط الإرسال. لن تُرسل منه رسائل جديدة.'
      );
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'تعذر تحديث خط الإرسال.');
    } finally {
      setBusyDevice(null);
    }
  }

  return (
    <section
      className="dz-settings-section dz-settings-native-sms"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 0, padding: '18px 20px', marginBottom: '20px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>ANDROID SMS SENDER LINES</span>
          <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>خطوط إرسال رسائل التتبع</h2>
          <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.75, color: 'var(--ink-muted)' }}>
            اربط شريحة لكل شبكة. يرسل TajerTrack رسالة واحدة فقط، ويختار الخط الذي يطابق شبكة رقم العميل تلقائياً. يمكنك ربط هاتف أحد أفراد العائلة دون مشاركة كلمة مرور المتجر.
          </p>
        </div>
        <span style={{ fontSize: '12px', color: available ? 'var(--ink-muted)' : '#946b2d', fontWeight: 700 }}>
          {available ? `${lines.filter((line) => line.operator_code).length} / 3 خطوط مرتبطة` : 'الربط غير متاح'}
        </span>
      </div>

      {!available ? (
        <p role="status" style={{ margin: '13px 0 0', paddingTop: '11px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '12px', lineHeight: 1.7 }}>
          يلزم تطبيق ترحيل خطوط الإرسال أولاً.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '10px', marginTop: '16px' }}>
            {OPERATORS.map((operator) => {
              const line = lines.find((candidate) => candidate.operator_code === operator.code) || null;
              const isBusy = busyOperator === operator.code || (line ? busyDevice === line.device_id : false);
              const lastSeen = line?.last_seen_at
                ? new Date(line.last_seen_at).toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' })
                : null;
              return (
                <div key={operator.code} style={{ minWidth: 0, border: '1px solid var(--border-soft)', padding: '13px', background: 'var(--bg-base)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--ink-main)' }}>{operator.name}</strong>
                    <span style={{ fontSize: '10px', color: line ? (line.enabled ? '#267548' : '#946b2d') : 'var(--ink-muted)', fontWeight: 700 }}>
                      {line ? (line.enabled ? 'مفعّل' : 'موقوف') : 'غير مرتبط'}
                    </span>
                  </div>
                  <p style={{ margin: '5px 0 0', color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.6 }}>
                    أرقام تبدأ بـ {operator.prefix}
                  </p>
                  {line ? (
                    <>
                      <p style={{ margin: '10px 0 0', color: 'var(--ink-main)', fontSize: '12px', fontWeight: 700, overflowWrap: 'anywhere' }}>
                        {line.display_name || 'هاتف Android'}
                      </p>
                      <p style={{ margin: '4px 0 10px', color: 'var(--ink-muted)', fontSize: '10px', lineHeight: 1.5 }}>
                        {lastSeen ? `آخر اتصال: ${lastSeen}` : 'بانتظار أول اتصال من التطبيق'}
                      </p>
                      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void manageLine(line.device_id, line.enabled ? 'disable' : 'enable')}
                          style={{ minHeight: '34px', padding: '0 10px', border: '1px solid var(--border-soft)', background: 'var(--surface)', color: 'var(--ink-main)', fontSize: '11px', fontWeight: 700, cursor: isBusy ? 'wait' : 'pointer' }}
                        >
                          {busyDevice === line.device_id ? 'جارٍ التحديث...' : line.enabled ? 'إيقاف الخط' : 'تفعيل الخط'}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (window.confirm(`إلغاء ربط خط ${operator.name}؟ لن يؤثر ذلك على الخطوط الأخرى.`)) {
                              void manageLine(line.device_id, 'revoke');
                            }
                          }}
                          style={{ minHeight: '34px', padding: '0 10px', border: '1px solid var(--border-soft)', background: 'transparent', color: 'var(--ink-muted)', fontSize: '11px', fontWeight: 700, cursor: isBusy ? 'wait' : 'pointer' }}
                        >
                          إلغاء الربط
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: '10px 0', minHeight: '38px', color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.6 }}>
                      لا يوجد هاتف مخصص لهذه الشبكة حالياً.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={isBusy || Boolean(line && !line.enabled)}
                    onClick={() => void createInvite(operator.code)}
                    style={{ width: '100%', minHeight: '38px', marginTop: '10px', padding: '0 10px', border: 0, background: line ? 'var(--bg-base)' : 'var(--ink-main)', color: line ? 'var(--ink-main)' : 'var(--surface)', fontSize: '11px', fontWeight: 700, cursor: isBusy || Boolean(line && !line.enabled) ? 'not-allowed' : 'pointer', opacity: isBusy || Boolean(line && !line.enabled) ? .55 : 1 }}
                  >
                    {busyOperator === operator.code ? 'جارٍ إنشاء الدعوة...' : line ? 'إعادة ربط جهاز' : 'إنشاء دعوة ربط'}
                  </button>
                </div>
              );
            })}
          </div>

          {legacyDevice && (
            <p style={{ margin: '12px 0 0', paddingTop: '10px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '11px', lineHeight: 1.7 }}>
              يوجد هاتف مرتبط بالطريقة السابقة ({legacyDevice.display_name || 'Android'}). سيُستبدل هذا الربط عند إكمال أول خط خاص بشبكة، ولن يتأثر أي خط آخر بعد ذلك.
            </p>
          )}

          {inviteUrl && (
            <div style={{ marginTop: '14px', padding: '13px', border: '1px solid var(--border-soft)', background: 'var(--bg-base)' }}>
              <strong style={{ display: 'block', color: 'var(--ink-main)', fontSize: '12px' }}>
                دعوة {OPERATORS.find((item) => item.code === inviteUrl.operator)?.name || 'الربط'}
              </strong>
              <input
                readOnly
                value={inviteUrl.url}
                aria-label="رابط دعوة ربط خط الإرسال"
                onFocus={(event) => event.currentTarget.select()}
                style={{ width: '100%', minHeight: '40px', marginTop: '8px', padding: '8px', direction: 'ltr', textAlign: 'left', border: '1px solid var(--border-soft)', borderRadius: 0, background: 'var(--surface)', color: 'var(--ink-main)', fontSize: '11px' }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '9px' }}>
                <button type="button" onClick={() => void copyInvite()} style={{ minHeight: '36px', padding: '0 13px', border: 0, background: 'var(--ink-main)', color: 'var(--surface)', fontSize: '11px', fontWeight: 700 }}>نسخ الرابط</button>
                <button type="button" onClick={() => void shareInvite()} style={{ minHeight: '36px', padding: '0 13px', border: '1px solid var(--border-soft)', background: 'var(--surface)', color: 'var(--ink-main)', fontSize: '11px', fontWeight: 700 }}>مشاركة</button>
              </div>
            </div>
          )}

          {notice && <p role="status" aria-live="polite" style={{ margin: '11px 0 0', color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.65 }}>{notice}</p>}
        </>
      )}

      {downloadUrl ? (
        <a href={downloadUrl} download style={{ display: 'inline-flex', marginTop: '13px', color: 'var(--ink-main)', fontSize: '12px', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
          تحميل تطبيق TajerTrack Phone
        </a>
      ) : (
        <p style={{ margin: '12px 0 0', color: 'var(--ink-muted)', fontSize: '11px', lineHeight: 1.6 }}>
          رابط تنزيل التطبيق سيظهر هنا بعد نشر نسخة Android الموقّعة.
        </p>
      )}
    </section>
  );
}
