import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { CampaignPortfolioList } from '@/myah/campaign/components/CampaignPortfolioList';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useAggregateRecords } from '@/object-record/hooks/useAggregateRecords';
import { AggregateOperations } from '~/generated-metadata/graphql';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import {
  campaignCreationActorKey,
  campaignCreationAttemptKey,
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { campaignCreationState } from '@/object-record/record-index/states/campaignCreationState';
import { type CampaignCreationIdentity } from '@/object-record/record-index/types/CampaignCreationAttempt';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useStore } from 'jotai';
import { RecordIndexContainerGater } from '@/object-record/record-index/components/RecordIndexContainerGater';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { canCreateRecordsForObjectMetadataItem } from '@/object-record/utils/canCreateRecordsForObjectMetadataItem';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const MODAL_ID = 'campaign-index-named-draft';

const isCampaignIdentityCurrent = (
  identity: CampaignCreationIdentity | undefined,
  workspaceId: string | undefined,
  userId: string | undefined,
  userWorkspaceId: string | null | undefined,
  workspaceMemberId: string | undefined,
): boolean =>
  !!identity &&
  workspaceId === identity.workspaceId &&
  userId === identity.userId &&
  userWorkspaceId === identity.userWorkspaceId &&
  (identity.workspaceMemberId === undefined ||
    workspaceMemberId === identity.workspaceMemberId);

const StyledSummary = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: ${themeCssVariables.spacing[4]};

  > div {
    border: 1px solid ${themeCssVariables.border.color.light};
    border-radius: ${themeCssVariables.border.radius.md};
    display: flex;
    flex-direction: column;
    gap: ${themeCssVariables.spacing[2]};
    min-height: 90px;
    padding: ${themeCssVariables.spacing[4]};
  }

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const StyledSummaryNumber = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xxl};
`;

const StyledSummaryDescription = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const CampaignParticipationSummary = ({
  boundaryIsCurrent,
}: {
  boundaryIsCurrent: boolean;
}) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaignCreator',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const canRead = boundaryIsCurrent && permissions.canReadObjectRecords;
  const { data, loading, error } = useAggregateRecords({
    objectNameSingular: 'campaignCreator',
    recordGqlFieldsAggregate: { id: [AggregateOperations.COUNT] },
    skip: !canRead,
  });
  const count = data.id?.[AggregateOperations.COUNT];
  return (
    <div>
      {canRead && !loading && !error && typeof count === 'number' ? (
        <>
          <StyledSummaryNumber>{count}</StyledSummaryNumber>
          <StyledSummaryDescription>
            {t`Creator-campaign participations across all campaigns`}
          </StyledSummaryDescription>
        </>
      ) : (
        <StyledSummaryDescription>
          {!canRead ? (
            t`Participation summary requires read access.`
          ) : loading ? (
            t`Loading participation summary…`
          ) : (
            <span role="alert">{t`Participation summary unavailable. Retry by refreshing the view.`}</span>
          )}
        </StyledSummaryDescription>
      )}
    </div>
  );
};

export const CampaignIndexSummary = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const identity = decodeCampaignCreationIdentity(
    getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
  );
  const boundaryIsCurrent = isCampaignIdentityCurrent(
    identity,
    currentWorkspace?.id,
    currentUser?.id,
    currentWorkspaceMember?.userWorkspaceId,
    currentWorkspaceMember?.id,
  );
  const canRead = boundaryIsCurrent && permissions.canReadObjectRecords;
  const { data, loading, error } = useAggregateRecords({
    objectNameSingular: 'campaign',
    recordGqlFieldsAggregate: { id: [AggregateOperations.COUNT] },
    skip: !canRead,
  });
  const count = data.id?.[AggregateOperations.COUNT];
  return (
    <StyledSummary aria-label={t`Campaign summary`}>
      <div>
        {canRead && !loading && !error && typeof count === 'number' ? (
          <>
            <StyledSummaryNumber>{count}</StyledSummaryNumber>
            <StyledSummaryDescription>
              {t`Accessible campaigns across all views`}
              {count === 0 && <div>{t`No accessible campaigns yet.`}</div>}
            </StyledSummaryDescription>
          </>
        ) : (
          <StyledSummaryDescription>
            {!canRead ? (
              t`Campaign summary requires read access.`
            ) : loading ? (
              t`Loading campaign summary…`
            ) : (
              <span role="alert">{t`Campaign summary unavailable. Retry by refreshing the view.`}</span>
            )}
          </StyledSummaryDescription>
        )}
      </div>
      <CampaignParticipationSummary boundaryIsCurrent={canRead} />
      <div>
        <StyledSummaryDescription>
          {t`Outreach status across campaigns`}
        </StyledSummaryDescription>
        <StyledSummaryDescription>
          {canRead
            ? t`Unavailable — no verified all-campaign breakdown`
            : t`Outreach summary requires Campaign read access.`}
        </StyledSummaryDescription>
      </div>
    </StyledSummary>
  );
};

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledInput = styled.input`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

