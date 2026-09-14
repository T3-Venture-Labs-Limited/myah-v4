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
import { H2Title } from 'twenty-ui/typography';

import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { styled } from '@linaria/react';
import { EmailAccountConnectionCards } from '@/settings/accounts/components/EmailAccountConnectionCards';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';

import { MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignOperationsTabUniversalIdentifier';
import { useCurrentPageLayoutOrThrow } from '@/page-layout/hooks/useCurrentPageLayoutOrThrow';

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
  provider: string | null;
  senderEmail: string | null;
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

const providerIcon = (provider: string | null) =>
  provider === null ? IconMail : (providerIconByName[provider] ?? IconMail);

const accountIdentifier = (account: CampaignEmailAccount) =>
  account.senderEmail ?? account.label;

const isUuid = (value: string | null): value is string =>
  value !== null &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const MyahCampaignEmailAccounts = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const [removingAccount, setRemovingAccount] =
    useState<CampaignEmailAccount | null>(null);
  const [removalTrigger, setRemovalTrigger] =
    useState<HTMLButtonElement | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const addEmailAccountButtonRef = useRef<HTMLButtonElement>(null);
  const pickerActionRef = useRef<HTMLButtonElement>(null);
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { closeDropdown } = useCloseDropdown();
  const { openModal } = useModal();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();
  // Persists the one-shot mutation through StrictMode's duplicate effect setup.
  // oxlint-disable-next-line twenty/no-state-useref
  const autoLinkedAccountRef = useRef<string | null>(null);
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

  const displayedAccounts = accountQuery.data?.campaignEmailAccounts ?? [];
  const candidates = candidatesQuery.data?.campaignEmailAccountCandidates ?? [];
  const isLoading = accountQuery.loading;
  const hasDefault = displayedAccounts.some((account) => account.isDefault);
  const defaultAccount = displayedAccounts.find((account) => account.isDefault);
  const firstAvailableCandidate = candidates.find(
    (candidate) =>
      candidate.health === 'AVAILABLE' &&
      !displayedAccounts.some(
        (account) =>
          account.connectedAccountId === candidate.connectedAccountId,
      ),
  );
  const campaignOperationsTabId =
    currentPageLayout.tabs.find(
      (tab) =>
        tab.universalIdentifier ===
        MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER,
    )?.id ?? MYAH_CAMPAIGN_OPERATIONS_TAB_UNIVERSAL_IDENTIFIER;
  const campaignOperationsReturnPath = `${getAppPath(
    AppPath.RecordShowPage,
    { objectNameSingular: 'campaign', objectRecordId: campaignId },
    { linkConnectedAccount: 1 },
  )}#${campaignOperationsTabId}`;

  useEffect(() => {
    if (isPickerOpen) {
      pickerActionRef.current?.focus();
    }
  }, [isPickerOpen]);

  const { refetch: refetchAccounts } = accountQuery;
  const { refetch: refetchCandidates } = candidatesQuery;
  const refreshAccountQueries = useCallback(
    () => Promise.all([refetchAccounts(), refetchCandidates()]),
    [refetchAccounts, refetchCandidates],
  );

  const handleLink = async (candidate: CampaignEmailAccount) => {
    try {
      await linkAccount({
        variables: {
          input: {
            campaignId,
            connectedAccountId: candidate.connectedAccountId,
          },
        },
      });
      closeDropdown(pickerDropdownId);
      await refreshAccountQueries();
      enqueueSuccessSnackBar({ message: 'Email account linked.' });
    } catch {
      enqueueErrorSnackBar({ message: 'Email account could not be linked.' });
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const connectionFailed =
      searchParams.get('emailAccountConnectionFailed') === '1';
    const shouldLink = searchParams.get('linkConnectedAccount') === '1';
    const connectedAccountId = searchParams.get('connectedAccountId');

    if (!connectionFailed && !shouldLink) return;

    const clearConnectionParams = () => {
      searchParams.delete('emailAccountConnectionFailed');
      searchParams.delete('linkConnectedAccount');
      searchParams.delete('connectedAccountId');
      navigate(
        {
          hash: location.hash,
          pathname: location.pathname,
          search: searchParams.toString(),
        },
        { replace: true },
      );
    };

    if (connectionFailed) {
      clearConnectionParams();
      enqueueErrorSnackBar({
        message: 'Email account connection failed. Try connecting it again.',
      });
      return;
    }

    if (!isUuid(connectedAccountId)) {
      clearConnectionParams();
      enqueueErrorSnackBar({ message: 'Email account could not be linked.' });
      return;
    }

    if (autoLinkedAccountRef.current) return;

    clearConnectionParams();
    autoLinkedAccountRef.current = connectedAccountId;
    void linkAccount({
      variables: { input: { campaignId, connectedAccountId } },
      awaitRefetchQueries: true,
      refetchQueries: [
        CAMPAIGN_EMAIL_ACCOUNTS,
        CAMPAIGN_EMAIL_ACCOUNT_CANDIDATES,
      ],
    })
      .then(() => {
        enqueueSuccessSnackBar({ message: 'Email account linked.' });
      })
      .catch(() => {
        enqueueErrorSnackBar({ message: 'Email account could not be linked.' });
      });
  }, [
    campaignId,
    enqueueErrorSnackBar,
    enqueueSuccessSnackBar,
    linkAccount,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  const handleSetDefault = async (account: CampaignEmailAccount) => {
    try {
      await setDefaultAccount({
        variables: { input: { campaignId, campaignAccountId: account.id } },
      });
      await refreshAccountQueries();
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

  const closeRemoval = (focusAddAccount = false) => {
    setRemovingAccount(null);
    if (focusAddAccount) {
      addEmailAccountButtonRef.current?.focus();
    } else {
      removalTrigger?.focus();
    }
    setRemovalTrigger(null);
  };

  const handleRemove = async () => {
    if (!removingAccount) return;

    try {
      await removeAccount({
        variables: {
          input: { campaignId, campaignAccountId: removingAccount.id },
        },
      });
      await refreshAccountQueries();
      enqueueSuccessSnackBar({ message: 'Email account removed.' });
      closeRemoval(true);
    } catch {
      enqueueErrorSnackBar({ message: 'Email account could not be removed.' });
    }
  };

  return (
    <Section>
      <H2Title
        title="Email Accounts"
        adornment={
          <Dropdown
            clickableComponent={
              <LightIconButton
                aria-label="Add email account"
                Icon={IconPlus}
                disabled={linking}
                ref={addEmailAccountButtonRef}
              />
            }
            containerType="neutral"
            dropdownAriaLabel="Email account candidates"
            dropdownComponents={
              <div>
                {candidatesQuery.loading ? (
                  <p aria-live="polite">Loading available email accounts…</p>
                ) : null}
                {!candidatesQuery.loading && candidatesQuery.error ? (
                  <p role="alert">
                    Available email accounts could not be loaded.
                  </p>
                ) : null}
                {!candidatesQuery.loading &&
                !candidatesQuery.error &&
                candidates.length === 0 ? (
                  <p>No available email accounts.</p>
                ) : null}
                {!candidatesQuery.loading && !candidatesQuery.error
                  ? candidates.map((candidate) => {
                      const isAlreadyLinked = displayedAccounts.some(
                        (account) =>
                          account.connectedAccountId ===
                          candidate.connectedAccountId,
                      );
                      const isCandidateAvailable =
                        candidate.health === 'AVAILABLE' && !isAlreadyLinked;

                      return (
                        <Button
                          ariaLabel={`Add ${accountIdentifier(candidate)}`}
                          disabled={linking || !isCandidateAvailable}
                          key={candidate.id}
                          ref={
                            candidate.id === firstAvailableCandidate?.id
                              ? pickerActionRef
                              : undefined
                          }
                          onClick={() => void handleLink(candidate)}
                          title={
                            isCandidateAvailable
                              ? `Add ${accountIdentifier(candidate)}`
                              : `${accountIdentifier(candidate)} is unavailable`
                          }
                          type="button"
                          variant="tertiary"
                        />
                      );
                    })
                  : null}
                <EmailAccountConnectionCards
                  returnTo={campaignOperationsReturnPath}
                />
              </div>
            }
            dropdownId={pickerDropdownId}
            dropdownPlacement="left-start"
            dropdownRole="dialog"
            onClose={() => {
              setIsPickerOpen(false);
              addEmailAccountButtonRef.current?.focus();
            }}
            onOpen={() => setIsPickerOpen(true)}
            renderClickableComponentAsChild
          />
        }
      />
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
          Reconnect the default email account before sending. Email drafting is
          paused until it is available.
        </p>
      ) : null}
      {defaultAccount?.health === 'UNAVAILABLE' ? (
        <p role="alert">
          The default email account is unavailable. Email drafting is paused
          until it is available.
        </p>
      ) : null}
      <StyledAccountTags aria-live="polite">
        {displayedAccounts.map((account) => {
          const ProviderIcon = providerIcon(account.provider);

          return (
            <StyledAccountTag key={account.id}>
              <Chip
                label={accountIdentifier(account)}
                leftComponent={
                  <ProviderIcon
                    aria-label={`${account.provider ?? 'email'} provider`}
                  />
                }
                rightComponent={
                  account.isDefault ? (
                    <span aria-label="Default email account">Default</span>
                  ) : undefined
                }
                variant={ChipVariant.Static}
              />
              {account.health !== 'AVAILABLE' ? (
                <span aria-label={`${accountIdentifier(account)} health`}>
                  {account.health === 'RECONNECT_REQUIRED'
                    ? 'Reconnect required'
                    : 'Unavailable'}
                </span>
              ) : null}
              {!account.isDefault ? (
                <Button
                  ariaLabel={`Make ${accountIdentifier(account)} default`}
                  disabled={settingDefault}
                  onClick={() => void handleSetDefault(account)}
                  title="Make default"
                  type="button"
                  variant="secondary"
                />
              ) : null}
              <LightIconButton
                aria-label={`Remove ${accountIdentifier(account)}`}
                Icon={IconX}
                onClick={(event) => {
                  setRemovalTrigger(event.currentTarget);
                  openRemoval(account);
                }}
              />
            </StyledAccountTag>
          );
        })}
      </StyledAccountTags>
      {removingAccount ? (
        <ConfirmationModal
          confirmButtonText="Remove account"
          loading={removing}
          modalInstanceId={removeModalId}
          onClose={() => closeRemoval()}
          onConfirmClick={() => void handleRemove()}
          subtitle={
            removingAccount.isDefault
              ? 'Removing the default account pauses email drafting. No replacement will be selected automatically.'
              : 'Removing this email account does not change the default email account.'
          }
          title={`Remove ${accountIdentifier(removingAccount)}?`}
        />
      ) : null}
    </Section>
  );
};
