import { CommandMeta } from 'nest-commander/src/constants';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { UpgradeCommand } from 'src/database/commands/upgrade-version-command/upgrade.command';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { SynchronizeInstagramSourceControlledMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790491923604-synchronize-instagram-source-controlled-metadata.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const workspaceId = '20202020-0000-4000-8000-000000000002';
const standardId = '20202020-0000-4000-8000-000000000001';
const names = [
  'myahInstagramAccount',
  'myahSocialConversation',
  'myahSocialMessage',
  'myahInstagramReplyDraft',
] as const;
const args: RunOnWorkspaceArgs = {
  workspaceId,
  options: { dryRun: false },
  index: 0,
  total: 1,
};

const setup = () => {
  const {
    allFlatEntityMaps: afterMaps,
    idByUniversalIdentifierByMetadataName: ids,
  } = computeTwentyStandardApplicationAllFlatEntityMaps({
    workspaceId,
    twentyStandardApplicationId: standardId,
    now: '2026-09-28T00:00:00.000Z',
  });
  const beforeMaps = structuredClone(afterMaps);
  const objectUids = names.map(
    (name) => MYAH_STANDARD_OBJECTS[name].universalIdentifier,
  );
  const fieldUids = [
    ...names.flatMap((name) =>
      Object.values(MYAH_STANDARD_OBJECTS[name].fields).map(
        (field) => field.universalIdentifier,
      ),
    ),
    MYAH_STANDARD_OBJECTS.creator.fields.instagramConversations
      .universalIdentifier,
    MYAH_STANDARD_OBJECTS.creator.fields.instagramMessageDrafts
      .universalIdentifier,
  ];
  const indexUids = names.flatMap((name) =>
    Object.values(MYAH_STANDARD_OBJECTS[name].indexes).map(
      (index) => index.universalIdentifier,
    ),
  );
  for (const [map, uids, metadataName] of [
    [beforeMaps.flatObjectMetadataMaps, objectUids, 'objectMetadata'],
    [beforeMaps.flatFieldMetadataMaps, fieldUids, 'fieldMetadata'],
    [beforeMaps.flatIndexMaps, indexUids, 'index'],
  ] as const) {
    for (const uid of uids) {
      delete map.byUniversalIdentifier[uid];
      delete map.universalIdentifierById[ids[metadataName]![uid]];
    }
  }
  const snapshot = (allFlatEntityMaps: typeof beforeMaps) => ({
    workspaceId,
    schemaName: 'workspace_20202020_0000_4000_8000_000000000002',
    flatApplicationMaps: {
      idByUniversalIdentifier: {
        [TWENTY_STANDARD_APPLICATION.universalIdentifier]: standardId,
      },
    },
    allFlatEntityMaps,
  });
  const managerQuery = jest
    .fn()
    .mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('to_jsonb(o)')
          ? [{ value: { id: 'stable-creator' } }]
          : [],
      ),
    );
  const findOneOrFail = jest
    .fn()
    .mockResolvedValueOnce({ metadataVersion: 12 })
    .mockResolvedValueOnce({ metadataVersion: 13 });
  const runner = {
    isReleased: false,
    isTransactionActive: true,
    manager: { query: managerQuery, getRepository: () => ({ findOneOrFail }) },
  } as never;
  (runner as { manager: { queryRunner?: unknown } }).manager.queryRunner =
    runner;
  const load = jest
    .fn()
    .mockResolvedValueOnce(snapshot(beforeMaps))
    .mockResolvedValueOnce(snapshot(afterMaps));
  const synchronizeAbsentInstagramInUpgradeTransaction = jest
    .fn()
    .mockResolvedValue(ids);
  const flush = jest.fn().mockResolvedValue(undefined);
  const publishCommittedMetadataVersion = jest
    .fn()
    .mockResolvedValue(undefined);
  const command = new SynchronizeInstagramSourceControlledMetadataCommand(
    {} as never,
    { synchronizeAbsentInstagramInUpgradeTransaction } as never,
    { load } as never,
    { flush } as never,
    { publishCommittedMetadataVersion } as never,
  );
  const afterCommit = jest.fn();
  return {
    command,
    runner,
    afterCommit,
    managerQuery,
    load,
    findOneOrFail,
    synchronizeAbsentInstagramInUpgradeTransaction,
    flush,
    publishCommittedMetadataVersion,
    objectUids,
    fieldUids,
    indexUids,
    snapshot,
    afterMaps,
  };
};

