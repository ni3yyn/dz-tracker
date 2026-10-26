import { TriggerHandler, TriggerContext, TriggerResult } from './types';
import { WhatsAppAlertTrigger } from './whatsapp.trigger';
import { OutboundWebhookTrigger } from './webhook.trigger';

export class TriggerEngine {
  private static handlers: TriggerHandler[] = [
    new WhatsAppAlertTrigger(),
    new OutboundWebhookTrigger(),
  ];

  /**
   * Registers a custom trigger handler (e.g., SMS, Email, Telegram, Custom Webhook)
   */
  static register(handler: TriggerHandler): void {
    // Avoid duplicate registrations
    if (!this.handlers.some((h) => h.name === handler.name)) {
      this.handlers.push(handler);
    }
  }

  /**
   * Evaluates all registered triggers against the event context.
   * Uses Promise.allSettled to guarantee that trigger execution never throws
   * or disrupts the primary tracking ingestion flow.
   */
  static async evaluateAndDispatch(ctx: TriggerContext): Promise<TriggerResult[]> {
    const results: TriggerResult[] = [];

    const eligibleHandlers = this.handlers.filter((handler) => {
      try {
        return handler.canTrigger(ctx);
      } catch (err) {
        console.warn(`[TriggerEngine]: Handler ${handler.name} threw in canTrigger:`, err);
        return false;
      }
    });

    if (eligibleHandlers.length === 0) {
      return results;
    }

    const executions = eligibleHandlers.map(async (handler) => {
      try {
        return await handler.execute(ctx);
      } catch (err: any) {
        return {
          triggerName: handler.name,
          channel: 'custom' as const,
          triggered: false,
          error: err?.message || 'Unknown trigger execution error',
        };
      }
    });

    const settled = await Promise.allSettled(executions);

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.push(item.value);
      } else {
        results.push({
          triggerName: 'Unknown',
          channel: 'custom',
          triggered: false,
          error: item.reason?.message || 'Trigger promise rejected',
        });
      }
    }

    return results;
  }
}
