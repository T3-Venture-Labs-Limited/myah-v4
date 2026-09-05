import { createHash, timingSafeEqual } from 'crypto';

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { z } from 'zod';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import {
  UnipileInstagramWebhookEventEntity,
  UnipileInstagramWebhookEventStatus,
  UnipileInstagramWebhookEventType,
} from 'src/modules/myah-unipile/entities/unipile-instagram-webhook-event.entity';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { UnipileInstagramWebhookQueue } from 'src/modules/myah-unipile/services/unipile-instagram-webhook.queue';

const identifierSchema = z.string().trim().min(1).max(512);
const timestampSchema = z.iso.datetime({ offset: true }).max(64);
const supportedMessageEventSchema = z.enum([
  'message_received',
  'message_read',
  'message_delivered',
  'message_edited',
]);
const accountInfoSchema = z
  .object({
    feature: z.string().trim().min(1).max(128).optional(),
    type: z.literal('INSTAGRAM').optional(),
    user_id: identifierSchema,
  })
  .strict();
const attendeeSchema = z
  .object({
    attendee_id: identifierSchema.optional(),
    attendee_name: z.string().trim().min(1).max(512).optional(),
    attendee_profile_url: z.string().url().max(2048).optional(),
    attendee_provider_id: identifierSchema,
    name: z.string().trim().min(1).max(512).optional(),
    profile_url: z.string().url().max(2048).optional(),
  })
  .strict();
const attachmentSchema = z
  .object({
    id: identifierSchema.optional(),
    mimetype: z.string().trim().min(1).max(255).optional(),
    size: z
      .object({
        height: z.string().regex(/^\d+$/).max(12),
        width: z.string().regex(/^\d+$/).max(12),
      })
      .strict()
      .optional(),
    sticker: z.boolean().optional(),
    type: z.string().trim().min(1).max(128).optional(),
    unavailable: z.boolean().optional(),
    url: z.string().url().max(2048).optional(),
  })
  .strict();
const accountStatusSchema = z.enum([
  'OK',
  'ERROR',
  'STOPPED',
  'CREDENTIALS',
  'PERMISSIONS',
  'CONNECTING',
  'DELETED',
  'CREATION_SUCCESS',
  'RECONNECTED',
  'SYNC_SUCCESS',
]);
const messageWebhookSchema = z
  .object({
    account_id: identifierSchema,
    account_info: accountInfoSchema,
    account_type: z.literal('INSTAGRAM'),
    attachments: z.array(attachmentSchema).max(50),
    attendees: z.array(attendeeSchema).max(50),
    chat_id: identifierSchema,
    event: supportedMessageEventSchema,
    message: z.string().max(16_384),
    message_id: identifierSchema,
    sender: attendeeSchema,
    timestamp: timestampSchema,
    webhook_name: z.string().trim().min(1).max(128),
  })
  .strict();
const accountStatusWebhookSchema = z
  .object({
    AccountStatus: z
      .object({
        account_id: identifierSchema,
        account_type: z.literal('INSTAGRAM'),
        message: accountStatusSchema,
      })
      .strict(),
  })
  .strict();
const webhookPayloadSchema = z.union([
  messageWebhookSchema,
  accountStatusWebhookSchema,
]);

type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
type NormalizedWebhookPayload = {
  accountId: string;
  accountStatus: string | null;
  attendeeProviderId: string | null;
  bucket: number | null;
  chatId: string | null;
  deliveryState: 'DELIVERED' | 'READ' | null;
  deliveryStateUpdatedAt: Date | null;
  eventType: UnipileInstagramWebhookEventType;
  messageId: string | null;
  timestamp: string | null;
};
type ClaimedEvent = {
  event: UnipileInstagramWebhookEventEntity;
  duplicate: boolean;
  shouldEnqueue: boolean;
};

@Injectable()
export class UnipileInstagramWebhookIntakeService {
  constructor(
    private readonly configService: TwentyConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly webhookQueue: UnipileInstagramWebhookQueue,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
  ) {}

  async intake(input: {
    secret: string | undefined;
    body: unknown;
  }): Promise<{ ok: true; duplicate: boolean }> {
    this.availabilityService.assertEnabled();
    this.assertSecret(input.secret);

    const parsedPayload = webhookPayloadSchema.safeParse(input.body);
    if (!parsedPayload.success) {
      throw new BadRequestException(
        'Invalid Unipile Instagram webhook payload',
      );
    }

    const payload = this.normalize(parsedPayload.data);
    const claimed = await this.claim(payload, this.fingerprint(payload));
    if (!claimed.shouldEnqueue) {
      return { ok: true, duplicate: claimed.duplicate };
    }

    await this.webhookQueue.enqueue(claimed.event.id);

    return { ok: true, duplicate: claimed.duplicate };
  }

