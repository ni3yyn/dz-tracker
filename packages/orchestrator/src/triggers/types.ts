import { TrackingEvent } from '../index';

export interface TriggerContext {
  event: TrackingEvent;
  orderId: string;
  trackingUuid: string;
  isNewOrder: boolean;
  statusChanged: boolean;
  displayStatus: string;
  merchant: {
    id: string;
    store_name: string;
  };
  siteUrl: string;
}

export interface TriggerResult {
  triggerName: string;
  channel: 'whatsapp' | 'webhook' | 'sms' | 'custom';
  triggered: boolean;
  urgency?: 'critical' | 'high' | 'medium' | 'info';
  dispatchedTo?: string;
  message?: string;
  actionUrl?: string;
  payload?: any;
  error?: string;
}

export interface TriggerHandler {
  name: string;
  canTrigger(ctx: TriggerContext): boolean;
  execute(ctx: TriggerContext): Promise<TriggerResult>;
}
