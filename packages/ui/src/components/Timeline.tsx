import React from 'react';
import '../styles/Timeline.css'; // استيراد الـ Pure CSS

export interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  description?: string | null;
  isCurrent: boolean;
}

export const Timeline = ({ events }: { events: TimelineEvent[] }) => {
  if (!events || events.length === 0) return <p className="timeline-empty">لا توجد تحديثات للطلب بعد.</p>;

  return (
    <div className="timeline-container">
      {events.map((event, index) => (
        <div key={event.id} className={`timeline-item ${event.isCurrent ? 'current' : ''}`}>
          <div className="timeline-indicator">
            <div className="timeline-dot"></div>
            {index !== events.length - 1 && <div className="timeline-line"></div>}
          </div>
          <div className="timeline-content">
            <h3 className="timeline-title">{event.title}</h3>
            <time className="timeline-date">
              {new Date(event.date).toLocaleString('ar-EG', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })}
            </time>
            {event.description && <p className="timeline-desc">{event.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};