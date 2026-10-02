import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type AllStandardObjectIndexName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-index-name.type';
import {
  type CreateStandardIndexArgs,
  createStandardIndexFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/index/create-standard-index-flat-metadata.util';

export const buildPartnershipObligationStandardFlatIndexMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<CreateStandardIndexArgs<'partnershipObligation'>, 'context'>): Record<
  AllStandardObjectIndexName<'partnershipObligation'>,
  FlatIndexMetadata
> => ({
  offerVersionPurposeUniqueIndex: createStandardIndexFlatMetadata({
    objectName,
    workspaceId,
    context: {
      indexName: 'offerVersionPurposeUniqueIndex',
      relatedFieldNames: ['offerVersion', 'purpose'],
      isUnique: true,
      // Purpose is an immutable agreement-line key, not a broad obligation type.
      // Full uniqueness reserves it across soft deletion; nullable keys need domain validation.
      indexWhereClause: null,
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
});