export const CampaignIndexCreationAction = () => {
  const { objectMetadataItem, recordIndexId } = useRecordIndexContextOrThrow();
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const canCreate = canCreateRecordsForObjectMetadataItem({
    objectPermissions: permissions,
    objectMetadataItem,
  });
  const { createNewIndexRecord } = useCreateNewIndexRecord({
    objectMetadataItem,
    instanceId: recordIndexId,
  });
  const { openModal, closeModal } = useModal();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const store = useStore();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const contextStoreInstance = useContext(ContextStoreComponentInstanceContext);
  const campaignCreation = useAtomStateValue(campaignCreationState);
  const identity = decodeCampaignCreationIdentity(
    getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
  );
  const boundaryIsCurrent = isCampaignIdentityCurrent(
    identity,
    currentWorkspace?.id,
    currentUser?.id,
    currentWorkspaceMember?.userWorkspaceId,
    currentWorkspaceMember?.id,
  );
  const attempt =
    identity && campaignCreation.actorKey === campaignCreationActorKey(identity)
      ? campaignCreation.attempts[campaignCreationAttemptKey(identity)]
      : undefined;
  const matchingAttempt =
    attempt?.objectMetadataId === objectMetadataItem.id &&
    identity &&
    campaignCreationIdentityKey(attempt.identity) ===
      campaignCreationIdentityKey(identity)
      ? attempt
      : undefined;
  const originAttempt =
    matchingAttempt?.origin.recordIndexId === recordIndexId &&
    matchingAttempt.origin.contextStoreInstanceId ===
      (contextStoreInstance?.instanceId ?? MAIN_CONTEXT_STORE_INSTANCE_ID) &&
    matchingAttempt.origin.returnPath ===
      window.location.pathname + window.location.search + window.location.hash
      ? matchingAttempt
      : undefined;
  let frozenName: string | undefined;
  if (matchingAttempt?.inputJson) {
    try {
      const savedName: unknown = JSON.parse(matchingAttempt.inputJson).name;
      if (typeof savedName === 'string') frozenName = savedName;
    } catch {
      // A malformed frozen input cannot be edited into a new creation attempt.
    }
  }
  const displayedName = matchingAttempt ? (frozenName ?? '') : name;
  const canConfirmExisting =
    boundaryIsCurrent && !!matchingAttempt && permissions.canReadObjectRecords;
  const canStartOrConfirm =
    boundaryIsCurrent &&
    (matchingAttempt
      ? canConfirmExisting
      : canCreate && permissions.canReadObjectRecords);

  useEffect(() => {
    setName('');
    setFailed(false);
  }, [campaignCreation.boundaryGeneration]);

  // oxlint-disable-next-line twenty/no-state-useref -- Synchronous guard before React commits the pending state.
  const submitting = useRef(false);

  const submit = async () => {
    if (
      !canStartOrConfirm ||
      !displayedName.trim() ||
      submitting.current ||
      (matchingAttempt && !originAttempt)
    )
      return;
    const submittedName = displayedName.trim();
    const sessionGeneration = campaignCreation.sessionGeneration;
    const boundaryGeneration = campaignCreation.boundaryGeneration;
    const isCurrentBoundary = () => {
      const current = store.get(campaignCreationState.atom);
      const currentIdentity = decodeCampaignCreationIdentity(
        getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
      );
      return (
        current.sessionGeneration === sessionGeneration &&
        current.boundaryGeneration === boundaryGeneration &&
        !!identity &&
        !!currentIdentity &&
        campaignCreationIdentityKey(currentIdentity) ===
          campaignCreationIdentityKey(identity) &&
        isCampaignIdentityCurrent(
          currentIdentity,
          store.get(currentWorkspaceState.atom)?.id,
          store.get(currentUserState.atom)?.id,
          store.get(currentWorkspaceMemberState.atom)?.userWorkspaceId,
          store.get(currentWorkspaceMemberState.atom)?.id,
        )
      );
    };
    if (!isCurrentBoundary()) return;
    submitting.current = true;
    setIsSubmitting(true);
    setFailed(false);
    try {
      const created = await createNewIndexRecord({
        name: submittedName,
      });
      if (!isCurrentBoundary()) return;
      if (created) {
        closeModal(MODAL_ID);
        setName('');
      } else {
        setFailed(true);
      }
    } catch {
      if (isCurrentBoundary()) setFailed(true);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        title={t`New campaign`}
        onClick={() => openModal(MODAL_ID)}
        disabled={!canStartOrConfirm}
        variant="primary"
      />
      <ModalStatefulWrapper
        modalInstanceId={MODAL_ID}
        modal
        ariaLabel={t`New campaign`}
        isClosable
        shouldCloseModalOnClickOutsideOrEscape={!isSubmitting}
        narrowWidth
        autoHeight
      >
        <StyledForm
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="campaign-draft-name">{t`Campaign name`}</label>
          <StyledInput
            id="campaign-draft-name"
            value={displayedName}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            disabled={isSubmitting || !canStartOrConfirm || !!matchingAttempt}
          />
          {matchingAttempt && !canConfirmExisting ? (
            <p role="alert">{t`Campaign recovery is unavailable with your current access.`}</p>
          ) : !canStartOrConfirm ? (
            <p role="alert">{t`Campaign creation is unavailable with your current access.`}</p>
          ) : null}
          {matchingAttempt && !originAttempt && (
            <p role="alert">{t`Return to the original Campaign view to continue this creation.`}</p>
          )}
          {failed && (
            <p role="alert">
              {originAttempt
                ? t`Campaign was not opened. Retry here to check the same creation, or check your Campaign access. Do not start a new draft elsewhere.`
                : t`Campaign was not created. Correct its name and try again.`}
            </p>
          )}
          <StyledActions>
            <Button
              title={t`Cancel`}
              type="button"
              onClick={() => closeModal(MODAL_ID)}
              disabled={isSubmitting}
              variant="secondary"
            />
            <Button
              title={
                isSubmitting
                  ? t`Checking…`
                  : failed
                    ? originAttempt
                      ? t`Retry creation`
                      : t`Try again`
                    : canConfirmExisting && !canCreate
                      ? t`Check campaign`
                      : t`Create draft`
              }
              type="submit"
              disabled={
                !canStartOrConfirm ||
                !displayedName.trim() ||
                isSubmitting ||
                (!!matchingAttempt && !originAttempt)
              }
              variant="primary"
            />
          </StyledActions>
        </StyledForm>
      </ModalStatefulWrapper>
    </>
  );
};

export const CampaignIndexWorkspace = () => (
  <RecordIndexContainerGater
    campaignCreationAction={<CampaignIndexCreationAction />}
    campaignOverviewSummary={<CampaignIndexSummary />}
    campaignOverviewContent={<CampaignPortfolioList />}
  />
);
