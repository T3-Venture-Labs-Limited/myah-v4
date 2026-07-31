import { type AllMetadataName } from 'twenty-shared/metadata';

import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { type AllUniversalWorkspaceMigrationAction } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration-action-common';

export const getWorkspaceMigrationActionMetadataNames = (
  action: AllUniversalWorkspaceMigrationAction,
): AllMetadataName[] => {
  if (
    action.metadataName !== 'pageLayoutWidget' ||
    action.flatEntity === undefined
  ) {
    return [action.metadataName];
  }

  switch (action.flatEntity.universalConfiguration.configurationType) {
    case WidgetConfigurationType.FIELDS:
      return ['pageLayoutWidget', 'view'];
    case WidgetConfigurationType.FRONT_COMPONENT:
      return ['pageLayoutWidget', 'frontComponent'];
    default:
      return ['pageLayoutWidget'];
  }
};
