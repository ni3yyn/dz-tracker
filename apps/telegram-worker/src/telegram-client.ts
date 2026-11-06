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

    this.client = new TelegramClient({
      apiId: this.config.telegramApiId,
      apiHash: this.config.telegramApiHash,
      storage: ':memory:', // Pure memory session; persistent session string loaded from secure config
      logLevel: 1, // Warnings and errors only
    });

    // TelegramClient.start() initializes the transport, restores session string, and verifies login
    await this.client.start({
      session: this.config.telegramSession || undefined,
    });
    this.isConnected = true;
  }

  async checkSession(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      await this.connect();
    }

    try {
      const me = await this.client!.getMe();
      if (!me) return false;

      if (this.config.telegramExpectedUserId && me.id !== this.config.telegramExpectedUserId) {
        console.warn(
          `[TelegramSender]: Connected account user ID (${me.id}) does not match expected (${this.config.telegramExpectedUserId})`
        );
      }

      return true;
    } catch (err) {
      const classified = classifyTelegramError(err);
      if (classified.category === 'fatal_auth') {
        console.error('[TelegramSender]: Session authentication check failed fatally:', classified.message);
      }
      return false;
    }
  }

  async resolvePhone(internationalPhone: string): Promise<ResolvedTelegramRecipient | null> {
    if (!this.client) {
      throw new Error('[TelegramSender]: Client is not initialized or connected.');
    }

    try {
      // Use official contacts.resolvePhone under the hood
      const inputPeer = await this.client.resolvePhoneNumber(internationalPhone, true);

      if (!inputPeer) {
        return null;
      }

      // Check if resolved peer is a User
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

      // Permanent resolution failures (no telegram account, privacy settings)
      if (classified.category === 'skip_permanent') {
        return null;
      }

      // Transient, flood wait, or network failures should be re-thrown for worker retry/pause handling
      throw err;
    }
  }

  async sendTrackingLink(
    recipient: ResolvedTelegramRecipient,
    message: string,
    randomId: bigint
  ): Promise<TelegramSendResult> {
    if (!this.client) {
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
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        console.warn('[TelegramSender]: Error closing TelegramClient:', err);
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }
}
