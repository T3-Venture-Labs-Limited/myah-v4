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

export const unipileHostedAuthUrlSchema = z.object({
  url: z.string().url(),
});

export const unipileChatStartedSchema = z.object({
  object: z.literal('ChatStarted'),
  chat_id: z.string(),
  message_id: z.string(),
});

export const unipileMessageSentSchema = z.object({
  object: z.literal('MessageSent'),
  message_id: z.string(),
});

export const unipileAccountDeletedSchema = z.object({
  object: z.literal('AccountDeleted'),
});

export const unipileInstagramChatSchema = z.object({
  object: z.literal('Chat'),
  id: z.string(),
  account_id: z.string(),
  account_type: z.literal('INSTAGRAM'),
  attendee_provider_id: z.string(),
  name: z.string().nullable(),
  type: z.literal(1),
  timestamp: z.string().nullable(),
});

export const unipileChatListSchema = z.object({
  object: z.literal('ChatList'),
  items: z.array(unipileInstagramChatSchema),
  cursor: z.string().nullable(),
});

export const unipileInstagramMessageSchema = z.object({
  object: z.literal('Message'),
  id: z.string(),
  account_id: z.string(),
  chat_id: z.string(),
  sender_id: z.string(),
  text: z.string().nullable(),
  attachments: z.array(z.unknown()),
  timestamp: z.string().nullable(),
});

export const unipileMessageListSchema = z.object({
  object: z.literal('MessageList'),
  items: z.array(unipileInstagramMessageSchema),
  cursor: z.string().nullable(),
});
