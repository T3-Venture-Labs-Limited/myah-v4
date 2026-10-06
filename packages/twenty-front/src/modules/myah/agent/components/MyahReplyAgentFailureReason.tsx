import { Link } from 'react-router-dom';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';

import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const UsageExhaustedReason = () => {
  const { [PermissionFlagType.BILLING]: canManageBilling } =
    usePermissionFlagMap();
  return (
    <span>
      Your AI usage is used up.{' '}
      {canManageBilling ? (
        <>
          Review <Link to={getSettingsPath(SettingsPath.Billing)}>Billing</Link>
          , then regenerate, or reply yourself.
        </>
      ) : (
        <>Ask a workspace admin to review Billing, or reply yourself.</>
      )}
    </span>
  );
};

export const MyahReplyAgentFailureReason = ({ reason }: { reason: string }) =>
  // Existing stored runs retain the pre-MYAH-463 wording until regenerated.
  reason.startsWith('Your AI usage is used up.') ||
  reason.startsWith('AI credit is used up.') ? (
    <UsageExhaustedReason />
  ) : (
    <>{reason}</>
  );
