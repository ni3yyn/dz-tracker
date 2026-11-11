'use client';

import { createPortal } from 'react-dom';
import { Icons } from '../../components/DashboardIcons';
import { MappingForm } from '../../MappingForm';

interface CustomMappingModalProps {
  isOpen: boolean;
  merchantId: string;
  onClose: () => void;
}

export function CustomMappingModal({ isOpen, merchantId, onClose }: CustomMappingModalProps) {
  const closeCustomMappingModal = onClose;

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal((

            <div
              className="dz-mapping-modal-backdrop"
              data-dashboard-back-dismiss="custom-status-modal"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeCustomMappingModal();
              }}
            >
              <section
                className="dz-mapping-modal-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dz-create-mapping-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="dz-mapping-modal-head">
                  <div>
                    <span className="dz-mapping-modal-kicker">مطابقة الحالات والترجمة</span>
                    <h2 id="dz-create-mapping-title">إضافة مسمى مخصص</h2>
                    <p>اربط كود الحالة الأصلي بالعبارة التي ستظهر للعميل في صفحة التتبع.</p>
                  </div>
                  <button
                    type="button"
                    className="dz-mapping-modal-close"
                    aria-label="إغلاق النافذة"
                    onClick={() => closeCustomMappingModal()}
                  >
                    <Icons.X />
                  </button>
                </header>
                <MappingForm merchantId={merchantId} />
              </section>
            </div>

  ), document.body);
}
