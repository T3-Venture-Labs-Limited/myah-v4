import type { DataSource, QueryRunner } from 'typeorm';

import type { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

import { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';

const WORKSPACE_ID = '20202020-0000-0000-0000-000000000001';
const OLD_INSTAGRAM_FIELD_ID = 'old-instagram-field-id';
const NEW_INSTAGRAM_FIELD_ID = 'new-instagram-field-id';

const fieldMetadataRows = [
  {
    id: OLD_INSTAGRAM_FIELD_ID,
    universalIdentifier: '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
  },
  {
    id: NEW_INSTAGRAM_FIELD_ID,
    universalIdentifier: 'f0d18169-7558-487c-bafd-eb0e6adaf63a',
  },
];

const instagramColumns = [
  { columnName: 'instagramUrl' },
  { columnName: 'instagramLinkPrimaryLinkUrl' },
  { columnName: 'instagramLinkPrimaryLinkLabel' },
  { columnName: 'instagramLinkSecondaryLinks' },
];

type WorkspaceMigrationRunnerHarness = {
  invalidateCache: jest.Mock;
};

type Harness = {
  service: MigrateMyahCreatorSocialLinksService;
  coreQuery: jest.Mock;
  workspaceQuery: jest.Mock;
  referenceQuery: jest.Mock;
  queryRunner: QueryRunner;
  workspaceMigrationRunnerService: WorkspaceMigrationRunnerHarness;
};

const createHarness = (): Harness => {
  const referenceQuery = jest.fn().mockResolvedValue([]);
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: false,
    manager: { query: referenceQuery },
  } as unknown as QueryRunner;
  const coreQuery = jest
    .fn()
    .mockResolvedValueOnce(fieldMetadataRows)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ count: '0' }]);
  const coreDataSource = {
    query: coreQuery,
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
  } as unknown as DataSource;
  const workspaceQuery = jest
    .fn()
    .mockResolvedValueOnce(instagramColumns)
    .mockResolvedValueOnce([{ count: '0' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ count: '0' }]);
  const workspaceMigrationRunnerService: WorkspaceMigrationRunnerHarness = {
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new (
      MigrateMyahCreatorSocialLinksService as unknown as new (
        coreDataSource: DataSource,
        workspaceMigrationRunnerService: WorkspaceMigrationRunnerHarness,
      ) => MigrateMyahCreatorSocialLinksService
    )(coreDataSource, workspaceMigrationRunnerService),
    coreQuery,
    workspaceQuery,
    referenceQuery,
    queryRunner,
    workspaceMigrationRunnerService,
  };
};

