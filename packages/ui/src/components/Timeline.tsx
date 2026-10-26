'use client';

import React from 'react';
import '../styles/Timeline.css';
import { TimelineDesign, ThemeMode } from '../types/branding';

export interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  description?: string | null;
  isCurrent: boolean;
}

export interface TimelineProps {
  events: TimelineEvent[];
  timelineDesign?: TimelineDesign;
  accentColor?: string;
  themeMode?: ThemeMode;
}

// Custom crisp SVG icons for statuses
const TimelineIcons = {
  Package: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Truck: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3h15v13H1z" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  Scooter: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M15 6h4l2 5" />
      <path d="M9 17l4-11h4" />
      <path d="M5 17h6" />
    </svg>
  ),
  CheckCircle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Building: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="8.01" y2="6" />
      <line x1="16" y1="6" x2="16.01" y2="6" />
      <line x1="12" y1="6" x2="12.01" y2="6" />
      <line x1="8" y1="10" x2="8.01" y2="10" />
      <line x1="16" y1="10" x2="16.01" y2="10" />
      <line x1="12" y1="10" x2="12.01" y2="10" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  ReturnBack: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  ),
};

function getStatusIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes('تسليم') || t.includes('delivered') || t.includes('تم الاستلام')) {
    return <TimelineIcons.CheckCircle />;
  }
  if (t.includes('مندوب') || t.includes('توزيع') || t.includes('delivery') || t.includes('اليوم')) {
    return <TimelineIcons.Scooter />;
  }
  if (t.includes('طريق') || t.includes('شحن') || t.includes('transit') || t.includes('نقل')) {
    return <TimelineIcons.Truck />;
  }
  if (t.includes('مكتب') || t.includes('stopdesk') || t.includes('مركز')) {
    return <TimelineIcons.Building />;
  }
  if (t.includes('رد') || t.includes('مغلق') || t.includes('تنبيه') || t.includes('failed') || t.includes('تحذير')) {
    return <TimelineIcons.AlertTriangle />;
  }
  if (t.includes('مرتجع') || t.includes('returned')) {
    return <TimelineIcons.ReturnBack />;
  }
  return <TimelineIcons.Package />;
}

function formatDateAr(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export const Timeline: React.FC<TimelineProps> = ({
  events,
  timelineDesign = 'stepper',
  accentColor,
  themeMode = 'light',
}) => {
  if (!events || events.length === 0) {
    return <p className="timeline-empty">لا توجد تحديثات للطلب بعد.</p>;
  }

  // Calculate delivery stage for Journey Bar
  const latestTitle = (events[0]?.title || '').toLowerCase();
  let journeyStep = 1;
  let hasAlert = false;

  if (latestTitle.includes('تسليم') || latestTitle.includes('delivered')) {
    journeyStep = 4;
  } else if (latestTitle.includes('مندوب') || latestTitle.includes('توصيل') || latestTitle.includes('delivery')) {
    journeyStep = 3;
  } else if (latestTitle.includes('شحن') || latestTitle.includes('طريق') || latestTitle.includes('transit')) {
    journeyStep = 2;
  } else {
    journeyStep = 1;
  }

  if (latestTitle.includes('رد') || latestTitle.includes('مغلق') || latestTitle.includes('failed')) {
    hasAlert = true;
  }

  const containerStyle = accentColor
    ? ({ '--brand-primary': accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`timeline-wrapper theme-${themeMode} design-${timelineDesign}`}
      style={containerStyle}
      dir="rtl"
    >
      {/* DESIGN 3: JOURNEY PROGRESS BAR */}
      {timelineDesign === 'journey' && (
        <div className="journey-stepper-box">
          <div className="journey-progress-track">
            <div
              className="journey-progress-fill"
              style={{
                width: `${journeyStep === 4 ? 100 : journeyStep === 3 ? 75 : journeyStep === 2 ? 45 : 15}%`,
              }}
            />
          </div>

          <div className="journey-steps-row">
            {[
              { step: 1, label: 'تم الطلب', icon: <TimelineIcons.Package /> },
              { step: 2, label: 'في الشحن', icon: <TimelineIcons.Truck /> },
              { step: 3, label: 'مع المندوب', icon: <TimelineIcons.Scooter /> },
              { step: 4, label: 'تم التسليم', icon: <TimelineIcons.CheckCircle /> },
            ].map((s) => {
              const isPassed = journeyStep >= s.step;
              const isCurrent = journeyStep === s.step;
              return (
                <div
                  key={s.step}
                  className={`journey-step-node ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <div className="journey-step-circle">
                    {s.icon}
                  </div>
                  <span className="journey-step-label">{s.label}</span>
                </div>
              );
            })}
          </div>

          {hasAlert && (
            <div className="journey-alert-pill">
              <TimelineIcons.AlertTriangle />
              <span>تنبيه: تعذر الاتصال بالزبون / الهاتف مغلق</span>
            </div>
          )}
        </div>
      )}

      {/* TIMELINE EVENTS CONTAINER */}
      <div className={`timeline-events-container layout-${timelineDesign}`}>
        {events.map((event, index) => {
          const isLatest = event.isCurrent || index === 0;
          const icon = getStatusIcon(event.title);

          // DESIGN 2: CARDS BENTO FEED
          if (timelineDesign === 'cards') {
            return (
              <div
                key={event.id}
                className={`timeline-card-item ${isLatest ? 'is-latest' : ''}`}
              >
                <div className="card-top-row">
                  <div className="card-badge-group">
                    <span className="card-icon-pill">{icon}</span>
                    <h3 className="card-title">{event.title}</h3>
                  </div>
                  {isLatest && <span className="card-live-indicator">● الحالة الحالية</span>}
                </div>

                <time className="card-date">{formatDateAr(event.date)}</time>

                {event.description && (
                  <p className="card-description">{event.description}</p>
                )}
              </div>
            );
          }

          // DESIGN 4: COMPACT MINIMALIST
          if (timelineDesign === 'compact') {
            return (
              <div
                key={event.id}
                className={`timeline-compact-item ${isLatest ? 'is-latest' : ''}`}
              >
                <div className="compact-dot-col">
                  <span className="compact-dot" />
                  {index !== events.length - 1 && <span className="compact-line" />}
                </div>
                <div className="compact-details">
                  <div className="compact-header-row">
                    <h3 className="compact-title">{event.title}</h3>
                    <time className="compact-time">{formatDateAr(event.date)}</time>
                  </div>
                  {event.description && (
                    <p className="compact-desc">{event.description}</p>
                  )}
                </div>
              </div>
            );
          }

          // DEFAULT & DESIGN 1: MODERN STEPPER (Connected Line with Contextual Icons)
          return (
            <div
              key={event.id}
              className={`timeline-stepper-item ${isLatest ? 'is-latest' : ''}`}
            >
              <div className="stepper-indicator-col">
                <div className="stepper-icon-node">
                  {icon}
                </div>
                {index !== events.length - 1 && <div className="stepper-vertical-line" />}
              </div>

              <div className="stepper-content-body">
                <div className="stepper-title-row">
                  <h3 className="stepper-title">{event.title}</h3>
                  {isLatest && <span className="stepper-active-badge">الآن</span>}
                </div>
                <time className="stepper-date">{formatDateAr(event.date)}</time>
                {event.description && (
                  <p className="stepper-desc">{event.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};