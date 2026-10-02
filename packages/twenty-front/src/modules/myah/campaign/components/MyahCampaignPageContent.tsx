import { styled } from '@linaria/react';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { NotesCard } from '@/activities/notes/components/NotesCard';
import { TasksCard } from '@/activities/tasks/components/TasksCard';
import { TimelineActivityContext } from '@/activities/timeline-activities/contexts/TimelineActivityContext';
import { RecordShowCommandMenu } from '@/command-menu-item/components/RecordShowCommandMenu';
import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { CampaignInfluencerIndex } from '@/myah/creator-crm/components/CampaignInfluencerIndex';
import { CampaignOutreachTab } from '@/myah-outreach/components/CampaignOutreachTab';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { RecordShowContainerContextStoreTargetedRecordsEffect } from '@/object-record/record-show/components/RecordShowContainerContextStoreTargetedRecordsEffect';
import { RecordShowEffect } from '@/object-record/record-show/components/RecordShowEffect';
import { RecordShowPageSSESubscribeEffect } from '@/object-record/record-show/components/RecordShowPageSSESubscribeEffect';
import { SummaryCard } from '@/object-record/record-show/components/SummaryCard';
import { computeRecordShowComponentInstanceId } from '@/object-record/record-show/utils/computeRecordShowComponentInstanceId';
import { MyahCampaignAgent } from '@/page-layout/components/MyahCampaignAgent';
import { MyahCampaignAudienceControls } from '@/page-layout/components/MyahCampaignAudienceControls';
import { MyahCampaignExecutionControls } from '@/page-layout/components/MyahCampaignExecutionControls';
import { MyahCampaignHome } from '@/page-layout/components/MyahCampaignHome';
import { MyahCampaignOperations } from '@/page-layout/components/MyahCampaignOperations';
import { PageLayoutEditModeProviderContext } from '@/page-layout/contexts/PageLayoutEditModeContext';
import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { FieldsWidget } from '@/page-layout/widgets/fields/components/FieldsWidget';
import { SidePanelToggleButton } from '@/side-panel/components/SidePanelToggleButton';
import { isNavigationDrawerExpandedState } from '@/ui/navigation/states/isNavigationDrawerExpanded';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { SidePanelProvider } from '@/ui/layout/side-panel/contexts/SidePanelContext';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import {
  PageLayoutType,
  ViewType,
  WidgetConfigurationType,
} from '~/generated-metadata/graphql';
import { RecordShowPageHeader } from '~/pages/object-record/RecordShowPageHeader';
import { RecordShowPageTitle } from '~/pages/object-record/RecordShowPageTitle';

