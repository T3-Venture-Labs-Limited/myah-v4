import { z } from 'zod';

export const OutreachEmailDraftInputZodSchema = z
  .object({
    campaignCreatorId: z.uuid(),
    connectedAccountId: z.uuid(),
    subject: z.string().trim().min(1),
    body: z.string().trim().min(1),
    inReplyTo: z.string().trim().min(1).optional(),
  })
  .strict();

export type OutreachEmailDraftInput = z.infer<
  typeof OutreachEmailDraftInputZodSchema
>;
