import { useFirstConnectedAccount } from '@/activities/emails/hooks/useFirstConnectedAccount';
import { useResolveDefaultEmailRecipient } from '@/activities/emails/hooks/useResolveDefaultEmailRecipient';
import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useOpenComposeEmailInSidePanel } from '@/side-panel/hooks/useOpenComposeEmailInSidePanel';
import { CoreObjectNameSingular, SettingsPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

export const ComposeEmailCommand = () => {
  const { connectedAccountId, loading: accountLoading } =
    useFirstConnectedAccount();
  const { openComposeEmailInSidePanel } = useOpenComposeEmailInSidePanel();
  const navigateSettings = useNavigateSettings();
  const {
    objectMetadataItem,
    selectedRecords,
    graphqlFilter,
    targetedRecordsRule,
  } = useHeadlessCommandContextApi();
  const objectNameSingular = objectMetadataItem?.nameSingular ?? null;
  const isBulkPerson =
    objectNameSingular === CoreObjectNameSingular.Person &&
    (selectedRecords.length > 1 || targetedRecordsRule.mode === 'exclusion');
  const { defaultTo, loading: recipientLoading } =
    useResolveDefaultEmailRecipient({
      objectNameSingular,
      recordId: isBulkPerson ? null : (selectedRecords[0]?.id ?? null),
      bulkPerson: isBulkPerson
        ? { filter: graphqlFilter ?? undefined }
        : undefined,
    });
  const handleExecute = () => {
    if (!isDefined(connectedAccountId)) {
      navigateSettings(SettingsPath.NewAccount);
      return;
    }
    openComposeEmailInSidePanel({ connectedAccountId, defaultTo });
  };
  return (
    <HeadlessEngineCommandWrapperEffect
      execute={handleExecute}
      ready={!accountLoading && !recipientLoading}
    />
  );
};
