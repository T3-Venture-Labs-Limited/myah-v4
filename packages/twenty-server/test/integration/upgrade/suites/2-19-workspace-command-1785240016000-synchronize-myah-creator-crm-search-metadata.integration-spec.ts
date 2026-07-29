import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { createManyOperationFactory } from 'test/integration/graphql/utils/create-many-operation-factory.util';
import { deleteManyOperationFactory } from 'test/integration/graphql/utils/delete-many-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { search } from 'test/integration/graphql/utils/search.util';

const TEST_CREATOR_LIST_ID = '20202020-2400-4000-8000-000000000001';
const TEST_CAMPAIGN_ID = '20202020-2400-4000-8000-000000000002';
const TEST_CREATOR_ID = '20202020-2400-4000-8000-000000000003';
const TEST_CREATOR_LIST_NAME = 'MYAH-240 searchable Creator List';
const TEST_CAMPAIGN_NAME = 'MYAH-240 searchable Campaign';
const TEST_CREATOR_NAME = 'MYAH-240 searchable Creator';
const SEARCH_METADATA_COMMAND_NAME =
  'upgrade:2-19:synchronize-myah-creator-crm-search-metadata';
const RECOMPUTE_SEARCH_VECTORS_COMMAND_NAME =
  'upgrade:2-18:recompute-search-vectors';
const FLAT_CACHE_INVALIDATE_COMMAND_NAME = 'cache:flat-cache-invalidate';

const CREATOR_CRM_SEARCH_FIELD_UNIVERSAL_IDENTIFIERS = [
  MYAH_STANDARD_OBJECTS.creator.fields.name.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creator.fields.email.universalIdentifier,
  MYAH_STANDARD_OBJECTS.creatorList.fields.name.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaign.fields.name.universalIdentifier,
];

const execFileAsync = promisify(execFile);

type SearchFieldMetadataRow = {
  id: string;
  objectMetadataId: string;
  fieldMetadataId: string;
  tsVectorFieldMetadataId: string;
  position: number;
  workspaceId: string;
  universalIdentifier: string;
  applicationId: string;
  createdAt: Date;
  updatedAt: Date;
};

const runWorkspaceCommand = async (
  commandName: string,
  additionalArgs: string[] = [],
) => {
  await execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      commandName,
      '--workspace-id',
      SEED_APPLE_WORKSPACE_ID,
      ...additionalArgs,
    ],
    { cwd: process.cwd(), env: process.env },
  );
};

const runSearchMetadataCommand = () =>
  runWorkspaceCommand(SEARCH_METADATA_COMMAND_NAME);

const runRecomputeSearchVectorsCommand = () =>
  runWorkspaceCommand(RECOMPUTE_SEARCH_VECTORS_COMMAND_NAME);

const runFlatCacheInvalidateCommand = () =>
  runWorkspaceCommand(FLAT_CACHE_INVALIDATE_COMMAND_NAME, [
    '--metadataName',
    'searchFieldMetadata',
  ]);

