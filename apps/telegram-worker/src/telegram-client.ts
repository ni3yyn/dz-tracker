import { TelegramClient } from '@mtcute/node';
import { tl } from '@mtcute/core';
import Long from 'long';
import { WorkerConfig } from './config.js';
import { ResolvedTelegramRecipient, TelegramSendResult } from './delivery-state.js';
import { classifyTelegramError } from './error-classifier.js';

export interface TelegramSender {
  connect(): Promise<void>;
  checkSession(): Promise<boolean>;
  resolvePhone(internationalPhone: string): Promise<ResolvedTelegramRecipient | null>;
  sendTrackingLink(
    recipient: ResolvedTelegramRecipient,
    message: string,
    randomId: bigint
  ): Promise<TelegramSendResult>;
  close(): Promise<void>;
}

export class MtcuteTelegramSender implements TelegramSender {
  private client: TelegramClient | null = null;
  private isConnected = false;

  constructor(private readonly config: WorkerConfig) {}

  async connect(): Promise<void> {
    if (this.isConnected && this.client) return;

    // Never leave a half-open client behind after a failed start attempt.
    if (this.client) {
      const previousClient = this.client;
      this.client = null;
      this.isConnected = false;
      try {
        await previousClient.destroy();
      } catch (err: any) {
        console.warn('[TelegramSender]: Failed to dispose previous client:', err?.message || err);
      }
    }

    const client = new TelegramClient({
      apiId: this.config.telegramApiId,
      apiHash: this.config.telegramApiHash,
      storage: ':memory:',
      logLevel: 1,
    });
    this.client = client;

    try {
      await client.start({
        session: this.config.telegramSession || undefined,
      });

      // close() may be called while start() is pending (e.g. lease loss or SIGTERM).
      // Do not allow that abandoned connection to become the active sender afterward.
      if (this.client !== client) {
        await client.destroy();
        throw new Error('Telegram connection was closed while authentication was in progress.');
      }

      this.isConnected = true;
    } catch (err) {
      if (this.client === client) {
        this.client = null;
      }
      this.isConnected = false;
      try {
        await client.destroy();
      } catch (destroyError: any) {
        console.warn('[TelegramSender]: Failed to clean up a failed connection:', destroyError?.message || destroyError);
      }
      throw err;
    }
  }

  async checkSession(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('[TelegramSender]: Cannot validate a session before a successful connection.');
    }

    try {
      const me = await this.client.getMe();
      if (!me) return false;

      if (this.config.telegramExpectedUserId && me.id !== this.config.telegramExpectedUserId) {
        throw new Error(
          '[TelegramSender]: Authenticated Telegram user ID does not match TELEGRAM_EXPECTED_USER_ID.'
        );
      }

      return true;
    } catch (err: any) {
      const classified = classifyTelegramError(err);
      if (classified.category === 'fatal_auth') {
        console.error('[TelegramSender]: Session authentication check failed fatally:', classified.message);
      }
      // Preserve the real error so bootstrap can distinguish fatal auth from a transient outage.
      throw err;
    }
  }

  async resolvePhone(internationalPhone: string): Promise<ResolvedTelegramRecipient | null> {
    if (!this.client || !this.isConnected) {
      throw new Error('[TelegramSender]: Client is not connected.');
    }

    try {
      const inputPeer = await this.client.resolvePhoneNumber(internationalPhone, true);
      if (!inputPeer) return null;

      if (inputPeer._ === 'inputPeerUser') {
        const userPeer = inputPeer as tl.RawInputPeerUser;
        return {
          userId: userPeer.userId,
          accessHash: userPeer.accessHash.toString(),
          phone: internationalPhone,
        };
      }

      return null;
    } catch (err: any) {
      const classified = classifyTelegramError(err);
      if (classified.category === 'skip_permanent') return null;
      throw err;
    }
  }

  async sendTrackingLink(
    recipient: ResolvedTelegramRecipient,
    message: string,
    randomId: bigint
  ): Promise<TelegramSendResult> {
    if (!this.client || !this.isConnected) {
      throw new Error('[TelegramSender]: Client is not connected.');
    }

    try {
      const randomIdLong = Long.fromString(randomId.toString());
      const userPeer: tl.TypeInputPeer = {
        _: 'inputPeerUser',
        userId: recipient.userId,
        accessHash: Long.fromString(recipient.accessHash),
      };

      const sent = await this.client.sendText(userPeer, message, {
        randomId: randomIdLong,
        disableWebPreview: false,
      });

      return {
        success: true,
        messageId: sent.id,
        randomId,
      };
    } catch (err: any) {
      const classified = classifyTelegramError(err);
      return {
        success: false,
        randomId,
        errorCode: classified.code,
        errorMessage: classified.message,
      };
    }
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.isConnected = false;

    if (!client) return;

    try {
      await client.destroy();
    } catch (err: any) {
      console.warn('[TelegramSender]: Error closing TelegramClient:', err?.message || err);
    }
  }
}
