import { type ReactNode, useState } from 'react';

import { NotesCard } from '@/activities/notes/components/NotesCard';
import { TasksCard } from '@/activities/tasks/components/TasksCard';
import { TimelineCard } from '@/activities/timeline-activities/components/TimelineCard';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { SidePanelRecordPageContent } from '@/side-panel/pages/record-page/components/SidePanelRecordPage';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { SidePanelProvider } from '@/ui/layout/side-panel/contexts/SidePanelContext';
import { styled } from '@linaria/react';
import { PageLayoutType } from '~/generated-metadata/graphql';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type MyahInboxContextTab =
  | 'creator'
  | 'campaign'
  | 'timeline'
  | 'tasks'
  | 'notes';

type MyahInboxContextPanelProps = {
  thread: MyahInboxThread;
};

type MyahInboxRecordOverviewProps = {
  objectNameSingular: string;
  objectRecordId: string | null;
  emptyMessage: string;
};

const CONTEXT_TABS: Array<{ id: MyahInboxContextTab; label: string }> = [
  { id: 'creator', label: 'Creator' },
  { id: 'campaign', label: 'Campaign' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
];

const StyledContextPanel = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const StyledTabList = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledTab = styled.button<{ isActive: boolean }>`
  background: transparent;
  border: 0;
  border-bottom: 2px solid
    ${({ isActive }) =>
      isActive ? themeCssVariables.font.color.primary : 'transparent'};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[1]};
  white-space: nowrap;
`;

const StyledTabPanel = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[3]} 0;
`;

const MyahInboxRecordOverview = ({
  objectNameSingular,
  objectRecordId,
  emptyMessage,
}: MyahInboxRecordOverviewProps) => {
  if (!objectRecordId) {
    return <StyledStatus>{emptyMessage}</StyledStatus>;
  }

  return (
    <SidePanelProvider value={{ isInSidePanel: true }}>
      <SidePanelRecordPageContent
        objectNameSingular={objectNameSingular}
        objectRecordId={objectRecordId}
        renderMode="default-tab-only"
      />
    </SidePanelProvider>
  );
};

const MyahInboxCreatorActivityContext = ({
  creatorId,
  children,
}: {
  creatorId: string | null;
  children: ReactNode;
}) => {
  if (!creatorId) {
    return (
      <StyledStatus>
        Link a Creator to view Creator activity, tasks, and notes.
      </StyledStatus>
    );
  }

  return (
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
        {children}
      </LayoutRenderingProvider>
    </SidePanelProvider>
  );
};

export const MyahInboxContextPanel = ({
  thread,
}: MyahInboxContextPanelProps) => {
  const [activeTab, setActiveTab] = useState<MyahInboxContextTab>('creator');
  const creatorId = thread.creator?.id ?? null;
  const campaignId = thread.campaign?.id ?? null;

  return (
    <StyledContextPanel>
      <StyledTabList role="tablist" aria-label="Inbox context">
        {CONTEXT_TABS.map((tab) => (
          <StyledTab
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </StyledTab>
        ))}
      </StyledTabList>
      <StyledTabPanel role="tabpanel">
        {activeTab === 'creator' && (
          <MyahInboxRecordOverview
            objectNameSingular="creator"
            objectRecordId={creatorId}
            emptyMessage="No Creator linked. Use the Creator action in the conversation header to link or create one."
          />
        )}
        {activeTab === 'campaign' && (
          <MyahInboxRecordOverview
            objectNameSingular="campaign"
            objectRecordId={campaignId}
            emptyMessage="No Campaign linked. Use the Campaign action in the conversation header to select one."
          />
        )}
        {activeTab === 'timeline' && (
          <MyahInboxCreatorActivityContext creatorId={creatorId}>
            <TimelineCard />
          </MyahInboxCreatorActivityContext>
        )}
        {activeTab === 'tasks' && (
          <MyahInboxCreatorActivityContext creatorId={creatorId}>
            <TasksCard />
          </MyahInboxCreatorActivityContext>
        )}
        {activeTab === 'notes' && (
          <MyahInboxCreatorActivityContext creatorId={creatorId}>
            <NotesCard />
          </MyahInboxCreatorActivityContext>
        )}
      </StyledTabPanel>
    </StyledContextPanel>
  );
};
