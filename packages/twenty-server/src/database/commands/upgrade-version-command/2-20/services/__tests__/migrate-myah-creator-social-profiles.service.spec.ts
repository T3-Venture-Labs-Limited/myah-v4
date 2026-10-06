import { MigrateMyahCreatorSocialProfilesService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-profiles.service';

const createService = ({
  creators,
  restrictedFields = [],
  retiredRestrictedFields = [],
  reconciliationMismatches = 0,
  migratedReceipts = [],
}: {
  creators: Array<Record<string, unknown>>;
  restrictedFields?: string[];
  retiredRestrictedFields?: string[];
  reconciliationMismatches?: number;
  migratedReceipts?: Array<{ attemptKey: string; operationKey: string }>;
}) => {
  const workspaceDataSource = {
    driver: { escape: (value: string) => `"${value}"` },
    query: jest.fn().mockResolvedValue(creators.map((data) => ({ data }))),
  };
  const dataSource = {
    driver: { escape: (value: string) => `"${value}"` },
    query: jest
      .fn()
      .mockResolvedValueOnce([
        ...restrictedFields.map((name) => ({ name, retired: false })),
        ...retiredRestrictedFields.map((name) => ({ name, retired: true })),
      ])
      .mockResolvedValueOnce(migratedReceipts)
      .mockResolvedValueOnce([{ count: String(reconciliationMismatches) }]),
  };
  const writer = {
    preserveSocialProfile: jest
      .fn()
      .mockImplementation(async (_manager, _schema, _creatorId, profile) =>
        Promise.resolve(`profile-${profile.platform}`),
      ),
    createSupplementaryNote: jest.fn().mockResolvedValue({
      noteId: 'note-1',
      noteTargetId: 'target-1',
    }),
  };
  const operationService = {
    execute: jest.fn(async ({ operationKey, write }) => ({
      receiptId: `receipt-${operationKey}`,
      ...(await write({}, 'workspace_schema')),
      replayed: false,
    })),
  };

  return {
    service: new MigrateMyahCreatorSocialProfilesService(
      dataSource as never,
      operationService as never,
      writer as never,
    ),
    workspaceDataSource,
    dataSource,
    operationService,
    writer,
  };
};

describe('MigrateMyahCreatorSocialProfilesService', () => {
  it('skips creators already migrated when the upgrade replays this command after their data changed', async () => {
    // Production (T3labs): every creator had a receipt, then the legacy fields
    // were removed, so re-planning produced a different digest and failed.
    const { service, workspaceDataSource, operationService, dataSource } =
      createService({
        creators: [
          { id: 'creator-migrated', notes: 'edited since migration' },
          { id: 'creator-new', notes: 'added after migration' },
        ],
        migratedReceipts: [
          {
            attemptKey: 'MYAH-409-legacy-creator-v1',
            operationKey: 'creator-migrated',
          },
        ],
      });

    await expect(
      service.migrate({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workspaceDataSource: workspaceDataSource as never,
        dryRun: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        committedRows: 1,
        replayedRows: 1,
        failures: 0,
      }),
    );
    expect(operationService.execute).toHaveBeenCalledTimes(1);
    expect(operationService.execute).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: 'creator-new' }),
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('creatorDataOperationReceipt'),
      [
        '11111111-1111-4111-8111-111111111111',
        [
          'MYAH-409-legacy-creator-v1',
          'MYAH-409-legacy-creator-v1-released-restrictions',
        ],
      ],
    );
  });

  it('plans only during dry-run and reports restricted values', async () => {
    const { service, workspaceDataSource, operationService } = createService({
      creators: [
        {
          id: 'creator-1',
          instagramUsername: 'private',
          tiktokUsername: 'public',
          notes: 'preserve',
        },
      ],
      restrictedFields: ['instagramUsername'],
    });

    await expect(
      service.migrate({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workspaceDataSource: workspaceDataSource as never,
        dryRun: true,
      }),
    ).resolves.toEqual({
      scanned: 1,
      plannedProfiles: 1,
      plannedNotes: 1,
      committedRows: 0,
      replayedRows: 0,
      conflicts: 0,
      failures: 0,
      skippedRestrictedValues: 1,
      reconciliationMismatches: 0,
    });
    expect(operationService.execute).not.toHaveBeenCalled();
  });

  it('blocks all preservation when destination object access would broaden visibility', async () => {
    const { service, workspaceDataSource, operationService, dataSource } =
      createService({
      creators: [
        {
          id: 'creator-private',
          instagramUsername: 'private',
          notes: 'private context',
        },
      ],
      restrictedFields: ['*'],
    });

    await expect(
      service.migrate({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workspaceDataSource: workspaceDataSource as never,
        dryRun: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        plannedProfiles: 0,
        plannedNotes: 0,
        committedRows: 0,
        skippedRestrictedValues: 2,
      }),
    );
    expect(operationService.execute).not.toHaveBeenCalled();
    expect(dataSource.query.mock.calls[0]?.[0]).toContain(
      'role."canReadAllObjectRecords"',
    );
  });

  it('commits each clean Creator atomically and leaves conflicting rows untouched', async () => {
    const { service, workspaceDataSource, operationService, writer } =
      createService({
        creators: [
          {
            id: 'creator-clean',
            instagramUsername: 'ada',
            instagramFollowerCount: 10,
            notes: 'preserve',
          },
          {
            id: 'creator-conflict',
            instagramUrl: 'https://instagram.com/one',
            instagramLinkPrimaryLinkUrl: 'https://instagram.com/two',
          },
        ],
      });

    await expect(
      service.migrate({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workspaceDataSource: workspaceDataSource as never,
        dryRun: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        scanned: 2,
        committedRows: 1,
        conflicts: 1,
        failures: 0,
        reconciliationMismatches: 0,
      }),
    );
    expect(operationService.execute).toHaveBeenCalledTimes(1);
    expect(operationService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: 'creator-clean',
        kind: 'LEGACY_MIGRATION',
      }),
    );
    expect(writer.preserveSocialProfile).toHaveBeenCalledTimes(1);
    expect(writer.createSupplementaryNote).toHaveBeenCalledTimes(1);
  });

  // Production T3labs (2026-10-02): the first pass ran while our standard
  // Creator Ops role still hid social fields, so it committed notes only.
  // The restriction is retired by this upgrade; the values must now be
  // preserved without changing the first pass's replayed receipts.
  it('preserves values hidden only by a retired standard restriction in a second pass', async () => {
    const { service, workspaceDataSource, operationService, writer } =
      createService({
        creators: [
          {
            id: 'creator-1',
            instagramUsername: 'ada',
            instagramBio: 'released bio',
            notes: 'already preserved',
            email: 'hidden@example.com',
          },
        ],
        restrictedFields: ['email'],
        retiredRestrictedFields: ['instagramUsername', 'instagramBio'],
      });

    await expect(
      service.migrate({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workspaceDataSource: workspaceDataSource as never,
        dryRun: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        committedRows: 2,
        skippedRestrictedValues: 0,
        failures: 0,
      }),
    );
    const [firstPass, releasedPass] = operationService.execute.mock.calls.map(
      ([input]) => input,
    );
    expect(firstPass).toMatchObject({
      attemptKey: 'MYAH-409-legacy-creator-v1',
      operationKey: 'creator-1',
    });
    expect(releasedPass).toMatchObject({
      attemptKey: 'MYAH-409-legacy-creator-v1-released-restrictions',
      operationKey: 'creator-1',
    });
    expect(writer.preserveSocialProfile).toHaveBeenCalledTimes(1);
    const [firstNote, releasedNote] =
      writer.createSupplementaryNote.mock.calls.map((call) => call[4]);
    expect(firstNote).toContain('already preserved');
    expect(firstNote).not.toContain('released bio');
    expect(releasedNote).toContain('released bio');
    expect(releasedNote).not.toContain('already preserved');
  });
});
