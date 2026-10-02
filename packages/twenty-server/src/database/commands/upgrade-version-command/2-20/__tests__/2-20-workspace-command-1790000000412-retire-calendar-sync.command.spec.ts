import {
  RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS,
  RetireCalendarSyncCommand,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000412-retire-calendar-sync.command';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const channel: { id: string; accountWorkspaceId: string | null } = {
  id: '20202020-0000-4000-8000-000000000002',
  accountWorkspaceId: workspaceId,
};
const object = {
  id: '20202020-0000-4000-8000-000000000003',
  isActive: true,
  applicationWorkspaceId: workspaceId,
  applicationUniversalIdentifier:
    TWENTY_STANDARD_APPLICATION.universalIdentifier,
};
const args = { index: 0, options: {}, total: 1, workspaceId };
const updateResult = (rows: { id: string }[], affected = rows.length) => ({
  records: rows,
  affected,
  raw: [rows, affected], // The default unstructured Postgres result, not records.
});
const createFixture = (channels = [channel], objects = [object]) => {
  const query = jest
    .fn()
    .mockResolvedValueOnce(channels)
    .mockResolvedValueOnce(objects)
    .mockResolvedValueOnce(updateResult(channels.map(({ id }) => ({ id }))))
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(
      updateResult(
        objects.filter(({ isActive }) => isActive).map(({ id }) => ({ id })),
      ),
    )
    .mockResolvedValueOnce([]);
  const runner = {
    isTransactionActive: true,
    isReleased: false,
    manager: { queryRunner: null as unknown },
    query,
  };
  runner.manager.queryRunner = runner;
  const cache = { flush: jest.fn() };
  const version = {
    incrementMetadataVersion: jest.fn(),
    publishCommittedMetadataVersion: jest.fn(),
  };
  const channelDryRunQuery = jest.fn().mockResolvedValue(channels);
  const objectDryRunQuery = jest.fn().mockResolvedValue(objects);
  version.incrementMetadataVersion.mockImplementation(
    (_workspaceId, transaction) =>
      transaction.afterCommit(() =>
        version.publishCommittedMetadataVersion(workspaceId),
      ),
  );
  const command = new RetireCalendarSyncCommand(
    {} as never,
    { query: channelDryRunQuery } as never,
    { query: objectDryRunQuery } as never,
    cache as never,
    version as never,
  );
  const effects: (() => Promise<void> | void)[] = [];
  const afterCommit = (effect: () => Promise<void> | void) =>
    effects.push(effect);
  return {
    command,
    query,
    runner: runner as never,
    cache,
    version,
    effects,
    afterCommit,
    channelDryRunQuery,
    objectDryRunQuery,
  };
};

