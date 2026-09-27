import { type FlatIndexMetadata } from 'src/engine/metadata-modules/flat-index-metadata/types/flat-index-metadata.type';
import {
  type CreateStandardIndexArgs,
  createStandardIndexFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/index/create-standard-index-flat-metadata.util';

export const buildMyahInstagramAccountStandardFlatIndexMetadatas = (
  args: Omit<CreateStandardIndexArgs<'myahInstagramAccount'>, 'context'>,
): Record<string, FlatIndexMetadata> => ({
  connectedAccountIdUniqueIndex: createStandardIndexFlatMetadata({
    ...args,
    context: {
      indexName: 'connectedAccountIdUniqueIndex',
      relatedFieldNames: ['connectedAccountId'],
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
    },
  }),
  igUserIdUniqueIndex: createStandardIndexFlatMetadata({
    ...args,
    context: {
      indexName: 'igUserIdUniqueIndex',
      relatedFieldNames: ['igUserId'],
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
    },
  }),
  unipileAccountIdUniqueIndex: createStandardIndexFlatMetadata({
    ...args,
    context: {
      indexName: 'unipileAccountIdUniqueIndex',
      relatedFieldNames: ['unipileAccountId'],
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
    },
  }),
});

export const buildMyahSocialConversationStandardFlatIndexMetadatas = (
  args: Omit<CreateStandardIndexArgs<'myahSocialConversation'>, 'context'>,
): Record<string, FlatIndexMetadata> => ({
  providerIdentityIndex: createStandardIndexFlatMetadata({
    ...args,
    context: {
      indexName: 'providerIdentityIndex',
      relatedFieldNames: [
        'provider',
        'instagramAccount',
        'providerConversationId',
      ],
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
    },
  }),
});

export const buildMyahSocialMessageStandardFlatIndexMetadatas = (
  args: Omit<CreateStandardIndexArgs<'myahSocialMessage'>, 'context'>,
): Record<string, FlatIndexMetadata> => ({
  providerIdentityIndex: createStandardIndexFlatMetadata({
    ...args,
    context: {
      indexName: 'providerIdentityIndex',
      relatedFieldNames: ['provider', 'conversation', 'providerMessageId'],
      isUnique: true,
      indexWhereClause: '"deletedAt" IS NULL',
    },
  }),
});
