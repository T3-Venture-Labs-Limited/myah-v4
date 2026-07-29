import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

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
const workspaceSchemaName = getWorkspaceSchemaName(
  SEED_YCOMBINATOR_WORKSPACE_ID,
);

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

type CreatorCrmObjectName = 'creator' | 'creatorList' | 'campaign';

type SearchMatch = {
  id: string;
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
      SEED_YCOMBINATOR_WORKSPACE_ID,
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

const findSearchMatches = async ({
  objectName,
  recordId,
  searchTerm,
}: {
  objectName: CreatorCrmObjectName;
  recordId: string;
  searchTerm: string;
}): Promise<SearchMatch[]> =>
  global.testDataSource.query(
    `SELECT id
     FROM "${workspaceSchemaName}"."${objectName}"
     WHERE id = $1
       AND "searchVector" @@ to_tsquery('simple', public.unaccent_immutable($2))`,
    [recordId, searchTerm],
  );

const upsertCreatorCrmRecords = async () => {
  await Promise.all([
    global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."creator" (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [TEST_CREATOR_ID, TEST_CREATOR_NAME],
    ),
    global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."creatorList" (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [TEST_CREATOR_LIST_ID, TEST_CREATOR_LIST_NAME],
    ),
    global.testDataSource.query(
      `INSERT INTO "${workspaceSchemaName}"."campaign" (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [TEST_CAMPAIGN_ID, TEST_CAMPAIGN_NAME],
    ),
  ]);
};

const deleteCreatorCrmRecords = async () => {
  await Promise.all([
    global.testDataSource.query(
      `DELETE FROM "${workspaceSchemaName}"."creator" WHERE id = $1`,
      [TEST_CREATOR_ID],
    ),
    global.testDataSource.query(
      `DELETE FROM "${workspaceSchemaName}"."creatorList" WHERE id = $1`,
      [TEST_CREATOR_LIST_ID],
    ),
    global.testDataSource.query(
      `DELETE FROM "${workspaceSchemaName}"."campaign" WHERE id = $1`,
      [TEST_CAMPAIGN_ID],
    ),
  ]);
};

describe('SynchronizeMyahCreatorCrmSearchMetadataCommand (integration)', () => {
  it('rebuilds Search vectors for Creator, Creator List, and Campaign records created while metadata was absent', async () => {
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
          SEED_YCOMBINATOR_WORKSPACE_ID,
          CREATOR_CRM_SEARCH_FIELD_UNIVERSAL_IDENTIFIERS,
        ],
      )) as [SearchFieldMetadataRow[], number];

      expect(deletedSearchFieldMetadatas).toHaveLength(4);

      await runFlatCacheInvalidateCommand();
      await runRecomputeSearchVectorsCommand();
      await upsertCreatorCrmRecords();

      const [
        searchCreatorsBeforeRepair,
        searchCreatorListsBeforeRepair,
        searchCampaignsBeforeRepair,
      ] = await Promise.all([
        findSearchMatches({
          objectName: 'creator',
          recordId: TEST_CREATOR_ID,
          searchTerm: 'creator',
        }),
        findSearchMatches({
          objectName: 'creatorList',
          recordId: TEST_CREATOR_LIST_ID,
          searchTerm: 'list',
        }),
        findSearchMatches({
          objectName: 'campaign',
          recordId: TEST_CAMPAIGN_ID,
          searchTerm: 'campaign',
        }),
      ]);

      expect(searchCreatorsBeforeRepair).toEqual([]);
      expect(searchCreatorListsBeforeRepair).toEqual([]);
      expect(searchCampaignsBeforeRepair).toEqual([]);

      await runSearchMetadataCommand();

      const restoredSearchFieldMetadatas: SearchFieldMetadataRow[] =
        await global.testDataSource.query(
          `SELECT sfm.id
           FROM core."searchFieldMetadata" AS sfm
           INNER JOIN core."fieldMetadata" AS fm ON fm.id = sfm."fieldMetadataId"
           WHERE fm."workspaceId" = $1
             AND fm."universalIdentifier" = ANY($2::uuid[])`,
          [
            SEED_YCOMBINATOR_WORKSPACE_ID,
            CREATOR_CRM_SEARCH_FIELD_UNIVERSAL_IDENTIFIERS,
          ],
        );

      expect(restoredSearchFieldMetadatas).toHaveLength(4);

      const [
        searchCreatorsAfterRepair,
        searchCreatorListsAfterRepair,
        searchCampaignsAfterRepair,
      ] = await Promise.all([
        findSearchMatches({
          objectName: 'creator',
          recordId: TEST_CREATOR_ID,
          searchTerm: 'creator',
        }),
        findSearchMatches({
          objectName: 'creatorList',
          recordId: TEST_CREATOR_LIST_ID,
          searchTerm: 'list',
        }),
        findSearchMatches({
          objectName: 'campaign',
          recordId: TEST_CAMPAIGN_ID,
          searchTerm: 'campaign',
        }),
      ]);

      expect(searchCreatorsAfterRepair).toEqual([{ id: TEST_CREATOR_ID }]);
      expect(searchCreatorListsAfterRepair).toEqual([
        { id: TEST_CREATOR_LIST_ID },
      ]);
      expect(searchCampaignsAfterRepair).toEqual([{ id: TEST_CAMPAIGN_ID }]);
    } finally {
      if (deletedSearchFieldMetadatas.length > 0) {
        await global.testDataSource.query(
          `DELETE FROM core."searchFieldMetadata" AS sfm
         USING core."fieldMetadata" AS fm
         WHERE sfm."fieldMetadataId" = fm.id
           AND fm."workspaceId" = $1
           AND fm."universalIdentifier" = ANY($2::uuid[])`,
          [
            SEED_YCOMBINATOR_WORKSPACE_ID,
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

      await deleteCreatorCrmRecords();
    }
  });
});
