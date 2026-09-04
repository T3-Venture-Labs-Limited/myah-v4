import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Chip, ChipVariant } from 'twenty-ui/data-display';
import {
  IconGoogle,
  IconMail,
  IconMicrosoft,
  IconPlus,
  IconX,
  type IconComponent,
} from 'twenty-ui/icon';
import { Button, LightIconButton } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';

import { RecordDetailSectionContainer } from '@/object-record/record-field-list/record-detail-section/components/RecordDetailSectionContainer';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { SettingsPath } from 'twenty-shared/types';
import { useNavigateSettings } from '~/hooks/useNavigateSettings';

const CAMPAIGN_EMAIL_ACCOUNTS = gql`
  query CampaignEmailAccounts($input: CampaignEmailAccountCampaignInput!) {
    campaignEmailAccounts(input: $input) {
      id
      connectedAccountId
      provider
      senderEmail
      label
      isDefault
      health
    }
  }
`;

const CAMPAIGN_EMAIL_ACCOUNT_CANDIDATES = gql`
  query CampaignEmailAccountCandidates(
    $input: CampaignEmailAccountCampaignInput!
  ) {
    campaignEmailAccountCandidates(input: $input) {
      id
      connectedAccountId
      provider
      senderEmail
      label
      isDefault
      health
    }
  }
`;

const LINK_CAMPAIGN_EMAIL_ACCOUNT = gql`
  mutation LinkCampaignEmailAccount($input: LinkCampaignEmailAccountInput!) {
    linkCampaignEmailAccount(input: $input) {
      id
      connectedAccountId
      provider
      senderEmail
      label
      isDefault
      health
    }
  }
`;

const SET_DEFAULT_CAMPAIGN_EMAIL_ACCOUNT = gql`
  mutation SetDefaultCampaignEmailAccount(
    $input: CampaignEmailAccountLinkInput!
  ) {
    setDefaultCampaignEmailAccount(input: $input) {
      id
      connectedAccountId
      provider
      senderEmail
      label
      isDefault
      health
    }
  }
`;

const REMOVE_CAMPAIGN_EMAIL_ACCOUNT = gql`
  mutation RemoveCampaignEmailAccount($input: CampaignEmailAccountLinkInput!) {
    removeCampaignEmailAccount(input: $input) {
      id
      connectedAccountId
      provider
      senderEmail
      label
      isDefault
      health
    }
  }
`;

type CampaignEmailAccount = {
  id: string;
  connectedAccountId: string;
  provider: string;
  senderEmail: string;
  label: string;
  isDefault: boolean;
  health: 'AVAILABLE' | 'RECONNECT_REQUIRED' | 'UNAVAILABLE';
};

const StyledAccountTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px 12px;
`;

const StyledAccountTag = styled.div`
  align-items: center;
  display: flex;
  gap: 4px;
  max-width: 100%;
