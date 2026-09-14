import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';
import { v5 } from 'uuid';

import { type ObjectMetadataCommandMenuItemPayload } from 'src/engine/metadata-modules/command-menu-item/dtos/types/object-metadata-command-menu-item-payload.type';
import { EngineComponentKey } from 'src/engine/metadata-modules/command-menu-item/enums/engine-component-key.enum';
import { isObjectMetadataCommandMenuItemPayload } from 'src/engine/metadata-modules/command-menu-item/utils/is-object-metadata-command-menu-item-payload.util';
import { type FlatCommandMenuItem } from 'src/engine/metadata-modules/flat-command-menu-item/types/flat-command-menu-item.type';
import { NAVIGATION_COMMAND_UUID_NAMESPACE } from 'src/engine/metadata-modules/flat-command-menu-item/utils/build-navigation-flat-command-menu-item.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatEntityToCreateDeleteUpdate } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-to-create-delete-update.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

type ObjectNavigationCommand = FlatCommandMenuItem & {
  payload: ObjectMetadataCommandMenuItemPayload;
};

export type OrphanedObjectNavigationCommandRepairPlan = {
  operations: FlatEntityToCreateDeleteUpdate<'commandMenuItem'>;
  unclassifiedOrphanCommandUniversalIdentifiers: string[];
};

// The broad payload helper detects drift; only an exact object-only payload is safe to mutate.
const hasExactObjectOnlyPayload = (command: ObjectNavigationCommand): boolean =>
  !Array.isArray(command.payload) &&
  Reflect.ownKeys(command.payload).length === 1 &&
  Object.prototype.hasOwnProperty.call(
    command.payload,
    'objectMetadataItemId',
  ) &&
  isNonEmptyString(command.payload.objectMetadataItemId);

export const buildOrphanedObjectNavigationCommandRepairPlan = ({
  flatObjectMetadataMaps,
  flatCommandMenuItemMaps,
  twentyStandardApplicationId,
}: {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatCommandMenuItemMaps: FlatEntityMaps<FlatCommandMenuItem>;
  twentyStandardApplicationId: string;
}): OrphanedObjectNavigationCommandRepairPlan => {
  const objects = Object.values(
    flatObjectMetadataMaps.byUniversalIdentifier,
  ).filter(isDefined);
  const currentObjectIds = new Set(objects.map(({ id }) => id));
  const operations: FlatEntityToCreateDeleteUpdate<'commandMenuItem'> = {
    flatEntityToCreate: [],
    flatEntityToUpdate: [],
    flatEntityToDelete: [],
  };
  const isPotentialObjectNavigationCommand = (
    command: FlatCommandMenuItem | undefined,
  ): command is ObjectNavigationCommand =>
    isDefined(command) &&
    command.applicationId === twentyStandardApplicationId &&
    command.isSystemSideEffect &&
    command.engineComponentKey === EngineComponentKey.NAVIGATION &&
    isObjectMetadataCommandMenuItemPayload(command.payload);
  const getCommand = (objectUniversalIdentifier: string) =>
    flatCommandMenuItemMaps.byUniversalIdentifier[
      v5(objectUniversalIdentifier, NAVIGATION_COMMAND_UUID_NAMESPACE)
    ];
  const isOrphan = (command: ObjectNavigationCommand) =>
    !currentObjectIds.has(command.payload.objectMetadataItemId);

  for (const object of objects.filter(({ isActive }) => isActive)) {
    const command = getCommand(object.universalIdentifier);

    if (
      isPotentialObjectNavigationCommand(command) &&
      hasExactObjectOnlyPayload(command) &&
      isOrphan(command)
    ) {
      operations.flatEntityToUpdate.push({
        ...command,
        payload: { objectMetadataItemId: object.id },
      });
    }
  }

  for (const { universalIdentifier } of [
    STANDARD_OBJECTS.person,
    STANDARD_OBJECTS.company,
    STANDARD_OBJECTS.opportunity,
  ]) {
    const command = getCommand(universalIdentifier);

    if (
      !isDefined(
        flatObjectMetadataMaps.byUniversalIdentifier[universalIdentifier],
      ) &&
      isPotentialObjectNavigationCommand(command) &&
      hasExactObjectOnlyPayload(command) &&
      isOrphan(command)
    ) {
      operations.flatEntityToDelete.push(command);
    }
  }

  const classified = new Set(
    [...operations.flatEntityToUpdate, ...operations.flatEntityToDelete].map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  );
  const unclassifiedOrphanCommandUniversalIdentifiers = Object.values(
    flatCommandMenuItemMaps.byUniversalIdentifier,
  )
    .filter(isPotentialObjectNavigationCommand)
    .filter(
      (command) =>
        isOrphan(command) && !classified.has(command.universalIdentifier),
    )
    .map(({ universalIdentifier }) => universalIdentifier)
    .sort();

  for (const entities of [
    operations.flatEntityToUpdate,
    operations.flatEntityToDelete,
  ]) {
    entities.sort((a, b) =>
      a.universalIdentifier.localeCompare(b.universalIdentifier),
    );
  }

  return { operations, unclassifiedOrphanCommandUniversalIdentifiers };
};
