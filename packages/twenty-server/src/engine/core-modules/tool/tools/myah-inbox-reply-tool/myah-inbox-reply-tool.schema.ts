import { z } from 'zod';

export const SendMyahInboxReplyInputZodSchema = z
  .object({ actionApprovalBindingId: z.uuid() })
  .strict();

export type SendMyahInboxReplyInput = z.infer<
  typeof SendMyahInboxReplyInputZodSchema
>;
