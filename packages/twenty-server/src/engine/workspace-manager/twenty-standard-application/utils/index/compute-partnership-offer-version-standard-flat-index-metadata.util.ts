import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type AllStandardObjectIndexName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-index-name.type';
import {
  type CreateStandardIndexArgs,
  createStandardIndexFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/index/create-standard-index-flat-metadata.util';

export const buildPartnershipOfferVersionStandardFlatIndexMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<CreateStandardIndexArgs<'partnershipOfferVersion'>, 'context'>): Record<
  AllStandardObjectIndexName<'partnershipOfferVersion'>,
  FlatIndexMetadata
> => ({
  campaignCreatorVersionUniqueIndex: createStandardIndexFlatMetadata({
    objectName,
    workspaceId,
    context: {
      indexName: 'campaignCreatorVersionUniqueIndex',
      relatedFieldNames: ['campaignCreator', 'version'],
      isUnique: true,
      // Full unique index retains historical identities across soft deletion.
      // Nullable keys require separate domain validation; SQL uniqueness does not enforce presence.
      indexWhereClause: null,
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
});
