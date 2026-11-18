'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface BrandingPreviewSidePanelProps {
  preview: React.ReactNode;
}

/**
 * Mobile preview drawer.
 *
 * Uses the same body-level portal and order-details drawer surface as the
 * merchant's Add/View Order panels. Keeping it outside .dz-main prevents the
 * dashboard's nested scroll container from clipping or moving the drawer.
 */
export function BrandingPreviewSidePanel({ preview }: BrandingPreviewSidePanelProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const gestureRef = useRef<{ x: number; y: number; pointerId: number; mode: 'open' | 'close' } | null>(null);
  const touchGestureRef = useRef<{ x: number; y: number; identifier: number; mode: 'open' | 'close' } | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const isDesktop = () => window.matchMedia('(min-width: 1141px)').matches;
    const getTarget = (target: EventTarget | null) => target instanceof Element ? target : null;

    const handlePointerDown = (event: PointerEvent) => {
      if (isDesktop() || event.pointerType !== 'touch') return;
      const target = getTarget(event.target);

      if (isOpen) {
        if (target?.closest('.dz-branding-preview-side-head')) {
          gestureRef.current = {
            x: event.clientX,
            y: event.clientY,
            pointerId: event.pointerId,
            mode: 'close',
          };
        }
        return;
      }

      // Android reserves the first ~24px for its system Back gesture. Keep the
      // app gesture just inside that zone, while still using the visible edge handle.
      if (event.clientX < 24 || event.clientX > 84) return;
      if (target?.closest('button, input, select, textarea, a, [contenteditable="true"]') &&
          !target?.closest('.dz-branding-preview-handle')) return;

      gestureRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        mode: 'open',
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const start = gestureRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - start.x;
      const deltaY = Math.abs(event.clientY - start.y);
      const horizontal = Math.abs(deltaX) >= 54 && Math.abs(deltaX) > deltaY * 1.15;
      const verticalIntent = deltaY >= 14 && deltaY > Math.abs(deltaX) * 1.15;

      // Do not discard a horizontal gesture while it is still accumulating
      // toward the activation threshold. Only abandon it once the user clearly scrolls vertically.
      if (verticalIntent) {
        gestureRef.current = null;
        return;
      }
      if (!horizontal) return;

      if (start.mode === 'open' && deltaX > 0) setIsOpen(true);
      if (start.mode === 'close' && deltaX < 0) setIsOpen(false);
      gestureRef.current = null;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isDesktop() || event.touches.length !== 1) {
        touchGestureRef.current = null;
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;
      const target = getTarget(event.target);

      if (isOpen) {
        if (target?.closest('.dz-branding-preview-side-head')) {
          touchGestureRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            identifier: touch.identifier,
            mode: 'close',
          };
        }
        return;
      }

      // Avoid Android's reserved system-navigation strip at the physical edge.
      if (touch.clientX < 24 || touch.clientX > 84) return;
      if (target?.closest('button, input, select, textarea, a, [contenteditable="true"]') &&
          !target?.closest('.dz-branding-preview-handle')) return;

      touchGestureRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        identifier: touch.identifier,
        mode: 'open',
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = touchGestureRef.current;
      if (!start) return;
      const activeTouches = [...Array.from(event.touches), ...Array.from(event.changedTouches)];
      const touch = activeTouches.find((item) => item.identifier === start.identifier);
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = Math.abs(touch.clientY - start.y);
      const horizontal = Math.abs(deltaX) >= 54 && Math.abs(deltaX) > deltaY * 1.15;
      const verticalIntent = deltaY >= 14 && deltaY > Math.abs(deltaX) * 1.15;

      if (verticalIntent) {
        touchGestureRef.current = null;
        return;
      }
      if (!horizontal) return;

      if (start.mode === 'open' && deltaX > 0) setIsOpen(true);
      if (start.mode === 'close' && deltaX < 0) setIsOpen(false);
      if (event.cancelable) event.preventDefault();
      touchGestureRef.current = null;
    };

    const clearPointerGesture = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
    };
    const clearTouchGesture = () => {
      touchGestureRef.current = null;
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', clearPointerGesture, true);
    window.addEventListener('pointercancel', clearPointerGesture, true);
    window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    window.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    window.addEventListener('touchend', clearTouchGesture, true);
    window.addEventListener('touchcancel', clearTouchGesture, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', clearPointerGesture, true);
      window.removeEventListener('pointercancel', clearPointerGesture, true);
      window.removeEventListener('touchstart', handleTouchStart, true);
      window.removeEventListener('touchmove', handleTouchMove, true);
      window.removeEventListener('touchend', clearTouchGesture, true);
      window.removeEventListener('touchcancel', clearTouchGesture, true);
      gestureRef.current = null;
      touchGestureRef.current = null;
    };
  }, [isMounted, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        triggerRef.current?.focus({ preventScroll: true });
        window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
      }
      return;
    }

    wasOpenRef.current = true;
    const main = document.querySelector<HTMLElement>('.dz-main-branding');
    const previousMainOverflowY = main?.style.overflowY ?? '';
    const previousBodyOverflow = document.body.style.overflow;

    if (main) main.style.overflowY = 'hidden';
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      closeRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const preventBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.dz-branding-preview-side-device .dz-phone-scroll-viewport')) {
        event.preventDefault();
      }
    };

    window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('wheel', preventBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', preventBackgroundScroll, { capture: true, passive: false });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('wheel', preventBackgroundScroll, true);
      document.removeEventListener('touchmove', preventBackgroundScroll, true);

      if (main) main.style.overflowY = previousMainOverflowY;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen]);

  return (
    <>
      {isMounted && createPortal(
        <>
          <button
            ref={triggerRef}
            type="button"
            className="dz-branding-preview-handle"
            onClick={() => setIsOpen(true)}
            aria-controls={panelId}
            aria-expanded={isOpen}
            aria-label="فتح معاينة صفحة التتبع"
            tabIndex={isOpen ? -1 : 0}
            data-open={isOpen ? 'true' : 'false'}
          >
            <span>معاينة</span>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>

          <div
            className="dz-order-detail-backdrop dz-order-details-backdrop dz-branding-preview-backdrop"
            data-dashboard-back-dismiss={isOpen ? 'branding-preview-panel' : undefined}
            data-open={isOpen ? 'true' : 'false'}
            aria-hidden={!isOpen}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && isOpen) setIsOpen(false);
            }}
          >
            <aside
              ref={panelRef}
              id={panelId}
              className="dz-order-detail-panel dz-order-details-panel dz-branding-preview-side-panel"
              data-open={isOpen ? 'true' : 'false'}
              role="dialog"
              aria-modal="true"
              aria-hidden={!isOpen}
              aria-labelledby={panelId + '-title'}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dz-order-side-panel-inner dz-order-side-panel-inner--details dz-branding-preview-side-panel-inner">
                <header className="dz-order-detail-head dz-branding-preview-side-head">
                  <div>
                    <h2 id={panelId + '-title'}>معاينة مباشرة</h2>
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    className="dz-order-detail-close"
                    aria-label="إغلاق المعاينة"
                    onClick={() => setIsOpen(false)}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6 18 18M18 6 6 18" />
                    </svg>
                  </button>
                </header>
                <div className="dz-branding-preview-side-device">
                  {preview}
                </div>
              </div>
            </aside>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
