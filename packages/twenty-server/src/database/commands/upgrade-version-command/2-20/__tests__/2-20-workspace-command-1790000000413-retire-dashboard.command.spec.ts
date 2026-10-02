import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FieldMetadataType } from 'twenty-shared/types';
import { DataSource, EntitySchema } from 'typeorm';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import { EntitySchemaColumnFactory } from 'src/engine/twenty-orm/factories/entity-schema-column.factory';
import { formatResult } from 'src/engine/twenty-orm/utils/format-result.util';
import {
  DASHBOARD_RETIREMENT_SELECT,
  RetireDashboardCommand,
  type DashboardRetirementManifest,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000413-retire-dashboard.command';

const scratch = join(homedir(), '.local/share/myah-scratch');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const row = (id: string, extra = {}) => ({
  id,
  deletedAt: null,
  applicationId: 'app-owner',
  universalIdentifier: `${id}-universal`,
  ...extra,
});
const fixture = () => {
  const dashboard = {
    find: jest.fn().mockResolvedValue([
      // WorkspaceRepository.find formats physical ACTOR columns into this nested shape.
      row('dashboard-1', {
        pageLayoutId: 'dashboard-layout',
        createdBy: {
          source: 'MANUAL',
          workspaceMemberId: 'synthetic-member',
          name: 'Synthetic owner',
          context: { fixture: 'ordinary' },
        },
      }),
      row('dashboard-2', {
        pageLayoutId: 'record-layout',
        deletedAt: '2026-01-01',
        createdBy: null,
      }),
    ]),
  };
  const attachment = {
    find: jest
      .fn()
      .mockResolvedValue([
        row('attachment-1', { targetDashboardId: 'dashboard-1' }),
      ]),
  };
  const timelineActivity = {
    find: jest.fn().mockResolvedValue([
      row('timeline-1', {
        targetDashboardId: 'dashboard-2',
        deletedAt: '2026-01-01',
      }),
    ]),
  };
  const layout = {
    find: jest.fn().mockImplementation(({ where }) =>
      where.type
        ? Promise.resolve([
            row('dashboard-layout', { type: 'DASHBOARD' }),
            row('unlinked-layout', {
              deletedAt: '2026-01-01',
              type: 'DASHBOARD',
            }),
          ])
        : Promise.resolve([row('record-layout', { type: 'RECORD_PAGE' })]),
    ),
  };
  // These tab layout overrides represent unknown historical JSON, not a supported current tab operation.
  const tab = {
    find: jest.fn().mockResolvedValue([
      row('dashboard-tab', {
        pageLayoutId: 'dashboard-layout',
        overrides: null,
      }),
      row('override-in-tab', {
        pageLayoutId: 'record-layout',
        overrides: { pageLayoutId: 'dashboard-layout' },
      }),
      row('override-out-tab', {
        pageLayoutId: 'dashboard-layout',
        overrides: { pageLayoutId: 'record-layout' },
      }),
      row('record-tab', { pageLayoutId: 'record-layout', overrides: null }),
    ]),
  };
  const widget = {
    find: jest.fn().mockResolvedValue([
      row('widget-in', {
        pageLayoutTabId: 'record-tab',
        overrides: { pageLayoutTabId: 'override-in-tab' },
        deletedAt: '2026-01-01',
      }),
      row('widget-out', {
        pageLayoutTabId: 'override-out-tab',
        overrides: { pageLayoutTabId: 'record-tab' },
      }),
      row('record-widget', {
        pageLayoutTabId: 'record-tab',
        overrides: null,
      }),
    ]),
  };
  const orm = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getRepository: jest.fn(
      (_id, name: 'dashboard' | 'attachment' | 'timelineActivity') =>
        ({ dashboard, attachment, timelineActivity })[name],
    ),
  };
  const iterator = { iterate: jest.fn() };
  const command = new RetireDashboardCommand(
    iterator as never,
    orm as never,
    layout as never,
    tab as never,
    widget as never,
  );

  return {
    command,
    iterator,
    orm,
    dashboard,
    attachment,
    timelineActivity,
    layout,
    tab,
    widget,
  };
};

