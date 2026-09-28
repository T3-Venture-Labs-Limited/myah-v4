import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { usePageLayoutHiddenWidgetTypes } from '@/page-layout/hooks/usePageLayoutHiddenWidgetTypes';
import { buildWidgetVisibilityContext } from '@/page-layout/utils/buildWidgetVisibilityContext';
import { filterVisibleWidgets } from '@/page-layout/utils/filterVisibleWidgets';
import { useWidgetPermissions } from '@/page-layout/widgets/hooks/useWidgetPermissions';
import { useIsMobile } from 'twenty-ui/utilities';
import { MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignRecordPageLayoutUniversalIdentifier';
import { MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignHomeTabUniversalIdentifier';
import { MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER } from '@/page-layout/constants/MyahCampaignAgentTabUniversalIdentifier';
import { useCurrentPageLayoutOrThrow } from '@/page-layout/hooks/useCurrentPageLayoutOrThrow';
import { useIsPageLayoutInEditMode } from '@/page-layout/hooks/useIsPageLayoutInEditMode';
import { usePageLayoutContentContext } from '@/page-layout/contexts/PageLayoutContentContext';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { getWidgetConfigurationViewId } from '@/page-layout/utils/getWidgetConfigurationViewId';
import { CalendarWidget } from '@/page-layout/widgets/calendar/components/CalendarWidget';
import { EmailThreadWidget } from '@/page-layout/widgets/email-thread/components/EmailThreadWidget';
import { EmailWidget } from '@/page-layout/widgets/emails/components/EmailWidget';
import { FieldRichTextWidgetRenderer } from '@/page-layout/widgets/field-rich-text/components/FieldRichTextWidgetRenderer';
import { FieldWidget } from '@/page-layout/widgets/field/components/FieldWidget';
import { FieldsWidget } from '@/page-layout/widgets/fields/components/FieldsWidget';
import { FileWidget } from '@/page-layout/widgets/files/components/FileWidget';
import { FrontComponentWidgetRenderer } from '@/page-layout/widgets/front-component/components/FrontComponentWidgetRenderer';
import { GraphWidgetRenderer } from '@/page-layout/widgets/graph/components/GraphWidgetRenderer';
import { IframeWidget } from '@/page-layout/widgets/iframe/components/IframeWidget';
import { NoteWidget } from '@/page-layout/widgets/notes/components/NoteWidget';
import { StandaloneRichTextWidgetRenderer } from '@/page-layout/widgets/standalone-rich-text/components/StandaloneRichTextWidgetRenderer';
import { TaskWidget } from '@/page-layout/widgets/tasks/components/TaskWidget';
import { TimelineWidget } from '@/page-layout/widgets/timeline/components/TimelineWidget';
import { WorkflowRunWidget } from '@/page-layout/widgets/workflow/components/WorkflowRunWidget';
import { WorkflowVersionWidget } from '@/page-layout/widgets/workflow/components/WorkflowVersionWidget';
import { RecordTableWidgetRenderer } from '@/page-layout/widgets/record-table/components/RecordTableWidgetRenderer';
import { WorkflowWidget } from '@/page-layout/widgets/workflow/components/WorkflowWidget';
import { ViewType, WidgetType } from '~/generated-metadata/graphql';

type WidgetContentRendererProps = {
  widget: PageLayoutWidget;
};

export const WidgetContentRenderer = ({
  widget,
}: WidgetContentRendererProps) => {
  const { currentPageLayout } = useCurrentPageLayoutOrThrow();
  const { tabId } = usePageLayoutContentContext();
  const { targetRecordIdentifier, isInSidePanel } = useLayoutRenderingContext();
  const isEditMode = useIsPageLayoutInEditMode();
  const views = useAtomStateValue(viewsSelector);
  const { objectMetadataItems } = useObjectMetadataItems();
  const campaignMetadata = objectMetadataItems.find(
    (item) => item.nameSingular === 'campaign',
  );
  const campaignPermissions = useObjectPermissionsForObject(
    campaignMetadata?.id ?? '',
  );
  const isMobile = useIsMobile();
  const hiddenWidgetTypes = usePageLayoutHiddenWidgetTypes();
  const tab = currentPageLayout.tabs.find((item) => item.id === tabId);
  const isStandardCampaign =
    targetRecordIdentifier?.targetObjectNameSingular === 'campaign' &&
    currentPageLayout.universalIdentifier ===
      MYAH_CAMPAIGN_RECORD_PAGE_LAYOUT_UNIVERSAL_IDENTIFIER;
  const homeViewUniversalIdentifier = '6bfee1b9-d36a-4e41-9fc6-d413b4e8b746';
  const agentViewUniversalIdentifier = 'eb4da94a-d3da-4354-bb39-7478ac12bd35';
  const hasVerifiedWidgetView = (
    candidateTab: typeof tab,
    candidateWidget: PageLayoutWidget,
    viewUniversalIdentifier: string,
  ) => {
    const viewId = getWidgetConfigurationViewId(candidateWidget.configuration);
    const visibleWidgets = filterVisibleWidgets({
      widgets:
        candidateTab?.widgets.filter(
          (item) => item.isActive && !hiddenWidgetTypes.has(item.type),
        ) ?? [],
      context: buildWidgetVisibilityContext({ isMobile, isInSidePanel }),
    });

    return (
      candidateTab?.isActive === true &&
      visibleWidgets.some((item) => item.id === candidateWidget.id) &&
      candidateWidget.type === WidgetType.FIELDS &&
      viewId !== null &&
      candidateTab?.widgets.filter(
        (item) => getWidgetConfigurationViewId(item.configuration) === viewId,
      ).length === 1 &&
      candidateTab.widgets.some((item) => item.id === candidateWidget.id) &&
      views.filter((view) => view.id === viewId).length === 1 &&
      views.some(
        (view) =>
          view.id === viewId &&
          view.universalIdentifier === viewUniversalIdentifier &&
          view.type === ViewType.FIELDS_WIDGET &&
          view.isActive,
      )
    );
  };
  const agentTab = currentPageLayout.tabs.find(
    (item) =>
      item.universalIdentifier === MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER,
  );
  const agentWidget = agentTab?.widgets.find((item) =>
    hasVerifiedWidgetView(agentTab, item, agentViewUniversalIdentifier),
  );
  const { hasAccess: hasAgentWidgetAccess } = useWidgetPermissions(
    agentWidget ?? widget,
  );
  const guidanceFields = [
    'communicationGuidelines',
    'replyRules',
    'escalationBoundaries',
  ];
  const isReadable = (name: string) => {
    const field = campaignMetadata?.fields.find((item) => item.name === name);
    return (
      !!campaignMetadata &&
      campaignPermissions.canReadObjectRecords &&
      !!field &&
      field.isActive !== false &&
      campaignPermissions.restrictedFields[field.id]?.canRead !== false
    );
  };
  const readableGuidanceFields = guidanceFields.filter(isReadable);
  const factFields = ['campaignBrief', 'additionalNotes'] as const;
  const hasFactsEditor =
    !!campaignMetadata &&
    campaignPermissions.canReadObjectRecords &&
    campaignPermissions.canUpdateObjectRecords &&
    factFields.every((name) => {
      const fieldId = campaignMetadata.fields.find(
        (field) => field.name === name,
      )?.id;
      return (
        fieldId !== undefined &&
        campaignPermissions.restrictedFields[fieldId]?.canRead !== false &&
        campaignPermissions.restrictedFields[fieldId]?.canUpdate !== false
      );
    });
  const homeTab = currentPageLayout.tabs.find(
    (item) =>
      item.universalIdentifier === MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER,
  );
  const homeWidget = homeTab?.widgets.find((item) =>
    hasVerifiedWidgetView(homeTab, item, homeViewUniversalIdentifier),
  );
  const { hasAccess: hasHomeWidgetAccess } = useWidgetPermissions(
    homeWidget ?? widget,
  );
  const guidanceHasDestination =
    agentWidget !== undefined && hasAgentWidgetAccess;
  const excludedHomeFields = [
    ...(guidanceHasDestination ? readableGuidanceFields : []),
    ...(hasFactsEditor ? factFields : []),
  ];
  const excludeFieldNames =
    !isEditMode && isStandardCampaign
      ? tab?.universalIdentifier ===
          MYAH_CAMPAIGN_HOME_TAB_UNIVERSAL_IDENTIFIER &&
        hasVerifiedWidgetView(tab, widget, homeViewUniversalIdentifier) &&
        excludedHomeFields.length > 0
        ? excludedHomeFields
        : tab?.universalIdentifier ===
              MYAH_CAMPAIGN_AGENT_TAB_UNIVERSAL_IDENTIFIER &&
            hasVerifiedWidgetView(tab, widget, agentViewUniversalIdentifier) &&
            homeWidget !== undefined &&
            hasHomeWidgetAccess &&
            factFields.some(isReadable)
          ? factFields.filter(isReadable)
          : undefined
      : undefined;

  switch (widget.type) {
    case WidgetType.GRAPH:
      return <GraphWidgetRenderer widget={widget} />;

    case WidgetType.IFRAME:
      return <IframeWidget widget={widget} />;

    case WidgetType.FIELD:
      return <FieldWidget widget={widget} />;

    case WidgetType.FIELDS:
      return (
        <FieldsWidget widget={widget} excludeFieldNames={excludeFieldNames} />
      );

    case WidgetType.TIMELINE:
      return <TimelineWidget widget={widget} />;

    case WidgetType.TASKS:
      return <TaskWidget widget={widget} />;

    case WidgetType.NOTES:
      return <NoteWidget widget={widget} />;

    case WidgetType.FIELD_RICH_TEXT:
      return <FieldRichTextWidgetRenderer widget={widget} />;

    case WidgetType.FILES:
      return <FileWidget widget={widget} />;

    case WidgetType.EMAILS:
      return <EmailWidget widget={widget} />;

    case WidgetType.CALENDAR:
      return <CalendarWidget widget={widget} />;

    case WidgetType.WORKFLOW:
      return <WorkflowWidget />;

    case WidgetType.WORKFLOW_VERSION:
      return <WorkflowVersionWidget />;

    case WidgetType.WORKFLOW_RUN:
      return <WorkflowRunWidget />;

    case WidgetType.STANDALONE_RICH_TEXT:
      return <StandaloneRichTextWidgetRenderer widget={widget} />;

    case WidgetType.FRONT_COMPONENT:
      return <FrontComponentWidgetRenderer widget={widget} />;

    case WidgetType.RECORD_TABLE:
      return <RecordTableWidgetRenderer widget={widget} />;

    case WidgetType.EMAIL_THREAD:
      return <EmailThreadWidget widget={widget} />;

    default:
      return null;
  }
};
