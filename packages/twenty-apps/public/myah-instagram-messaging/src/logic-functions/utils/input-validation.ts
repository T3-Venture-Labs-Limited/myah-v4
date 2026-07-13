import { MAX_MANUAL_DISCOVERY_LIMIT } from 'src/logic-functions/constants/composio-instagram.constants';

export const clampManualDiscoveryLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return MAX_MANUAL_DISCOVERY_LIMIT;
  }

  if (limit < 1) {
    return 1;
  }

  return Math.min(Math.floor(limit), MAX_MANUAL_DISCOVERY_LIMIT);
};

export const requireFields = (
  fields: Record<string, string | undefined>,
): string[] =>
  Object.entries(fields)
    .filter(([, value]) => !value?.trim())
    .map(([field]) => field);

export const resolveConnectedAccountId = (
  connectedAccountId?: string,
): string | undefined => {
  const explicitId = connectedAccountId?.trim();
  const isLocalOrTest =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const configuredDefault = isLocalOrTest
    ? process.env.MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID?.trim()
    : undefined;
  const resolvedConnectedAccountId = explicitId || configuredDefault;

  return resolvedConnectedAccountId === ''
    ? undefined
    : resolvedConnectedAccountId;
};

export const buildMissingConnectedAccountError = (
  missingFields: string[] = ['connectedAccountId'],
): string => {
  const missingFieldList = missingFields.join(', ');

  return `Missing required fields: ${missingFieldList}. Connect Instagram in Settings, then pass the workspace Instagram account connectedAccountId from the myahInstagramAccount record, or configure MYAH_COMPOSIO_CONNECTED_ACCOUNT_ID for local smoke tests.`;
};
