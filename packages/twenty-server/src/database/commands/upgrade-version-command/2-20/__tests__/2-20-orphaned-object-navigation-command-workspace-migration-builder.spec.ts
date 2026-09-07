import { Test } from '@nestjs/testing';
import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { FeatureFlagKey } from 'twenty-shared/types';
import { v5 } from 'uuid';

import { buildOrphanedObjectNavigationCommandRepairPlan } from 'src/database/commands/upgrade-version-command/2-20/utils/build-orphaned-object-navigation-command-repair-plan.util';
import { LoggerService } from 'src/engine/core-modules/logger/logger.service';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import {
  buildNavigationFlatCommandMenuItem,
  NAVIGATION_COMMAND_UUID_NAMESPACE,
} from 'src/engine/metadata-modules/flat-command-menu-item/utils/build-navigation-flat-command-menu-item.util';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { WorkspaceMigrationCommandMenuItemActionsBuilderService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/builders/command-menu-item/workspace-migration-command-menu-item-actions-builder.service';
import { FlatCommandMenuItemValidatorService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-builder/validators/services/flat-command-menu-item-validator.service';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const APPLICATION_ID = '20202020-0000-4000-8000-000000000002';
const buildMaps = <T extends FlatCommandMenuItem | FlatObjectMetadata>(
  entities: T[],
): FlatEntityMaps<T> => ({
  byUniversalIdentifier: Object.fromEntries(
    entities.map((entity) => [entity.universalIdentifier, entity]),
  ),
  universalIdentifierById: Object.fromEntries(
    entities.map((entity) => [entity.id, entity.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {
    [APPLICATION_ID]: entities.map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  },
});

describe('orphaned object-navigation command real workspace migration builder', () => {
  it('validates 38 payload-only updates, three explicit deletions and no creates without changing the seed; rerun is empty', async () => {
    const objects = Array.from({ length: 38 }, (_, index) =>
      getFlatObjectMetadataMock({
        universalIdentifier: v5(
          `object-${index}`,
          NAVIGATION_COMMAND_UUID_NAMESPACE,
        ),
        id: v5(`current-object-id-${index}`, NAVIGATION_COMMAND_UUID_NAMESPACE),
        nameSingular: `object${index}`,
        applicationId: APPLICATION_ID,
        workspaceId: WORKSPACE_ID,
      }),
    );
    const helpers = ['campaignCreatorList', 'campaignCreatorListSource'].map(
      (nameSingular) =>
        getFlatObjectMetadataMock({
          universalIdentifier: v5(
            nameSingular,
            NAVIGATION_COMMAND_UUID_NAMESPACE,
          ),
          nameSingular,
          isSearchable: false,
        }),
    );
    const removedObjects = [
      STANDARD_OBJECTS.person,
      STANDARD_OBJECTS.company,
      STANDARD_OBJECTS.opportunity,
    ].map(({ universalIdentifier }) =>
      getFlatObjectMetadataMock({ universalIdentifier }),
    );
    const commands = [...objects, ...removedObjects].map(
      (objectMetadata, index) =>
        buildNavigationFlatCommandMenuItem({
          objectMetadata: {
            ...objectMetadata,
            id: v5(`missing-${index}`, NAVIGATION_COMMAND_UUID_NAMESPACE),
          },
          commandMenuItemId: v5(
            `command-${index}`,
            NAVIGATION_COMMAND_UUID_NAMESPACE,
          ),
          applicationId: APPLICATION_ID,
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          workspaceId: WORKSPACE_ID,
          position: index,
          now: '2026-07-31T02:19:09.000Z',
        }),
    );
    const flatObjectMetadataMaps = buildMaps([...objects, ...helpers]);
    const fromCommandMaps = buildMaps(commands);
    const before = structuredClone({ flatObjectMetadataMaps, fromCommandMaps });
    const plan = buildOrphanedObjectNavigationCommandRepairPlan({
      flatObjectMetadataMaps,
      flatCommandMenuItemMaps: fromCommandMaps,
      twentyStandardApplicationId: APPLICATION_ID,
    });

    expect(plan.operations.flatEntityToUpdate).toHaveLength(38);
    expect(plan.operations.flatEntityToDelete).toHaveLength(3);
    expect(plan.operations.flatEntityToCreate).toEqual([]);
    expect(plan.unclassifiedOrphanCommandUniversalIdentifiers).toEqual([]);
    const deletedIdentities = new Set(
      plan.operations.flatEntityToDelete.map(
        ({ universalIdentifier }) => universalIdentifier,
      ),
    );
    const updates = new Map(
      plan.operations.flatEntityToUpdate.map((command) => [
        command.universalIdentifier,
        command,
      ]),
    );
    const toCommandMaps = buildMaps(
      structuredClone(
        commands
          .filter(
            ({ universalIdentifier }) =>
              !deletedIdentities.has(universalIdentifier),
          )
          .map((command) => ({
            ...command,
            ...updates.get(command.universalIdentifier),
          })),
      ),
    );
    const testingModule = await Test.createTestingModule({
      providers: [
        WorkspaceMigrationCommandMenuItemActionsBuilderService,
        FlatCommandMenuItemValidatorService,
        {
          provide: LoggerService,
          useValue: { perfTime: jest.fn(), perfTimeEnd: jest.fn() },
        },
      ],
    }).compile();

    try {
      const builder = testingModule.get(
        WorkspaceMigrationCommandMenuItemActionsBuilderService,
      );
      const dependencyMaps = createEmptyAllFlatEntityMaps();
      dependencyMaps.flatCommandMenuItemMaps = structuredClone(fromCommandMaps);
      const result = await builder.validateAndBuild({
        workspaceId: WORKSPACE_ID,
        from: fromCommandMaps,
        to: toCommandMaps,
        buildOptions: {
          isSystemBuild: true,
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
          inferDeletionFromMissingEntities: { commandMenuItem: true },
        },
        dependencyOptimisticFlatEntityMaps: dependencyMaps,
        additionalCacheDataMaps: {
          featureFlagsMap: Object.fromEntries(
            Object.values(FeatureFlagKey).map((key) => [key, false]),
          ) as Record<FeatureFlagKey, boolean>,
        },
      });
      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error(JSON.stringify(result));
      const expectedUpdateUniversalIdentifiers = objects
        .map(({ universalIdentifier }) =>
          v5(universalIdentifier, NAVIGATION_COMMAND_UUID_NAMESPACE),
        )
        .sort();
      const expectedDeleteUniversalIdentifiers = removedObjects
        .map(({ universalIdentifier }) =>
          v5(universalIdentifier, NAVIGATION_COMMAND_UUID_NAMESPACE),
        )
        .sort();
      expect(result.actions.create).toEqual([]);
      expect(result.actions.update).toHaveLength(38);
      expect(result.actions.delete).toHaveLength(3);
      expect(
        result.actions.update
          .map(({ universalIdentifier }) => universalIdentifier)
          .sort(),
      ).toEqual(expectedUpdateUniversalIdentifiers);
      expect(
        result.actions.delete
          .map(({ universalIdentifier }) => universalIdentifier)
          .sort(),
      ).toEqual(expectedDeleteUniversalIdentifiers);
      for (const action of result.actions.update) {
        expect(action.update).toEqual({
          payload: updates.get(action.universalIdentifier)?.payload,
        });
        expect(action.metadataName).toBe('commandMenuItem');
        expect(action.type).toBe('update');
      }
      expect({ flatObjectMetadataMaps, fromCommandMaps }).toEqual(before);
      expect(
        buildOrphanedObjectNavigationCommandRepairPlan({
          flatObjectMetadataMaps,
          flatCommandMenuItemMaps: toCommandMaps,
          twentyStandardApplicationId: APPLICATION_ID,
        }),
      ).toEqual({
        operations: {
          flatEntityToCreate: [],
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
        unclassifiedOrphanCommandUniversalIdentifiers: [],
      });
      for (const helper of helpers) {
        expect(
          toCommandMaps.byUniversalIdentifier[
            v5(helper.universalIdentifier, NAVIGATION_COMMAND_UUID_NAMESPACE)
          ],
        ).toBeUndefined();
      }
    } finally {
      await testingModule.close();
    }
  });
});
