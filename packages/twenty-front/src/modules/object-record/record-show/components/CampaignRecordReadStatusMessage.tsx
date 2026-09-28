import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';

export type CampaignRecordReadStatus =
  | 'ready'
  | 'loading'
  | 'missing'
  | 'forbidden'
  | 'failed';

export const getCampaignRecordReadStatus = ({
  recordId,
  record,
  loading,
  error,
  hasReadPermission,
  hasLoadedRecord = false,
}: {
  recordId: string;
  record?: { id: string };
  loading: boolean;
  error?: unknown;
  hasReadPermission: boolean;
  hasLoadedRecord?: boolean;
}): CampaignRecordReadStatus =>
  !hasReadPermission ||
  (CombinedGraphQLErrors.is(error) &&
    error.errors.some(({ extensions }) => extensions?.code === 'FORBIDDEN'))
    ? 'forbidden'
    : loading
      ? hasLoadedRecord
        ? 'ready'
        : 'loading'
      : error
        ? 'failed'
        : record?.id === recordId
          ? 'ready'
          : 'missing';

export const CampaignRecordReadStatusMessage = ({
  status,
  onRetry,
}: {
  status: Exclude<CampaignRecordReadStatus, 'ready'>;
  onRetry?: () => void;
}) =>
  status === 'loading' ? (
    <div role="status" style={{ padding: 16 }}>
      {t`Loading campaign…`}
    </div>
  ) : (
    <div role="alert" style={{ padding: 16 }}>
      {status === 'failed'
        ? t`Unable to load campaign. Try again.`
        : status === 'forbidden'
          ? t`You do not have access to this campaign.`
          : t`Campaign is unavailable or you do not have access to it.`}
      {status === 'failed' && onRetry && (
        <button type="button" onClick={onRetry} style={{ marginLeft: 8 }}>
          {t`Retry`}
        </button>
      )}
    </div>
  );
