import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { TimelineActivityContext } from '@/activities/timeline-activities/contexts/TimelineActivityContext';
import { viewableRecordIdComponentState } from '@/side-panel/pages/record-page/states/viewableRecordIdComponentState';
import { viewableRecordNameSingularComponentState } from '@/side-panel/pages/record-page/states/viewableRecordNameSingularComponentState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { INFORMATION_BANNER_HEIGHT } from '@/information-banner/constants/InformationBannerHeight';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { PageLayoutRecordPageRenderer } from '@/object-record/record-show/components/PageLayoutRecordPageRenderer';
import {
  CampaignRecordReadStatusMessage,
  getCampaignRecordReadStatus,
} from '@/object-record/record-show/components/CampaignRecordReadStatusMessage';
import { useRecordShowRecord } from '@/object-record/record-show/hooks/useRecordShowRecord';
import { type PageLayoutTabsRendererRenderMode } from '@/page-layout/components/PageLayoutTabsRenderer';
import { useRecordShowPage } from '@/object-record/record-show/hooks/useRecordShowPage';
import { recordStoreFamilySelector } from '@/object-record/record-store/states/selectors/recordStoreFamilySelector';
import { useComponentInstanceStateContext } from '@/ui/utilities/state/component-state/hooks/useComponentInstanceStateContext';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';

const StyledSidePanelRecord = styled.div<{
  hasDeletedRecordBanner: boolean;
}>`
  height: ${({ hasDeletedRecordBanner }) => {
    const bannerOffset = hasDeletedRecordBanner
      ? INFORMATION_BANNER_HEIGHT
      : '0px';
    return `calc(100% - ${bannerOffset})`;
  }};
`;

const CampaignSidePanelRecord = ({
  objectRecordId,
  renderMode,
}: {
  objectRecordId: string;
  renderMode?: PageLayoutTabsRendererRenderMode;
}) => {
  const {
    record,
    loading,
    error,
    hasReadPermission,
    hasLoadedRecord,
    refetch,
  } = useRecordShowRecord({
    objectNameSingular: 'campaign',
    recordId: objectRecordId,
  });
  const status = getCampaignRecordReadStatus({
    recordId: objectRecordId,
    record,
    loading,
    error,
    hasReadPermission,
    hasLoadedRecord,
  });

  return status === 'ready' ? (
    <PageLayoutRecordPageRenderer
      targetRecordIdentifier={{
        id: objectRecordId,
        targetObjectNameSingular: 'campaign',
      }}
      isInSidePanel
      renderMode={renderMode}
      recordAlreadyLoaded
    />
  ) : (
    <CampaignRecordReadStatusMessage
      status={status}
      onRetry={() => void refetch()}
    />
  );
};

type SidePanelRecordPageContentProps = {
  objectNameSingular: string;
  objectRecordId: string;
  renderMode?: PageLayoutTabsRendererRenderMode;
};

export const SidePanelRecordPageContent = ({
  objectNameSingular: initialObjectNameSingular,
  objectRecordId: initialObjectRecordId,
  renderMode,
}: SidePanelRecordPageContentProps) => {
  const { objectNameSingular, objectRecordId } = useRecordShowPage(
    initialObjectNameSingular,
    initialObjectRecordId,
  );
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id;
  const recordDeletedAt = useAtomFamilySelectorValue(
    recordStoreFamilySelector,
    {
      recordId: objectRecordId,
      fieldName: 'deletedAt',
    },
  );

  const sidePanelPageInstanceId = useComponentInstanceStateContext(
    SidePanelPageComponentInstanceContext,
  )?.instanceId;

  if (!sidePanelPageInstanceId) {
    throw new Error('Command menu page instance id is not defined');
  }

  return (
    <RecordComponentInstanceContextsWrapper
      componentInstanceId={`record-show-${objectRecordId}`}
    >
      <ContextStoreComponentInstanceContext.Provider
        value={{
          instanceId: sidePanelPageInstanceId,
        }}
      >
        <CommandMenuComponentInstanceContext.Provider
          value={{ instanceId: sidePanelPageInstanceId }}
        >
          <StyledSidePanelRecord hasDeletedRecordBanner={!!recordDeletedAt}>
            <TimelineActivityContext.Provider
              value={{
                recordId: objectRecordId,
              }}
            >
              {objectNameSingular === 'campaign' ? (
                <CampaignSidePanelRecord
                  key={`${workspaceId ?? ''}:${objectRecordId}`}
                  objectRecordId={objectRecordId}
                  renderMode={renderMode}
                />
              ) : (
                <PageLayoutRecordPageRenderer
                  targetRecordIdentifier={{
                    id: objectRecordId,
                    targetObjectNameSingular: objectNameSingular,
                  }}
                  isInSidePanel
                  renderMode={renderMode}
                />
              )}
            </TimelineActivityContext.Provider>
          </StyledSidePanelRecord>
        </CommandMenuComponentInstanceContext.Provider>
      </ContextStoreComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};

export const SidePanelRecordPage = () => {
  const viewableRecordNameSingular = useAtomComponentStateValue(
    viewableRecordNameSingularComponentState,
  );

  const viewableRecordId = useAtomComponentStateValue(
    viewableRecordIdComponentState,
  );

  if (!viewableRecordNameSingular) {
    throw new Error('Object name is not defined');
  }

  if (!viewableRecordId) {
    throw new Error('Record id is not defined');
  }

  return (
    <SidePanelRecordPageContent
      objectNameSingular={viewableRecordNameSingular}
      objectRecordId={viewableRecordId}
    />
  );
};
