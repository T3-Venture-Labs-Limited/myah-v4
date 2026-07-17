import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';

describe('TwentyStandardApplicationService', () => {
  it('does not provision replaced CRM metadata for a fresh workspace', async () => {
    const validateBuildAndRunWorkspaceMigrationFromTo = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const service = new TwentyStandardApplicationService(
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            twentyStandardFlatApplication: {
              id: STANDARD_APPLICATION_ID,
              universalIdentifier: '20202020-0000-0000-0000-000000000003',
            },
          }),
      } as unknown as ApplicationService,
      {
        validateBuildAndRunWorkspaceMigrationFromTo,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          ...createEmptyAllFlatEntityMaps(),
          featureFlagsMap: {},
        }),
      } as unknown as WorkspaceCacheService,
      {} as GlobalWorkspaceOrmManager,
    );

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
    });

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[STANDARD_OBJECTS.person.universalIdentifier],
    ).toBeUndefined();
  });
});
