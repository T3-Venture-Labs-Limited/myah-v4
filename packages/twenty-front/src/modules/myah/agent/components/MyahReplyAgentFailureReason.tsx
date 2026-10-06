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

// Existing stored runs retain the pre-MYAH-463 wording until regenerated.
const isUsageExhausted = (reason: string) =>
  reason.startsWith('Your AI usage is used up.') ||
  reason.startsWith('AI credit is used up.');

// Plain-text form for places that cannot hold a link (clickable rows).
export const myahReplyAgentFailureText = (reason: string) =>
  isUsageExhausted(reason)
    ? 'Your AI usage is used up. Review Billing, then regenerate, or reply yourself.'
    : reason;

export const MyahReplyAgentFailureReason = ({ reason }: { reason: string }) =>
  isUsageExhausted(reason) ? <UsageExhaustedReason /> : <>{reason}</>;
