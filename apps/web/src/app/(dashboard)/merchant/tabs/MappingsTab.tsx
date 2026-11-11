import type { Ref } from 'react';
import { Icons } from '../components/DashboardIcons';

type MappingRow = {
  id: string;
  source_status: string;
  display_status: string;
};

interface MappingsTabProps {
  merchantId: string;
  mappings: MappingRow[];
  triggerRef: Ref<HTMLButtonElement>;
  onOpenCustomMapping: () => void;
  editingMappingId: string | null;
  editDisplayStatus: string;
  onEditDisplayStatusChange: (value: string) => void;
  isSavingEdit: boolean;
  onSaveInlineEdit: (sourceStatus: string) => Promise<void>;
  onCancelInlineEdit: () => void;
  onBeginInlineEdit: (id: string, displayStatus: string) => void;
  onApplyPreset: (formData: FormData) => Promise<void>;
  onDeleteMapping: (formData: FormData) => Promise<void>;
}

export function MappingsTab({
  merchantId,
  mappings,
  triggerRef,
  onOpenCustomMapping,
  editingMappingId,
  editDisplayStatus,
  onEditDisplayStatusChange,
  isSavingEdit,
  onSaveInlineEdit,
  onCancelInlineEdit,
  onBeginInlineEdit,
  onApplyPreset,
  onDeleteMapping,
}: MappingsTabProps) {
  return (
            <section className="dz-mappings-tab" aria-labelledby="dz-mappings-title">
              <header className="dz-mappings-intro">
                <div>
                  <span className="dz-mappings-eyebrow">تجربة التتبع</span>
                  <h2 id="dz-mappings-title">مسميات الحالات</h2>
                  <p>حوّل أكواد شركات التوصيل أو متجرك إلى عبارات واضحة يفهمها العميل.</p>
                </div>
                <div className="dz-mappings-intro-actions">
                  <span className="dz-mappings-count"><strong>{mappings.length}</strong> مطابقة مفعّلة</span>
                  <button
                    ref={triggerRef}
                    type="button"
                    className="dz-mappings-add-button"
                    onClick={() => onOpenCustomMapping()}
                  >
                    <Icons.Plus />
                    إضافة مسمى مخصص
                  </button>
                </div>
              </header>

              <section className="dz-mappings-presets" aria-labelledby="dz-presets-title">
                <div className="dz-mappings-section-head">
                  <div>
                    <h3 id="dz-presets-title">ابدأ بحزمة جاهزة</h3>
                    <p>طبّق المسميات المناسبة لمصدر طلباتك، ويمكنك تعديلها لاحقاً.</p>
                  </div>
                </div>
                <div className="dz-mappings-preset-actions">
                  <form action={async (fd) => { await onApplyPreset(fd); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="yalidine" />
                    <button type="submit" className="dz-mapping-preset">ياليدين <span>تطبيق</span></button>
                  </form>
                  <form action={async (fd) => { await onApplyPreset(fd); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="ecotrack" />
                    <button type="submit" className="dz-mapping-preset">إيكوتراك <span>تطبيق</span></button>
                  </form>
                  <form action={async (fd) => { await onApplyPreset(fd); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="zrexpress" />
                    <button type="submit" className="dz-mapping-preset">ZR Express <span>تطبيق</span></button>
                  </form>
                  <form action={async (fd) => { await onApplyPreset(fd); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="shopify" />
                    <button type="submit" className="dz-mapping-preset">شوبيفاي <span>تطبيق</span></button>
                  </form>
                </div>
              </section>

              <section className="dz-mappings-list" aria-labelledby="dz-active-mappings-title">
                <div className="dz-mappings-section-head dz-mappings-list-head">
                  <div>
                    <h3 id="dz-active-mappings-title">المسميات المفعّلة</h3>
                    <p>يمكنك تعديل أي مسمى أو حذفه دون التأثير على بقية المطابقات.</p>
                  </div>
                  <span className="dz-mappings-list-count">{mappings.length}</span>
                </div>

                {mappings.length === 0 ? (
                  <div className="dz-mappings-empty">
                    <strong>لا توجد مسميات مخصصة بعد</strong>
                    <p>ابدأ بحزمة جاهزة أو أضف أول مطابقة يدوياً.</p>
                  </div>
                ) : (
                  <div className="dz-mappings-rows">
                    {mappings.map((m) => {
                      const isEditing = editingMappingId === m.id;
                      return (
                        <article className="dz-mapping-row" key={m.id}>
                          <div className="dz-mapping-source">
                            <span>الحالة الأصلية</span>
                            <code className="dz-mono">{m.source_status}</code>
                          </div>
                          <div className="dz-mapping-arrow" aria-hidden="true">←</div>
                          <div className="dz-mapping-display">
                            <span>ما يراه العميل</span>
                            {isEditing ? (
                              <input type="text" value={editDisplayStatus} onChange={(e) => onEditDisplayStatusChange(e.target.value)} className="input" autoFocus aria-label="المسمى الظاهر للعميل" />
                            ) : (
                              <strong>{m.display_status}</strong>
                            )}
                          </div>
                          <div className="dz-mapping-actions">
                            {isEditing ? (
                              <>
                                <button onClick={() => onSaveInlineEdit(m.source_status)} disabled={isSavingEdit} className="dz-mapping-action dz-mapping-action-primary">{isSavingEdit ? 'جارٍ الحفظ...' : 'حفظ'}</button>
                                <button onClick={() => onCancelInlineEdit()} className="dz-mapping-action">إلغاء</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => onBeginInlineEdit(m.id, m.display_status)} className="dz-mapping-action">تعديل</button>
                                <form action={async (fd) => { await onDeleteMapping(fd); }}>
                                  <input type="hidden" name="id" value={m.id} />
                                  <button type="submit" className="dz-mapping-action dz-mapping-action-delete">حذف</button>
                                </form>
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </section>
  );
}
