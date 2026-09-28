import { useParams } from 'react-router-dom';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';

import { SidePanelToggleButton } from '@/side-panel/components/SidePanelToggleButton';
import { MyahCampaignExecutionControls } from '@/page-layout/components/MyahCampaignExecutionControls';
import { RecordShowCommandMenu } from '@/command-menu-item/components/RecordShowCommandMenu';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { TimelineActivityContext } from '@/activities/timeline-activities/contexts/TimelineActivityContext';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { PageLayoutRecordPageRenderer } from '@/object-record/record-show/components/PageLayoutRecordPageRenderer';
import {
  CampaignRecordReadStatusMessage,
  getCampaignRecordReadStatus,
  type CampaignRecordReadStatus,
} from '@/object-record/record-show/components/CampaignRecordReadStatusMessage';
import { useRecordShowRecord } from '@/object-record/record-show/hooks/useRecordShowRecord';
import { RecordShowPageSSESubscribeEffect } from '@/object-record/record-show/components/RecordShowPageSSESubscribeEffect';
import { useRecordShowPage } from '@/object-record/record-show/hooks/useRecordShowPage';
import { computeRecordShowComponentInstanceId } from '@/object-record/record-show/utils/computeRecordShowComponentInstanceId';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { RecordShowPageHeader } from '~/pages/object-record/RecordShowPageHeader';
import { RecordShowPageTitle } from '~/pages/object-record/RecordShowPageTitle';
// Other object record pages retain their native rendering path.

const RecordShowPageContent = ({
  objectNameSingular,
  objectRecordId,
  isLayoutCustomizationModeEnabled,
  campaignReadStatus = 'ready',
  onRetry,
}: {
  objectNameSingular: string;
  objectRecordId: string;
  isLayoutCustomizationModeEnabled: boolean;
  campaignReadStatus?: CampaignRecordReadStatus;
  onRetry?: () => void;
}) => {
  const isRecordAvailable = campaignReadStatus === 'ready';
  return (
    <>
      <RecordShowPageTitle
        key={`${objectNameSingular}:${objectRecordId}`}
        objectNameSingular={objectNameSingular}
        objectRecordId={objectRecordId}
        isRecordAvailable={isRecordAvailable}
      />
      <PageCardLayout
        header={
          <RecordShowPageHeader
            objectNameSingular={objectNameSingular}
            objectRecordId={objectRecordId}
            isRecordAvailable={isRecordAvailable}
          >
            {isRecordAvailable && (
              <>
                {objectNameSingular === 'campaign' && (
                  <MyahCampaignExecutionControls
                    key={objectRecordId}
                    campaignId={objectRecordId}
                    variant="header"
                  />
                )}
                <RecordShowCommandMenu />
                {!isLayoutCustomizationModeEnabled && <SidePanelToggleButton />}
              </>
            )}
          </RecordShowPageHeader>
        }
      >
        {isRecordAvailable ? (
          <TimelineActivityContext.Provider
            value={{ recordId: objectRecordId }}
          >
            <PageLayoutRecordPageRenderer
              targetRecordIdentifier={{
                id: objectRecordId,
                targetObjectNameSingular: objectNameSingular,
              }}
              isInSidePanel={false}
              recordAlreadyLoaded={objectNameSingular === 'campaign'}
            />
            <RecordShowPageSSESubscribeEffect
              objectNameSingular={objectNameSingular}
              recordId={objectRecordId}
            />
          </TimelineActivityContext.Provider>
        ) : (
          <CampaignRecordReadStatusMessage
            status={campaignReadStatus}
            onRetry={onRetry}
          />
        )}
      </PageCardLayout>
    </>
  );
};

const CampaignRecordShowPageContent = ({
  objectRecordId,
  isLayoutCustomizationModeEnabled,
}: {
  objectRecordId: string;
  isLayoutCustomizationModeEnabled: boolean;
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

  const campaignReadStatus = getCampaignRecordReadStatus({
    recordId: objectRecordId,
    record,
    loading,
    error,
    hasReadPermission,
    hasLoadedRecord,
  });

  return (
    <RecordShowPageContent
      objectNameSingular="campaign"
      objectRecordId={objectRecordId}
      isLayoutCustomizationModeEnabled={isLayoutCustomizationModeEnabled}
      campaignReadStatus={campaignReadStatus}
      onRetry={() => void refetch()}
    />
  );
};

export const RecordShowPage = () => {
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id;
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  const parameters = useParams<{
    objectNameSingular: string;
    objectRecordId: string;
  }>();

  const { objectNameSingular, objectRecordId } = useRecordShowPage(
    parameters.objectNameSingular ?? '',
    parameters.objectRecordId ?? '',
  );

  const recordShowComponentInstanceId =
    computeRecordShowComponentInstanceId(objectRecordId);

  return (
    <RecordComponentInstanceContextsWrapper
      componentInstanceId={recordShowComponentInstanceId}
    >
      <ContextStoreComponentInstanceContext.Provider
        value={{ instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID }}
      >
        <CommandMenuComponentInstanceContext.Provider
          value={{ instanceId: recordShowComponentInstanceId }}
        >
          {objectNameSingular === 'campaign' ? (
            <CampaignRecordShowPageContent
              key={`${workspaceId ?? ''}:${objectNameSingular}:${objectRecordId}`}
              objectRecordId={objectRecordId}
              isLayoutCustomizationModeEnabled={
                isLayoutCustomizationModeEnabled
              }
            />
          ) : (
            <RecordShowPageContent
              objectNameSingular={objectNameSingular}
              objectRecordId={objectRecordId}
              isLayoutCustomizationModeEnabled={
                isLayoutCustomizationModeEnabled
              }
            />
          )}
        </CommandMenuComponentInstanceContext.Provider>
      </ContextStoreComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
