'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { BrandedSelect } from '../../BrandedSelect';
import { Icons } from '../../components/DashboardIcons';
import { getYalidineManualParcelOptions, getYalidineManualFeeQuote } from '../../yalidine-actions';
import type { ManualOrderSuccess } from './useManualOrder';
import styles from './AddOrderPanel.module.css';

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
  const [deliveryTier, setDeliveryTier] = useState('express');
  const [feeQuote, setFeeQuote] = useState<any>(null);
  const [feeQuoteLoading, setFeeQuoteLoading] = useState(false);
  const [feeQuoteError, setFeeQuoteError] = useState('');
  const [hasExchange, setHasExchange] = useState(false);
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
    if (!isAddOrderPanelOpen || !shouldDispatchToYalidine || !fromWilayaId || !toWilayaId || !toCommuneId) {
      setFeeQuote(null);
      setFeeQuoteError('');
      setFeeQuoteLoading(false);
      return;
    }
    let active = true;
    setFeeQuoteLoading(true);
    setFeeQuoteError('');
    void getYalidineManualFeeQuote(Number(fromWilayaId), Number(toWilayaId), Number(toCommuneId))
      .then((result) => {
        if (!active) return;
        if (!result.success || !result.quote) {
          setFeeQuote(null);
          setFeeQuoteError(result.error || 'تعذّر جلب تسعيرة التوصيل الرسمية.');
          return;
        }
        setFeeQuote(result.quote);
      })
      .catch((error: any) => {
        if (active) setFeeQuoteError(error?.message || 'تعذّر جلب تسعيرة التوصيل الرسمية.');
      })
      .finally(() => { if (active) setFeeQuoteLoading(false); });
    return () => { active = false; };
  }, [isAddOrderPanelOpen, shouldDispatchToYalidine, fromWilayaId, toWilayaId, toCommuneId]);

  useEffect(() => {
    if (!isAddOrderPanelOpen || !shouldDispatchToYalidine || parcelOptions) return;
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
  }, [isAddOrderPanelOpen, shouldDispatchToYalidine, parcelOptions]);

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
                    <span className={styles.kicker}>تاجر تراك · الطلبات</span>
                    <h2 id="add-order-title" className={styles.title}>إضافة طلب جديد</h2>
                  </div>
                  <button
                    type="button"
                    className={"dz-order-detail-close " + styles.closeButton}
                    aria-label="إغلاق النافذة"
                    onClick={() => closeAddOrder()}
                    disabled={isCreatingOrder}
                  >
                    <Icons.X />
                  </button>
                </div>

                {newOrderSuccess ? (
                  <div className={styles.successView}>
                    <div className={styles.successMark} aria-hidden="true">
                      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h3 className={styles.successTitle}>
                      {newOrderSuccess.exchangeReplacement
                        ? newOrderSuccess.exchangeReplacementNeedsConfirmation
                          ? 'تم استلام الشحنة وتحتاج إلى تأكيد الربط'
                          : 'تم ربط الشحنة بطلب الاستبدال'
                        : newOrderSuccess.carrierShipmentCreated
                          ? 'تم إنشاء الشحنة بنجاح في Guepex'
                          : 'تم تسجيل الطلب بنجاح'}
                    </h3>
                    <p className={styles.successCopy}>
                      {newOrderSuccess.exchangeReplacement ? (
                        <>
                          مرجع الطلب الداخلي: <strong>{newOrderSuccess.externalOrderId}</strong>
                          <span>
                            {newOrderSuccess.exchangeReplacementNeedsConfirmation
                              ? 'توجد عدة طلبات استبدال مطابقة. راجع طلبات الاستبدال لتأكيد الربط.'
                              : 'ستظهر تحديثات الشحنة ضمن صفحة التتبع الأصلية.'}
                          </span>
                        </>
                      ) : (
                        <>
                          مرجع الطلب: <strong>{newOrderSuccess.externalOrderId}</strong>
                          {newOrderSuccess.telegramQueueCheckFailed
                            ? <span>تعذّر التحقق من جدولة رابط التتبع.</span>
                            : newOrderSuccess.telegramTrackingQueued
                              ? <span>تمت جدولة رابط التتبع عبر تيليجرام.</span>
                              : newOrderSuccess.telegramTrackingEnabled
                                ? <span>لم تتم جدولة رابط التتبع رغم تفعيل الخدمة.</span>
                                : null}
                        </>
                      )}
                    </p>

                    {newOrderSuccess.carrierTrackingNumber && (
                      <div className={styles.trackingCode}>
                        <span>رقم التتبع لدى ياليدين</span>
                        <strong dir="ltr">{newOrderSuccess.carrierTrackingNumber}</strong>
                        {newOrderSuccess.carrierShipmentReused && <small>تم ربط الشحنة الموجودة دون إنشاء شحنة ثانية.</small>}
                        {newOrderSuccess.carrierLabelUrl && (
                          <a href={newOrderSuccess.carrierLabelUrl} target="_blank" rel="noreferrer">
                            فتح بوليصة الشحن
                          </a>
                        )}
                      </div>
                    )}

                    {!newOrderSuccess.exchangeReplacement && (
                      <>
                        <div className={styles.trackingUrl} dir="ltr">
                          {siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/{newOrderSuccess.trackingUuid}
                        </div>
                        <div className={styles.successActions}>
                          <a
                            href={`/t/${newOrderSuccess.trackingUuid}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.successPrimary}
                          >
                            <Icons.ExternalLink /> فتح صفحة التتبع
                          </a>
                          <button
                            type="button"
                            className={styles.successSecondary}
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
                      className={styles.successClose}
                      onClick={closeAddOrderSuccess}
                    >
                      إغلاق
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateOrder} className={styles.form}>
                    {addOrderError && (
                      <div className={styles.error} role="alert">
                        <Icons.AlertTriangle />
                        <span>{addOrderError}</span>
                      </div>
                    )}

                    <section className={styles.section}>
                      <div className={styles.sectionHeading}>
                        <h3>بيانات العميل</h3>
                        <span>معلومات الطلب الأساسية</span>
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>مرجع الطلب في تاجر تراك *</label>
                        <input
                          type="text"
                          name="external_order_id"
                          defaultValue={'ORD-' + Math.floor(100000 + Math.random() * 900000)}
                          required
                          className={styles.input}
                          placeholder="ORD-123456"
                          dir="ltr"
                        />
                      </div>
                      <div className={styles.grid}>
                        <div className={styles.field}>
                          <label className={styles.label}>الاسم الشخصي *</label>
                          <input type="text" name="customer_firstname" placeholder="محمد" required className={styles.input} maxLength={80} />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>اللقب *</label>
                          <input type="text" name="customer_lastname" placeholder="عبد الله" required className={styles.input} maxLength={100} />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>رقم الهاتف الأساسي *</label>
                          <input type="tel" name="customer_phone" placeholder="0550123456" required className={styles.input} dir="ltr" />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>رقم هاتف إضافي</label>
                          <input type="tel" name="customer_phone2" placeholder="0660123456" className={styles.input} dir="ltr" />
                        </div>
                      </div>
                    </section>

                    <section className={styles.section}>
                      <div className={styles.sectionHeading}>
                        <h3>بيانات الشحنة</h3>
                        <span>شركة التوصيل ومحتويات الطرد</span>
                      </div>
                      <div className={styles.grid}>
                        <div className={styles.field}>
                          <label className={styles.label}>شركة التوصيل</label>
                          <BrandedSelect
                            name="carrier_name"
                            ariaLabel="شركة التوصيل"
                            value={carrierName}
                            onChange={(value) => setCarrierName(value)}
                            variant="field"
                            className={styles.select}
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
                        <div className={styles.field}>
                          <label className={styles.label}>رقم التتبع لدى شركة التوصيل</label>
                          <input
                            type="text"
                            name="carrier_tracking_number"
                            value={manualTrackingNumber}
                            onChange={(event) => setManualTrackingNumber(event.target.value)}
                            placeholder="أدخل رقم تتبع موجوداً"
                            className={styles.input}
                            dir="ltr"
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>المنتج / محتوى الشحنة {shouldDispatchToYalidine ? '*' : '(اختياري)'}</label>
                          <input
                            type="text"
                            name="product_name"
                            maxLength={255}
                            placeholder="مثال: ساعة ذكية × 2"
                            className={styles.input}
                            required={shouldDispatchToYalidine}
                          />
                        </div>
                        <div className={styles.field}>
                          <label className={styles.label}>الحالة الأولية</label>
                          <BrandedSelect
                            name="status_raw"
                            ariaLabel="الحالة الأولية"
                            defaultValue="order_placed"
                            variant="field"
                            className={styles.select}
                            options={[
                              { value: 'order_placed', label: 'تم استلام الطلب' },
                              { value: 'processing', label: 'قيد التجهيز' },
                              { value: 'shipped', label: 'خرج للشحن والتوصيل' },
                            ]}
                          />
                        </div>
                      </div>
                    </section>

                    {carrierName === 'Yalidine Express' && (
                      <section className={styles.section}>
                        <label className={styles.toggleRow}>
                          <input
                            type="checkbox"
                            name="send_to_yalidine"
                            checked={sendToYalidine}
                            onChange={(event) => setSendToYalidine(event.target.checked)}
                          />
                          <span>
                            <strong>إنشاء الشحنة مباشرة في Guepex</strong>
                            <small>إرسال بيانات العميل وإنشاء بوليصة الشحن الآن.</small>
                          </span>
                        </label>

                        {manualTrackingNumber.trim() ? (
                          <p className={styles.inlineNote}>سيتم ربط رقم التتبع المدخل فقط.</p>
                        ) : sendToYalidine ? (
                          <>
                            {parcelOptionsLoading && <p className={styles.inlineNote} role="status">جارٍ تحميل خيارات التوصيل…</p>}
                            {parcelOptionsError && (
                              <p className={styles.inlineError} role="alert">
                                {parcelOptionsError}
                              </p>
                            )}
                            {parcelOptions && (
                              <div className={styles.shippingFields}>
                                <div className={styles.sectionHeading}>
                                  <h3>عنوان ووجهة التوصيل</h3>
                                  <span>اختر الولاية والبلدية بدقة</span>
                                </div>
                                <div className={styles.grid}>
                                  <div className={styles.field}>
                                    <label className={styles.label}>ولاية الانطلاق *</label>
                                    <BrandedSelect
                                      name="from_wilaya_id"
                                      ariaLabel="ولاية انطلاق الشحنة"
                                      value={fromWilayaId}
                                      onChange={setFromWilayaId}
                                      variant="field"
                                      className={styles.select}
                                      options={[
                                        { value: '', label: 'اختر الولاية', disabled: true },
                                        ...parcelOptions.wilayas.map((item: any) => ({ value: String(item.id), label: item.name })),
                                      ]}
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>ولاية المستلم *</label>
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
                                      className={styles.select}
                                      options={[
                                        { value: '', label: 'اختر الولاية', disabled: true },
                                        ...destinationWilayas.map((item: any) => ({ value: String(item.id), label: item.name })),
                                      ]}
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>بلدية المستلم *</label>
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
                                      className={styles.select}
                                      options={[
                                        { value: '', label: toWilayaId ? 'اختر البلدية' : 'اختر ولاية المستلم أولاً', disabled: true },
                                        ...destinationCommunes.map((item: any) => ({ value: String(item.id), label: item.name })),
                                      ]}
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>عنوان المستلم *</label>
                                    <input
                                      className={styles.input}
                                      type="text"
                                      name="carrier_address"
                                      maxLength={255}
                                      required={shouldDispatchToYalidine}
                                      placeholder="الحي، الشارع، رقم المنزل"
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>طريقة التوصيل *</label>
                                    <BrandedSelect
                                      name="delivery_type"
                                      ariaLabel="طريقة التوصيل"
                                      value={deliveryType}
                                      onChange={(value) => {
                                        setDeliveryType(value);
                                        setStopDeskId('');
                                      }}
                                      variant="field"
                                      className={styles.select}
                                      options={[
                                        { value: 'home', label: 'توصيل إلى المنزل' },
                                        { value: 'stopdesk', label: 'استلام من المكتب' },
                                      ]}
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>الوزن (كغ) *</label>
                                    <input className={styles.input} type="number" name="shipment_weight" min={1} max={100} step={1} defaultValue={1} required={shouldDispatchToYalidine} />
                                  </div>
                                  {deliveryType === 'stopdesk' && (
                                    <div className={styles.field}>
                                      <label className={styles.label}>مكتب الاستلام *</label>
                                      <BrandedSelect
                                        name="stopdesk_id"
                                        ariaLabel="مكتب الاستلام"
                                        value={stopDeskId}
                                        onChange={setStopDeskId}
                                        variant="field"
                                        className={styles.select}
                                        options={[
                                          { value: '', label: 'اختر مكتب الاستلام', disabled: true },
                                          ...stopDeskCenters.map((item: any) => ({
                                            value: String(item.center_id),
                                            label: item.name + (item.address ? ' — ' + item.address : ''),
                                          })),
                                        ]}
                                      />
                                      {stopDeskCenters.length === 0 && (
                                        <p className={styles.inlineNote}>لا يوجد مكتب استلام متاح لهذه البلدية.</p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className={styles.sectionHeading}>
                                  <h3>المبلغ والتفاصيل</h3>
                                  <span>قيمة التحصيل نفسها تُرسل كقيمة مصرّح بها</span>
                                </div>
                                <div className={styles.grid}>
                                  <div className={styles.field}>
                                    <label className={styles.label}>المبلغ المطلوب تحصيله من العميل (دج) *</label>
                                    <input
                                      className={styles.input}
                                      type="number"
                                      name="shipment_amount"
                                      min={0}
                                      max={150000}
                                      step={1}
                                      required={shouldDispatchToYalidine}
                                      placeholder="4500"
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>من يدفع رسوم التوصيل؟ *</label>
                                    <BrandedSelect
                                      name="delivery_fee_payer"
                                      ariaLabel="دافع رسوم التوصيل"
                                      defaultValue="receiver"
                                      variant="field"
                                      className={styles.select}
                                      options={[
                                        { value: 'receiver', label: 'العميل عند الاستلام' },
                                        { value: 'sender', label: 'المتجر (توصيل مجاني)' },
                                      ]}
                                    />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>نوع الخدمة *</label>
                                    <BrandedSelect
                                      name="delivery_tier"
                                      ariaLabel="نوع خدمة التوصيل"
                                      value={deliveryTier}
                                      onChange={setDeliveryTier}
                                      variant="field"
                                      className={styles.select}
                                      options={[
                                        { value: 'express', label: 'سريع' },
                                        { value: 'economic', label: 'اقتصادي' },
                                      ]}
                                    />
                                  </div>
                                  {parcelOptions.platform === 'guepex' && (
                                    <div className={styles.field}>
                                      <label className={styles.label}>السماح بفتح الطرد قبل الاستلام</label>
                                      <BrandedSelect
                                        name="opening_decision"
                                        ariaLabel="قرار فتح الطرد"
                                        defaultValue="accept"
                                        variant="field"
                                        className={styles.select}
                                        options={[
                                          { value: 'accept', label: 'مسموح' },
                                          { value: 'reject', label: 'غير مسموح' },
                                        ]}
                                      />
                                    </div>
                                  )}
                                </div>

                                <div className={styles.dimensions}>
                                  <div className={styles.field}>
                                    <label className={styles.label}>الطول (سم) *</label>
                                    <input className={styles.input} type="number" name="shipment_length" min={0} max={500} step={1} defaultValue={0} required={shouldDispatchToYalidine} />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>العرض (سم) *</label>
                                    <input className={styles.input} type="number" name="shipment_width" min={0} max={500} step={1} defaultValue={0} required={shouldDispatchToYalidine} />
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>الارتفاع (سم) *</label>
                                    <input className={styles.input} type="number" name="shipment_height" min={0} max={500} step={1} defaultValue={0} required={shouldDispatchToYalidine} />
                                  </div>
                                </div>

                                <div className={styles.optionsRow}>
                                  <label className={styles.checkboxRow}>
                                    <input type="checkbox" name="do_insurance" />
                                    <span>تأمين الشحنة</span>
                                  </label>
                                  <label className={styles.checkboxRow}>
                                    <input type="checkbox" name="has_exchange" checked={hasExchange} onChange={(event) => setHasExchange(event.target.checked)} />
                                    <span>استبدال منتج عند التسليم</span>
                                  </label>
                                </div>

                                {hasExchange && (
                                  <div className={styles.field}>
                                    <label className={styles.label}>المنتج الذي سيستلمه المندوب *</label>
                                    <input className={styles.input} type="text" name="product_to_collect" maxLength={255} required={shouldDispatchToYalidine && hasExchange} placeholder="المنتج القديم أو المقاس السابق" />
                                  </div>
                                )}

                                {feeQuoteLoading && <p className={styles.inlineNote} role="status">جارٍ جلب تعرفة التوصيل…</p>}
                                {feeQuoteError && <p className={styles.inlineError} role="alert">{feeQuoteError}</p>}
                                {feeQuote && (
                                  <div className={styles.feeSummary}>
                                    <span>تعرفة التوصيل لهذه الوجهة</span>
                                    <strong>
                                      {(deliveryType === 'stopdesk'
                                        ? (deliveryTier === 'economic' ? feeQuote.economicDesk : feeQuote.expressDesk)
                                        : (deliveryTier === 'economic' ? feeQuote.economicHome : feeQuote.expressHome)
                                      ) ?? 'غير متاحة'} دج
                                    </strong>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : null}
                      </section>
                    )}

                    <div className={styles.formFooter}>
                      <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={isCreatingOrder || (shouldDispatchToYalidine && (parcelOptionsLoading || Boolean(parcelOptionsError) || !parcelOptions))}
                      >
                        {isCreatingOrder ? 'جارٍ حفظ الطلب وإرسال الشحنة…' : shouldDispatchToYalidine ? 'إنشاء الشحنة وحفظ الطلب' : 'حفظ الطلب'}
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => closeAddOrder()}
                        disabled={isCreatingOrder}
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
