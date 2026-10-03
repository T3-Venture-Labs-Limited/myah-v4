import { NotesCard } from '@/activities/notes/components/NotesCard';
import { MyahCampaignCreatorAgentDraft } from '@/myah/agent/components/MyahCampaignCreatorAgentDraft';
import { MyahCampaignCreatorMessages } from '@/page-layout/components/MyahCampaignCreatorMessages';
import { type CampaignCreatorInboxReturnTarget } from '@/myah/inbox/types/CampaignCreatorInboxReturnTarget';
import { TimelineCard } from '@/activities/timeline-activities/components/TimelineCard';
import { TimelineActivityContext } from '@/activities/timeline-activities/contexts/TimelineActivityContext';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { SidePanelProvider } from '@/ui/layout/side-panel/contexts/SidePanelContext';
import { styled } from '@linaria/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type Membership = ObjectRecord & {
  id: string;
  campaignId: string;
  creatorId: string;
  stage?: string | null;
};
type Creator = ObjectRecord & {
  id: string;
  name?: string | null;
  email?: string | null;
};
type SocialProfile = ObjectRecord & {
  creatorId: string;
  platform?: string | null;
  handle?: string | null;
  profileUrl?: string | null;
  followerCount?: number | null;
};

const StyledPanel = styled.aside`
  background: ${themeCssVariables.background.primary};
  border-left: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  z-index: 2;
`;
const StyledAvatar = styled.span`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-radius: 50%;
  display: inline-flex;
  height: 40px;
  justify-content: center;
  width: 40px;
`;
const StyledHeader = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[4]};
  position: relative;
  h2 {
    font-size: ${themeCssVariables.font.size.md};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    margin: 0;
  }
  p {
    color: ${themeCssVariables.font.color.secondary};
    margin: 0;
  }
  a {
    color: ${themeCssVariables.brand.text};
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
`;
const StyledClose = styled.button`
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  position: absolute;
  right: ${themeCssVariables.spacing[4]};
  top: ${themeCssVariables.spacing[4]};
`;
const StyledIdentity = styled.div`
  align-items: center;
  column-gap: ${themeCssVariables.spacing[3]};
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  padding-right: ${themeCssVariables.spacing[6]};
  ${StyledAvatar} {
    grid-column: 1;
    grid-row: 1 / 3;
  }
  h2 {
    grid-column: 2;
    grid-row: 1;
    overflow-wrap: anywhere;
  }
  span:last-child {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
    grid-column: 2;
    grid-row: 2;
    overflow-wrap: anywhere;
  }
`;
const StyledBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[4]};
  a {
    color: ${themeCssVariables.brand.text};
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
`;
const StyledTabs = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  overflow-x: auto;
  button {
    background: none;
    border: 0;
    cursor: pointer;
    padding: ${themeCssVariables.spacing[3]};
  }
  button[aria-selected='true'] {
    border-bottom: 2px solid ${themeCssVariables.color.pink};
  }
`;

export const MyahCampaignCreatorContextPanel = ({
  campaignId,
  membershipId,
  onClose,
  returnTarget,
  initialTab = 'messages',
}: {
  campaignId: string;
  membershipId: string;
  onClose: () => void;
  returnTarget: CampaignCreatorInboxReturnTarget;
  initialTab?: 'profile' | 'messages';
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);
  const [tab, setTab] = useState<'profile' | 'activity' | 'notes' | 'messages'>(
    initialTab,
  );
  const { objectMetadataItems } = useObjectMetadataItems();
  const membershipMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'campaignCreator',
  );
  const creatorMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'creator',
  );
  const profileMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'socialProfile',
  );
  const profilePermissions = useObjectPermissionsForObject(
    profileMetadata?.id ?? '',
  );
  const profileFieldReadable = (name: string) => {
    const field = profileMetadata?.fields.find((item) => item.name === name);
    return (
      !!field &&
      profileMetadata?.readableFields.some((item) => item.id === field.id) &&
      profilePermissions.restrictedFields?.[field.id]?.canRead !== false
    );
  };
  const membershipPermissions = useObjectPermissionsForObject(
    membershipMetadata?.id ?? '',
  );
  const creatorPermissions = useObjectPermissionsForObject(
    creatorMetadata?.id ?? '',
  );
  const membershipFieldReadable = (name: string) => {
    const id = membershipMetadata?.fields.find(
      (field) => field.name === name,
    )?.id;
    return (
      !!id && membershipPermissions.restrictedFields?.[id]?.canRead !== false
    );
  };
  const creatorFieldReadable = (name: string) => {
    const id = creatorMetadata?.fields.find((field) => field.name === name)?.id;
    return !!id && creatorPermissions.restrictedFields?.[id]?.canRead !== false;
  };
  const canReadStage = membershipFieldReadable('stage');
  // The membership foreign keys are exposed through relation field metadata.
  const canReadMembershipBinding =
    membershipFieldReadable('campaign') && membershipFieldReadable('creator');
  const canReadName = creatorFieldReadable('name');
  const canReadEmail = creatorFieldReadable('email');
  const canReadProfiles =
    profilePermissions.canReadObjectRecords &&
    profileFieldReadable('id') &&
    profileFieldReadable('creator') &&
    profileFieldReadable('platform');
  const canReadHandle = profileFieldReadable('handle');
  const canReadProfileUrl = profileFieldReadable('profileUrl');
  const canReadFollowers = profileFieldReadable('followerCount');
  const {
    record: membership,
    loading,
    hasReadPermission: canReadMembership,
    error,
    refetch,
  } = useFindOneRecord<Membership>({
    objectNameSingular: 'campaignCreator',
    objectRecordId: membershipId,
    recordGqlFields: {
      id: true,
      campaignId: true,
      creatorId: true,
      ...(canReadStage ? { stage: true } : {}),
    },
    skip: !canReadMembershipBinding,
  });
  const belongsToCampaign =
    canReadMembershipBinding &&
    canReadMembership &&
    membership?.id === membershipId &&
    membership.campaignId === campaignId;
  const creatorId = belongsToCampaign ? membership.creatorId : '';
  const {
    record: creator,
    loading: creatorLoading,
    hasReadPermission: canReadCreator,
    error: creatorError,
    refetch: refetchCreator,
  } = useFindOneRecord<Creator>({
    objectNameSingular: 'creator',
    objectRecordId: creatorId,
    recordGqlFields: {
      id: true,
      ...(canReadName ? { name: true } : {}),
      ...(canReadEmail ? { email: true } : {}),
    },
    skip: !creatorId,
  });
  const readableCreator =
    creatorPermissions.canReadObjectRecords &&
    canReadCreator &&
    !loading &&
    !creatorLoading &&
    !error &&
    !creatorError &&
    creatorId &&
    creator?.id === creatorId
      ? creator
      : undefined;

  const {
    records: profiles,
    loading: profileLoading,
    hasReadPermission: canReadProfileRecords,
    error: profileError,
    hasNextPage: hasMoreProfiles,
  } = useFindManyRecords<SocialProfile>({
    objectNameSingular: 'socialProfile',
    filter: { creatorId: { eq: creatorId } },
    recordGqlFields: {
      id: true,
      creatorId: true,
      ...(canReadProfiles ? { platform: true } : {}),
      ...(canReadHandle ? { handle: true } : {}),
      ...(canReadProfileUrl ? { profileUrl: true } : {}),
      ...(canReadFollowers ? { followerCount: true } : {}),
    },
    limit: 100,
    fetchPolicy: 'no-cache',
    skip: !readableCreator || !canReadProfiles,
  });
  const canShowProfiles =
    !!readableCreator &&
    canReadProfiles &&
    canReadProfileRecords &&
    !profileLoading &&
    !profileError;
  const readableProfiles = canShowProfiles
    ? profiles.filter((profile) => profile.creatorId === creatorId)
    : [];
  const stageLabel =
    canReadStage && membership?.stage
      ? (membershipMetadata?.fields
          .find((field) => field.name === 'stage')
          ?.options?.find((option) => option.value === membership.stage)
          ?.label ?? 'Unknown stage')
      : 'Unavailable';

  return (
    <StyledPanel aria-label="Campaign creator context">
      <StyledHeader>
        <StyledClose
          ref={closeButtonRef}
          type="button"
          aria-label="Close creator context"
          onClick={onClose}
        >
          ×
        </StyledClose>
        {readableCreator ? (
          <StyledIdentity>
            <StyledAvatar aria-label="No profile image available">
              {((canReadName && readableCreator.name) || '?')
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </StyledAvatar>
            <h2>
              {(canReadName && readableCreator.name) || 'Creator context'}
            </h2>
            <span>
              {(canReadEmail && readableCreator.email) || 'Email unavailable'}
            </span>
          </StyledIdentity>
        ) : (
          <h2>Creator context</h2>
        )}
        {readableProfiles.map((profile) => {
          const label = `${profile.platform ?? 'Social'}: ${canReadHandle && profile.handle ? `@${profile.handle.replace(/^@/, '')}` : 'Profile'}`;
          const safeUrl =
            canReadProfileUrl &&
            profile.profileUrl &&
            /^https:\/\//i.test(profile.profileUrl)
              ? profile.profileUrl
              : undefined;
          return (
            <p key={profile.id}>
              {safeUrl ? (
                <a href={safeUrl} rel="noopener noreferrer" target="_blank">
                  {label}
                </a>
              ) : (
                label
              )}
              {canReadFollowers && profile.followerCount != null
                ? ` · ${profile.followerCount.toLocaleString()} followers`
                : null}
            </p>
          );
        })}
        {canShowProfiles && hasMoreProfiles ? (
          <p>More profiles are available on the Creator record.</p>
        ) : null}
        {belongsToCampaign && !loading && !error ? (
          <p>Recorded campaign stage: {stageLabel} · not outreach evidence</p>
        ) : null}
      </StyledHeader>
      {loading || creatorLoading ? (
        <StyledBody role="status">Loading creator context…</StyledBody>
      ) : error || creatorError ? (
        <StyledBody role="alert">
          Unable to load creator context.{' '}
          <button
            type="button"
            onClick={() => void (error ? refetch() : refetchCreator())}
          >
            Retry
          </button>
        </StyledBody>
      ) : !belongsToCampaign || !readableCreator ? (
        <StyledBody>
          Creator context is unavailable for this campaign or your access.
        </StyledBody>
      ) : (
        <>
          <StyledTabs role="tablist" aria-label="Creator context sections">
            {(['profile', 'activity', 'notes', 'messages'] as const).map(
              (section) => (
                <button
                  key={section}
                  type="button"
                  role="tab"
                  aria-selected={tab === section}
                  onClick={() => setTab(section)}
                >
                  {section === 'messages'
                    ? 'Conversation'
                    : section[0].toUpperCase() + section.slice(1)}
                </button>
              ),
            )}
          </StyledTabs>
          <StyledBody role="tabpanel">
            {tab === 'profile' ? (
              <>
                <Link
                  to={getAppPath(AppPath.RecordShowPage, {
                    objectNameSingular: 'creator',
                    objectRecordId: creatorId,
                  })}
                >
                  Open Creator profile and files
                </Link>
                <p>
                  Files are available through the Creator record where linked;
                  no campaign deliverable is inferred.
                </p>
              </>
            ) : tab === 'messages' ? (
              <>
                <MyahCampaignCreatorAgentDraft
                  campaignId={campaignId}
                  membershipId={membershipId}
                  returnTarget={returnTarget}
                />
                <MyahCampaignCreatorMessages
                  campaignId={campaignId}
                  membershipId={membershipId}
                  returnTarget={returnTarget}
                />
              </>
            ) : (
              <SidePanelProvider value={{ isInSidePanel: true }}>
                <LayoutRenderingProvider
                  value={{
                    targetRecordIdentifier: {
                      id: creatorId,
                      targetObjectNameSingular: 'creator',
                    },
                    layoutType: PageLayoutType.RECORD_PAGE,
                    isInSidePanel: true,
                  }}
                >
                  {tab === 'notes' ? (
                    <NotesCard />
                  ) : (
                    <TimelineActivityContext.Provider
                      value={{ recordId: creatorId }}
                    >
                      <TimelineCard />
                    </TimelineActivityContext.Provider>
                  )}
                </LayoutRenderingProvider>
              </SidePanelProvider>
            )}
          </StyledBody>
        </>
      )}
    </StyledPanel>
  );
};