describe('SynchronizeMyahCreatorCrmSearchMetadataCommand (integration)', () => {
  it('restores generic Search for Creator, Creator List, and Campaign records created while metadata was absent', async () => {
    let deletedSearchFieldMetadatas: SearchFieldMetadataRow[] = [];

    try {
      await runSearchMetadataCommand();

      [deletedSearchFieldMetadatas] = (await global.testDataSource.query(
        `DELETE FROM core."searchFieldMetadata" AS sfm
           USING core."fieldMetadata" AS fm
           WHERE sfm."fieldMetadataId" = fm.id
             AND fm."workspaceId" = $1
             AND fm."universalIdentifier" = ANY($2::uuid[])
           RETURNING sfm.id,
                     sfm."objectMetadataId",
                     sfm."fieldMetadataId",
                     sfm."tsVectorFieldMetadataId",
                     sfm.position,
                     sfm."workspaceId",
                     sfm."universalIdentifier",
                     sfm."applicationId",
                     sfm."createdAt",
                     sfm."updatedAt"`,
        [
          SEED_APPLE_WORKSPACE_ID,
          CREATOR_CRM_SEARCH_FIELD_UNIVERSAL_IDENTIFIERS,
        ],
      )) as [SearchFieldMetadataRow[], number];

      expect(deletedSearchFieldMetadatas).toHaveLength(4);

      await runFlatCacheInvalidateCommand();
      await runRecomputeSearchVectorsCommand();

      await makeGraphqlAPIRequest(
        createManyOperationFactory({
          objectMetadataSingularName: 'creator',
          objectMetadataPluralName: 'creators',
          gqlFields: 'id',
          data: [{ id: TEST_CREATOR_ID, name: TEST_CREATOR_NAME }],
          upsert: true,
        }),
      );
      await makeGraphqlAPIRequest(
        createManyOperationFactory({
          objectMetadataSingularName: 'creatorList',
          objectMetadataPluralName: 'creatorLists',
          gqlFields: 'id',
          data: [{ id: TEST_CREATOR_LIST_ID, name: TEST_CREATOR_LIST_NAME }],
          upsert: true,
        }),
      );
      await makeGraphqlAPIRequest(
        createManyOperationFactory({
          objectMetadataSingularName: 'campaign',
          objectMetadataPluralName: 'campaigns',
          gqlFields: 'id',
          data: [{ id: TEST_CAMPAIGN_ID, name: TEST_CAMPAIGN_NAME }],
          upsert: true,
        }),
      );

      const [
        searchCreatorsBeforeRepair,
        searchCreatorListsBeforeRepair,
        searchCampaignsBeforeRepair,
      ] = await Promise.all([
        search({
          searchInput: TEST_CREATOR_NAME,
          includedObjectNameSingulars: ['creator'],
          limit: 50,
          expectToFail: false,
        }),
        search({
          searchInput: TEST_CREATOR_LIST_NAME,
          includedObjectNameSingulars: ['creatorList'],
          limit: 50,
          expectToFail: false,
        }),
        search({
          searchInput: TEST_CAMPAIGN_NAME,
          includedObjectNameSingulars: ['campaign'],
          limit: 50,
          expectToFail: false,
        }),
      ]);

      expect(searchCreatorsBeforeRepair.data.search.edges).toEqual([]);
      expect(searchCreatorListsBeforeRepair.data.search.edges).toEqual([]);
      expect(searchCampaignsBeforeRepair.data.search.edges).toEqual([]);

      await runSearchMetadataCommand();

      const restoredSearchFieldMetadatas: SearchFieldMetadataRow[] =
        await global.testDataSource.query(
          `SELECT sfm.id
           FROM core."searchFieldMetadata" AS sfm
           INNER JOIN core."fieldMetadata" AS fm ON fm.id = sfm."fieldMetadataId"
           WHERE fm."workspaceId" = $1
             AND fm."universalIdentifier" = ANY($2::uuid[])`,
          [
            SEED_APPLE_WORKSPACE_ID,
            CREATOR_CRM_SEARCH_FIELD_UNIVERSAL_IDENTIFIERS,
          ],
        );

      expect(restoredSearchFieldMetadatas).toHaveLength(4);

      const [
        searchCreatorsAfterRepair,
        searchCreatorListsAfterRepair,
        searchCampaignsAfterRepair,
      ] = await Promise.all([
        search({
          searchInput: TEST_CREATOR_NAME,
          includedObjectNameSingulars: ['creator'],
          limit: 50,
          expectToFail: false,
        }),
        search({
          searchInput: TEST_CREATOR_LIST_NAME,
          includedObjectNameSingulars: ['creatorList'],
          limit: 50,
          expectToFail: false,
        }),
        search({
          searchInput: TEST_CAMPAIGN_NAME,
          includedObjectNameSingulars: ['campaign'],
          limit: 50,
          expectToFail: false,
        }),
      ]);

      expect(
        searchCreatorsAfterRepair.data.search.edges.map(
          (edge) => edge.node.recordId,
        ),
      ).toEqual([TEST_CREATOR_ID]);
      expect(
        searchCreatorListsAfterRepair.data.search.edges.map(
          (edge) => edge.node.recordId,
        ),
      ).toEqual([TEST_CREATOR_LIST_ID]);
      expect(
        searchCampaignsAfterRepair.data.search.edges.map(
          (edge) => edge.node.recordId,
        ),
      ).toEqual([TEST_CAMPAIGN_ID]);
    } finally {
      if (deletedSearchFieldMetadatas.length > 0) {
        await global.testDataSource.query(
          `DELETE FROM core."searchFieldMetadata" AS sfm
         USING core."fieldMetadata" AS fm
         WHERE sfm."fieldMetadataId" = fm.id
           AND fm."workspaceId" = $1
           AND fm."universalIdentifier" = ANY($2::uuid[])`,
          [
            SEED_APPLE_WORKSPACE_ID,
            CREATOR_CRM_SEARCH_FIELD_UNIVERSAL_IDENTIFIERS,
          ],
        );

        for (const searchFieldMetadata of deletedSearchFieldMetadatas) {
          await global.testDataSource.query(
            `INSERT INTO core."searchFieldMetadata" (
           id,
           "objectMetadataId",
           "fieldMetadataId",
           "tsVectorFieldMetadataId",
           position,
           "workspaceId",
           "universalIdentifier",
           "applicationId",
           "createdAt",
           "updatedAt"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              searchFieldMetadata.id,
              searchFieldMetadata.objectMetadataId,
              searchFieldMetadata.fieldMetadataId,
              searchFieldMetadata.tsVectorFieldMetadataId,
              searchFieldMetadata.position,
              searchFieldMetadata.workspaceId,
              searchFieldMetadata.universalIdentifier,
              searchFieldMetadata.applicationId,
              searchFieldMetadata.createdAt,
              searchFieldMetadata.updatedAt,
            ],
          );
        }
        await runSearchMetadataCommand();
      }

      await makeGraphqlAPIRequest(
        deleteManyOperationFactory({
          objectMetadataSingularName: 'creator',
          objectMetadataPluralName: 'creators',
          gqlFields: 'id',
          filter: { id: { eq: TEST_CREATOR_ID } },
        }),
      );
      await makeGraphqlAPIRequest(
        deleteManyOperationFactory({
          objectMetadataSingularName: 'creatorList',
          objectMetadataPluralName: 'creatorLists',
          gqlFields: 'id',
          filter: { id: { eq: TEST_CREATOR_LIST_ID } },
        }),
      );
      await makeGraphqlAPIRequest(
        deleteManyOperationFactory({
          objectMetadataSingularName: 'campaign',
          objectMetadataPluralName: 'campaigns',
          gqlFields: 'id',
          filter: { id: { eq: TEST_CAMPAIGN_ID } },
        }),
      );
    }
  });
});
