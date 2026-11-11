'use client';

import { createPortal } from 'react-dom';
import type { FormEvent } from 'react';
import { BrandedSelect } from '../../BrandedSelect';
import { Icons } from '../../components/DashboardIcons';
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
                    <span className="dz-order-detail-kicker">شحنة تجريبية / يدوية</span>
                    <h2 id="add-order-title" style={{ fontSize: '22px', fontWeight: 850 }}>إضافة طلب جديد</h2>
                    <p>أدخل بيانات الطلب لتجربة التتبع المباشر وإرسال رابط تيليجرام</p>
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
                      تم تسجيل الطلب بنجاح!
                    </h3>
                    <p style={{ margin: '0 0 18px', fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                      رقم الطلب: <strong>{newOrderSuccess.externalOrderId}</strong><br />
                      {newOrderSuccess.telegramQueueCheckFailed ? 'تم تسجيل الطلب، لكن تعذّر التحقق من حالة جدولة رابط التتبع.' : newOrderSuccess.telegramTrackingQueued ? 'تم إدراج رابط التتبع في طابور تيليجرام، وسيحاول حساب تاجر تراك إرساله إلى الحساب المرتبط برقم العميل.' : newOrderSuccess.telegramTrackingEnabled ? 'الخدمة مفعّلة، لكن لم تُدرج مهمة الإرسال. تحقق من تطبيق تحديث قاعدة البيانات وسجلات العامل.' : 'خدمة إرسال روابط التتبع عبر تيليجرام متوقفة حالياً. فعّلها من إعدادات المتجر لإرسال روابط الطلبات الجديدة.'}
                    </p>

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
                            defaultValue="Yalidine Express"
                            variant="field"
                            options={[
                              { value: 'Yalidine Express', label: 'Yalidine Express (ياليدين)' },
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
                            placeholder="اختياري (YAL-1234)"
                            className="dz-input-field"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            اسم المنتج (اختياري)
                          </label>
                          <input
                            type="text"
                            name="product_name"
                            placeholder="ساعة ذكية Ultra"
                            className="dz-input-field"
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
                        disabled={isCreatingOrder}
                        style={{ flex: 2, background: '#263b30', fontSize: '14px', fontWeight: 750, padding: '12px 20px', minHeight: '46px' }}
                      >
                        {isCreatingOrder ? 'جاري إنشاء الطلب...' : 'إنشاء الطلب وجدولة التتبع'}
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
