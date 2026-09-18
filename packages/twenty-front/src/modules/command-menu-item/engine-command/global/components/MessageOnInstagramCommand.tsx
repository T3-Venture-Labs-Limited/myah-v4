import { useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { ContextStorePageType, SettingsPath } from 'twenty-shared/types';

import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { useOpenInstagramMessageInSidePanel } from '@/side-panel/hooks/useOpenInstagramMessageInSidePanel';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { InstagramMessageComposerAccountDocument } from '~/generated/graphql';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export const MessageOnInstagramCommand = () => {
  const canSendFirstMessage = useHasPermissionFlag(
    PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL,
  );
  const canSendReply = useHasPermissionFlag(
    PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
  );
  const canManageAccounts = useHasPermissionFlag(
    PermissionFlagType.CONNECTED_ACCOUNTS,
  );
  const canMessage = canSendFirstMessage || canSendReply;
  const client = useApolloCoreClient();
  const { data, loading, error } = useQuery(
    InstagramMessageComposerAccountDocument,
    {
      client,
      fetchPolicy: 'network-only',
      skip: !canMessage,
    },
  );
  const { openInstagramMessageInSidePanel } =
    useOpenInstagramMessageInSidePanel();
  const navigateSettings = useNavigateSettings();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { objectMetadataItem, selectedRecords, targetedRecordsRule, pageType } =
    useHeadlessCommandContextApi();

  const handleExecute = () => {
    if (!canMessage) return;
    const account = data?.instagramMessageComposerAccount;
    if (error || !account) {
      enqueueErrorSnackBar({
        message: t`Could not load Instagram connection status.`,
      });
      return;
    }
    if (
      account.status === 'BLOCKED' &&
      account.code === 'ACCOUNT_UNAVAILABLE'
    ) {
      if (canManageAccounts) navigateSettings(SettingsPath.AccountsInstagram);
      else enqueueErrorSnackBar({ message: t`Please contact your admin.` });
      return;
    }
    if (account.status !== 'READY' || !account.sender) {
      enqueueErrorSnackBar({ message: t`Instagram messaging is unavailable.` });
      return;
    }
    // Record pages implicitly target the displayed record. Only an explicit index selection may prefill.
    const canPrefill =
      pageType === ContextStorePageType.Index &&
      objectMetadataItem?.nameSingular === 'creator' &&
      selectedRecords.length === 1 &&
      targetedRecordsRule.mode === 'selection' &&
      targetedRecordsRule.selectedRecordIds.length === 1 &&
      targetedRecordsRule.selectedRecordIds[0] === selectedRecords[0].id;
    openInstagramMessageInSidePanel({
      creatorRecordId: canPrefill ? selectedRecords[0].id : undefined,
    });
  };

  return (
    <HeadlessEngineCommandWrapperEffect
      execute={handleExecute}
      ready={!loading}
    />
  );
};