  private assertSecret(secret: string | undefined): void {
    const expected = Buffer.from(
      this.configService.get('UNIPILE_WEBHOOK_SECRET'),
    );
    const provided = Buffer.from(secret ?? '');

    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new UnauthorizedException();
    }
  }

  private normalize(payload: WebhookPayload): NormalizedWebhookPayload {
    if ('AccountStatus' in payload) {
      const { account_id, message } = payload.AccountStatus;
      return {
        accountId: account_id,
        accountStatus: message,
        attendeeProviderId: null,
        bucket: Math.floor(Date.now() / 30_000),
        chatId: null,
        deliveryState: null,
        deliveryStateUpdatedAt: null,
        eventType: UnipileInstagramWebhookEventType.ACCOUNT_STATUS,
        messageId: null,
        timestamp: null,
      };
    }

    const attendeeProviderId =
      payload.attendees.find(
        ({ attendee_provider_id }) =>
          attendee_provider_id !== payload.account_info.user_id,
      )?.attendee_provider_id ??
      (payload.sender.attendee_provider_id !== payload.account_info.user_id
        ? payload.sender.attendee_provider_id
        : null);
    if (!attendeeProviderId) {
      throw new BadRequestException(
        'Unipile Instagram webhook has no remote attendee',
      );
    }
    const eventType = {
      message_received: UnipileInstagramWebhookEventType.MESSAGE_RECEIVED,
      message_read: UnipileInstagramWebhookEventType.MESSAGE_READ,
      message_delivered: UnipileInstagramWebhookEventType.MESSAGE_DELIVERED,
      message_edited: UnipileInstagramWebhookEventType.MESSAGE_EDITED,
    }[payload.event];
    const deliveryState =
      payload.event === 'message_read'
        ? 'READ'
        : payload.event === 'message_delivered'
          ? 'DELIVERED'
          : null;

    return {
      accountId: payload.account_id,
      accountStatus: null,
      attendeeProviderId,
      bucket: null,
      chatId: payload.chat_id,
      deliveryState,
      deliveryStateUpdatedAt: deliveryState
        ? new Date(payload.timestamp)
        : null,
      eventType,
      messageId: payload.message_id,
      timestamp: payload.timestamp,
    };
  }

  private async claim(
    payload: NormalizedWebhookPayload,
    fingerprint: string,
  ): Promise<ClaimedEvent> {
    return this.dataSource.transaction(async (manager) => {
      const bindingRepository = manager.getRepository(
        UnipileInstagramAccountBindingEntity,
      );
      const eventRepository = manager.getRepository(
        UnipileInstagramWebhookEventEntity,
      );
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        fingerprint,
      ]);

      const existing = await eventRepository.findOne({
        where: { eventFingerprint: fingerprint },
      });
      if (existing) {
        if (existing.status === UnipileInstagramWebhookEventStatus.RECEIVED) {
          existing.status = UnipileInstagramWebhookEventStatus.ENQUEUED;
          await eventRepository.save(existing);
        }

        return {
          event: existing,
          duplicate: true,
          shouldEnqueue:
            existing.status === UnipileInstagramWebhookEventStatus.ENQUEUED,
        };
      }
      const binding = await bindingRepository.findOne({
        where: {
          unipileAccountId: payload.accountId,
          deactivatedAt: IsNull(),
        },
      });
      if (
        !binding ||
        (payload.eventType !==
          UnipileInstagramWebhookEventType.ACCOUNT_STATUS &&
          binding.status !== UnipileInstagramAccountBindingStatus.ACTIVE)
      ) {
        throw new BadRequestException(
          'Unipile Instagram account is unavailable',
        );
      }

      const event = eventRepository.create({
        bindingId: binding.id,
        eventFingerprint: fingerprint,
        eventType: payload.eventType,
        unipileChatId: payload.chatId,
        unipileMessageId: payload.messageId,
        attendeeProviderId: payload.attendeeProviderId,
        accountStatus: payload.accountStatus,
        deliveryState: payload.deliveryState,
        deliveryStateUpdatedAt: payload.deliveryStateUpdatedAt,
        status: UnipileInstagramWebhookEventStatus.ENQUEUED,
      });
      await eventRepository.save(event);

      return {
        event,
        duplicate: false,
        shouldEnqueue: true,
      };
    });
  }

  private fingerprint(payload: NormalizedWebhookPayload): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
