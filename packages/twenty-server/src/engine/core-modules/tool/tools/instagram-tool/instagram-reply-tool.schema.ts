import { z } from 'zod';

export const InstagramReplyToolInputZodSchema = z.object({
  approvalId: z
    .string()
    .uuid()
    .describe(
      'Opaque approval id returned by request_approval for this exact Instagram reply.',
    ),
});

export type InstagramReplyToolInput = z.infer<
  typeof InstagramReplyToolInputZodSchema
>;