describe('SynchronizeInstagramSourceControlledMetadataCommand', () => {
  it('registers 3604 and rejects ordinary unpinned apply', async () => {
    const { command, synchronizeAbsentInstagramInUpgradeTransaction } = setup();
    await expect(command.runOnWorkspace(args)).rejects.toThrow(
      /pinned upgrade transaction/,
    );
    expect(
      synchronizeAbsentInstagramInUpgradeTransaction,
    ).not.toHaveBeenCalled();
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeInstagramSourceControlledMetadataCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1790491923604 });
    expect(
      Reflect.getMetadata(
        CommandMeta,
        SynchronizeInstagramSourceControlledMetadataCommand,
      ),
    ).toMatchObject({
      name: 'upgrade:2-20:synchronize-instagram-source-controlled-metadata',
    });
  });

  it('rejects unbound, released, dry-run and unrecognized option schemas before a snapshot', async () => {
    const { command, runner, afterCommit, load } = setup();
    for (const bad of [
      {
        isReleased: false,
        isTransactionActive: true,
        manager: { queryRunner: {} },
      },
      {
        isReleased: true,
        isTransactionActive: true,
        manager: { queryRunner: runner },
      },
      {
        isReleased: false,
        isTransactionActive: false,
        manager: { queryRunner: runner },
      },
    ])
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(
          args,
          bad as never,
          afterCommit,
        ),
      ).rejects.toThrow(/pinned upgrade transaction/);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { ...args, options: undefined } as never,
        runner,
        afterCommit,
      ),
    ).rejects.toThrow(/pinned upgrade transaction/);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { ...args, options: { dryRun: true } },
        runner,
        afterCommit,
      ),
    ).rejects.toThrow(/pinned upgrade transaction/);
    for (const options of [
      { unknown: true },
      { dryRun: 'false' },
      { verbose: 'yes' },
      { workspaceCountLimit: 0 },
      { workspaceIds: [standardId] },
      { workspaceIds: [workspaceId, workspaceId] },
      { workspaceIds: 'not-an-array' },
      { workspaceId: new Set([workspaceId]), workspaceIds: [standardId] },
      { startFromWorkspaceId: workspaceId, workspaceIds: [workspaceId] },
      { startFromWorkspaceId: 3 },
      { workspaceId: [workspaceId] },
    ])
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(
          { ...args, options } as never,
          runner,
          afterCommit,
        ),
      ).rejects.toThrow(/pinned upgrade transaction/);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { ...args, unknown: true } as never,
        runner,
        afterCommit,
      ),
    ).rejects.toThrow(/pinned upgrade transaction/);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        { ...args, index: -1 },
        runner,
        afterCommit,
      ),
    ).rejects.toThrow(/pinned upgrade transaction/);
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ['unfiltered upgrade', {}, { workspaceIds: undefined }],
    [
      'filtered -w upgrade',
      { workspaceId: new Set([workspaceId]) },
      { workspaceIds: [workspaceId], workspaceId: new Set([workspaceId]) },
    ],
    [
      'start/count upgrade',
      {
        startFromWorkspaceId: workspaceId,
        workspaceCountLimit: 1,
        verbose: true,
      },
      {
        workspaceIds: undefined,
        startFromWorkspaceId: workspaceId,
        workspaceCountLimit: 1,
        verbose: true,
      },
    ],
  ])(
    'accepts %s through the real CLI option projection and common pinned runner args',
    async (_name, rawOptions, expectedOptions) => {
      const parsed = jest
        .fn()
        .mockResolvedValue({ totalSuccesses: 0, totalFailures: 0 });
      const cli = new UpgradeCommand(
        { getUpgradeSequence: () => [] } as never,
        { run: parsed } as never,
        { invalidateInstanceAndAllWorkspacesStatus: jest.fn() } as never,
      );
      await cli.run([], rawOptions);
      const options = parsed.mock.calls[0][0].options;
      expect(options).toEqual(expectedOptions);
      expect(
        Object.prototype.hasOwnProperty.call(options, 'workspaceIds'),
      ).toBe(true);

      const { command, runner, managerQuery, load, flush } = setup();
      managerQuery.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('pg_class') &&
            managerQuery.mock.calls.filter(([query]) =>
              String(query).includes('pg_class'),
            ).length === 2
            ? names.map((relname) => ({ relname }))
            : sql.includes('to_jsonb(o)')
              ? [{ value: { id: 'stable-creator' } }]
              : [],
        ),
      );
      const transaction = runner as {
        isTransactionActive: boolean;
        startTransaction?: jest.Mock;
        commitTransaction?: jest.Mock;
        rollbackTransaction?: jest.Mock;
      };
      transaction.startTransaction = jest.fn().mockImplementation(() => {
        transaction.isTransactionActive = true;
      });
      transaction.commitTransaction = jest.fn().mockImplementation(() => {
        transaction.isTransactionActive = false;
      });
      transaction.rollbackTransaction = jest.fn().mockImplementation(() => {
        transaction.isTransactionActive = false;
      });
      const recordUpgradeMigration = jest.fn();
      const commonRunner = new WorkspaceCommandRunnerService(
        { get: () => '2.20.0' } as never,
        { recordUpgradeMigration } as never,
        { invalidateInstanceAndAllWorkspacesStatus: jest.fn() } as never,
        { currentRunner: () => runner } as never,
      );
      const pinnedCall = jest.spyOn(
        command,
        'runOnWorkspaceInUpgradeTransaction',
      );
      await commonRunner.runWorkspaceCommands({
        options,
        iteratorContext: {
          workspaceId,
          dataSource: undefined,
          index: 0,
          total: 1,
        },
        workspaceCommands: [{ name: '3604', command: command as never }],
      });
      expect(pinnedCall).toHaveBeenCalledWith(
        { workspaceId, options, dataSource: undefined, index: 0, total: 1 },
        runner,
        expect.any(Function),
      );
      expect(load).toHaveBeenCalledWith(workspaceId, runner);
      expect(recordUpgradeMigration).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '3604',
          status: 'completed',
          queryRunner: runner,
        }),
      );
      expect(transaction.commitTransaction).toHaveBeenCalledTimes(1);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(
        Object.prototype.hasOwnProperty.call(
          pinnedCall.mock.calls[0][0],
          'dataSource',
        ),
      ).toBe(true);
    },
  );

  it('ignores a real iterator dataSource capability and uses only the bound manager', async () => {
    const { command, runner, afterCommit, managerQuery, load } = setup();
    managerQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('pg_class') &&
          managerQuery.mock.calls.filter(([query]) =>
            String(query).includes('pg_class'),
          ).length === 2
          ? names.map((relname) => ({ relname }))
          : sql.includes('to_jsonb(o)')
            ? [{ value: { id: 'stable-creator' } }]
            : [],
      ),
    );
    const pooled = {
      getRepository: jest.fn(),
      createQueryRunner: jest.fn(),
      query: jest.fn(),
    };
    await command.runOnWorkspaceInUpgradeTransaction(
      {
        ...args,
        dataSource: pooled as never,
        options: { workspaceIds: [workspaceId], dryRun: false },
      } as never,
      runner,
      afterCommit,
    );
    expect(load).toHaveBeenCalledWith(workspaceId, runner);
    expect(pooled.getRepository).not.toHaveBeenCalled();
    expect(pooled.createQueryRunner).not.toHaveBeenCalled();
    expect(pooled.query).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy application', 'core."application"', [{ id: standardId }]],
    [
      'partial or foreign-owner object UID',
      'core."objectMetadata"',
      [{ universalIdentifier: names[0] }],
    ],
    [
      'partial field UID',
      'core."fieldMetadata"',
      [{ universalIdentifier: names[0] }],
    ],
    [
      'partial index UID',
      'core."indexMetadata"',
      [{ universalIdentifier: names[0] }],
    ],
    ['native physical name', 'pg_class', [{ relname: 'myahInstagramAccount' }]],
    [
      'underscored physical name',
      'pg_class',
      [{ relname: '_myahInstagramAccount' }],
    ],
  ])(
    'fails closed on %s before builder and callbacks',
    async (_description, fragment, rows) => {
      const {
        command,
        runner,
        afterCommit,
        managerQuery,
        synchronizeAbsentInstagramInUpgradeTransaction,
      } = setup();
      managerQuery.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes(fragment as string)
            ? rows
            : sql.includes('to_jsonb(o)')
              ? [{ value: { id: 'stable-creator' } }]
              : [],
        ),
      );
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
      ).rejects.toThrow(/not wholly absent/);
      expect(
        synchronizeAbsentInstagramInUpgradeTransaction,
      ).not.toHaveBeenCalled();
      expect(afterCommit).not.toHaveBeenCalled();
    },
  );

  it('uses the exact runner, verifies the 4/93/5 readback and schedules only committed cache repair', async () => {
    const {
      command,
      runner,
      afterCommit,
      managerQuery,
      synchronizeAbsentInstagramInUpgradeTransaction,
      flush,
      publishCommittedMetadataVersion,
    } = setup();
    managerQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('pg_class') &&
          managerQuery.mock.calls.filter(([query]) =>
            String(query).includes('pg_class'),
          ).length === 2
          ? names.map((relname) => ({ relname }))
          : sql.includes('to_jsonb(o)')
            ? [{ value: { id: 'stable-creator' } }]
            : [],
      ),
    );
    await command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit);
    expect(synchronizeAbsentInstagramInUpgradeTransaction).toHaveBeenCalledWith(
      args,
      { queryRunner: runner, afterCommit },
    );
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();
    expect(publishCommittedMetadataVersion).not.toHaveBeenCalled();
    await afterCommit.mock.calls[0][0]();
    expect(flush).toHaveBeenCalledWith(
      workspaceId,
      expect.arrayContaining([
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
        'flatIndexMaps',
      ]),
    );
    expect(publishCommittedMetadataVersion).toHaveBeenCalledWith(workspaceId);
  });

  it('rejects a Creator row mutation or incomplete physical graph after native work', async () => {
    const changed = setup();
    let creatorRead = 0;
    changed.managerQuery.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('to_jsonb(o)')
          ? [{ value: { id: ++creatorRead } }]
          : sql.includes('pg_class') &&
              changed.managerQuery.mock.calls.filter(([query]) =>
                String(query).includes('pg_class'),
              ).length === 2
            ? names.map((relname) => ({ relname }))
            : [],
      ),
    );
    await expect(
      changed.command.runOnWorkspaceInUpgradeTransaction(
        args,
        changed.runner,
        changed.afterCommit,
      ),
    ).rejects.toThrow(/readback differs/);
    expect(changed.afterCommit).not.toHaveBeenCalled();

    const missing = setup();
    await expect(
      missing.command.runOnWorkspaceInUpgradeTransaction(
        args,
        missing.runner,
        missing.afterCommit,
      ),
    ).rejects.toThrow(/readback differs/);
    expect(missing.afterCommit).not.toHaveBeenCalled();
  });

  it('does not schedule repair or fabricate a receipt on native failure or incomplete readback', async () => {
    const first = setup();
    first.synchronizeAbsentInstagramInUpgradeTransaction.mockRejectedValueOnce(
      new Error('runner failed'),
    );
    await expect(
      first.command.runOnWorkspaceInUpgradeTransaction(
        args,
        first.runner,
        first.afterCommit,
      ),
    ).rejects.toThrow('runner failed');
    expect(first.afterCommit).not.toHaveBeenCalled();
    const second = setup();
    second.load.mockResolvedValueOnce(second.snapshot(second.afterMaps));
    await expect(
      second.command.runOnWorkspaceInUpgradeTransaction(
        args,
        second.runner,
        second.afterCommit,
      ),
    ).rejects.toThrow(/not wholly absent/);
    expect(second.afterCommit).not.toHaveBeenCalled();
  });
});
