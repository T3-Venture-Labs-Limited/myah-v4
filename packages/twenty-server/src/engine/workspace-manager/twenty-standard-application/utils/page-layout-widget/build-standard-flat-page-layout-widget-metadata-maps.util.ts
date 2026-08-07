import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { addFlatEntityToFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/add-flat-entity-to-flat-entity-maps-or-throw.util';
import { type FlatPageLayoutWidget } from 'src/engine/metadata-modules/flat-page-layout-widget/types/flat-page-layout-widget.type';
import { FieldDisplayMode } from 'src/engine/metadata-modules/page-layout-widget/enums/field-display-mode.enum';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { WidgetType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-type.enum';
import { type AllPageLayoutWidgetConfiguration } from 'src/engine/metadata-modules/page-layout-widget/types/all-page-layout-widget-configuration.type';
import { ALL_STANDARD_PAGE_LAYOUTS } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { type AllStandardObjectName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-name.type';
import { type StandardRecordPageLayoutConfig } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-config/standard-page-layout-config.type';
import { computeMyFirstDashboardWidgets } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-widget/compute-my-first-dashboard-widgets.util';
import {
  type CreateStandardPageLayoutWidgetArgs,
  type CreateStandardPageLayoutWidgetContext,
  createStandardPageLayoutWidgetFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout-widget/create-standard-page-layout-widget-flat-metadata.util';
import { findObjectNameByUniversalIdentifier } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/create-standard-page-layout-flat-metadata.util';

export type BuildStandardFlatPageLayoutWidgetMetadataMapsArgs = Omit<
  CreateStandardPageLayoutWidgetArgs,
  'context'
>;

const RECORD_PAGE_LAYOUT_WIDGET_TYPES = [
  WidgetType.FIELDS,
  WidgetType.FIELD,
  WidgetType.STANDALONE_RICH_TEXT,
  WidgetType.TIMELINE,
  WidgetType.TASKS,
  WidgetType.NOTES,
  WidgetType.FILES,
  WidgetType.EMAILS,
  WidgetType.CALENDAR,
  WidgetType.FIELD_RICH_TEXT,
  WidgetType.WORKFLOW,
  WidgetType.WORKFLOW_VERSION,
  WidgetType.WORKFLOW_RUN,
  WidgetType.RECORD_TABLE,
];

const WIDGET_TYPE_TO_CONFIGURATION_TYPE: Partial<
  Record<WidgetType, WidgetConfigurationType>
> = {
  [WidgetType.FIELDS]: WidgetConfigurationType.FIELDS,
  [WidgetType.FIELD]: WidgetConfigurationType.FIELD,
  [WidgetType.STANDALONE_RICH_TEXT]:
    WidgetConfigurationType.STANDALONE_RICH_TEXT,
  [WidgetType.TIMELINE]: WidgetConfigurationType.TIMELINE,
  [WidgetType.TASKS]: WidgetConfigurationType.TASKS,
  [WidgetType.NOTES]: WidgetConfigurationType.NOTES,
  [WidgetType.FILES]: WidgetConfigurationType.FILES,
  [WidgetType.EMAILS]: WidgetConfigurationType.EMAILS,
  [WidgetType.CALENDAR]: WidgetConfigurationType.CALENDAR,
  [WidgetType.FIELD_RICH_TEXT]: WidgetConfigurationType.FIELD_RICH_TEXT,
  [WidgetType.WORKFLOW]: WidgetConfigurationType.WORKFLOW,
  [WidgetType.WORKFLOW_VERSION]: WidgetConfigurationType.WORKFLOW_VERSION,
  [WidgetType.WORKFLOW_RUN]: WidgetConfigurationType.WORKFLOW_RUN,
  [WidgetType.RECORD_TABLE]: WidgetConfigurationType.RECORD_TABLE,
  [WidgetType.EMAIL_THREAD]: WidgetConfigurationType.EMAIL_THREAD,
};

const RECORD_PAGE_FIELDS_VIEW_NAME_BY_OBJECT: Partial<
  Record<AllStandardObjectName, string>
> = {
  blocklist: 'blocklistRecordPageFields',
  calendarChannelEventAssociation:
    'calendarChannelEventAssociationRecordPageFields',
  calendarEvent: 'calendarEventRecordPageFields',
  calendarEventParticipant: 'calendarEventParticipantRecordPageFields',
  callRecording: 'callRecordingRecordPageFields',
  company: 'companyRecordPageFields',
  messageChannelMessageAssociation:
    'messageChannelMessageAssociationRecordPageFields',
  messageChannelMessageAssociationMessageFolder:
    'messageChannelMessageAssociationMessageFolderRecordPageFields',
  messageParticipant: 'messageParticipantRecordPageFields',
  note: 'noteRecordPageFields',
  opportunity: 'opportunityRecordPageFields',
  person: 'personRecordPageFields',
  task: 'taskRecordPageFields',
  workflowAutomatedTrigger: 'workflowAutomatedTriggerRecordPageFields',
  workflowRun: 'workflowRunRecordPageFields',
  workflowVersion: 'workflowVersionRecordPageFields',
  brandBrainPage: 'brandBrainPageRecordPageFields',
  creator: 'creatorRecordPageFields',
};
const buildRecordPageWidgetConfigurations = ({
  widgetType,
  layoutObjectName,
  standardObjectMetadataRelatedEntityIds,
  fieldUniversalIdentifier,
  fieldsViewUniversalIdentifier,
  viewUniversalIdentifier,
}: {
  widgetType: WidgetType;
  layoutObjectName: AllStandardObjectName | null;
  standardObjectMetadataRelatedEntityIds: BuildStandardFlatPageLayoutWidgetMetadataMapsArgs['standardObjectMetadataRelatedEntityIds'];
  fieldUniversalIdentifier?: string;
  fieldsViewUniversalIdentifier?: string;
  viewUniversalIdentifier?: string;
}): {
  configuration: AllPageLayoutWidgetConfiguration;
  universalConfiguration: CreateStandardPageLayoutWidgetContext['universalConfiguration'];
} => {
  if (widgetType === WidgetType.FIELDS && isDefined(layoutObjectName)) {
    return buildFieldsWidgetConfiguration({
      objectName: layoutObjectName,
      standardObjectMetadataRelatedEntityIds,
      fieldsViewUniversalIdentifier,
    });
  }

  if (
    widgetType === WidgetType.FIELD &&
    isDefined(layoutObjectName) &&
    isDefined(fieldUniversalIdentifier)
  ) {
    return buildFieldWidgetConfiguration({
      objectName: layoutObjectName,
      standardObjectMetadataRelatedEntityIds,
      fieldUniversalIdentifier,
      viewUniversalIdentifier,
    });
  }

  if (
    widgetType === WidgetType.RECORD_TABLE &&
    isDefined(layoutObjectName) &&
    isDefined(viewUniversalIdentifier)
  ) {
    const view = Object.values(
      standardObjectMetadataRelatedEntityIds[layoutObjectName].views,
    ).find(
      (candidate) => candidate.universalIdentifier === viewUniversalIdentifier,
    );
    if (!view) {
      throw new Error(
        `Record table view ${viewUniversalIdentifier} is not defined`,
      );
    }
    return {
      configuration: {
        configurationType: WidgetConfigurationType.RECORD_TABLE,
        viewId: view.id,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.RECORD_TABLE,
        viewId: viewUniversalIdentifier,
      },
    };
  }

  const configurationType = WIDGET_TYPE_TO_CONFIGURATION_TYPE[widgetType];

  if (!configurationType) {
    throw new Error(
      `No configuration type mapping for widget type ${widgetType}`,
    );
  }

  const baseConfig = { configurationType };

  return {
    configuration: baseConfig as AllPageLayoutWidgetConfiguration,
    universalConfiguration:
      baseConfig as CreateStandardPageLayoutWidgetContext['universalConfiguration'],
  };
};

const buildFieldsWidgetConfiguration = ({
  objectName,
  standardObjectMetadataRelatedEntityIds,
  fieldsViewUniversalIdentifier,
}: {
  objectName: AllStandardObjectName;
  standardObjectMetadataRelatedEntityIds: BuildStandardFlatPageLayoutWidgetMetadataMapsArgs['standardObjectMetadataRelatedEntityIds'];
  fieldsViewUniversalIdentifier?: string;
}): {
  configuration: AllPageLayoutWidgetConfiguration;
  universalConfiguration: CreateStandardPageLayoutWidgetContext['universalConfiguration'];
} => {
  const recordPageFieldsViewName =
    RECORD_PAGE_FIELDS_VIEW_NAME_BY_OBJECT[objectName];

  if (!recordPageFieldsViewName && !fieldsViewUniversalIdentifier) {
    return {
      configuration: {
        configurationType: WidgetConfigurationType.FIELDS,
        viewId: null,
        newFieldDefaultVisibility: true,
      },
      universalConfiguration: {
        configurationType: WidgetConfigurationType.FIELDS,
        viewUniversalIdentifier: null,
        newFieldDefaultVisibility: true,
      },
    };
  }

  const standardObjectViews = (
    'views' in STANDARD_OBJECTS[objectName]
      ? STANDARD_OBJECTS[objectName].views
      : {}
  ) as Record<string, { universalIdentifier: string }>;

  const views = standardObjectMetadataRelatedEntityIds[objectName]
    .views as Record<
    string,
    {
      id: string;
      viewFieldGroups?: Record<string, { id: string }>;
    }
  >;

  const fieldsView = fieldsViewUniversalIdentifier
    ? Object.entries(standardObjectViews).find(
        ([, view]) =>
          view.universalIdentifier === fieldsViewUniversalIdentifier,
      )
    : undefined;

  if (fieldsViewUniversalIdentifier && !fieldsView) {
    throw new Error(
      `Fields view ${fieldsViewUniversalIdentifier} is not defined on ${objectName}`,
    );
  }

  const [fieldsViewName] = fieldsView ?? [recordPageFieldsViewName];
  const viewId = fieldsViewName ? (views[fieldsViewName]?.id ?? null) : null;

  const myahRecordPageFieldsViewUniversalIdentifiers: Partial<
    Record<AllStandardObjectName, string>
  > = {
    brandBrainPage: '2774101b-3c0b-485b-91f5-b92d30bdcb6e',
    creator: 'fdbaccb5-56d4-4c36-98c7-0f5ab0b7cc1e',
  };
  const viewUniversalIdentifier =
    fieldsViewUniversalIdentifier ??
    myahRecordPageFieldsViewUniversalIdentifiers[objectName] ??
    (recordPageFieldsViewName
      ? standardObjectViews[recordPageFieldsViewName]?.universalIdentifier
      : null) ??
    null;

  return {
    configuration: {
      configurationType: WidgetConfigurationType.FIELDS,
      viewId,
      newFieldDefaultVisibility: true,
    },
    universalConfiguration: {
      configurationType: WidgetConfigurationType.FIELDS,
      viewUniversalIdentifier,
      newFieldDefaultVisibility: true,
    },
  };
};
const buildFieldWidgetConfiguration = ({
  objectName,
  standardObjectMetadataRelatedEntityIds,
  fieldUniversalIdentifier,
  viewUniversalIdentifier,
}: {
  objectName: AllStandardObjectName;
  standardObjectMetadataRelatedEntityIds: BuildStandardFlatPageLayoutWidgetMetadataMapsArgs['standardObjectMetadataRelatedEntityIds'];
  fieldUniversalIdentifier: string;
  viewUniversalIdentifier?: string;
}): {
  configuration: AllPageLayoutWidgetConfiguration;
  universalConfiguration: CreateStandardPageLayoutWidgetContext['universalConfiguration'];
} => {
  const fields = standardObjectMetadataRelatedEntityIds[objectName]
    .fields as Record<string, { id: string }>;

  const fieldName = Object.keys(STANDARD_OBJECTS[objectName].fields).find(
    (name) =>
      (
        STANDARD_OBJECTS[objectName].fields as Record<
          string,
          { universalIdentifier: string }
        >
      )[name]?.universalIdentifier === fieldUniversalIdentifier,
  );

  const fieldMetadataId = fieldName ? (fields[fieldName]?.id ?? null) : null;

  const view = viewUniversalIdentifier
    ? Object.values(standardObjectMetadataRelatedEntityIds)
        .flatMap((metadata) => Object.values(metadata.views))
        .find(
          (candidate) =>
            candidate.universalIdentifier === viewUniversalIdentifier,
        )
    : undefined;
  return {
    configuration: {
      configurationType: WidgetConfigurationType.FIELD,
      fieldMetadataId: fieldMetadataId ?? fieldUniversalIdentifier,
      fieldDisplayMode: view ? FieldDisplayMode.TABLE : FieldDisplayMode.CARD,
      ...(view ? { viewId: view.id } : {}),
    },
    universalConfiguration: {
      configurationType: WidgetConfigurationType.FIELD,
      fieldMetadataId: fieldUniversalIdentifier,
      fieldDisplayMode: view ? FieldDisplayMode.TABLE : FieldDisplayMode.CARD,
      ...(view ? { viewId: viewUniversalIdentifier } : {}),
    },
  };
};

const computeRecordPageWidgets = ({
  now,
  workspaceId,
  twentyStandardApplicationId,
  standardObjectMetadataRelatedEntityIds,
  standardPageLayoutMetadataRelatedEntityIds,
}: BuildStandardFlatPageLayoutWidgetMetadataMapsArgs): FlatPageLayoutWidget[] => {
  const allWidgets: FlatPageLayoutWidget[] = [];
  for (const [layoutName, layoutConfig] of Object.entries(
    ALL_STANDARD_PAGE_LAYOUTS,
  ).filter(([name]) => name !== 'myFirstDashboard')) {
    const layout = layoutConfig as StandardRecordPageLayoutConfig;
    let layoutObjectName: AllStandardObjectName | null = null;
    if (layout.objectUniversalIdentifier) {
      const objectName = findObjectNameByUniversalIdentifier(
        layout.objectUniversalIdentifier,
      ) as AllStandardObjectName;

      layoutObjectName = objectName;
    }

    for (const tabTitle of Object.keys(layout.tabs)) {
      const tab = layout.tabs[tabTitle];

      for (const widgetName of Object.keys(tab.widgets)) {
        const widget = tab.widgets[widgetName];

        const isRecordPageWidget = RECORD_PAGE_LAYOUT_WIDGET_TYPES.includes(
          widget.type,
        );

        const widgetObjectName = widget.objectUniversalIdentifier
          ? (findObjectNameByUniversalIdentifier(
              widget.objectUniversalIdentifier,
            ) as AllStandardObjectName)
          : layoutObjectName;
        const objectMetadataId = isRecordPageWidget
          ? widgetObjectName
            ? (standardObjectMetadataRelatedEntityIds[widgetObjectName]?.id ??
              null)
            : null
          : null;

        const objectMetadataUniversalIdentifier = isRecordPageWidget
          ? (widget.objectUniversalIdentifier ??
            layout.objectUniversalIdentifier ??
            null)
          : null;

        const { configuration, universalConfiguration } =
          buildRecordPageWidgetConfigurations({
            widgetType: widget.type,
            layoutObjectName: widgetObjectName,
            standardObjectMetadataRelatedEntityIds,
            fieldUniversalIdentifier: widget.fieldUniversalIdentifier,
            viewUniversalIdentifier: widget.viewUniversalIdentifier,
            fieldsViewUniversalIdentifier: widget.fieldsViewUniversalIdentifier,
          });

        allWidgets.push(
          createStandardPageLayoutWidgetFlatMetadata({
            now,
            workspaceId,
            twentyStandardApplicationId,
            standardObjectMetadataRelatedEntityIds,
            standardPageLayoutMetadataRelatedEntityIds,
            objectMetadataUniversalIdentifier,
            context: {
              layoutName,
              tabTitle,
              widgetName,
              title: widget.title,
              type: widget.type,
              gridPosition: widget.gridPosition,
              position: widget.position ?? null,
              configuration,
              universalConfiguration,
              objectMetadataId,
              conditionalDisplay: widget.conditionalDisplay ?? null,
              conditionalAvailabilityExpression:
                widget.conditionalAvailabilityExpression ?? null,
            },
          }),
        );
      }
    }
  }

  return allWidgets;
};

export const buildStandardFlatPageLayoutWidgetMetadataMaps = (
  args: BuildStandardFlatPageLayoutWidgetMetadataMapsArgs,
): FlatEntityMaps<FlatPageLayoutWidget> => {
  const allWidgetMetadatas: FlatPageLayoutWidget[] = [
    ...computeMyFirstDashboardWidgets(args),
    ...computeRecordPageWidgets(args),
  ];

  let flatPageLayoutWidgetMaps = createEmptyFlatEntityMaps();

  for (const widgetMetadata of allWidgetMetadatas) {
    flatPageLayoutWidgetMaps = addFlatEntityToFlatEntityMapsOrThrow({
      flatEntity: widgetMetadata,
      flatEntityMaps: flatPageLayoutWidgetMaps,
    });
  }

  return flatPageLayoutWidgetMaps;
};