`;

const providerIconByName: Record<string, IconComponent> = {
  GOOGLE: IconGoogle,
  MICROSOFT: IconMicrosoft,
};

const providerIcon = (provider: string) =>
  providerIconByName[provider] ?? IconMail;

const accountSummary = (account: CampaignEmailAccount) =>
  `${account.label} (${account.senderEmail})`;

export const MyahCampaignEmailAccounts = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const [accounts, setAccounts] = useState<CampaignEmailAccount[] | null>(null);
  const [removingAccount, setRemovingAccount] =
    useState<CampaignEmailAccount | null>(null);
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { openModal, closeModal } = useModal();
  const navigateSettings = useNavigateSettings();
  const removeModalId = `campaign-email-account-remove-${campaignId}`;
  const pickerDropdownId = `campaign-email-account-picker-${campaignId}`;
  const accountQuery = useQuery<{
    campaignEmailAccounts: CampaignEmailAccount[];
  }>(CAMPAIGN_EMAIL_ACCOUNTS, { variables: { input: { campaignId } } });
  const candidatesQuery = useQuery<{
    campaignEmailAccountCandidates: CampaignEmailAccount[];
  }>(CAMPAIGN_EMAIL_ACCOUNT_CANDIDATES, {
    variables: { input: { campaignId } },
  });
  const [linkAccount, { loading: linking }] = useMutation<{
    linkCampaignEmailAccount: CampaignEmailAccount[];
  }>(LINK_CAMPAIGN_EMAIL_ACCOUNT);
  const [setDefaultAccount, { loading: settingDefault }] = useMutation<{
    setDefaultCampaignEmailAccount: CampaignEmailAccount[];
  }>(SET_DEFAULT_CAMPAIGN_EMAIL_ACCOUNT);
  const [removeAccount, { loading: removing }] = useMutation<{
    removeCampaignEmailAccount: CampaignEmailAccount[];
  }>(REMOVE_CAMPAIGN_EMAIL_ACCOUNT);

  const displayedAccounts =
    accounts ?? accountQuery.data?.campaignEmailAccounts ?? [];
  const candidates = candidatesQuery.data?.campaignEmailAccountCandidates ?? [];
  const isLoading = accountQuery.loading || candidatesQuery.loading;
  const hasDefault = displayedAccounts.some((account) => account.isDefault);
  const defaultAccount = displayedAccounts.find((account) => account.isDefault);

  const applyResult = (result?: CampaignEmailAccount[]) => {
    if (result) setAccounts(result);
  };

  const handleLink = async (candidate: CampaignEmailAccount) => {
    try {
      const result = await linkAccount({
        variables: {
          input: {
            campaignId,
            connectedAccountId: candidate.connectedAccountId,
          },
        },
      });
      applyResult(result.data?.linkCampaignEmailAccount);
      enqueueSuccessSnackBar({ message: 'Email account linked.' });
    } catch {
      enqueueErrorSnackBar({ message: 'Email account could not be linked.' });
    }
  };

  const handleSetDefault = async (account: CampaignEmailAccount) => {
    try {
      const result = await setDefaultAccount({
        variables: { input: { campaignId, campaignAccountId: account.id } },
      });
      applyResult(result.data?.setDefaultCampaignEmailAccount);
      enqueueSuccessSnackBar({ message: 'Default email account updated.' });
    } catch {
      enqueueErrorSnackBar({
        message: 'Default email account could not be updated.',
      });
    }
  };

  const openRemoval = (account: CampaignEmailAccount) => {
    setRemovingAccount(account);
    openModal(removeModalId);
  };

  const handleRemove = async () => {
    if (!removingAccount) return;

    try {
      const result = await removeAccount({
        variables: {
          input: { campaignId, campaignAccountId: removingAccount.id },
        },
      });
      applyResult(result.data?.removeCampaignEmailAccount);
      enqueueSuccessSnackBar({ message: 'Email account removed.' });
      setRemovingAccount(null);
      closeModal(removeModalId);
    } catch {
      enqueueErrorSnackBar({ message: 'Email account could not be removed.' });
    }
  };

  return (
    <Section>
      <RecordDetailSectionContainer
        dataTestId="campaign-email-accounts-section"
        link={undefined}
        title="Email Accounts"
        rightAdornment={
          <Dropdown
            clickableComponent={
              <LightIconButton
                aria-label="Add email account"
                Icon={IconPlus}
                disabled={linking}
              />
            }
            dropdownComponents={
              <div aria-label="Email account candidates" role="menu">
                {candidates.length === 0 ? (
                  <p>No available email accounts.</p>
                ) : (
                  candidates.map((candidate) => (
                    <Button
                      ariaLabel={`Add ${accountSummary(candidate)}`}
                      key={candidate.id}
                      onClick={() => void handleLink(candidate)}
                      title={`Add ${candidate.label}`}
                      type="button"
                      variant="tertiary"
                    />
                  ))
                )}
                <Button
                  ariaLabel="Connect email account"
                  onClick={() => navigateSettings(SettingsPath.NewAccount)}
                  title="Connect email account"
                  type="button"
                  variant="secondary"
                />
              </div>
            }
            dropdownId={pickerDropdownId}
            dropdownPlacement="left-start"
          />
        }
      >
        {isLoading ? <p aria-live="polite">Loading email accounts…</p> : null}
        {!isLoading && accountQuery.error ? (
          <p role="alert">Email accounts could not be loaded.</p>
        ) : null}
        {!isLoading && !accountQuery.error && displayedAccounts.length === 0 ? (
          <p>No email accounts linked.</p>
        ) : null}
        {!isLoading &&
        !accountQuery.error &&
        !hasDefault &&
        displayedAccounts.length > 0 ? (
          <p role="alert">
            Email drafting is paused until a default account is selected.
          </p>
        ) : null}
        {defaultAccount?.health === 'RECONNECT_REQUIRED' ? (
          <p role="alert">
            Reconnect the default email account before sending.
          </p>
        ) : null}
        {defaultAccount?.health === 'UNAVAILABLE' ? (
          <p role="alert">
            The default email account is unavailable before sending.
          </p>
        ) : null}
        <StyledAccountTags aria-live="polite">
          {displayedAccounts.map((account) => {
            const ProviderIcon = providerIcon(account.provider);

            return (
              <StyledAccountTag key={account.id}>
                <Chip
                  label={accountSummary(account)}
                  leftComponent={
                    <ProviderIcon aria-label={`${account.provider} provider`} />
                  }
                  rightComponent={
                    account.isDefault ? (
                      <span aria-label="Default email account">Default</span>
                    ) : undefined
                  }
                  variant={ChipVariant.Static}
                />
                {account.health !== 'AVAILABLE' ? (
                  <span aria-label={`${accountSummary(account)} health`}>
                    {account.health === 'RECONNECT_REQUIRED'
                      ? 'Reconnect required'
                      : 'Unavailable'}
                  </span>
                ) : null}
                {!account.isDefault ? (
                  <Button
                    ariaLabel={`Make ${accountSummary(account)} default`}
                    disabled={settingDefault}
                    onClick={() => void handleSetDefault(account)}
                    title="Make default"
                    type="button"
                    variant="secondary"
                  />
                ) : null}
                <LightIconButton
                  aria-label={`Remove ${account.label}`}
                  Icon={IconX}
                  onClick={() => openRemoval(account)}
                />
              </StyledAccountTag>
            );
          })}
        </StyledAccountTags>
      </RecordDetailSectionContainer>
      <ModalStatefulWrapper
        ariaLabel="Confirm email account removal"
        isClosable
        modal
        modalInstanceId={removeModalId}
        onClose={() => setRemovingAccount(null)}
      >
        {removingAccount ? (
          <div aria-label="Confirm email account removal" role="alertdialog">
            <h2>Remove {removingAccount.label}?</h2>
            <p>
              Removing the default account pauses email drafting. No replacement
              will be selected automatically.
            </p>
            <Button
              ariaLabel="Cancel removal"
              onClick={() => {
                setRemovingAccount(null);
                closeModal(removeModalId);
              }}
              title="Cancel"
              type="button"
              variant="secondary"
            />
            <Button
              ariaLabel="Confirm removal"
              disabled={removing}
              onClick={() => void handleRemove()}
              title="Remove account"
              type="button"
              variant="primary"
            />
          </div>
        ) : null}
      </ModalStatefulWrapper>
    </Section>
  );
};
