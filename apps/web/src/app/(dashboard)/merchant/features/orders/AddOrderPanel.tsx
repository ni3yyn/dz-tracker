'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { BrandedSelect } from '../../BrandedSelect';
import { Icons } from '../../components/DashboardIcons';
import { getYalidineManualParcelOptions, getYalidineManualParcelOptionsCacheVersion, getYalidineManualFeeQuote } from '../../yalidine-actions';
import { readManualParcelOptionsCache, writeManualParcelOptionsCache } from './manual-parcel-options-cache';
import type { ManualOrderSuccess } from './useManualOrder';
import { useManualOrder } from './useManualOrder';
import { normalizeMerchantServerError } from '../../../../../lib/merchant-error-messages';
import styles from './AddOrderPanel.module.css';

interface AddOrderPanelProps {
  merchantId: string;
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
  panelNotice: string | null;
}


function AnimatedScreenStage({
  mode,
  children,
}: {
  mode: 'form' | 'success';
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousModeRef = useRef(mode);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    const parent = stage?.parentElement;
    if (!stage || !content || !parent) return;

    let frame = 0;
    let active = true;

    const measure = () => {
      if (!active) return;
      const parentStyle = window.getComputedStyle(parent);
      const horizontalPadding =
        (Number.parseFloat(parentStyle.paddingInlineStart) || 0) +
        (Number.parseFloat(parentStyle.paddingInlineEnd) || 0);
      const availableWidth = Math.max(0, parent.clientWidth - horizontalPadding);
      const targetWidth = mode === 'success'
        ? Math.min(460, availableWidth)
        : availableWidth;
      const nextWidth = `${Math.round(targetWidth)}px`;

      if (!stage.dataset.ready) stage.style.transition = 'none';
      if (stage.style.width !== nextWidth) stage.style.width = nextWidth;

      const nextHeight = `${Math.ceil(content.getBoundingClientRect().height)}px`;
      if (stage.style.height !== nextHeight) stage.style.height = nextHeight;

      if (!stage.dataset.ready) {
        void stage.offsetHeight;
        stage.dataset.ready = 'true';
        stage.style.removeProperty('transition');
      }
    };

    const scheduleMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;
    measure();

    if (previousMode !== mode && mode === 'success') {
      const panel = stage.closest('.dz-order-side-panel');
      if (panel instanceof HTMLElement) {
        panel.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }
    }

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleMeasure)
      : null;
    observer?.observe(content);
    observer?.observe(parent);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      active = false;
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [mode]);

  return (
    <div ref={stageRef} className={styles.screenStage} data-mode={mode}>
      <div ref={contentRef} className={styles.screenStageContent}>
        {children}
      </div>
    </div>
  );
}

interface AddOrderPanelControllerProps {
  merchantId: string;
  telegramEnabled: boolean;
  siteUrl: string;
}

