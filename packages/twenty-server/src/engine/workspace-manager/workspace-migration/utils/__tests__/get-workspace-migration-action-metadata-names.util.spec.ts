import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { getWorkspaceMigrationActionMetadataNames } from 'src/engine/workspace-manager/workspace-migration/utils/get-workspace-migration-action-metadata-names.util';
import { type AllUniversalWorkspaceMigrationAction } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/types/workspace-migration-action-common';

describe('getWorkspaceMigrationActionMetadataNames', () => {
  it('includes the existing Fields widget view so its configuration can resolve it', () => {
    const action = {
      type: 'create',
      metadataName: 'pageLayoutWidget',
      flatEntity: {
        universalConfiguration: {
          configurationType: WidgetConfigurationType.FIELDS,
          viewUniversalIdentifier: 'existing-view',
          newFieldDefaultVisibility: true,
        },
      },
    } as AllUniversalWorkspaceMigrationAction;

    expect(getWorkspaceMigrationActionMetadataNames(action)).toEqual([
      'pageLayoutWidget',
      'view',
    ]);
  });

  it('includes the existing Front Component widget component so its configuration can resolve it', () => {
    const action = {
      type: 'create',
      metadataName: 'pageLayoutWidget',
      flatEntity: {
        universalConfiguration: {
          configurationType: WidgetConfigurationType.FRONT_COMPONENT,
          frontComponentUniversalIdentifier: 'existing-front-component',
        },
      },
    } as AllUniversalWorkspaceMigrationAction;

    expect(getWorkspaceMigrationActionMetadataNames(action)).toEqual([
      'pageLayoutWidget',
      'frontComponent',
    ]);
  });

  it('does not add configuration dependencies for deleted widgets', () => {
    const action = {
      type: 'delete',
      metadataName: 'pageLayoutWidget',
      universalIdentifier: 'widget-to-delete',
    } as AllUniversalWorkspaceMigrationAction;

    expect(getWorkspaceMigrationActionMetadataNames(action)).toEqual([
      'pageLayoutWidget',
    ]);
  });
});
