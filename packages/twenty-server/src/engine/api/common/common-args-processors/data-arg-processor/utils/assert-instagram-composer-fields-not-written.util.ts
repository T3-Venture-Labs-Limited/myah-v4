import { type ObjectRecord } from 'twenty-shared/types';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { STANDARD_ERROR_MESSAGE } from 'src/engine/api/common/common-query-runners/errors/standard-error-message.constant';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { buildFieldMapsFromFlatObjectMetadata } from 'src/engine/metadata-modules/flat-field-metadata/utils/build-field-maps-from-flat-object-metadata.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

// Canonical ownership is packages/twenty-apps/public/myah-instagram-messaging.
// These mirrors intentionally let the generic server API enforce app-owned fields
// without a runtime dependency on the independently installed application.
export const INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER =
  '85762d24-541b-407f-9d6a-cdf89552c665';
export const INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER =
  '4738ebcd-6662-4ecc-a190-374fa0525951';
export const INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS = {
  composerInputDigest: '5d78a1f7-79ea-4b67-9a8d-3b0a6109a5d4',
  instagramMessageSnapshot: '3a80e3bb-cc44-4c97-9e89-a849776a9580',
} as const;
export const INSTAGRAM_COMPOSER_PROTECTED_FIELD_UNIVERSAL_IDENTIFIERS =
  new Set<string>(
    Object.values(INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS),
  );

/** Rejects present generic API keys before input transformation or side effects. */
export const assertInstagramComposerFieldsNotWritten = ({
  partialRecordInputs,
  flatObjectMetadata,
  flatFieldMetadataMaps,
}: {
  partialRecordInputs: Partial<ObjectRecord>[] | undefined;
  flatObjectMetadata: FlatObjectMetadata;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}): void => {
  if (
    !partialRecordInputs ||
    flatObjectMetadata.universalIdentifier !==
      INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER
  ) {
    return;
  }

  const { fieldIdByName, fieldIdByJoinColumnName } =
    buildFieldMapsFromFlatObjectMetadata(
      flatFieldMetadataMaps,
      flatObjectMetadata,
    );
  for (const record of partialRecordInputs) {
    for (const key of Object.keys(record)) {
      const fieldMetadataId =
        fieldIdByName[key] || fieldIdByJoinColumnName[key];
      if (!fieldMetadataId) continue;
      const fieldMetadata = findFlatEntityByIdInFlatEntityMaps({
        flatEntityId: fieldMetadataId,
        flatEntityMaps: flatFieldMetadataMaps,
      });
      if (
        fieldMetadata &&
        INSTAGRAM_COMPOSER_PROTECTED_FIELD_UNIVERSAL_IDENTIFIERS.has(
          fieldMetadata.universalIdentifier,
        )
      ) {
        throw new CommonQueryRunnerException(
          'Instagram composer fields are server-managed.',
          CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
          { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
        );
      }
    }
  }
};