export const AddOrderPanelController = memo(function AddOrderPanelController({
  merchantId,
  telegramEnabled,
  siteUrl,
}: AddOrderPanelControllerProps) {
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const showToast = useCallback((message: string) => setPanelNotice(message), []);
  const order = useManualOrder({ merchantId, telegramEnabled, showToast });

  useEffect(() => {
    const handleOpen = () => order.openAddOrder();
    window.addEventListener('tajertrack:add-order-open', handleOpen);
    return () => window.removeEventListener('tajertrack:add-order-open', handleOpen);
  }, [order.openAddOrder]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && order.isAddOrderModalOpen && !order.isCreatingOrder) {
        order.closeAddOrder();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [order.closeAddOrder, order.isAddOrderModalOpen, order.isCreatingOrder]);

  useEffect(() => {
    window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
  }, [order.isAddOrderPanelMounted, order.isAddOrderModalOpen]);

  useEffect(() => {
    if (!panelNotice) return;
    const timer = window.setTimeout(() => setPanelNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [panelNotice]);

  const copyToClipboard = useCallback((text: string, _id: string) => {
    if (!navigator.clipboard?.writeText) {
      showToast('تعذّر نسخ رابط التتبع من هذا المتصفح.');
      return;
    }
    void navigator.clipboard.writeText(text)
      .then(() => showToast('تم نسخ رابط التتبع'))
      .catch(() => showToast('تعذّر نسخ رابط التتبع.'));
  }, [showToast]);

  return (
    <AddOrderPanel
      {...order}
      merchantId={merchantId}
      siteUrl={siteUrl}
      copyToClipboard={copyToClipboard}
      showToast={showToast}
      panelNotice={panelNotice}
    />
  );
});

export function AddOrderPanel({
  merchantId,
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
  panelNotice,
}: AddOrderPanelProps) {
  const [carrierName, setCarrierName] = useState('Yalidine Express');
  const [sendToYalidine, setSendToYalidine] = useState(true);
  const [manualTrackingNumber, setManualTrackingNumber] = useState('');
  const [productQuantity, setProductQuantity] = useState('1');
  const [deliveryFeePayer, setDeliveryFeePayer] = useState<'receiver' | 'sender'>('receiver');
  const [parcelOptions, setParcelOptions] = useState<any>(null);
  const [parcelOptionsLoading, setParcelOptionsLoading] = useState(false);
  const [parcelOptionsError, setParcelOptionsError] = useState('');
  const parcelOptionsLoadAttemptRef = useRef(false);
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
  const submitFeedback = addOrderError || parcelOptionsError || feeQuoteError;

  const destinationWilayas = useMemo(
    () => (parcelOptions?.wilayas || []).filter((item: any) => item.is_deliverable),
    [parcelOptions]
  );
  const destinationCommunes = useMemo(
    () => (parcelOptions?.communes || []).filter((item: any) =>
      item.wilaya_id === Number(toWilayaId) && (
        item.is_deliverable ||
        (deliveryType === 'stopdesk' && (parcelOptions?.centers || []).some((center: any) =>
          center.wilaya_id === Number(toWilayaId) && center.commune_id === item.id
        ))
      )
    ),
    [parcelOptions, toWilayaId, deliveryType]
  );
  const stopDeskCenters = useMemo(
    () => (parcelOptions?.centers || []).filter((item: any) =>
      item.wilaya_id === Number(toWilayaId)
    ),
    [parcelOptions, toWilayaId]
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
          setFeeQuoteError(normalizeMerchantServerError(result.error || 'تعذّر جلب تسعيرة التوصيل الرسمية.', 'fees'));
          return;
        }
        setFeeQuote(result.quote);
      })
      .catch((error: any) => {
        if (active) setFeeQuoteError(normalizeMerchantServerError(error, 'fees'));
      })
      .finally(() => { if (active) setFeeQuoteLoading(false); });
    return () => { active = false; };
  }, [isAddOrderPanelOpen, shouldDispatchToYalidine, fromWilayaId, toWilayaId, toCommuneId]);

  useEffect(() => {
    if (!isAddOrderPanelOpen || !shouldDispatchToYalidine) return;
    if (parcelOptionsLoadAttemptRef.current) return;

    parcelOptionsLoadAttemptRef.current = true;
    let active = true;
    let cachedOptions: any = null;

    const applyOptions = (options: any) => {
      setParcelOptions(options);
      const defaultSender = options.wilayas.find((item: any) =>
        item.name.toLocaleLowerCase() === 'alger'
      ) || options.wilayas[0];
      if (defaultSender) {
        setFromWilayaId((current) => current || String(defaultSender.id));
      }
    };

    const loadOptions = async () => {
      setParcelOptionsError('');
      setParcelOptionsLoading(true);
      try {
        // This action only checks the active connection and does not call Guepex.
        const scope = await getYalidineManualParcelOptionsCacheVersion();
        if (!active) return;
        if (!scope.success || !scope.cacheVersion) {
          throw new Error(scope.error || 'تعذّر التحقق من ربط شركة التوصيل.');
        }

        const cached = readManualParcelOptionsCache<any>(merchantId, scope.cacheVersion);
        if (cached) {
          cachedOptions = cached.options;
          applyOptions(cached.options);
          // Cached options are usable immediately, including while stale data refreshes.
          setParcelOptionsLoading(false);
        }

        // A fresh 24-hour browser cache avoids all three location-list API lookups.
        if (cached?.isFresh) return;

        const result = await getYalidineManualParcelOptions();
        if (!active) return;
        if (!result.success || !result.options) {
          if (!cachedOptions) {
            setParcelOptionsError(normalizeMerchantServerError(
              result.error || 'تعذّر تحميل مواقع شركة التوصيل.',
              'locations'
            ));
          }
          // Keep stale cached data when Guepex is rate-limiting or unavailable.
          return;
        }

        const currentVersion = result.cacheVersion || scope.cacheVersion;
        writeManualParcelOptionsCache(merchantId, currentVersion, result.options);
        applyOptions(result.options);
        setParcelOptionsError('');
      } catch (error: any) {
        if (active && !cachedOptions) {
          setParcelOptionsError(normalizeMerchantServerError(error, 'locations'));
        }
      } finally {
        if (active) {
          setParcelOptionsLoading(false);
          parcelOptionsLoadAttemptRef.current = false;
        }
      }
    };

    void loadOptions();
    return () => {
      active = false;
      parcelOptionsLoadAttemptRef.current = false;
    };
  }, [isAddOrderPanelOpen, shouldDispatchToYalidine, merchantId]);

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

                <AnimatedScreenStage mode={newOrderSuccess ? 'success' : 'form'}>
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
                        : newOrderSuccess.carrierShipmentReused
                          ? 'تم ربط الشحنة الموجودة بنجاح'
                          : newOrderSuccess.carrierShipmentCreated
                            ? 'تم إرسال الشحنة بنجاح إلى Guepex'
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
                    <section className={styles.section}>
                      <div className={styles.sectionHeading}>
                        <h3>بيانات العميل</h3>
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
                      </div>
                      <div className={styles.grid}>
                        <div className={styles.field}>
                          <label className={styles.label}>شركة التوصيل</label>
                          <BrandedSelect
                            name="carrier_name"
                            ariaLabel="شركة التوصيل"
                            value={carrierName}
                            onChange={(value) => {
                              setCarrierName(value);
                              if (value === 'Yalidine Express') setManualTrackingNumber('');
                            }}
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
                        {carrierName !== 'Yalidine Express' && (
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
                        )}
                        <div className={styles.field}>
                          <label className={styles.label}>المنتج / محتوى الشحنة {shouldDispatchToYalidine ? '*' : '(اختياري)'}</label>
                          <div className={styles.productDescriptionRow}>
                            <input
                              type="text"
                              name="product_name"
                              maxLength={255}
                              placeholder="مثال: ساعة ذكية"
                              className={styles.input}
                              required={shouldDispatchToYalidine}
                            />
                            {shouldDispatchToYalidine && (
                              <BrandedSelect
                                name="product_quantity"
                                ariaLabel="عدد القطع"
                                value={productQuantity}
                                onChange={setProductQuantity}
                                variant="field"
                                className={styles.productQuantitySelect}
                                options={Array.from({ length: 20 }, (_, index) => ({
                                  value: String(index + 1),
                                  label: String(index + 1),
                                }))}
                              />
                            )}
                          </div>
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
                          </span>
                        </label>

                        {manualTrackingNumber.trim() ? (
                          <p className={styles.inlineNote}>سيتم ربط رقم التتبع المدخل فقط.</p>
                        ) : sendToYalidine ? (
                          <>
                            {parcelOptionsLoading && <p className={styles.inlineNote} role="status">جارٍ تحميل خيارات التوصيل…</p>}
                            {parcelOptions && (
                              <div className={styles.shippingFields}>
                                <div className={styles.sectionHeading}>
                                  <h3>عنوان ووجهة التوصيل</h3>
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
                                        onChange={(value) => {
                                          const selectedCenter = stopDeskCenters.find((item: any) =>
                                            String(item.center_id) === value
                                          );
                                          setStopDeskId(value);
                                          if (selectedCenter?.commune_id) {
                                            setToCommuneId(String(selectedCenter.commune_id));
                                          }
                                        }}
                                        variant="field"
                                        className={styles.select}
                                        options={[
                                          { value: '', label: 'اختر مكتب الاستلام', disabled: true },
                                          ...stopDeskCenters.map((item: any) => ({
                                            value: String(item.center_id),
                                            label: item.name +
                                              (item.commune_name ? ' — ' + item.commune_name : '') +
                                              (item.address ? ' · ' + item.address : ''),
                                          })),
                                        ]}
                                      />
                                      {stopDeskCenters.length === 0 && (
                                        <p className={styles.inlineNote}>لا توجد مكاتب استلام متاحة في هذه الولاية.</p>
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
                                    <label className={styles.label}>سعر المنتج (بدون سعر التوصيل) (دج) *</label>
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
                                    <p className={styles.inlineNote}>أدخل السعر الإجمالي لجميع القطع، وليس سعر القطعة الواحدة.</p>
                                  </div>
                                  <div className={styles.field}>
                                    <label className={styles.label}>من يدفع رسوم التوصيل؟ *</label>
                                    <BrandedSelect
                                      name="delivery_fee_payer"
                                      ariaLabel="دافع رسوم التوصيل"
                                      value={deliveryFeePayer}
                                      onChange={(value) => setDeliveryFeePayer(value === 'sender' ? 'sender' : 'receiver')}
                                      variant="field"
                                      className={styles.select}
                                      options={[
                                        { value: 'receiver', label: 'العميل عند الاستلام' },
                                        { value: 'sender', label: 'المتجر (توصيل مجاني)' },
                                      ]}
                                    />
                                    <p className={styles.inlineNote}>
                                      {deliveryFeePayer === 'receiver'
                                        ? 'أدخل ثمن المنتجات فقط. ستضيف Guepex رسوم التوصيل إلى المبلغ الذي يدفعه العميل عند الاستلام.'
                                        : 'أدخل ثمن المنتجات فقط. يتحمل المتجر رسوم التوصيل بشكل منفصل، ولن تُضاف إلى ما يدفعه العميل.'}
                                    </p>
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
                      <div
                        className={styles.footerFeedback}
                        data-visible={submitFeedback ? 'true' : 'false'}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        <div className={styles.footerFeedbackInner}>
                          {submitFeedback && (
                            <div className={styles.error} role="alert">
                              <Icons.AlertTriangle />
                              <span>{submitFeedback}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={isCreatingOrder || (shouldDispatchToYalidine && (parcelOptionsLoading || Boolean(parcelOptionsError) || !parcelOptions))}
                        aria-busy={isCreatingOrder}
                      >
                        <span>{shouldDispatchToYalidine ? 'إنشاء الشحنة وحفظ الطلب' : 'حفظ الطلب'}</span>
                        <span className={styles.submitSpinner} data-active={isCreatingOrder ? 'true' : 'false'} aria-hidden="true" />
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
                </AnimatedScreenStage>
              </div>
              </aside>
              <div
                className={styles.panelNotice}
                data-visible={panelNotice ? 'true' : 'false'}
                role="status"
                aria-live="polite"
              >
                {panelNotice}
              </div>
            </div>

  ), document.body);
}