const sections = [
  { id: 'home', label: 'Home' },
  { id: 'influencers', label: 'Influencers' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
  { id: 'agent', label: 'Campaign Agent' },
  { id: 'operations', label: 'Operations' },
] as const;

const StyledPage = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;
const StyledNavigation = styled.nav`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  min-width: 0;
  overflow-x: auto;
  padding: 0 ${themeCssVariables.spacing[2]};
  white-space: nowrap;
`;
const StyledSectionLink = styled(Link)`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  padding: ${themeCssVariables.spacing[2]};
  position: relative;
  text-decoration: none;

  &:hover,
  &[aria-current='page'] {
    color: ${themeCssVariables.font.color.primary};
  }

  &[aria-current='page']::after {
    background: ${themeCssVariables.border.color.inverted};
    bottom: 0;
    content: '';
    height: 1px;
    left: 0;
    position: absolute;
    right: 0;
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.brand.focusRing};
    outline-offset: -2px;
  }
`;
const StyledSection = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
`;

export const MyahCampaignPageContent = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const [searchParams] = useSearchParams();
  const activeSectionLinkRef = useRef<HTMLAnchorElement>(null);
  const isMobile = useIsMobile();
  const setIsNavigationDrawerExpanded = useSetAtomState(
    isNavigationDrawerExpandedState,
  );

  useEffect(() => {
    if (isMobile) setIsNavigationDrawerExpanded(false);
  }, [isMobile, setIsNavigationDrawerExpanded]);
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { canUpdateObjectRecords } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const views = useAtomStateValue(viewsSelector);
  const homeViewId =
    views.find(
      (view) =>
        view.universalIdentifier === '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746' &&
        view.objectMetadataId === objectMetadataItem.id &&
        view.type === ViewType.FIELDS_WIDGET &&
        view.isActive,
    )?.id ?? null;
  // The native fields renderer falls back to active object fields when this view is absent.
  const homeFieldsWidget = {
    id: 'campaign-home-fields',
    configuration: {
      configurationType: WidgetConfigurationType.FIELDS,
      viewId: homeViewId,
    },
  } as PageLayoutWidget;
  const requestedSection = searchParams.get('section');
  const section =
    sections.find(({ id }) => id === requestedSection)?.id ?? 'home';
  const sectionSearch = (id: (typeof sections)[number]['id']) => {
    const params = new URLSearchParams(searchParams);
    if (id === 'home') params.delete('section');
    else params.set('section', id);
    return `?${params.toString()}`;
  };
  const recordShowComponentInstanceId =
    computeRecordShowComponentInstanceId(campaignId);

  useEffect(() => {
    activeSectionLinkRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [section]);

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
          <RecordShowPageTitle
            objectNameSingular="campaign"
            objectRecordId={campaignId}
          />
          <PageCardLayout
            header={
              <RecordShowPageHeader
                objectNameSingular="campaign"
                objectRecordId={campaignId}
                compactOnMobile={isMobile}
              >
                <MyahCampaignExecutionControls
                  campaignId={campaignId}
                  variant="header"
                />
                <RecordShowCommandMenu />
                <SidePanelToggleButton />
              </RecordShowPageHeader>
            }
          >
            <TimelineActivityContext.Provider value={{ recordId: campaignId }}>
              <RecordShowEffect
                objectNameSingular="campaign"
                recordId={campaignId}
              />
              <RecordShowContainerContextStoreTargetedRecordsEffect
                recordId={campaignId}
              />
              <RecordShowPageSSESubscribeEffect
                objectNameSingular="campaign"
                recordId={campaignId}
              />
              <LayoutRenderingProvider
                value={{
                  targetRecordIdentifier: {
                    id: campaignId,
                    targetObjectNameSingular: 'campaign',
                  },
                  layoutType: PageLayoutType.RECORD_PAGE,
                  isInSidePanel: false,
                }}
              >
                <SidePanelProvider value={{ isInSidePanel: false }}>
                  <StyledPage>
                    <StyledNavigation aria-label="Campaign sections">
                      {sections.map(({ id, label }) => (
                        <StyledSectionLink
                          ref={
                            section === id ? activeSectionLinkRef : undefined
                          }
                          key={id}
                          to={sectionSearch(id)}
                          aria-current={section === id ? 'page' : undefined}
                        >
                          {label}
                        </StyledSectionLink>
                      ))}
                    </StyledNavigation>
                    <StyledSection key={section}>
                      {section === 'home' ? (
                        <>
                          <SummaryCard
                            objectNameSingular="campaign"
                            objectRecordId={campaignId}
                            isInSidePanel={false}
                          />
                          <PageLayoutComponentInstanceContext.Provider
                            value={{
                              instanceId: `campaign-${campaignId}-fields`,
                            }}
                          >
                            <PageLayoutEditModeProviderContext
                              value={{ isInEditMode: false }}
                            >
                              <FieldsWidget widget={homeFieldsWidget} />
                            </PageLayoutEditModeProviderContext>
                          </PageLayoutComponentInstanceContext.Provider>
                          <MyahCampaignHome campaignId={campaignId} />
                          {canUpdateObjectRecords ? (
                            <MyahCampaignAudienceControls
                              campaignId={campaignId}
                            />
                          ) : null}
                        </>
                      ) : section === 'influencers' ? (
                        <CampaignInfluencerIndex
                          campaignId={campaignId}
                          viewId={null}
                        />
                      ) : section === 'outreach' ? (
                        <CampaignOutreachTab campaignId={campaignId} />
                      ) : section === 'tasks' ? (
                        <TasksCard />
                      ) : section === 'notes' ? (
                        <NotesCard />
                      ) : section === 'agent' ? (
                        <MyahCampaignAgent
                          campaignId={campaignId}
                          title="Campaign Agent"
                        />
                      ) : (
                        <MyahCampaignOperations
                          campaignId={campaignId}
                          title="Operations"
                          dedicatedPage
                        />
                      )}
                    </StyledSection>
                  </StyledPage>
                </SidePanelProvider>
              </LayoutRenderingProvider>
            </TimelineActivityContext.Provider>
          </PageCardLayout>
        </CommandMenuComponentInstanceContext.Provider>
      </ContextStoreComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
