import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { ALL_MANY_TO_ONE_METADATA_RELATIONS } from 'src/engine/metadata-modules/flat-entity/constant/all-many-to-one-metadata-relations.constant';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { TwentyStandardApplicationService } from 'src/engine/workspace-manager/twenty-standard-application/services/twenty-standard-application.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const STANDARD_APPLICATION_ID = '20202020-0000-0000-0000-000000000002';

describe('TwentyStandardApplicationService', () => {
  const createService = (
    fromMaps: Partial<ReturnType<typeof createEmptyAllFlatEntityMaps>> = {},
  ) => {
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
              universalIdentifier:
                TWENTY_STANDARD_APPLICATION.universalIdentifier,
            },
          }),
      } as unknown as ApplicationService,
      {
        validateBuildAndRunWorkspaceMigrationFromTo,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          ...createEmptyAllFlatEntityMaps(),
          ...fromMaps,
          featureFlagsMap: {},
          flatApplicationMaps: {
            byId: {
              [STANDARD_APPLICATION_ID]: {
                id: STANDARD_APPLICATION_ID,
                universalIdentifier:
                  TWENTY_STANDARD_APPLICATION.universalIdentifier,
              },
            },
            idByUniversalIdentifier: {
              [TWENTY_STANDARD_APPLICATION.universalIdentifier]:
                STANDARD_APPLICATION_ID,
            },
          },
        }),
      } as unknown as WorkspaceCacheService,
      {} as GlobalWorkspaceOrmManager,
    );

    return { service, validateBuildAndRunWorkspaceMigrationFromTo };
  };

  it('does not provision replaced CRM metadata for a Myah workspace', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService();

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'myah',
    });

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[STANDARD_OBJECTS.person.universalIdentifier],
    ).toBeUndefined();
  });

  it.each(['myah', 'full'] as const)(
    'provisions only reply metadata on fresh and repeated %s sync',
    async (profile) => {
      const later = [
        MYAH_STANDARD_OBJECTS.partnershipOfferVersion,
        MYAH_STANDARD_OBJECTS.partnershipObligation,
      ];
      const run = async (fromMaps = createEmptyAllFlatEntityMaps()) => {
        const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
          createService(fromMaps);
        await service.synchronizeTwentyStandardApplicationOrThrow({
          workspaceId: WORKSPACE_ID,
          profile,
        });
        return validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
          .fromToAllFlatEntityMaps;
      };
      const fresh = await run();
      const repeated = await run(
        Object.fromEntries(
          Object.entries(fresh).map(([key, value]) => [
            key,
            (value as { to: unknown }).to,
          ]),
        ) as ReturnType<typeof createEmptyAllFlatEntityMaps>,
      );

      for (const result of [fresh, repeated]) {
        const objects = result.flatObjectMetadataMaps.to.byUniversalIdentifier;
        expect(
          objects[STANDARD_OBJECTS.person.universalIdentifier] !== undefined,
        ).toBe(profile === 'full');
        const fields = result.flatFieldMetadataMaps.to.byUniversalIdentifier;
        const indexes = result.flatIndexMaps.to.byUniversalIdentifier;
        const permissions =
          result.flatObjectPermissionMaps.to.byUniversalIdentifier;
        for (const object of later) {
          expect(objects[object.universalIdentifier]).toBeUndefined();
          for (const { universalIdentifier } of Object.values(object.fields)) {
            expect(fields[universalIdentifier]).toBeUndefined();
          }
          for (const { universalIdentifier } of Object.values(object.indexes)) {
            expect(indexes[universalIdentifier]).toBeUndefined();
          }
          expect(
            Object.values(permissions).some(
              (permission) =>
                (
                  permission as
                    | { objectMetadataUniversalIdentifier?: string }
                    | undefined
                )?.objectMetadataUniversalIdentifier ===
                object.universalIdentifier,
            ),
          ).toBe(false);
        }
        for (const field of [
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions,
          MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations,
          STANDARD_OBJECTS.task.fields.partnershipObligations,
        ]) {
          expect(fields[field.universalIdentifier]).toBeUndefined();
        }
        expect(
          fields[
            MYAH_STANDARD_OBJECTS.campaign.fields.replyAgentEnabled
              .universalIdentifier
          ]?.defaultValue,
        ).toBe(false);
        expect(
          fields[
            MYAH_STANDARD_OBJECTS.campaignCreator.fields.replyAgentPaused
              .universalIdentifier
          ]?.defaultValue,
        ).toBe(false);
        expect(
          objects[
            MYAH_STANDARD_OBJECTS.campaignEmailConversationBinding
              .universalIdentifier
          ],
        ).toBeDefined();
        // A filtered target must be closed over metadata relations, not just
        // missing the two table definitions.
        for (const name of TWENTY_STANDARD_ALL_METADATA_NAME) {
          const entries =
            result[getMetadataFlatEntityMapsKey(name)].to.byUniversalIdentifier;
          for (const entity of Object.values(entries)) {
            if (!entity) continue;
            for (const relation of Object.values(
              ALL_MANY_TO_ONE_METADATA_RELATIONS[name],
            )) {
              if (!relation) continue;
              const targetMaps =
                result[getMetadataFlatEntityMapsKey(relation.metadataName)];
              if (!targetMaps) continue; // External application-owned metadata.
              const target = targetMaps.to.byUniversalIdentifier;
              const id = (entity as unknown as Record<string, unknown>)[
                relation.universalForeignKey
              ];
              if (typeof id === 'string') expect(target[id]).toBeDefined();
            }
          }
        }
      }
    },
  );

  it.each(['myah', 'full'] as const)(
    'preserves an existing applied B projection on repeat %s sync',
    async (profile) => {
      const { allFlatEntityMaps } =
        computeTwentyStandardApplicationAllFlatEntityMaps({
          now: '2026-09-27T00:00:00.000Z',
          workspaceId: WORKSPACE_ID,
          twentyStandardApplicationId: STANDARD_APPLICATION_ID,
          removeReplacedTwentyCrmMetadata: profile === 'myah',
        });
      const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
        createService(allFlatEntityMaps);
      await service.synchronizeTwentyStandardApplicationOrThrow({
        workspaceId: WORKSPACE_ID,
        profile,
      });
      const input =
        validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];
      expect(
        input.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
          .byUniversalIdentifier[
          STANDARD_OBJECTS.person.universalIdentifier
        ] !== undefined,
      ).toBe(profile === 'full');
      for (const name of [
        'partnershipOfferVersion',
        'partnershipObligation',
      ] as const) {
        expect(
          input.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
            .byUniversalIdentifier[
            MYAH_STANDARD_OBJECTS[name].universalIdentifier
          ],
        ).toBeDefined();
      }
    },
  );

  it.each(['myah', 'full'] as const)(
    'fails closed before %s migration if only one B object is present',
    async (profile) => {
      const from = createEmptyAllFlatEntityMaps();
      const object = MYAH_STANDARD_OBJECTS.partnershipOfferVersion;
      from.flatObjectMetadataMaps = createEmptyFlatEntityMaps();
      from.flatObjectMetadataMaps.byUniversalIdentifier[
        object.universalIdentifier
      ] = {
        id: '20202020-0000-0000-0000-000000000004',
        applicationId: STANDARD_APPLICATION_ID,
        universalIdentifier: object.universalIdentifier,
      } as never;
      from.flatObjectMetadataMaps.universalIdentifierById[
        '20202020-0000-0000-0000-000000000004'
      ] = object.universalIdentifier;
      from.flatObjectMetadataMaps.universalIdentifiersByApplicationId[
        STANDARD_APPLICATION_ID
      ] = [object.universalIdentifier];
      const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
        createService(from);
      await expect(
        service.synchronizeTwentyStandardApplicationOrThrow({
          workspaceId: WORKSPACE_ID,
          profile,
        }),
      ).rejects.toThrow(/partial partnership metadata/i);
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'flatFieldMetadataMaps',
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
        .universalIdentifier,
      'full',
    ],
    [
      'flatFieldMetadataMaps',
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
        .universalIdentifier,
    ],
    [
      'flatFieldMetadataMaps',
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
        .universalIdentifier,
    ],
    [
      'flatFieldMetadataMaps',
      STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
    ],
    [
      'flatIndexMaps',
      MYAH_STANDARD_OBJECTS.partnershipOfferVersion.indexes
        .campaignCreatorVersionUniqueIndex.universalIdentifier,
    ],
    [
      'flatIndexMaps',
      MYAH_STANDARD_OBJECTS.partnershipObligation.indexes
        .offerVersionPurposeUniqueIndex.universalIdentifier,
    ],
  ] as const)(
    'holds incomplete B metadata %s %s before deletion inference',
    async (mapKey, id, profile: 'myah' | 'full' = 'myah') => {
      const { allFlatEntityMaps } =
        computeTwentyStandardApplicationAllFlatEntityMaps({
          now: '2026-09-27T00:00:00.000Z',
          workspaceId: WORKSPACE_ID,
          twentyStandardApplicationId: STANDARD_APPLICATION_ID,
          removeReplacedTwentyCrmMetadata: true,
        });
      const from = createEmptyAllFlatEntityMaps();
      const source = allFlatEntityMaps[mapKey].byUniversalIdentifier[id];
      expect(source).toBeDefined();
      const maps = from[mapKey];
      maps.byUniversalIdentifier[id] = source as never;
      maps.universalIdentifierById[source!.id] = id;
      maps.universalIdentifiersByApplicationId[STANDARD_APPLICATION_ID] = [id];
      const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
        createService(from);
      await expect(
        service.synchronizeTwentyStandardApplicationOrThrow({
          workspaceId: WORKSPACE_ID,
          profile,
        }),
      ).rejects.toThrow(/partial partnership metadata/i);
      expect(
        validateBuildAndRunWorkspaceMigrationFromTo,
      ).not.toHaveBeenCalled();
    },
  );

  it('holds a stranded B object permission before deletion inference', async () => {
    const { allFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now: '2026-09-27T00:00:00.000Z',
        workspaceId: WORKSPACE_ID,
        twentyStandardApplicationId: STANDARD_APPLICATION_ID,
        removeReplacedTwentyCrmMetadata: true,
      });
    const permission = Object.values(
      allFlatEntityMaps.flatObjectPermissionMaps.byUniversalIdentifier,
    ).find(
      (item) =>
        item?.objectMetadataUniversalIdentifier ===
        MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
    );
    expect(permission).toBeDefined();
    const from = createEmptyAllFlatEntityMaps();
    from.flatObjectPermissionMaps.byUniversalIdentifier[
      permission!.universalIdentifier
    ] = permission;
    from.flatObjectPermissionMaps.universalIdentifierById[permission!.id] =
      permission!.universalIdentifier;
    from.flatObjectPermissionMaps.universalIdentifiersByApplicationId[
      STANDARD_APPLICATION_ID
    ] = [permission!.universalIdentifier];
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService(from);
    await expect(
      service.synchronizeTwentyStandardApplicationOrThrow({
        workspaceId: WORKSPACE_ID,
        profile: 'myah',
      }),
    ).rejects.toThrow(/partial partnership metadata/i);
    expect(validateBuildAndRunWorkspaceMigrationFromTo).not.toHaveBeenCalled();
  });

  it('retains replaced CRM metadata for a full Twenty fixture workspace', async () => {
    const { service, validateBuildAndRunWorkspaceMigrationFromTo } =
      createService();

    await service.synchronizeTwentyStandardApplicationOrThrow({
      workspaceId: WORKSPACE_ID,
      profile: 'full',
    });

    const migrationInput =
      validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0];

    expect(
      migrationInput.fromToAllFlatEntityMaps.flatObjectMetadataMaps.to
        .byUniversalIdentifier[STANDARD_OBJECTS.person.universalIdentifier],
    ).toBeDefined();
  });
});
