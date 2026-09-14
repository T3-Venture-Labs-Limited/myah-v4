import { z } from 'zod';

const uuidSchema = z.string().uuid();
const uuidArraySchema = z.array(uuidSchema).min(1).max(500);

export const addCreatorsToCreatorListInputSchema = z
  .object({
    creatorListId: uuidSchema,
    creatorIds: uuidArraySchema,
  })
  .strict();

export const removeCreatorFromCreatorListInputSchema = z
  .object({
    creatorListId: uuidSchema,
    creatorId: uuidSchema,
  })
  .strict();

export const getCampaignAudienceInputSchema = z
  .object({ campaignId: uuidSchema })
  .strict();

export const addDirectCampaignCreatorsInputSchema = z
  .object({
    campaignId: uuidSchema,
    creatorIds: uuidArraySchema,
    assignedManagedMailboxId: uuidSchema.nullish(),
  })
  .strict();

export const attachCreatorListsToCampaignInputSchema = z
  .object({
    campaignId: uuidSchema,
    creatorListIds: uuidArraySchema,
  })
  .strict();

export const detachCreatorListFromCampaignInputSchema = z
  .object({
    campaignId: uuidSchema,
    creatorListId: uuidSchema,
  })
  .strict();

export const getCampaignCreatorListAdditionCandidatesInputSchema = z
  .object({
    campaignId: uuidSchema,
    creatorListId: uuidSchema,
  })
  .strict();

export const approveCampaignCreatorListAdditionsInputSchema = z
  .object({
    campaignId: uuidSchema,
    creatorListId: uuidSchema,
    creatorIds: uuidArraySchema,
  })
  .strict();