describe('registered pinned upgrade inventory', () => {
  const args = { workspaceId, index: 0, total: 1, options: {} };
  const boundRunner = () => {
    const runner = {
      isTransactionActive: true,
      isReleased: false,
      manager: { queryRunner: null as unknown },
      query: jest.fn(),
    };
    runner.manager.queryRunner = runner;
    return runner;
  };

  it('rejects an absent, inactive, released or foreign runner and manifest options before reading', async () => {
    const f = fixture();
    const runner = boundRunner();
    for (const invalid of [
      undefined,
      { ...runner, isTransactionActive: false },
      { ...runner, isReleased: true },
      { ...runner, manager: { queryRunner: {} } },
    ]) {
      await expect(
        f.command.runOnWorkspaceInUpgradeTransaction(
          args,
          invalid as never,
          () => {},
        ),
      ).rejects.toThrow(/pinned/);
    }
    await expect(
      f.command.runOnWorkspaceInUpgradeTransaction(
        { ...args, options: { manifestDir: '/tmp/private' } } as never,
        runner as never,
        () => {},
      ),
    ).rejects.toThrow(/manifest/);
    await expect(
      f.command.runOnWorkspaceInUpgradeTransaction(
        args,
        runner as never,
        undefined as never,
      ),
    ).rejects.toThrow(/pinned/);
    expect(runner.query).not.toHaveBeenCalled();
    expect(f.orm.getRepository).not.toHaveBeenCalled();
  });

  it('inventories dashboard and linked preserved records only through the receipt-bound runner, without writing a file', async () => {
    const f = fixture();
    const runner = boundRunner();
    runner.query
      .mockResolvedValueOnce([{ present: true, originalPath: 'core, public' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          dashboards: '2',
          pageLayouts: '3',
          pageLayoutTabs: '4',
          pageLayoutWidgets: '5',
          attachments: '6',
          timelineActivities: '7',
          anomalousLinkedLayouts: '1',
        },
      ]);
    const log = jest.spyOn(f.command['logger'], 'log').mockImplementation();
    await f.command.runOnWorkspaceInUpgradeTransaction(
      args,
      runner as never,
      () => {},
    );
    expect(runner.query).toHaveBeenCalledTimes(4);
    // PostgreSQL cannot infer the type of a parameter passed only to variadic
    // format(); both schema uses must cast the bound value explicitly.
    expect(runner.query.mock.calls[0]).toEqual([
      expect.stringContaining("format('%I.dashboard', $1::text)"),
      [getWorkspaceSchemaName(workspaceId)],
    ]);
    expect(runner.query.mock.calls[1]).toEqual([
      expect.stringContaining("format('%I', $1::text)"),
      [getWorkspaceSchemaName(workspaceId)],
    ]);
    expect(runner.query.mock.calls[2][0]).toMatch(/FROM dashboard/);
    expect(runner.query.mock.calls[2][0]).toMatch(/targetDashboardId/);
    expect(runner.query.mock.calls[2][0]).toMatch(/pageLayoutTab/);
    expect(runner.query.mock.calls[2][0]).not.toMatch(
      /\b(UPDATE|DELETE|INSERT|DROP|CREATE)\b/i,
    );
    expect(runner.query.mock.calls[2][1]).toEqual([workspaceId]);
    expect(runner.query.mock.calls[3]).toEqual([
      expect.stringContaining("set_config('search_path', $1"),
      ['core, public'],
    ]);
    expect(log.mock.calls.flat().join(' ')).toMatch(
      /2 dashboard\(s\).*6 attachment\(s\).*7 timeline activity/,
    );
    expect(f.orm.getRepository).not.toHaveBeenCalled();
    expect(f.layout.find).not.toHaveBeenCalled();
    expect(f.tab.find).not.toHaveBeenCalled();
    expect(f.widget.find).not.toHaveBeenCalled();
  });

  it('counts distinct anomalous layouts when two dashboards share one non-dashboard layout (SQL-shape regression)', async () => {
    // No PostgreSQL connection in this unit suite: the query result is mocked.
    // Guard the SQL expression that would otherwise multiply layout rows on JOIN.
    const f = fixture();
    const runner = boundRunner();
    runner.query
      .mockResolvedValueOnce([{ present: true, originalPath: 'core, public' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          dashboards: '2',
          pageLayouts: '0',
          pageLayoutTabs: '0',
          pageLayoutWidgets: '0',
          attachments: '0',
          timelineActivities: '0',
          anomalousLinkedLayouts: '1',
        },
      ]);
    const log = jest.spyOn(f.command['logger'], 'log').mockImplementation();
    await f.command.runOnWorkspaceInUpgradeTransaction(
      args,
      runner as never,
      () => {},
    );
    const sql = runner.query.mock.calls[2][0] as string;
    expect(sql).toMatch(
      /count\(DISTINCT l\.id\).*FROM core\."pageLayout" l JOIN dashboards d ON d\."pageLayoutId" = l\.id/s,
    );
    expect(log.mock.calls.flat().join(' ')).toMatch(
      /2 dashboard\(s\).*1 anomalous linked layout\(s\)/,
    );
  });

  it('propagates inventory failure without proceeding to a receipt or manifest', async () => {
    const f = fixture();
    const runner = boundRunner();
    runner.query
      .mockResolvedValueOnce([{ present: true, originalPath: 'core, public' }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('missing legacy link table'));
    await expect(
      f.command.runOnWorkspaceInUpgradeTransaction(
        args,
        runner as never,
        () => {},
      ),
    ).rejects.toThrow('missing legacy link table');
    expect(runner.query).toHaveBeenCalledTimes(3);
    expect(f.orm.getRepository).not.toHaveBeenCalled();
  });

  it('still counts dashboard layouts without an extant physical dashboard table', async () => {
    const f = fixture();
    const runner = boundRunner();
    runner.query
      .mockResolvedValueOnce([{ present: false, originalPath: 'core, public' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          dashboards: '0',
          pageLayouts: '1',
          pageLayoutTabs: '1',
          pageLayoutWidgets: '1',
          attachments: '0',
          timelineActivities: '0',
          anomalousLinkedLayouts: '0',
        },
      ]);
    await f.command.runOnWorkspaceInUpgradeTransaction(
      args,
      runner as never,
      () => {},
    );
    expect(runner.query.mock.calls[2][0]).not.toContain('FROM dashboard)');
  });
});

it('writes a private, complete, repeat-safe, read-only dashboard closure with anomalous links outside destructive scope', async () => {
  const directory = await mkdtemp(join(scratch, 'myah410-dashboard-test-'));
  const f = fixture();
  const log = jest.spyOn(f.command['logger'], 'log').mockImplementation();
  const execute = () =>
    f.command.runOnWorkspace({
      workspaceId,
      options: { dryRun: true, manifestDir: directory },
    } as never);

  try {
    await execute();
    const path = join(directory, `${workspaceId}.dashboard-retirement.json`);
    const first = await readFile(path, 'utf8');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(first) as DashboardRetirementManifest;

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      workspaceId,
      dashboards: [
        {
          id: 'dashboard-1',
          deleted: false,
          pageLayoutId: 'dashboard-layout',
          createdBy: {
            source: 'MANUAL',
            workspaceMemberId: 'synthetic-member',
            name: 'Synthetic owner',
            context: { fixture: 'ordinary' },
          },
          disposition: 'preserve',
        },
        {
          id: 'dashboard-2',
          deleted: true,
          pageLayoutId: 'record-layout',
          disposition: 'preserve-anomalous-link',
        },
      ],
      pageLayouts: [
        { id: 'dashboard-layout', applicationId: 'app-owner', deleted: false },
        { id: 'unlinked-layout', applicationId: 'app-owner', deleted: true },
      ],
      pageLayoutTabs: expect.arrayContaining([
        {
          id: 'override-in-tab',
          basePageLayoutId: 'record-layout',
          overridePageLayoutId: 'dashboard-layout',
          applicationId: 'app-owner',
          universalIdentifier: 'override-in-tab-universal',
          deleted: false,
          disposition: 'preserve',
        },
        {
          id: 'override-out-tab',
          basePageLayoutId: 'dashboard-layout',
          overridePageLayoutId: 'record-layout',
          applicationId: 'app-owner',
          universalIdentifier: 'override-out-tab-universal',
          deleted: false,
          disposition: 'preserve',
        },
      ]),
      pageLayoutWidgets: expect.arrayContaining([
        {
          id: 'widget-in',
          basePageLayoutTabId: 'record-tab',
          overridePageLayoutTabId: 'override-in-tab',
          deleted: true,
          applicationId: 'app-owner',
          universalIdentifier: 'widget-in-universal',
          disposition: 'preserve',
        },
        {
          id: 'widget-out',
          basePageLayoutTabId: 'override-out-tab',
          overridePageLayoutTabId: 'record-tab',
          deleted: false,
          applicationId: 'app-owner',
          universalIdentifier: 'widget-out-universal',
          disposition: 'preserve',
        },
      ]),
      attachments: [
        {
          id: 'attachment-1',
          targetDashboardId: 'dashboard-1',
          deleted: false,
          disposition: 'preserve',
        },
      ],
      timelineActivities: [
        {
          id: 'timeline-1',
          targetDashboardId: 'dashboard-2',
          deleted: true,
          disposition: 'preserve',
        },
      ],
      anomalousLinkedLayouts: [
        {
          id: 'record-layout',
          deleted: false,
          disposition: 'preserve-anomalous-link',
          applicationId: 'app-owner',
          universalIdentifier: 'record-layout-universal',
        },
      ],
    });
    expect(manifest.pageLayoutTabs).toHaveLength(3);
    expect(manifest.pageLayoutWidgets).toHaveLength(2);
    expect(JSON.stringify(manifest)).not.toContain('record-widget');
    expect(JSON.stringify(manifest)).not.toContain('record-tab-universal');
    expect(log.mock.calls.flat().join(' ')).not.toContain('dashboard-1');
    expect(f.dashboard.find).toHaveBeenCalledWith(
      expect.objectContaining({
        withDeleted: true,
        select: DASHBOARD_RETIREMENT_SELECT,
      }),
    );
    expect(f.attachment.find).toHaveBeenCalledWith(
      expect.objectContaining({
        withDeleted: true,
        select: expect.objectContaining({ targetDashboardId: true }),
      }),
    );
    expect(f.timelineActivity.find).toHaveBeenCalledWith(
      expect.objectContaining({
        withDeleted: true,
        select: expect.objectContaining({ targetDashboardId: true }),
      }),
    );
    await execute();
    expect(await readFile(path, 'utf8')).toBe(first);
    f.dashboard.find.mockResolvedValueOnce([
      row('different-dashboard', { pageLayoutId: null, createdBy: null }),
    ]);
    await expect(execute()).rejects.toThrow(
      'Existing dashboard manifest differs',
    );
    expect(await readFile(path, 'utf8')).toBe(first);
    expect(f.orm).not.toHaveProperty('save');
    expect(f.layout).not.toHaveProperty('delete');
    expect(f.tab).not.toHaveProperty('delete');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('uses selectable physical ACTOR columns generated by workspace ORM metadata, without opening a database', async () => {
  const fields = [
    { id: 'id', name: 'id', type: FieldMetadataType.UUID },
    { id: 'deletedAt', name: 'deletedAt', type: FieldMetadataType.DATE_TIME },
    { id: 'pageLayoutId', name: 'pageLayoutId', type: FieldMetadataType.UUID },
    { id: 'createdBy', name: 'createdBy', type: FieldMetadataType.ACTOR },
  ];
  const columns = new EntitySchemaColumnFactory().create(
    { fieldIds: fields.map(({ id }) => id) } as never,
    {
      byId: Object.fromEntries(fields.map((field) => [field.id, field])),
    } as never,
  );
  const dataSource = new DataSource({
    type: 'postgres',
    entities: [new EntitySchema({ name: 'dashboard', columns })],
  });

  await (
    dataSource as unknown as { buildMetadatas(): Promise<void> }
  ).buildMetadatas();
  expect(columns).not.toHaveProperty('createdBy');
  const selected = Object.keys(DASHBOARD_RETIREMENT_SELECT);
  expect(selected).toEqual(
    expect.arrayContaining([
      'createdBySource',
      'createdByWorkspaceMemberId',
      'createdByName',
      'createdByContext',
    ]),
  );
  expect(selected.every((key) => key in columns)).toBe(true);
  expect(() =>
    dataSource
      .getRepository('dashboard')
      .createQueryBuilder('dashboard')
      .setFindOptions({ select: DASHBOARD_RETIREMENT_SELECT })
      .getSql(),
  ).not.toThrow();
  expect(() =>
    dataSource
      .getRepository('dashboard')
      .createQueryBuilder('dashboard')
      .setFindOptions({ select: { createdBy: true } })
      .getSql(),
  ).toThrow('createdBy');
});

it('uses the native workspace result formatter for physical ACTOR columns before consuming repository rows', () => {
  const fields = [
    {
      id: 'id',
      universalIdentifier: 'id',
      name: 'id',
      type: FieldMetadataType.UUID,
    },
    {
      id: 'createdBy',
      universalIdentifier: 'createdBy',
      name: 'createdBy',
      type: FieldMetadataType.ACTOR,
      isNullable: false,
    },
  ];
  const fieldMaps = {
    universalIdentifierById: Object.fromEntries(
      fields.map(({ id }) => [id, id]),
    ),
    byUniversalIdentifier: Object.fromEntries(
      fields.map((field) => [field.id, field]),
    ),
  };
  const object = { id: 'dashboard', fieldIds: fields.map(({ id }) => id) };
  const result = formatResult<Record<string, unknown>>(
    {
      id: 'dashboard-1',
      createdBySource: 'MANUAL',
      createdByWorkspaceMemberId: 'member-1',
      createdByName: 'Synthetic owner',
      createdByContext: { fixture: 'ordinary' },
    },
    object as never,
    {} as never,
    fieldMaps as never,
  );

  expect(result).toMatchObject({
    createdBy: {
      source: 'MANUAL',
      workspaceMemberId: 'member-1',
      name: 'Synthetic owner',
      context: { fixture: 'ordinary' },
    },
  });
  expect(result).not.toHaveProperty('createdByName');
  expect(result).not.toHaveProperty('createdBySource');
});

it('rejects unscoped/multiple/invalid manifest workspace IDs before iteration or reads and fails if iterator swallows a workspace error', async () => {
  const f = fixture();
  const dir = join(scratch, 'myah410-dashboard-synthetic');
  const run = (workspaceIds?: string[]) =>
    f.command.run([], {
      manifestDir: dir,
      workspaceId: workspaceIds && new Set(workspaceIds),
    });

  await expect(run()).rejects.toThrow('exactly one explicit UUID');
  await expect(run(['not-a-uuid'])).rejects.toThrow(
    'exactly one explicit UUID',
  );
  await expect(
    run([workspaceId, '22222222-2222-4222-8222-222222222222']),
  ).rejects.toThrow('exactly one explicit UUID');
  expect(f.iterator.iterate).not.toHaveBeenCalled();
  expect(f.orm.getRepository).not.toHaveBeenCalled();

  f.iterator.iterate.mockResolvedValueOnce({
    fail: [{ workspaceId, error: new Error('manifest write failed') }],
    success: [],
  });
  await expect(run([workspaceId])).rejects.toThrow('Dashboard manifest failed');
  expect(f.iterator.iterate).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceIds: [workspaceId],
      callback: expect.any(Function),
    }),
  );
  expect(f.orm.getRepository).not.toHaveBeenCalled();
  f.iterator.iterate.mockResolvedValueOnce({ fail: [], success: [] });
  await expect(run([workspaceId])).rejects.toThrow(
    'workspace was not processed',
  );
});
