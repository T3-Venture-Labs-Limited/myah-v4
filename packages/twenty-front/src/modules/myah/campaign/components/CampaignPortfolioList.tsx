import { useTextFieldFocusProps } from '@/ui/utilities/focus/hooks/useTextFieldFocusProps';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import { decodeCampaignCreationIdentity } from '@/apollo/utils/campaignCreationOperation';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type Campaign = ObjectRecord & {
  name?: string | null;
  lifecycleStatus?: string | null;
};

const StyledPortfolio = styled.section`
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  overflow: auto;
  padding: 0 ${themeCssVariables.spacing[4]} ${themeCssVariables.spacing[4]};
  width: 100%;
`;
const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding-bottom: ${themeCssVariables.spacing[3]};
  input {
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    padding: ${themeCssVariables.spacing[2]};
  }
`;
const StyledRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: minmax(180px, 2fr) minmax(100px, 1fr) repeat(
      3,
      minmax(80px, 1fr)
    );
  min-height: 64px;
  padding: ${themeCssVariables.spacing[3]};
  @media (max-width: 800px) {
    grid-template-columns: minmax(0, 1fr) auto;
    > :nth-child(n + 3) {
      display: none;
    }
  }
  a {
    color: ${themeCssVariables.font.color.primary};
    font-weight: ${themeCssVariables.font.weight.medium};
    overflow: hidden;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a:hover,
  a:focus-visible {
    color: ${themeCssVariables.color.pink};
  }
`;
const StyledHeading = styled(StyledRow)`
  background: ${themeCssVariables.background.secondary};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  min-height: 38px;
`;
const StyledUnavailable = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const CampaignPortfolioList = () => {
  const textFieldFocus = useTextFieldFocusProps();
  const [search, setSearch] = useState('');
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const identity = decodeCampaignCreationIdentity(
    getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
  );
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const permissions = useObjectPermissionsForObject(objectMetadataItem.id);
  const canRead =
    permissions.canReadObjectRecords &&
    !!identity &&
    identity.workspaceId === currentWorkspace?.id &&
    identity.userId === currentUser?.id &&
    identity.userWorkspaceId === currentWorkspaceMember?.userWorkspaceId &&
    (identity.workspaceMemberId === undefined ||
      identity.workspaceMemberId === currentWorkspaceMember?.id);
  const fieldReadable = (fieldName: string) => {
    const id = objectMetadataItem.fields.find(
      (field) => field.name === fieldName,
    )?.id;
    return !!id && permissions.restrictedFields?.[id]?.canRead !== false;
  };
  const canReadName = canRead && fieldReadable('name');
  const canReadLifecycle = canRead && fieldReadable('lifecycleStatus');
  const {
    records,
    totalCount,
    loading,
    error,
    hasReadPermission,
    hasNextPage,
    isFetchingMoreRecords,
    fetchMoreRecords,
    refetch,
  } = useFindManyRecords<Campaign>({
    objectNameSingular: 'campaign',
    recordGqlFields: {
      id: true,
      ...(canReadName ? { name: true } : {}),
      ...(canReadLifecycle ? { lifecycleStatus: true } : {}),
    },
    skip: !canRead,
  });
  if (!canRead || !hasReadPermission)
    return (
      <StyledPortfolio role="alert">
        Campaigns are unavailable with your current access.
      </StyledPortfolio>
    );
  const loaded = error ? [] : records;
  const shown = loaded.filter(
    (campaign) =>
      !search.trim() ||
      (canReadName &&
        campaign.name
          ?.toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase())),
  );
  return (
    <StyledPortfolio aria-label="Campaign portfolio">
      <StyledToolbar>
        <input
          onFocus={textFieldFocus.onFocus}
          onBlur={textFieldFocus.onBlur}
          type="search"
          aria-label="Search loaded campaigns"
          placeholder="Search loaded campaigns"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StyledUnavailable>
          {loaded.length} loaded
          {typeof totalCount === 'number' ? ` of ${totalCount}` : ''}
        </StyledUnavailable>
      </StyledToolbar>
      <StyledUnavailable>
        Partnership counts are not yet available per Campaign; recorded stages
        are not verified agreements.
      </StyledUnavailable>
      <StyledHeading aria-hidden="true">
        <span>Campaign</span>
        <span>Lifecycle</span>
        <span>Contacting</span>
        <span>In negotiation</span>
        <span>Onboarded</span>
      </StyledHeading>
      {error ? (
        <p role="alert">
          Unable to load campaigns.{' '}
          <button type="button" onClick={() => void refetch()}>
            Retry campaigns
          </button>
        </p>
      ) : loading && loaded.length === 0 ? (
        <p role="status">Loading campaigns…</p>
      ) : (
        <>
          {shown.map((campaign) => (
            <StyledRow key={campaign.id}>
              <Link
                to={getAppPath(AppPath.RecordShowPage, {
                  objectNameSingular: 'campaign',
                  objectRecordId: campaign.id,
                })}
              >
                {canReadName
                  ? campaign.name || 'Untitled Campaign'
                  : 'Campaign'}
              </Link>
              <span>
                {canReadLifecycle
                  ? campaign.lifecycleStatus || 'Lifecycle unavailable'
                  : 'Lifecycle unavailable'}
              </span>
              <StyledUnavailable>—</StyledUnavailable>
              <StyledUnavailable>—</StyledUnavailable>
              <StyledUnavailable>—</StyledUnavailable>
            </StyledRow>
          ))}
          {shown.length === 0 && (
            <p>
              {search
                ? 'No matches in loaded campaigns. Load more to continue searching.'
                : totalCount === 0
                  ? 'No Campaigns yet.'
                  : 'No readable Campaigns on this page.'}
            </p>
          )}
          {hasNextPage && (
            <button
              disabled={isFetchingMoreRecords}
              type="button"
              onClick={() => void fetchMoreRecords()}
            >
              {isFetchingMoreRecords
                ? 'Loading more campaigns…'
                : 'Load more campaigns'}
            </button>
          )}
        </>
      )}
    </StyledPortfolio>
  );
};
