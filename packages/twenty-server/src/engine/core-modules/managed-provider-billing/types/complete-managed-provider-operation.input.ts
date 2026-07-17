import { type SafeMetronomeEventProperties } from './safe-metronome-event-properties.type';

export type ManagedProviderOperationCompletionOutcome =
  | 'BILLABLE'
  | 'NON_BILLABLE_FAILURE'
  | 'UNKNOWN';

export type CompleteManagedProviderOperationInput = {
  actualUsageProperties: SafeMetronomeEventProperties;
  actorUserWorkspaceId: string | null;
  operationId: string;
  operationKey: string;
  outcome: ManagedProviderOperationCompletionOutcome;
  providerConfigurationKey: string;
  providerCostMicrousd: string | null;
  providerExecutionId: string | null;
  providerKey: string;
  workspaceId: string;
};
