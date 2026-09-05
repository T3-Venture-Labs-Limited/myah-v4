import { z } from 'zod';

export const InstagramReplyActionProposalInputZodSchema = z
  .object({ draftId: z.string().uuid() })
  .strict();

export type InstagramReplyActionProposalInput = z.infer<
  typeof InstagramReplyActionProposalInputZodSchema
>;

export const sendInstagramReplyInputSchema = z
  .object({
    actionApprovalBindingId: z
      .string()
      .uuid()
      .describe('Opaque immutable approval binding for this exact reply.'),
  })
  .strict();

export type SendInstagramReplyInput = z.infer<
  typeof sendInstagramReplyInputSchema
>;
