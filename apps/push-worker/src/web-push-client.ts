import webpush from 'web-push';
import { PushPayload, PushSendResult } from './delivery-state.js';
import { classifyPushError } from './error-classifier.js';
import { PushWorkerConfig } from './config.js';

export interface WebPushRecipient {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
}

export class WebPushClient {
  private isConfigured = false;

  constructor(private config: PushWorkerConfig) {
    this.configureVapid();
  }

  private configureVapid(): void {
    if (this.config.vapidPublicKey && this.config.vapidPrivateKey && this.config.vapidSubject) {
      try {
        webpush.setVapidDetails(
          this.config.vapidSubject,
          this.config.vapidPublicKey,
          this.config.vapidPrivateKey
        );
        this.isConfigured = true;
      } catch (err: any) {
        console.error('[WebPushClient]: Failed to configure VAPID details:', err.message);
      }
    } else {
      console.warn('[WebPushClient]: VAPID keys not fully configured. Push sending will be disabled.');
    }
  }

  public get ready(): boolean {
    return this.isConfigured;
  }

  public async sendPush(
    recipient: WebPushRecipient,
    payload: PushPayload,
    options?: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string }
  ): Promise<PushSendResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        errorCode: 'VAPID_NOT_CONFIGURED',
        errorMessage: 'VAPID credentials are not configured on push worker.',
        isRetryable: false,
      };
    }

    const pushSubscription = {
      endpoint: recipient.endpoint,
      keys: {
        p256dh: recipient.p256dh,
        auth: recipient.auth_secret,
      },
    };

    const requestOptions: webpush.RequestOptions = {
      TTL: options?.ttlSeconds ?? 86400, // 24 hours
      urgency: options?.urgency ?? 'high',
      topic: options?.topic ? options.topic.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 32) : undefined,
    };

    const serializedPayload = JSON.stringify(payload);

    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        serializedPayload,
        requestOptions
      );

      return {
        success: true,
        statusCode: response.statusCode || 201,
      };
    } catch (err: any) {
      const classified = classifyPushError(err);
      return {
        success: false,
        statusCode: classified.statusCode,
        errorCode: classified.code,
        errorMessage: classified.message,
        isExpiredSubscription: classified.category === 'expired_subscription',
        isRetryable: classified.category === 'retryable' || classified.category === 'rate_limited',
        retryAfterSeconds: classified.retryAfterSeconds,
      };
    }
  }
}

