import type { FormEvent } from 'react';
import { ImageUploadField } from '../ImageUploadField';
import { Icons } from '../components/DashboardIcons';
import type { MerchantUpsellItem, ReorderDirection } from '../shared/upsell-types';

interface UpsellsTabProps {
  merchantId: string;
  siteUrl: string;
  orders: Array<{ tracking_uuid: string }>;
  upsells: MerchantUpsellItem[];
  editingUpsellId: string | null;
  onCancelEdit: () => void;
  scrapeUrl: string;
  onScrapeUrlChange: (value: string) => void;
  isScraping: boolean;
  scrapeError: string | null;
  onScrapeProductUrl: () => Promise<void>;
  onSaveUpsellSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  title: string;
  onTitleChange: (value: string) => void;
  productUrl: string;
  onProductUrlChange: (value: string) => void;
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  price: string;
  onPriceChange: (value: string) => void;
  isActive: boolean;
  onActiveChange: (value: boolean) => void;
  isSaving: boolean;
  saveError: string | null;
  reorderingId: string | null;
  togglingId: string | null;
  deletingId: string | null;
  onReorder: (id: string, direction: ReorderDirection) => Promise<void>;
  onToggle: (item: MerchantUpsellItem) => Promise<void>;
  onEdit: (item: MerchantUpsellItem) => void;
  onDelete: (id: string) => Promise<void>;
}

