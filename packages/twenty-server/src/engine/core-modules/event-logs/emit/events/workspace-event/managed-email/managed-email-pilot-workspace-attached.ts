import { z } from 'zod';

import { registerEvent } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/track';

export const MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT =
  'ManagedEmailPilotWorkspaceAttached' as const;

export const managedEmailPilotWorkspaceAttachedSchema = z.strictObject({
  event: z.literal(MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT),
  properties: z.strictObject({
    attachmentCreated: z.boolean(),
    reason: z.string().min(1),
    receiptId: z.string().regex(/^[a-f0-9]{64}$/),
    sourceWorkspaceId: z.string().uuid(),
    targetWorkspaceId: z.string().uuid(),
  }),
});

export type ManagedEmailPilotWorkspaceAttachedTrackEvent = z.infer<
  typeof managedEmailPilotWorkspaceAttachedSchema
>;

registerEvent(
  MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT,
  managedEmailPilotWorkspaceAttachedSchema,
);
