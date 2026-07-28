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
const TEST_CREATOR_LIST_NAME = 'MYAH-240 searchable Creator List';
const TEST_CAMPAIGN_NAME = 'MYAH-240 searchable Campaign';
const SEARCH_METADATA_COMMAND_NAME =
  'upgrade:2-19:synchronize-myah-creator-crm-search-metadata';

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

const runSearchMetadataCommand = async () => {
  await execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      SEARCH_METADATA_COMMAND_NAME,
      '--workspace-id',
      SEED_APPLE_WORKSPACE_ID,
    ],
    { cwd: process.cwd(), env: process.env },
  );
};

describe('SynchronizeMyahCreatorCrmSearchMetadataCommand (integration)', () => {
  it('restores generic Search for existing Creator List and Campaign records', async () => {
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

      const searchCreatorListsAfterRepair = await search({
        searchInput: TEST_CREATOR_LIST_NAME,
        includedObjectNameSingulars: ['creatorList'],
        limit: 50,
        expectToFail: false,
      });
      const searchCampaignsAfterRepair = await search({
        searchInput: TEST_CAMPAIGN_NAME,
        includedObjectNameSingulars: ['campaign'],
        limit: 50,
        expectToFail: false,
      });

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
