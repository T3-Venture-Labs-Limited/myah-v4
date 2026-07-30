import { type ClientConfig } from '@/client-config/types/ClientConfig';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const isUnauthenticatedClientConfigResponse = (response: unknown): boolean =>
  typeof response === 'object' &&
  response !== null &&
  'errors' in response &&
  Array.isArray(response.errors) &&
  response.errors.some(
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'extensions' in error &&
      typeof error.extensions === 'object' &&
      error.extensions !== null &&
      'code' in error.extensions &&
      error.extensions.code === 'UNAUTHENTICATED',
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clientConfigBooleanProperties = [
  'analyticsEnabled',
  'canManageFeatureFlags',
  'isAttachmentPreviewEnabled',
  'isCloudflareIntegrationEnabled',
  'isClickHouseConfigured',
  'isConfigVariablesInDbEnabled',
  'isEmailVerificationRequired',
  'isEmailingDomainInDemoMode',
  'isGoogleCalendarEnabled',
  'isGoogleMessagingEnabled',
  'isImapSmtpCaldavEnabled',
  'isMicrosoftCalendarEnabled',
  'isMicrosoftMessagingEnabled',
  'isMultiWorkspaceEnabled',
  'isWorkspaceSchemaDDLLocked',
  'allowRequestsToTwentyIcons',
  'signInPrefilled',
] as const;

const hasRequiredBooleanProperties = (
  record: Record<string, unknown>,
): boolean =>
  clientConfigBooleanProperties.every(
    (property) => typeof record[property] === 'boolean',
  );

const isAuthProvidersResponse = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.google === 'boolean' &&
  typeof value.microsoft === 'boolean' &&
  typeof value.password === 'boolean' &&
  Array.isArray(value.sso);

const isOptionalString = (value: unknown): boolean =>
  value === undefined || typeof value === 'string';

const isClientConfigResponse = (response: unknown): response is ClientConfig =>
  isRecord(response) &&
  Array.isArray(response.aiModels) &&
  response.aiModels.every(isRecord) &&
  isAuthProvidersResponse(response.authProviders) &&
  isRecord(response.api) &&
  isRecord(response.billing) &&
  isRecord(response.captcha) &&
  isRecord(response.onboarding) &&
  Array.isArray(response.publicFeatureFlags) &&
  response.publicFeatureFlags.every(isRecord) &&
  isRecord(response.sentry) &&
  isRecord(response.support) &&
  typeof response.frontDomain === 'string' &&
  isOptionalString(response.appVersion) &&
  isOptionalString(response.calendarBookingPageId) &&
  isOptionalString(response.defaultSubdomain) &&
  (response.publicFunctionDomain === undefined ||
    response.publicFunctionDomain === null ||
    typeof response.publicFunctionDomain === 'string') &&
  (response.maintenance === undefined || isRecord(response.maintenance)) &&
  hasRequiredBooleanProperties(response);

const createClientConfigUnauthenticatedError = (): Error => {
  const error = new Error('Client config request is unauthenticated');

  error.name = 'ClientConfigUnauthenticatedError';

  return error;
};

export const getClientConfig = async (): Promise<ClientConfig> => {
  const tokenPair = getTokenPair();
  const token = tokenPair?.accessOrWorkspaceAgnosticToken?.token;
  const response = await fetch(`${REACT_APP_SERVER_BASE_URL}/client-config`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch client config: ${response.status} ${response.statusText}`,
    );
  }

  const clientConfig: unknown = await response.json();

  if (isUnauthenticatedClientConfigResponse(clientConfig)) {
    throw createClientConfigUnauthenticatedError();
  }

  if (!isClientConfigResponse(clientConfig)) {
    throw new Error('Invalid client config response');
  }

  return clientConfig;
};
