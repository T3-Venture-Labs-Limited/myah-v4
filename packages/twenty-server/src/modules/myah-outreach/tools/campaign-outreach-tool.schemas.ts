import { z } from 'zod';

export const campaignOutreachToolInputSchema = z.object({
  campaignId: z
    .string()
    .uuid()
    .describe('The UUID of the Campaign Outreach campaign'),
});
