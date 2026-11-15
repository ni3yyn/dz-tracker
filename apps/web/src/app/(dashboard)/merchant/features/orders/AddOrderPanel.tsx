'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { BrandedSelect } from '../../BrandedSelect';
import { Icons } from '../../components/DashboardIcons';
import { getYalidineManualParcelOptions } from '../../yalidine-actions';
import type { ManualOrderSuccess } from './useManualOrder';

interface AddOrderPanelProps {
  isAddOrderPanelMounted: boolean;
  isAddOrderPanelOpen: boolean;
  isAddOrderModalOpen: boolean;
  isCreatingOrder: boolean;
  addOrderError: string | null;
  newOrderSuccess: ManualOrderSuccess | null;
  siteUrl: string;
  closeAddOrder: () => void;
  closeAddOrderSuccess: () => void;
  finishAddOrderPanelClose: () => void;
  handleCreateOrder: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  copyToClipboard: (text: string, id: string) => void;
  showToast: (message: string) => void;
}

export function AddOrderPanel({
  isAddOrderPanelMounted,
  isAddOrderPanelOpen,
  isAddOrderModalOpen,
  isCreatingOrder,
  addOrderError,
  newOrderSuccess,
  siteUrl,
  closeAddOrder,
  closeAddOrderSuccess,
  finishAddOrderPanelClose,
  handleCreateOrder,
  copyToClipboard,
  showToast,
}: AddOrderPanelProps) {
  const [carrierName, setCarrierName] = useState('Yalidine Express');
  const [sendToYalidine, setSendToYalidine] = useState(true);
  const [manualTrackingNumber, setManualTrackingNumber] = useState('');
  const [parcelOptions, setParcelOptions] = useState<any>(null);
  const [parcelOptionsLoading, setParcelOptionsLoading] = useState(false);
  const [parcelOptionsError, setParcelOptionsError] = useState('');
  const [fromWilayaId, setFromWilayaId] = useState('');
  const [toWilayaId, setToWilayaId] = useState('');
  const [toCommuneId, setToCommuneId] = useState('');
  const [deliveryType, setDeliveryType] = useState('home');
  const [stopDeskId, setStopDeskId] = useState('');
  const shouldDispatchToYalidine =
    carrierName === 'Yalidine Express' && sendToYalidine && !manualTrackingNumber.trim();

  const destinationWilayas = useMemo(
    () => (parcelOptions?.wilayas || []).filter((item: any) => item.is_deliverable),
    [parcelOptions]
  );
  const destinationCommunes = useMemo(
    () => (parcelOptions?.communes || []).filter((item: any) =>
      item.wilaya_id === Number(toWilayaId) && item.is_deliverable
    ),
    [parcelOptions, toWilayaId]
  );
  const stopDeskCenters = useMemo(
    () => (parcelOptions?.centers || []).filter((item: any) =>
      item.wilaya_id === Number(toWilayaId) &&
      item.commune_id === Number(toCommuneId)
    ),
    [parcelOptions, toCommuneId, toWilayaId]
  );

  useEffect(() => {
    if (!isAddOrderPanelOpen || !shouldDispatchToYalidine || parcelOptions || parcelOptionsLoading) return;
    let active = true;
    setParcelOptionsLoading(true);
    setParcelOptionsError('');
    void getYalidineManualParcelOptions()
      .then((result) => {
        if (!active) return;
        if (!result.success || !result.options) {
          setParcelOptionsError(result.error || 'تعذّر تحميل مواقع شركة التوصيل.');
          return;
        }
        setParcelOptions(result.options);
        const defaultSender = result.options.wilayas.find((item: any) =>
          item.name.toLocaleLowerCase() === 'alger'
        ) || result.options.wilayas[0];
        if (defaultSender) setFromWilayaId(String(defaultSender.id));
      })
      .catch((error: any) => {
        if (active) setParcelOptionsError(error?.message || 'تعذّر تحميل مواقع شركة التوصيل.');
      })
      .finally(() => {
        if (active) setParcelOptionsLoading(false);
      });
    return () => { active = false; };
  }, [isAddOrderPanelOpen, shouldDispatchToYalidine, parcelOptions, parcelOptionsLoading]);

  if (!isAddOrderPanelMounted || typeof document === 'undefined') return null;

  return createPortal((

            <div
              className="dz-order-detail-backdrop dz-order-side-backdrop"
              data-dashboard-back-dismiss="add-order-panel"
              data-open={isAddOrderPanelOpen ? 'true' : 'false'}
              aria-hidden={!isAddOrderPanelOpen}
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && isAddOrderPanelOpen && !isCreatingOrder) {
                  closeAddOrder();
                }
              }}
            >
              <aside
                className="dz-order-detail-panel dz-order-side-panel dz-order-side-panel--add"
                data-open={isAddOrderPanelOpen ? 'true' : 'false'}
                role="dialog"
                aria-modal="true"
                aria-hidden={!isAddOrderPanelOpen}
                aria-labelledby="add-order-title"
                onMouseDown={(event) => event.stopPropagation()}
                onTransitionEnd={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    event.propertyName === 'flex-basis' &&
                    !isAddOrderModalOpen &&
                    !isAddOrderPanelOpen
                  ) {
                    finishAddOrderPanelClose();
                  }
                }}
              >
                <div className="dz-order-side-panel-inner dz-order-side-panel-inner--add">
                <div className="dz-order-detail-head">
                  <div>
                    <span className="dz-order-detail-kicker">طلب جديد · شحنة مباشرة</span>
                    <h2 id="add-order-title" style={{ fontSize: '22px', fontWeight: 850 }}>إضافة طلب جديد</h2>
                    <p>أدخل بيانات العميل والمنتج مرة واحدة، ثم أنشئ الشحنة في حساب شركة التوصيل.</p>
                  </div>
                  <button
                    type="button"
                    className="dz-order-detail-close"
                    aria-label="إغلاق النافذة"
                    onClick={() => closeAddOrder()}
                    disabled={isCreatingOrder}
                  >
                    <Icons.X />
                  </button>
                </div>

                {newOrderSuccess ? (
                  <div style={{ padding: '24px 0', textAlign: 'center' }}>
                    <div style={{
                      width: '58px',
                      height: '58px',
                      borderRadius: '50%',
                      background: '#dcfce7',
                      color: '#16a34a',
                      display: 'grid',
                      placeItems: 'center',
                      margin: '0 auto 16px',
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: 'var(--ink-main)' }}>
                      {newOrderSuccess.exchangeReplacement
                        ? newOrderSuccess.exchangeReplacementNeedsConfirmation
                          ? 'تم استلام الشحنة وتحتاج إلى تأكيد الربط'
                          : 'تم ربط الشحنة بطلب الاستبدال'
                        : newOrderSuccess.carrierShipmentCreated
                          ? 'تم تسجيل الطلب وإنشاء الشحنة لدى ياليدين'
                          : 'تم تسجيل الطلب بنجاح!'}
                    </h3>
                    <p style={{ margin: '0 0 18px', fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                      {newOrderSuccess.exchangeReplacement ? (
                        <>
                          مرجع الشحنة: <strong>{newOrderSuccess.externalOrderId}</strong><br />
                          {newOrderSuccess.exchangeReplacementNeedsConfirmation
                            ? 'توجد عدة طلبات استبدال مطابقة. راجع قسم طلبات الاستبدال واختر الطلب الصحيح قبل متابعة الشحنة.'
                            : 'ستظهر تحديثات الشحنة ضمن صفحة التتبع الأصلية. لم يتم إنشاء طلب جديد أو إرسال رابط تتبع إضافي للعميل.'}
                        </>
                      ) : (
                        <>
                          رقم الطلب: <strong>{newOrderSuccess.externalOrderId}</strong><br />
                          {newOrderSuccess.telegramQueueCheckFailed ? 'تم تسجيل الطلب، لكن تعذّر التحقق من حالة جدولة رابط التتبع.' : newOrderSuccess.telegramTrackingQueued ? 'تم إدراج رابط التتبع في طابور تيليجرام، وسيحاول حساب تاجر تراك إرساله إلى الحساب المرتبط برقم العميل.' : newOrderSuccess.telegramTrackingEnabled ? 'الخدمة مفعّلة، لكن لم تُدرج مهمة الإرسال. تحقق من تطبيق تحديث قاعدة البيانات وسجلات العامل.' : 'خدمة إرسال روابط التتبع عبر تيليجرام متوقفة حالياً. فعّلها من إعدادات المتجر لإرسال روابط الطلبات الجديدة.'}
                        </>
                      )}
                    </p>

                    {newOrderSuccess.carrierTrackingNumber && (
                      <div style={{ display: 'grid', gap: 6, padding: '12px 0', marginBottom: 14, borderTop: '1px solid var(--border-soft)', borderBottom: '1px solid var(--border-soft)' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>رقم تتبع شركة التوصيل</span>
                        <strong dir="ltr" style={{ fontSize: 18, letterSpacing: '0.04em' }}>{newOrderSuccess.carrierTrackingNumber}</strong>
                        {newOrderSuccess.carrierShipmentReused && <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>تم ربط الشحنة الموجودة مسبقاً، ولم يتم إنشاء شحنة ثانية.</span>}
                        {newOrderSuccess.carrierLabelUrl && (
                          <a href={newOrderSuccess.carrierLabelUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, textAlign: 'start' }}>
                            فتح بوليصة الشحن لدى ياليدين
                          </a>
                        )}
                      </div>
                    )}

                    {!newOrderSuccess.exchangeReplacement && (
                      <>
                    <div style={{
                      background: 'var(--bg-base, #f4f5f1)',
                      padding: '14px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      marginBottom: '18px',
                      border: '1px solid var(--border-soft)',
                      textAlign: 'left',
                      direction: 'ltr',
                    }}>
                      {`${siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/${newOrderSuccess.trackingUuid}`}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <a
                        href={`/t/${newOrderSuccess.trackingUuid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="dz-btn"
                        style={{ flex: 1, textDecoration: 'none', fontSize: '14px', padding: '12px 18px', minHeight: '44px' }}
                      >
                        <Icons.ExternalLink /> فتح صفحة التتبع
                      </a>
                      <button
                        type="button"
                        className="dz-btn dz-btn-outline"
                        style={{ flex: 1, fontSize: '14px', padding: '12px 18px', minHeight: '44px' }}
                        onClick={() => {
                          const url = `${siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/${newOrderSuccess.trackingUuid}`;
                          copyToClipboard(url, 'new-tracking-link');
                          showToast('تم نسخ رابط التتبع');
                        }}
                      >
                        <Icons.Copy /> نسخ الرابط
                      </button>
                    </div>
                      </>
                    )}

                    <button
                      type="button"
                      className="dz-btn dz-btn-outline"
                      style={{ width: '100%', marginTop: '14px', fontSize: '14px', padding: '12px', minHeight: '44px' }}
                      onClick={closeAddOrderSuccess}                    >
                      إغلاق
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateOrder} style={{ padding: '18px 0' }}>
                    {addOrderError && (
                      <div style={{
                        background: '#fee2e2',
                        color: '#991b1b',
                        padding: '12px 16px',
                        borderRadius: '9px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <Icons.AlertTriangle /> {addOrderError}
                      </div>
                    )}


                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                          رقم الطلب (Order ID) *
                        </label>
                        <input
                          type="text"
                          name="external_order_id"
                          defaultValue={`ORD-${Math.floor(100000 + Math.random() * 900000)}`}
                          required
                          className="dz-input-field"
                          placeholder="ORD-123456"
                          dir="ltr"
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            اسم العميل *
                          </label>
                          <input
                            type="text"
                            name="customer_name"
                            placeholder="محمد عبد الله"
                            required
                            className="dz-input-field"
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            رقم الهاتف *
                          </label>
                          <input
                            type="text"
                            name="customer_phone"
                            placeholder="0550123456"
                            required
                            className="dz-input-field"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            شركة التوصيل لهذه الشحنة
                          </label>
                          <BrandedSelect
                            name="carrier_name"
                            ariaLabel="شركة الشحن"
                            value={carrierName}
                            onChange={(value) => setCarrierName(value)}
                            variant="field"
                            options={[
                              { value: 'Yalidine Express', label: 'Yalidine / Guepex' },
                              { value: 'ZR Express', label: 'ZR Express' },
                              { value: 'Maystro Delivery', label: 'Maystro Delivery' },
                              { value: 'EcoTrack', label: 'EcoTrack' },
                              { value: 'Zimou Express', label: 'Zimou Express' },
                              { value: 'Elogistia', label: 'Elogistia' },
                              { value: 'Procolis', label: 'Procolis' },
                              { value: 'E-com Delivery v2', label: 'E-com Delivery v2' },
                              { value: 'توصيل خاص', label: 'توصيل خاص (متجرنا)' },
                            ]}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            رقم التتبع لشركة الشحن
                          </label>
                          <input
                            type="text"
                            name="carrier_tracking_number"
                            value={manualTrackingNumber}
                            onChange={(event) => setManualTrackingNumber(event.target.value)}
                            placeholder="أدخل رقم تتبع موجوداً إن كانت الشحنة منشأة مسبقاً"
                            className="dz-input-field"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            اسم المنتج {shouldDispatchToYalidine ? '*' : '(اختياري)'}
                          </label>
                          <input
                            type="text"
                            name="product_name"
                            placeholder="ساعة ذكية Ultra"
                            className="dz-input-field"
                            required={shouldDispatchToYalidine}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            حالة الشحنة الأولية
                          </label>
                          <BrandedSelect
                            name="status_raw"
                            ariaLabel="حالة الشحنة الأولية"
                            defaultValue="order_placed"
                            variant="field"
                            options={[
                              { value: 'order_placed', label: 'تم استلام الطلب (order_placed)' },
                              { value: 'processing', label: 'قيد التجهيز (processing)' },
                              { value: 'shipped', label: 'خرج للشحن والتوصيل (shipped)' },
                            ]}
                          />
                        </div>
                      </div>

                      {carrierName === 'Yalidine Express' && (
                        <section style={{ display: 'grid', gap: 14, padding: '16px 0', borderTop: '1px solid var(--border-soft)', borderBottom: '1px solid var(--border-soft)' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              name="send_to_yalidine"
                              checked={sendToYalidine}
                              onChange={(event) => setSendToYalidine(event.target.checked)}
                              style={{ width: 18, height: 18, marginTop: 2, accentColor: '#263b30' }}
                            />
                            <span style={{ display: 'grid', gap: 4 }}>
                              <strong style={{ fontSize: 14 }}>إنشاء الشحنة مباشرة في Yalidine / Guepex</strong>
                              <span style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                                يرسل بيانات العميل إلى حسابك وينشئ بوليصة حقيقية فور الضغط على حفظ، وليس مسودة. إذا أدخلت رقم تتبع موجوداً أعلاه فلن تُرسل شحنة ثانية.
                              </span>
                            </span>
                          </label>

                          {manualTrackingNumber.trim() ? (
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-muted)' }}>
                              سيتم ربط رقم التتبع الذي أدخلته فقط، دون إنشاء شحنة جديدة.
                            </p>
                          ) : sendToYalidine ? (
                            <>
                              {parcelOptionsLoading && <p role="status" style={{ margin: 0, fontSize: 13 }}>جارٍ تحميل الولايات والبلديات ومكاتب الاستلام من Guepex...</p>}
                              {parcelOptionsError && (
                                <p role="alert" style={{ margin: 0, color: '#b42318', fontSize: 13, lineHeight: 1.7 }}>
                                  {parcelOptionsError} يمكنك إلغاء خيار الإرسال المباشر لتسجيل الطلب فقط.
                                </p>
                              )}
                              {parcelOptions && (
                                <>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>ولاية الانطلاق *</label>
                                      <BrandedSelect
                                        name="from_wilaya_id"
                                        ariaLabel="ولاية انطلاق الشحنة"
                                        value={fromWilayaId}
                                        onChange={setFromWilayaId}
                                        variant="field"
                                        options={[
                                          { value: '', label: 'اختر الولاية', disabled: true },
                                          ...parcelOptions.wilayas.map((item: any) => ({ value: String(item.id), label: item.name })),
                                        ]}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>ولاية المستلم *</label>
                                      <BrandedSelect
                                        name="to_wilaya_id"
                                        ariaLabel="ولاية المستلم"
                                        value={toWilayaId}
                                        onChange={(value) => {
                                          setToWilayaId(value);
                                          setToCommuneId('');
                                          setStopDeskId('');
                                        }}
                                        variant="field"
                                        options={[
                                          { value: '', label: 'اختر الولاية', disabled: true },
                                          ...destinationWilayas.map((item: any) => ({ value: String(item.id), label: item.name })),
                                        ]}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>بلدية المستلم *</label>
                                    <BrandedSelect
                                      name="to_commune_id"
                                      ariaLabel="بلدية المستلم"
                                      value={toCommuneId}
                                      onChange={(value) => {
                                        setToCommuneId(value);
                                        setStopDeskId('');
                                      }}
                                      disabled={!toWilayaId}
                                      variant="field"
                                      options={[
                                        { value: '', label: toWilayaId ? 'اختر البلدية' : 'اختر ولاية المستلم أولاً', disabled: true },
                                        ...destinationCommunes.map((item: any) => ({ value: String(item.id), label: item.name })),
                                      ]}
                                    />
                                  </div>

                                  <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>عنوان المستلم *</label>
                                    <input
                                      className="dz-input-field"
                                      type="text"
                                      name="carrier_address"
                                      maxLength={255}
                                      required={shouldDispatchToYalidine}
                                      placeholder="الحي، الشارع، رقم المنزل..."
                                    />
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>طريقة التوصيل *</label>
                                      <BrandedSelect
                                        name="delivery_type"
                                        ariaLabel="طريقة التوصيل"
                                        value={deliveryType}
                                        onChange={(value) => {
                                          setDeliveryType(value);
                                          setStopDeskId('');
                                        }}
                                        variant="field"
                                        options={[
                                          { value: 'home', label: 'توصيل إلى المنزل' },
                                          { value: 'stopdesk', label: 'استلام من المكتب (Stop Desk)' },
                                        ]}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>الوزن (كغ) *</label>
                                      <input
                                        className="dz-input-field"
                                        type="number"
                                        name="shipment_weight"
                                        min={1}
                                        max={100}
                                        step={1}
                                        defaultValue={1}
                                        required={shouldDispatchToYalidine}
                                      />
                                    </div>
                                  </div>

                                  {deliveryType === 'stopdesk' && (
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>مكتب الاستلام *</label>
                                      <BrandedSelect
                                        name="stopdesk_id"
                                        ariaLabel="مكتب الاستلام"
                                        value={stopDeskId}
                                        onChange={setStopDeskId}
                                        variant="field"
                                        options={[
                                          { value: '', label: 'اختر مكتب الاستلام', disabled: true },
                                          ...stopDeskCenters.map((item: any) => ({
                                            value: String(item.center_id),
                                            label: item.name + (item.address ? ' — ' + item.address : ''),
                                          })),
                                        ]}
                                      />
                                      {stopDeskCenters.length === 0 && (
                                        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>
                                          لا توجد مكاتب استلام لهذه البلدية؛ اختر التوصيل إلى المنزل.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>المبلغ المطلوب تحصيله من العميل (دج) *</label>
                                      <input
                                        className="dz-input-field"
                                        type="number"
                                        name="shipment_amount"
                                        min={0}
                                        max={150000}
                                        step={1}
                                        required={shouldDispatchToYalidine}
                                        placeholder="4500"
                                      />
                                    </div>
                                    <div>
                                      <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>من يدفع رسوم التوصيل؟ *</label>
                                      <BrandedSelect
                                        name="delivery_fee_payer"
                                        ariaLabel="دافع رسوم التوصيل"
                                        defaultValue="receiver"
                                        variant="field"
                                        options={[
                                          { value: 'receiver', label: 'العميل عند الاستلام' },
                                          { value: 'sender', label: 'المتجر (توصيل مجاني للعميل)' },
                                        ]}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 750, marginBottom: 7 }}>وصف محتوى الشحنة *</label>
                                    <input
                                      className="dz-input-field"
                                      type="text"
                                      name="product_description"
                                      maxLength={255}
                                      required={shouldDispatchToYalidine}
                                      defaultValue=""
                                      placeholder="مثال: ساعة ذكية، لون أسود"
                                    />
                                  </div>
                                </>
                              )}
                            </>
                          ) : null}
                        </section>
                      )}

                      <div style={{
                        borderInlineStart: '3px solid #52775a',
                        background: '#f3f6f0',
                        padding: '12px 14px',
                        marginTop: '6px',
                      }}>
                        <strong style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--ink-main)' }}>
                          الإرسال عبر حساب Telegram الخاص بتاجر تراك
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--ink-muted)', lineHeight: 1.8, display: 'block', marginTop: '4px' }}>
                          عند تفعيل «روابط التتبع» من إعدادات المتجر، يُدرج رابط هذا الطلب للإرسال تلقائياً إلى حساب Telegram الذي يمكن العثور عليه برقم الهاتف. لا يحتاج العميل إلى بدء محادثة مع بوت؛ ويعتمد نجاح العثور على الحساب على صحة الرقم وإعدادات خصوصية Telegram.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                      <button
                        type="submit"
                        className="dz-btn"
                        disabled={isCreatingOrder || (shouldDispatchToYalidine && (parcelOptionsLoading || Boolean(parcelOptionsError) || !parcelOptions))}
                        style={{ flex: 2, background: '#263b30', fontSize: '14px', fontWeight: 750, padding: '12px 20px', minHeight: '46px' }}
                      >
                        {isCreatingOrder ? 'جارٍ حفظ الطلب وإرسال الشحنة...' : shouldDispatchToYalidine ? 'إنشاء الشحنة وحفظ الطلب' : 'حفظ الطلب وجدولة التتبع'}
                      </button>
                      <button
                        type="button"
                        className="dz-btn dz-btn-outline"
                        onClick={() => closeAddOrder()}
                        disabled={isCreatingOrder}
                        style={{ flex: 1, fontSize: '14px', fontWeight: 750, padding: '12px 20px', minHeight: '46px' }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
              </aside>
            </div>

  ), document.body);
}
