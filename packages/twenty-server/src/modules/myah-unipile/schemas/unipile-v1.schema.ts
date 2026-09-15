import { z } from 'zod';

export const unipileInstagramSourceStatusSchema = z.enum([
  'OK',
  'STOPPED',
  'ERROR',
  'CREDENTIALS',
  'PERMISSIONS',
  'CONNECTING',
]);

export const unipileInstagramAccountSchema = z.object({
  id: z.string(),
  type: z.literal('INSTAGRAM'),
  connection_params: z.object({
    im: z.object({
      id: z.string(),
      username: z.string().nullable().optional(),
    }),
  }),
  sources: z
    .tuple([
      z.object({
        status: unipileInstagramSourceStatusSchema,
      }),
    ])
    .rest(
      z.object({
        status: unipileInstagramSourceStatusSchema,
      }),
    ),
});

// GET users/{identifier} may omit provider_messaging_id, but such a profile
// cannot identify an Instagram Start Chat recipient. Keep opaque ID bytes.
const unipileProfileIdentitySchema = z
  .string()
  .refine((value) => value.trim().length > 0);

export const unipileInstagramMessagingProfileSchema = z.object({
  object: z.literal('UserProfile'),
  provider: z.literal('INSTAGRAM'),
  provider_id: unipileProfileIdentitySchema,
  provider_messaging_id: unipileProfileIdentitySchema,
  public_identifier: unipileProfileIdentitySchema,
});

export const unipileHostedAuthUrlSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);

        // Trust only the generated default origin; keep opaque URL bytes intact.
        return (
          url.protocol === 'https:' &&
          url.origin === 'https://account.unipile.com' &&
          url.username === '' &&
          url.password === ''
        );
      } catch {
        return false;
      }
    }),
});

export const unipileChatStartedSchema = z.object({
  object: z.literal('ChatStarted'),
  chat_id: z.string().trim().min(1),
  message_id: z.string().trim().min(1),
});

export const unipileMessageSentSchema = z.object({
  object: z.literal('MessageSent'),
  message_id: z.string().trim().min(1),
});

export const unipileAccountDeletedSchema = z.object({
  object: z.literal('AccountDeleted'),
});

// Application ingestion policy, not an exhaustive provider/RFC3339 grammar.
// Validate calendar syntax before Date; preserve nullable input bytes, including
// microseconds (even though downstream JS high-water Dates lose sub-ms precision).
const unipileTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .pipe(
    z.string().refine((value) => {
      const fraction = value.match(/\.(\d+)/)?.[1];
      const offsetHours = value.endsWith('Z') ? 0 : Number(value.slice(-5, -3));

      if (
        value.startsWith('0000-') ||
        (fraction?.length ?? 0) > 6 ||
        offsetHours > 15
      ) {
        return false;
      }

      const date = new Date(value);
      const utcYear = date.getUTCFullYear();

      return Number.isFinite(date.getTime()) && utcYear >= 1 && utcYear <= 9999;
    }),
  )
  .nullable();

const unipileInstagramChatBaseSchema = z.object({
  object: z.literal('Chat'),
  id: z.string(),
  account_id: z.string(),
  account_type: z.literal('INSTAGRAM'),
  name: z.string().nullable(),
  timestamp: unipileTimestampSchema,
});

export const unipileInstagramChatSchema = z.discriminatedUnion('type', [
  unipileInstagramChatBaseSchema.extend({
    attendee_provider_id: z.string(),
    type: z.literal(0),
  }),
  unipileInstagramChatBaseSchema.extend({
    attendee_provider_id: z.string().optional(),
    type: z.union([z.literal(1), z.literal(2)]),
  }),
]);

export const unipileChatListSchema = z.object({
  object: z.literal('ChatList'),
  items: z.array(unipileInstagramChatSchema),
  cursor: z.string().nullable(),
});

const unipileBinaryBooleanSchema = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .nullish()
  .transform((value) => value === true || value === 1);

export const unipileInstagramMessageSchema = z.object({
  object: z.literal('Message'),
  id: z.string(),
  account_id: z.string(),
  chat_id: z.string(),
  sender_id: z.string(),
  // Unipile's published SDK models message is_sender as numeric 0 | 1.
  // It may be absent on legacy payloads, where strict sender-ID fallback applies.
  is_sender: z.union([z.literal(0), z.literal(1)]).optional(),
  text: z.string().nullable(),
  attachments: z.array(z.unknown()),
  timestamp: unipileTimestampSchema,
  seen: unipileBinaryBooleanSchema,
  delivered: unipileBinaryBooleanSchema,
  hidden: unipileBinaryBooleanSchema,
  deleted: unipileBinaryBooleanSchema,
  is_event: unipileBinaryBooleanSchema,
});

export const unipileMessageListSchema = z.object({
  object: z.literal('MessageList'),
  items: z.array(unipileInstagramMessageSchema),
  cursor: z.string().nullable(),
});
