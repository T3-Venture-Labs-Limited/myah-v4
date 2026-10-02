import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import { type AllStandardObjectIndexName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-index-name.type';
import {
  type CreateStandardIndexArgs,
  createStandardIndexFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/index/create-standard-index-flat-metadata.util';

export const buildSocialProfileStandardFlatIndexMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<CreateStandardIndexArgs<'socialProfile'>, 'context'>): Record<
  AllStandardObjectIndexName<'socialProfile'>,
  FlatIndexMetadata
> => ({
  creatorPlatformIndex: createStandardIndexFlatMetadata({
    objectName,
    workspaceId,
    context: {
      indexName: 'creatorPlatformIndex',
      relatedFieldNames: ['creator', 'platform'],
      isUnique: false,
      indexWhereClause: '"deletedAt" IS NULL',
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
  platformAccountIdUniqueIndex: createStandardIndexFlatMetadata({
    objectName,
    workspaceId,
    context: {
      indexName: 'platformAccountIdUniqueIndex',
      relatedFieldNames: ['platform', 'platformAccountId'],
      isUnique: true,
      indexWhereClause:
        '"deletedAt" IS NULL AND NULLIF(BTRIM("platformAccountId"), \'\') IS NOT NULL',
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
  normalizedLocatorUniqueIndex: createStandardIndexFlatMetadata({
    objectName,
    workspaceId,
    context: {
      indexName: 'normalizedLocatorUniqueIndex',
      relatedFieldNames: ['platform', 'normalizedLocator'],
      isUnique: true,
      indexWhereClause:
        '"deletedAt" IS NULL AND NULLIF(BTRIM("normalizedLocator"), \'\') IS NOT NULL',
    },
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
  }),
});