export function UpsellsTab({
  merchantId,
  siteUrl,
  orders,
  upsells,
  editingUpsellId,
  onCancelEdit,
  scrapeUrl,
  onScrapeUrlChange,
  isScraping,
  scrapeError,
  onScrapeProductUrl,
  onSaveUpsellSubmit,
  title,
  onTitleChange,
  productUrl,
  onProductUrlChange,
  imageUrl,
  onImageUrlChange,
  price,
  onPriceChange,
  isActive,
  onActiveChange,
  isSaving,
  saveError,
  reorderingId,
  togglingId,
  deletingId,
  onReorder,
  onToggle,
  onEdit,
  onDelete,
}: UpsellsTabProps) {
  return (
            <div className="dz-upsell-container" aria-label="زيادة المبيعات وعرض المنتجات التكميلية">
              {/* HERO BANNER */}
              <div className="dz-upsell-hero-banner">
                <div className="dz-upsell-hero-text">
                  <h3>
                    <Icons.ShoppingBag /> زيادة المبيعات (قد يعجبك أيضاً)
                  </h3>
                  <p>
                    تظهر هذه المنتجات في أسفل صفحة التتبع لزبائنك عندما يتابعون مسار شحنتهم. الصق رابط أي منتج من متجرك (Shopify، YouCan، WooCommerce، WordPress، أو متجر مبرمج) لجلبه تلقائياً بنقرة واحدة!
                  </p>
                </div>
                {orders.length > 0 && orders[0].tracking_uuid && (
                  <a
                    href={`${siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/${orders[0].tracking_uuid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dz-upsell-hero-badge"
                    style={{ textDecoration: 'none' }}
                  >
                    <Icons.ExternalLink /> معاينة صفحة التتبع الحية
                  </a>
                )}
              </div>

              {/* FORM CARD: SMART SCRAPER & MANUAL EDIT */}
              <div id="dz-upsell-form-anchor" className="dz-upsell-form-card">
                <div className="dz-upsell-form-head">
                  <div>
                    <h3>
                      {editingUpsellId ? <Icons.Edit /> : <Icons.Plus />}
                      {editingUpsellId ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد'}
                    </h3>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {editingUpsellId ? 'قم بتعديل بيانات المنتج ثم اضغط على حفظ التعديلات' : 'يمكنك جلب المنتج تلقائياً بالرابط أو كتابة تفاصيله يدوياً'}
                    </span>
                  </div>
                  {editingUpsellId && (
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="dz-btn dz-btn-outline"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>

                {/* SMART SCRAPER BAR */}
                <div className="dz-smart-fetch-box">
                  <label className="dz-smart-fetch-label">
                   جلب تلقائي بالرابط (Shopify, YouCan, WooCommerce, متجر خاص)
                  </label>
                  <div className="dz-smart-fetch-row">
                    <input
                      type="url"
                      className="dz-smart-fetch-input"
                      placeholder="https://mystore.com/products/example-product"
                      value={scrapeUrl}
                      onChange={(e) => onScrapeUrlChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          onScrapeProductUrl();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="dz-smart-fetch-btn"
                      onClick={onScrapeProductUrl}
                      disabled={isScraping || !scrapeUrl.trim()}
                    >
                      <Icons.Sparkles />
                      {isScraping ? 'جاري الاستخراج...' : 'جلب تلقائي'}
                    </button>
                  </div>
                  {scrapeError && (
                    <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icons.AlertTriangle /> {scrapeError}
                    </div>
                  )}
                </div>

                {/* PRODUCT FORM */}
                <form onSubmit={onSaveUpsellSubmit}>
                  {saveError && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icons.AlertTriangle /> {saveError}
                    </div>
                  )}

                  <div className="dz-upsell-inputs-grid">
                    <div className="dz-upsell-field">
                      <label>عنوان المنتج *</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: حقيبة ظهر كلاسيكية مضادة للماء"
                        value={title}
                        onChange={(e) => onTitleChange(e.target.value)}
                      />
                    </div>

                    <div className="dz-upsell-field">
                      <label>رابط صفحة المنتج (Destination URL) *</label>
                      <input
                        type="url"
                        required
                        dir="ltr"
                        placeholder="https://mystore.com/products/bag"
                        value={productUrl}
                        onChange={(e) => onProductUrlChange(e.target.value)}
                      />
                      <small>الرابط الذي سيفتح للعميل في نافذة جديدة عند النقر على المنتج</small>
                    </div>

                    <div className="dz-upsell-field">
                      <ImageUploadField
                        label="صورة المنتج"
                        required
                        value={imageUrl}
                        onChange={onImageUrlChange}
                        merchantId={merchantId}
                        folder="upsell-products"
                        quality={0.68}
                      />
                    </div>

                    <div className="dz-upsell-field">
                      <label>السعر (اختياري)</label>
                      <input
                        type="text"
                        placeholder="مثال: 3,500 د.ج (اتركه فارغاً إذا كنت لا ترغب بعرض السعر)"
                        value={price}
                        onChange={(e) => onPriceChange(e.target.value)}
                      />
                      <small>إذا تركته فارغاً سيظهر المنتج بصورته وعنوانه فقط دون سعر</small>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', paddingTop: '10px', borderTop: '1px solid rgba(9, 9, 11, 0.06)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => onActiveChange(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: '#27342d', cursor: 'pointer' }}
                      />
                      تفعيل ظهور هذا المنتج في صفحة التتبع (نشط)
                    </label>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {editingUpsellId && (
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          className="dz-btn dz-btn-outline"
                        >
                          إلغاء
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="dz-btn"
                        style={{ background: '#27342d', color: '#fff', padding: '10px 22px' }}
                      >
                        {isSaving
                          ? 'جاري الحفظ...'
                          : editingUpsellId
                          ? '✓ حفظ التعديلات'
                          : '✓ إضافة المنتج وعرضه للزبائن'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* PRODUCTS LIST */}
              <div className="dz-upsell-list-card">
                <div className="dz-upsell-list-head">
                  <div>
                    <h3>
                      منتجاتك المضافة ({upsells.length})
                    </h3>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      النشط حالياً: {upsells.filter((u) => u.is_active).length} منتج · تحكم بترتيب الظهور بالأسهم
                    </span>
                  </div>

                  <div className="dz-upsell-stats-pills">
                    <div className="dz-upsell-stat-pill" title="إجمالي عدد نقرات الزبائن على المنتجات المقترحة">
                      <Icons.MousePointer />
                      <span>إجمالي النقرات: <b>{upsells.reduce((acc, u) => acc + (Number(u.clicks_count) || 0), 0)}</b></span>
                    </div>
                    <div className="dz-upsell-stat-pill active" title="عدد المنتجات النشطة والمعروضة في صفحة التتبع">
                      <span>المعروضة: <b>{upsells.filter((u) => u.is_active).length}</b></span>
                    </div>
                  </div>
                </div>

                {upsells.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                    <div style={{ width: '56px', height: '56px', margin: '0 auto 14px', borderRadius: '50%', background: '#f3f4f6', display: 'grid', placeItems: 'center', color: '#9ca3af' }}>
                      <Icons.ShoppingBag />
                    </div>
                    <strong style={{ display: 'block', fontSize: '15px', color: '#111827', marginBottom: '6px' }}>
                      لا توجد منتجات مضافة بعد
                    </strong>
                    <p style={{ margin: '0 auto', maxWidth: '440px', fontSize: '13px', lineHeight: 1.6 }}>
                      الصق رابط أي منتج من متجرك في الحقل أعلاه واضغط على «جلب تلقائي ⚡» لتظهر اقتراحات الشراء لزبائنك في صفحة التتبع فوراً!
                    </p>
                  </div>
                ) : (
                  <div className="dz-upsell-cards-grid">
                    {upsells.map((item, index) => (
                      <div
                        key={item.id}
                        className={`dz-upsell-item-card ${!item.is_active ? 'is-inactive' : ''}`}
                      >
                        <div className="dz-upsell-item-card-top">
                          <img
                            src={toCachedImageUrl(item.image_url)}
                            alt={item.title}
                            className="dz-upsell-item-card-img"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
                            }}
                          />
                          <div className="dz-upsell-item-card-meta">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <span className="dz-upsell-order-badge" title="ترتيب ظهور المنتج للزبون">
                                #{index + 1}
                              </span>
                              <span className="dz-upsell-clicks-badge" title={`تم النقر على هذا المنتج ${item.clicks_count || 0} مرة من قبل الزبائن`}>
                                <Icons.MousePointer /> {item.clicks_count || 0} نقرة
                              </span>
                            </div>
                            <h4 className="dz-upsell-item-card-title" title={item.title}>
                              {item.title}
                            </h4>
                            {item.price ? (
                              <span className="dz-upsell-item-card-price">{item.price}</span>
                            ) : (
                              <span className="dz-upsell-item-card-noprice">بدون سعر</span>
                            )}
                          </div>
                        </div>

                        <div className="dz-upsell-item-card-bottom">
                          <div className="dz-upsell-order-controls" aria-label="ترتيب ظهور المنتج">
                            <button
                              type="button"
                              className="dz-upsell-action-btn reorder-btn"
                              disabled={index === 0 || reorderingId !== null}
                              onClick={() => onReorder(item.id, 'up')}
                              title={index === 0 ? 'هذا أول منتج' : 'تقديم ترتيب المنتج للأعلى'}
                              aria-label="تقديم ترتيب المنتج للأعلى"
                            >
                              <Icons.ArrowUp />
                            </button>
                            <button
                              type="button"
                              className="dz-upsell-action-btn reorder-btn"
                              disabled={index === upsells.length - 1 || reorderingId !== null}
                              onClick={() => onReorder(item.id, 'down')}
                              title={index === upsells.length - 1 ? 'هذا آخر منتج' : 'تأخير ترتيب المنتج للأسفل'}
                              aria-label="تأخير ترتيب المنتج للأسفل"
                            >
                              <Icons.ArrowDown />
                            </button>
                          </div>

                          <button
                            type="button"
                            className={`dz-upsell-toggle-btn ${item.is_active ? 'active' : 'inactive'}`}
                            onClick={() => onToggle(item)}
                            disabled={togglingId === item.id}
                            title={item.is_active ? 'اضغط لإخفائه من صفحة التتبع' : 'اضغط لإظهاره في صفحة التتبع'}
                          >
                            {togglingId === item.id
                              ? '...'
                              : item.is_active
                              ? '✓ معروض'
                              : 'مخفي'}
                          </button>

                          <div className="dz-upsell-action-btns">
                            <a
                              href={item.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="dz-upsell-action-btn"
                              title="فتح رابط المنتج في نافذة جديدة"
                            >
                              <Icons.ExternalLink />
                            </a>
                            <button
                              type="button"
                              className="dz-upsell-action-btn"
                              onClick={() => onEdit(item)}
                              title="تعديل بيانات المنتج"
                            >
                              <Icons.Edit />
                            </button>
                            <button
                              type="button"
                              className="dz-upsell-action-btn danger"
                              onClick={() => onDelete(item.id)}
                              disabled={deletingId === item.id}
                              title="حذف المنتج"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
  );
}
