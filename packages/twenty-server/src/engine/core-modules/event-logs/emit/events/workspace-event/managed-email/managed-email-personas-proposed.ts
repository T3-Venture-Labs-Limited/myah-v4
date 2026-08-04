import { z } from 'zod';

import { registerEvent } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/track';

export const MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT =
  'ManagedEmailPersonasProposed' as const;

export const managedEmailPersonasProposedSchema = z.strictObject({
  event: z.literal(MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT),
  properties: z.strictObject({
    actorWorkspaceMemberId: z.string().uuid(),
    personaCount: z.number().int().positive(),
    personaVersions: z.array(z.number().int().positive()),
    policyVersion: z.string().min(1),
    proposalId: z.string().min(1),
  }),
});

export type ManagedEmailPersonasProposedTrackEvent = z.infer<
  typeof managedEmailPersonasProposedSchema
>;

registerEvent(
  MANAGED_EMAIL_PERSONAS_PROPOSED_EVENT,
  managedEmailPersonasProposedSchema,
);
