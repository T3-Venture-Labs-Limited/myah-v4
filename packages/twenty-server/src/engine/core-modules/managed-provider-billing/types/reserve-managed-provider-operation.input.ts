import { type SafeMetronomeEventProperties } from './safe-metronome-event-properties.type';

export type ReserveManagedProviderOperationInput = {
  actorUserWorkspaceId: string | null;
  expectedProductIds: string[];
  maximumUsageProperties: SafeMetronomeEventProperties;
  metronomeEventType: string;
  operationKey: string;
  providerConfigurationKey: string;
  providerKey: string;
  requestId: string;
  workspaceId: string;
};
