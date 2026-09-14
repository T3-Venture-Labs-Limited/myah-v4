import { msg } from '@lingui/core/macro';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';

export const hasOwnCampaignInputKey = (
  value: unknown,
  key: PropertyKey,
): boolean =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  Object.prototype.hasOwnProperty.call(value, key);

export const isForbiddenGenericCampaignCreateData = (data: unknown): boolean =>
  hasOwnCampaignInputKey(data, 'sequenceAuthorization') ||
  hasOwnCampaignInputKey(data, 'deletedAt') ||
  (hasOwnCampaignInputKey(data, 'lifecycleStatus') &&
    (data as { lifecycleStatus?: unknown }).lifecycleStatus !== 'DRAFT');

export const isForbiddenGenericCampaignUpdateData = (data: unknown): boolean =>
  hasOwnCampaignInputKey(data, 'sequenceAuthorization') ||
  hasOwnCampaignInputKey(data, 'deletedAt') ||
  hasOwnCampaignInputKey(data, 'lifecycleStatus');

export const rejectGenericCampaignLifecycleOperation = (): never => {
  throw new CommonQueryRunnerException(
    'Campaign lifecycle and execution authority require a dedicated operation.',
    CommonQueryRunnerExceptionCode.BAD_REQUEST,
    {
      userFriendlyMessage: msg`Campaign lifecycle and execution authority require a dedicated operation.`,
    },
  );
};
