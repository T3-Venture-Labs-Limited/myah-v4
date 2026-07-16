import { z } from 'zod';

export const sendInstagramReplyInputSchema = z
  .object({
    approvalBindingId: z
      .string()
      .uuid()
      .describe('Opaque immutable approval binding for this exact reply.'),
  })
  .strict();

export type SendInstagramReplyInput = z.infer<
  typeof sendInstagramReplyInputSchema
>;