describe('RetireCalendarSyncCommand', () => {
  it('blocks unpinned writes and preserves a read-only standalone dry run', async () => {
    const {
      command,
      query,
      afterCommit,
      channelDryRunQuery,
      objectDryRunQuery,
    } = createFixture();
    await expect(command.runOnWorkspace(args)).rejects.toThrow(/pinned/);
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(channelDryRunQuery).toHaveBeenCalledTimes(1);
    expect(objectDryRunQuery).toHaveBeenCalledTimes(1);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(
        args,
        { isTransactionActive: false } as never,
        afterCommit,
      ),
    ).rejects.toThrow(/pinned/);
    expect(query).not.toHaveBeenCalled();
  });

  it('retires each overlapping channel only once, without touching provider IDs or physical tables', async () => {
    const { command, query, runner, version, cache, effects, afterCommit } =
      createFixture();
    await command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit);
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls[0][1]).toEqual([workspaceId, expect.any(String)]);
    expect(query.mock.calls[1][1]).toEqual([
      workspaceId,
      [
        STANDARD_OBJECTS.calendarChannelEventAssociation.universalIdentifier,
        STANDARD_OBJECTS.calendarEventParticipant.universalIdentifier,
        STANDARD_OBJECTS.calendarEvent.universalIdentifier,
        STANDARD_OBJECTS.callRecording.universalIdentifier,
      ],
    ]);
    expect(RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS).toHaveLength(4);
    expect(query.mock.calls[2][1][1]).toEqual([channel.id]);
    expect(query.mock.calls[2][2]).toBe(true);
    expect(query.mock.calls[2][0]).not.toMatch(
      /ExternalId|ClientState|syncCursor|DROP/i,
    );
    expect(query.mock.calls[3][0]).toContain('IS DISTINCT FROM $3');
    expect(query.mock.calls[4][1][1]).toEqual([object.id]);
    expect(query.mock.calls[4][2]).toBe(true);
    expect(query.mock.calls[4][0]).not.toMatch(/DROP|DELETE/i);
    expect(version.incrementMetadataVersion).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ queryRunner: runner, afterCommit }),
    );
    expect(cache.flush).not.toHaveBeenCalled();
    for (const effect of effects) await effect();
    expect(cache.flush).toHaveBeenCalledWith(workspaceId, [
      'flatObjectMetadataMaps',
    ]);
    expect(version.publishCommittedMetadataVersion).toHaveBeenCalledWith(
      workspaceId,
    );
    expect(cache.flush.mock.invocationCallOrder[0]).toBeLessThan(
      version.publishCommittedMetadataVersion.mock.invocationCallOrder[0],
    );
  });

  it('rejects foreign accounts and metadata owners before any update', async () => {
    for (const [channels, objects] of [
      [[{ ...channel, accountWorkspaceId: 'foreign' }], [object]],
      [[{ ...channel, accountWorkspaceId: null }], [object]],
      [[channel], [{ ...object, applicationUniversalIdentifier: 'foreign' }]],
      [[channel], [{ ...object, applicationWorkspaceId: 'foreign' }]],
    ] as [(typeof channel)[], (typeof object)[]][]) {
      const { command, query, runner, afterCommit } = createFixture(
        [...channels],
        [...objects],
      );
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
      ).rejects.toThrow(/Foreign/);
      expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(
        true,
      );
    }
  });

  it('does not rewrite inactive objects, or publish when nothing changes', async () => {
    const { command, query, runner, version, effects, afterCommit } =
      createFixture([], [{ ...object, isActive: false }]);
    await command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit);
    expect(query).toHaveBeenCalledTimes(2);
    expect(version.incrementMetadataVersion).not.toHaveBeenCalled();
    expect(effects).toHaveLength(0);
  });

  it.each([
    ['unstructured tuple', [[{ id: channel.id }], 1]],
    ['missing affected', { records: [{ id: channel.id }] }],
    ['wrong affected', updateResult([{ id: channel.id }], 0)],
    ['null ID', { records: [{ id: null }], affected: 1 }],
    [
      'foreign ID',
      updateResult([{ id: '20202020-0000-4000-8000-000000000009' }]),
    ],
    ['missing ID', updateResult([], 0)],
    [
      'duplicate ID',
      { records: [{ id: channel.id }, { id: channel.id }], affected: 1 },
    ],
  ])(
    'rejects calendar channel %s before touching metadata',
    async (_case, result) => {
      const { command, query, runner, effects, afterCommit } = createFixture();
      query
        .mockReset()
        .mockResolvedValueOnce([channel])
        .mockResolvedValueOnce([object])
        .mockResolvedValueOnce(result)
        .mockResolvedValueOnce([]);
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
      ).rejects.toThrow(/channel retirement postcondition/);
      expect(query).toHaveBeenCalledTimes(4);
      expect(effects).toHaveLength(0);
    },
  );

  it.each([
    ['unstructured tuple', [[{ id: object.id }], 1]],
    ['missing affected', { records: [{ id: object.id }] }],
    ['wrong affected', updateResult([{ id: object.id }], 0)],
    ['null ID', { records: [{ id: null }], affected: 1 }],
    [
      'foreign ID',
      updateResult([{ id: '20202020-0000-4000-8000-000000000009' }]),
    ],
    ['missing ID', updateResult([], 0)],
    [
      'duplicate ID',
      { records: [{ id: object.id }, { id: object.id }], affected: 1 },
    ],
  ])(
    'rejects calendar metadata %s without version/cache publication',
    async (_case, result) => {
      const { command, query, runner, effects, version, afterCommit } =
        createFixture([], [object]);
      query
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([object])
        .mockResolvedValueOnce(result)
        .mockResolvedValueOnce([]);
      await expect(
        command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
      ).rejects.toThrow(/metadata retirement postcondition/);
      expect(version.incrementMetadataVersion).not.toHaveBeenCalled();
      expect(effects).toHaveLength(0);
    },
  );

  it('rejects duplicate calendar returned IDs despite matching affected and record counts', async () => {
    const another = { ...channel, id: '20202020-0000-4000-8000-000000000008' };
    const { command, query, runner, afterCommit } = createFixture(
      [channel, another],
      [],
    );
    query
      .mockReset()
      .mockResolvedValueOnce([channel, another])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        updateResult([{ id: channel.id }, { id: channel.id }], 2),
      )
      .mockResolvedValueOnce([]);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
    ).rejects.toThrow(/channel retirement postcondition/);
  });

  it('rejects duplicate calendar metadata returned IDs despite matching counts', async () => {
    const another = { ...object, id: '20202020-0000-4000-8000-000000000008' };
    const { command, query, runner, version, afterCommit } = createFixture(
      [],
      [object, another],
    );
    query
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([object, another])
      .mockResolvedValueOnce(
        updateResult([{ id: object.id }, { id: object.id }], 2),
      )
      .mockResolvedValueOnce([]);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
    ).rejects.toThrow(/metadata retirement postcondition/);
    expect(version.incrementMetadataVersion).not.toHaveBeenCalled();
  });

  it('fails the transaction on missing readback, without scheduling cache publication', async () => {
    const { command, query, runner, cache, effects, afterCommit } =
      createFixture();
    query
      .mockReset()
      .mockResolvedValueOnce([channel])
      .mockResolvedValueOnce([object])
      .mockResolvedValueOnce(updateResult([], 0))
      .mockResolvedValueOnce([channel]);
    await expect(
      command.runOnWorkspaceInUpgradeTransaction(args, runner, afterCommit),
    ).rejects.toThrow(/postcondition/);
    expect(cache.flush).not.toHaveBeenCalled();
    expect(effects).toHaveLength(0);
  });
});