describe('MigrateMyahCreatorSocialLinksService', () => {
  it('copies old text values and migrates active view references', async () => {
    const harness = createHarness();
  
    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: true });
  
    const updateSql = harness.workspaceQuery.mock.calls[2][0] as string;
  
    expect(updateSql).toContain(
      '"instagramLinkPrimaryLinkUrl" = COALESCE(NULLIF(BTRIM("instagramLinkPrimaryLinkUrl"), \'\'), BTRIM("instagramUrl"))',
    );
    expect(updateSql).toContain(
      '"instagramLinkPrimaryLinkLabel" = COALESCE("instagramLinkPrimaryLinkLabel", \'\')',
    );
    expect(updateSql).toContain(
      'WHEN jsonb_typeof("instagramLinkSecondaryLinks") = \'array\'',
    );
  
    const referenceSql = harness.referenceQuery.mock.calls[0][0] as string;
  
    expect(referenceSql).toContain('core."viewField"');
    expect(referenceSql).toContain('core."viewFilter"');
    expect(referenceSql).toContain('core."viewSort"');
    expect(referenceSql).toContain('primaryLinkUrl');
    expect(referenceSql).not.toContain('core."fieldPermission"');
    expect(harness.referenceQuery).toHaveBeenCalledWith(
      expect.any(String),
      [WORKSPACE_ID, OLD_INSTAGRAM_FIELD_ID, NEW_INSTAGRAM_FIELD_ID],
    );
    expect(harness.queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    const permissionCopySql = harness.coreQuery.mock.calls[1][0] as string;
  
    expect(permissionCopySql).toContain('INSERT INTO core."fieldPermission"');
    expect(permissionCopySql).toContain('ON CONFLICT ("fieldMetadataId", "roleId") DO NOTHING');
    expect(
      harness.workspaceMigrationRunnerService.invalidateCache,
    ).toHaveBeenCalledWith({
      allFlatEntityMapsKeys: [
        'flatFieldPermissionMaps',
        'flatFieldMetadataMaps',
        'flatObjectMetadataMaps',
        'flatRoleMaps',
        'flatViewFieldMaps',
        'flatViewFilterMaps',
        'flatViewSortMaps',
      ],
      workspaceId: WORKSPACE_ID,
    });
  
    expect(harness.workspaceQuery.mock.calls).toEqual([
      [
        expect.any(String),
        undefined,
        undefined,
        { shouldBypassPermissionChecks: true },
      ],
      [
        expect.any(String),
        undefined,
        undefined,
        { shouldBypassPermissionChecks: true },
      ],
      [
        expect.any(String),
        undefined,
        undefined,
        { shouldBypassPermissionChecks: true },
      ],
      [
        expect.any(String),
        undefined,
        undefined,
        { shouldBypassPermissionChecks: true },
      ],
    ]);
  });
  it('materializes missing link companions when the replacement URL already matches old text', async () => {
    const harness = createHarness();

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: true });

    const updateSql = harness.workspaceQuery.mock.calls[2][0] as string;
    const verificationSql = harness.workspaceQuery.mock.calls[3][0] as string;

    expect(updateSql).toContain(
      '"instagramLinkPrimaryLinkUrl" = COALESCE(NULLIF(BTRIM("instagramLinkPrimaryLinkUrl"), \'\'), BTRIM("instagramUrl"))',
    );
    expect(updateSql).toContain(
      '"instagramLinkPrimaryLinkLabel" = COALESCE("instagramLinkPrimaryLinkLabel", \'\')',
    );
    expect(updateSql).toContain(
      'WHEN jsonb_typeof("instagramLinkSecondaryLinks") = \'array\'',
    );
    expect(verificationSql).toContain(
      '"instagramLinkPrimaryLinkLabel" IS NULL',
    );
    expect(verificationSql).toContain(
      'jsonb_typeof("instagramLinkSecondaryLinks") IS DISTINCT FROM \'array\'',
    );
    expect(updateSql).not.toContain(
      'AND NULLIF(BTRIM("instagramLinkPrimaryLinkUrl"), \'\') IS NULL',
    );
  });

  it('copies permissions before data verification without detaching old restrictions on failure', async () => {
    const harness = createHarness();

    harness.workspaceQuery
      .mockReset()
      .mockResolvedValueOnce(instagramColumns)
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '1' }]);

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: false });

    const permissionCopySql = (harness.coreQuery.mock.calls[1]?.[0] ??
      '') as string;
    const referenceSql = harness.referenceQuery.mock.calls[0][0] as string;

    expect(permissionCopySql).toContain('INSERT INTO core."fieldPermission"');
    expect(permissionCopySql).toContain('NOT EXISTS');
    expect(permissionCopySql).toContain('obsolete."canReadFieldValue"');
    expect(permissionCopySql).toContain('obsolete."canUpdateFieldValue"');
    expect(permissionCopySql).not.toContain('DELETE FROM');
    expect(permissionCopySql).not.toContain('SET "fieldMetadataId" = $3');
    expect(referenceSql).not.toContain('core."fieldPermission"');
    expect(harness.coreQuery.mock.invocationCallOrder[1]).toBeLessThan(
      harness.workspaceQuery.mock.invocationCallOrder[2],
    );
  });

  it('blocks cleanup without overwriting conflicting old and new values', async () => {
    const harness = createHarness();

    harness.workspaceQuery
      .mockReset()
      .mockResolvedValueOnce(instagramColumns)
      .mockResolvedValueOnce([{ count: '1' }]);

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: false });

    expect(harness.workspaceQuery).toHaveBeenCalledTimes(2);
    expect(harness.referenceQuery).not.toHaveBeenCalled();
  });

  it('uses replacement references and removes obsolete duplicates atomically', async () => {
    const harness = createHarness();

    await harness.service.migrate({
      workspaceId: WORKSPACE_ID,
      workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
      dryRun: false,
    });

    const referenceSql = harness.referenceQuery.mock.calls[0][0] as string;

    expect(referenceSql).toContain('duplicate_view_fields');
    expect(referenceSql).toContain('duplicate_view_filters');
    expect(referenceSql).toContain('duplicate_view_sorts');
    expect(referenceSql.indexOf('duplicate_view_fields')).toBeLessThan(
      referenceSql.indexOf('updated_view_fields'),
    );
  });

  it('keeps obsolete fields when active old references remain', async () => {
    const harness = createHarness();

    harness.coreQuery
      .mockReset()
      .mockResolvedValueOnce(fieldMetadataRows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: '1' }]);

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: false });

    expect(
      harness.workspaceMigrationRunnerService.invalidateCache,
    ).toHaveBeenCalledWith({
      allFlatEntityMapsKeys: [
        'flatFieldPermissionMaps',
        'flatFieldMetadataMaps',
        'flatObjectMetadataMaps',
        'flatRoleMaps',
        'flatViewFieldMaps',
        'flatViewFilterMaps',
        'flatViewSortMaps',
      ],
      workspaceId: WORKSPACE_ID,
    });
  });

  it('preserves successful migration results when cache invalidation fails', async () => {
    const harness = createHarness();

    harness.workspaceMigrationRunnerService.invalidateCache.mockRejectedValueOnce(
      new Error('cache unavailable'),
    );

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: true });
  });

  it('does not enter reference cleanup when copying fails', async () => {
    const harness = createHarness();

    harness.workspaceQuery
      .mockReset()
      .mockResolvedValueOnce(instagramColumns)
      .mockResolvedValueOnce([{ count: '0' }])
      .mockRejectedValueOnce(new Error('copy failed'));

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).rejects.toThrow('copy failed');

    expect(harness.referenceQuery).not.toHaveBeenCalled();
  });

  it('invalidates direct metadata caches after view-reference migration commits', async () => {
    const harness = createHarness();

    await harness.service.migrate({
      workspaceId: WORKSPACE_ID,
      workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
      dryRun: false,
    });

    expect(
      harness.workspaceMigrationRunnerService.invalidateCache.mock
        .invocationCallOrder[0],
    ).toBeGreaterThan(harness.referenceQuery.mock.invocationCallOrder[0]);
  });

  it('invalidates direct metadata caches when copying permissions fails', async () => {
    const harness = createHarness();

    harness.coreQuery
      .mockReset()
      .mockResolvedValueOnce(fieldMetadataRows)
      .mockRejectedValueOnce(new Error('permission copy failed'));

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).rejects.toThrow('permission copy failed');

    expect(
      harness.workspaceMigrationRunnerService.invalidateCache,
    ).toHaveBeenCalledWith({
      allFlatEntityMapsKeys: [
        'flatFieldPermissionMaps',
        'flatFieldMetadataMaps',
        'flatObjectMetadataMaps',
        'flatRoleMaps',
        'flatViewFieldMaps',
        'flatViewFilterMaps',
        'flatViewSortMaps',
      ],
      workspaceId: WORKSPACE_ID,
    });
  });

  it('is a no-op after obsolete workspace columns are gone', async () => {
    const harness = createHarness();

    harness.workspaceQuery.mockReset().mockResolvedValueOnce([]);

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: false,
      }),
    ).resolves.toEqual({ canDeleteOldFields: true });

    expect(harness.workspaceQuery).toHaveBeenCalledTimes(1);
    expect(harness.referenceQuery).not.toHaveBeenCalled();
  });

  it('performs no mutation in dry-run mode', async () => {
    const harness = createHarness();

    harness.workspaceQuery
      .mockReset()
      .mockResolvedValueOnce(instagramColumns)
      .mockResolvedValueOnce([{ count: '0' }]);

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: true,
      }),
    ).resolves.toEqual({ canDeleteOldFields: true });

    expect(harness.workspaceQuery).toHaveBeenCalledTimes(2);
    expect(harness.referenceQuery).not.toHaveBeenCalled();
  });

  it('allows dry-run when the preceding dry-run sync only plans replacement columns', async () => {
    const harness = createHarness();

    harness.workspaceQuery
      .mockReset()
      .mockResolvedValueOnce([{ columnName: 'instagramUrl' }]);

    await expect(
      harness.service.migrate({
        workspaceId: WORKSPACE_ID,
        workspaceDataSource: { query: harness.workspaceQuery } as unknown as GlobalWorkspaceDataSource,
        dryRun: true,
      }),
    ).resolves.toEqual({ canDeleteOldFields: true });

    expect(harness.workspaceQuery).toHaveBeenCalledTimes(1);
    expect(harness.coreQuery).not.toHaveBeenCalled();
    expect(harness.referenceQuery).not.toHaveBeenCalled();
  });
});
