import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { FieldMetadataType } from 'twenty-shared/types';
import { DataSource, EntitySchema } from 'typeorm';

import { EntitySchemaColumnFactory } from 'src/engine/twenty-orm/factories/entity-schema-column.factory';
import { formatResult } from 'src/engine/twenty-orm/utils/format-result.util';
import { DASHBOARD_RETIREMENT_SELECT, RetireDashboardCommand, type DashboardRetirementManifest } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000413-retire-dashboard.command';

const scratch = join(homedir(), '.local/share/myah-scratch');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const row = (id: string, extra = {}) => ({ id, deletedAt: null, applicationId: 'app-owner', universalIdentifier: `${id}-universal`, ...extra });
const fixture = () => {
  const dashboard = { find: jest.fn().mockResolvedValue([
    // WorkspaceRepository.find formats physical ACTOR columns into this nested shape.
    row('dashboard-1', { pageLayoutId: 'dashboard-layout', createdBy: { source: 'MANUAL', workspaceMemberId: 'synthetic-member', name: 'Synthetic owner', context: { fixture: 'ordinary' } } }),
    row('dashboard-2', { pageLayoutId: 'record-layout', deletedAt: '2026-01-01', createdBy: null }),
  ]) };
  const attachment = { find: jest.fn().mockResolvedValue([row('attachment-1', { targetDashboardId: 'dashboard-1' })]) };
  const timelineActivity = { find: jest.fn().mockResolvedValue([row('timeline-1', { targetDashboardId: 'dashboard-2', deletedAt: '2026-01-01' })]) };
  const layout = { find: jest.fn().mockImplementation(({ where }) => where.type
    ? Promise.resolve([row('dashboard-layout', { type: 'DASHBOARD' }), row('unlinked-layout', { deletedAt: '2026-01-01', type: 'DASHBOARD' })])
    : Promise.resolve([row('record-layout', { type: 'RECORD_PAGE' })])) };
  // These tab layout overrides represent unknown historical JSON, not a supported current tab operation.
  const tab = { find: jest.fn().mockResolvedValue([
    row('dashboard-tab', { pageLayoutId: 'dashboard-layout', overrides: null }),
    row('override-in-tab', { pageLayoutId: 'record-layout', overrides: { pageLayoutId: 'dashboard-layout' } }),
    row('override-out-tab', { pageLayoutId: 'dashboard-layout', overrides: { pageLayoutId: 'record-layout' } }),
    row('record-tab', { pageLayoutId: 'record-layout', overrides: null }),
  ]) };
  const widget = { find: jest.fn().mockResolvedValue([
    row('widget-in', { pageLayoutTabId: 'record-tab', overrides: { pageLayoutTabId: 'override-in-tab' }, deletedAt: '2026-01-01' }),
    row('widget-out', { pageLayoutTabId: 'override-out-tab', overrides: { pageLayoutTabId: 'record-tab' } }),
    row('record-widget', { pageLayoutTabId: 'record-tab', overrides: null }),
  ]) };
  const orm = { executeInWorkspaceContext: jest.fn(async (callback) => callback()), getRepository: jest.fn((_id, name: 'dashboard' | 'attachment' | 'timelineActivity') => ({ dashboard, attachment, timelineActivity })[name]) };
  const iterator = { iterate: jest.fn() };
  const command = new RetireDashboardCommand(iterator as never, orm as never, layout as never, tab as never, widget as never);

  return { command, iterator, orm, dashboard, attachment, timelineActivity, layout, tab, widget }; 
};

it('writes a private, complete, repeat-safe, read-only dashboard closure with anomalous links outside destructive scope', async () => {
  const directory = await mkdtemp(join(scratch, 'myah410-dashboard-test-'));
  const f = fixture();
  const log = jest.spyOn(f.command['logger'], 'log').mockImplementation();
  const execute = () => f.command.runOnWorkspace({ workspaceId, options: { dryRun: true, manifestDir: directory } } as never);

  try {
    await execute();
    const path = join(directory, `${workspaceId}.dashboard-retirement.json`);
    const first = await readFile(path, 'utf8');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const manifest = JSON.parse(first) as DashboardRetirementManifest;

    expect(manifest).toMatchObject({ schemaVersion: 1, workspaceId,
      dashboards: [
        { id: 'dashboard-1', deleted: false, pageLayoutId: 'dashboard-layout', createdBy: { source: 'MANUAL', workspaceMemberId: 'synthetic-member', name: 'Synthetic owner', context: { fixture: 'ordinary' } }, disposition: 'preserve' },
        { id: 'dashboard-2', deleted: true, pageLayoutId: 'record-layout', disposition: 'preserve-anomalous-link' },
      ],
      pageLayouts: [
        { id: 'dashboard-layout', applicationId: 'app-owner', deleted: false },
        { id: 'unlinked-layout', applicationId: 'app-owner', deleted: true },
      ],
      pageLayoutTabs: expect.arrayContaining([
        { id: 'override-in-tab', basePageLayoutId: 'record-layout', overridePageLayoutId: 'dashboard-layout', applicationId: 'app-owner', universalIdentifier: 'override-in-tab-universal', deleted: false, disposition: 'preserve' },
        { id: 'override-out-tab', basePageLayoutId: 'dashboard-layout', overridePageLayoutId: 'record-layout', applicationId: 'app-owner', universalIdentifier: 'override-out-tab-universal', deleted: false, disposition: 'preserve' },
      ]),
      pageLayoutWidgets: expect.arrayContaining([
        { id: 'widget-in', basePageLayoutTabId: 'record-tab', overridePageLayoutTabId: 'override-in-tab', deleted: true, applicationId: 'app-owner', universalIdentifier: 'widget-in-universal', disposition: 'preserve' },
        { id: 'widget-out', basePageLayoutTabId: 'override-out-tab', overridePageLayoutTabId: 'record-tab', deleted: false, applicationId: 'app-owner', universalIdentifier: 'widget-out-universal', disposition: 'preserve' },
      ]),
      attachments: [{ id: 'attachment-1', targetDashboardId: 'dashboard-1', deleted: false, disposition: 'preserve' }],
      timelineActivities: [{ id: 'timeline-1', targetDashboardId: 'dashboard-2', deleted: true, disposition: 'preserve' }],
      anomalousLinkedLayouts: [{ id: 'record-layout', deleted: false, disposition: 'preserve-anomalous-link', applicationId: 'app-owner', universalIdentifier: 'record-layout-universal' }],
    });
    expect(manifest.pageLayoutTabs).toHaveLength(3);
    expect(manifest.pageLayoutWidgets).toHaveLength(2);
    expect(JSON.stringify(manifest)).not.toContain('record-widget');
    expect(JSON.stringify(manifest)).not.toContain('record-tab-universal');
    expect(log.mock.calls.flat().join(' ')).not.toContain('dashboard-1');
    expect(f.dashboard.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true, select: DASHBOARD_RETIREMENT_SELECT }));
    expect(f.attachment.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true, select: expect.objectContaining({ targetDashboardId: true }) }));
    expect(f.timelineActivity.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true, select: expect.objectContaining({ targetDashboardId: true }) }));
    await execute();
    expect(await readFile(path, 'utf8')).toBe(first);
    f.dashboard.find.mockResolvedValueOnce([row('different-dashboard', { pageLayoutId: null, createdBy: null })]);
    await expect(execute()).rejects.toThrow('Existing dashboard manifest differs');
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
    { byId: Object.fromEntries(fields.map((field) => [field.id, field])) } as never,
  );
  const dataSource = new DataSource({ type: 'postgres', entities: [new EntitySchema({ name: 'dashboard', columns })] });

  await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  expect(columns).not.toHaveProperty('createdBy');
  const selected = Object.keys(DASHBOARD_RETIREMENT_SELECT);
  expect(selected).toEqual(expect.arrayContaining(['createdBySource', 'createdByWorkspaceMemberId', 'createdByName', 'createdByContext']));
  expect(selected.every((key) => key in columns)).toBe(true);
  expect(() => dataSource.getRepository('dashboard').createQueryBuilder('dashboard').setFindOptions({ select: DASHBOARD_RETIREMENT_SELECT }).getSql()).not.toThrow();
  expect(() => dataSource.getRepository('dashboard').createQueryBuilder('dashboard').setFindOptions({ select: { createdBy: true } }).getSql()).toThrow('createdBy');
});

it('uses the native workspace result formatter for physical ACTOR columns before consuming repository rows', () => {
  const fields = [
    { id: 'id', universalIdentifier: 'id', name: 'id', type: FieldMetadataType.UUID },
    { id: 'createdBy', universalIdentifier: 'createdBy', name: 'createdBy', type: FieldMetadataType.ACTOR, isNullable: false },
  ];
  const fieldMaps = {
    universalIdentifierById: Object.fromEntries(fields.map(({ id }) => [id, id])),
    byUniversalIdentifier: Object.fromEntries(fields.map((field) => [field.id, field])),
  };
  const object = { id: 'dashboard', fieldIds: fields.map(({ id }) => id) };
  const result = formatResult<Record<string, unknown>>(
    { id: 'dashboard-1', createdBySource: 'MANUAL', createdByWorkspaceMemberId: 'member-1', createdByName: 'Synthetic owner', createdByContext: { fixture: 'ordinary' } },
    object as never,
    {} as never,
    fieldMaps as never,
  );

  expect(result).toMatchObject({ createdBy: { source: 'MANUAL', workspaceMemberId: 'member-1', name: 'Synthetic owner', context: { fixture: 'ordinary' } } });
  expect(result).not.toHaveProperty('createdByName');
  expect(result).not.toHaveProperty('createdBySource');
});

it('rejects unscoped/multiple/invalid manifest workspace IDs before iteration or reads and fails if iterator swallows a workspace error', async () => {
  const f = fixture();
  const dir = join(scratch, 'myah410-dashboard-synthetic');
  const run = (workspaceIds?: string[]) => f.command.run([], { manifestDir: dir, workspaceId: workspaceIds && new Set(workspaceIds) });

  await expect(run()).rejects.toThrow('exactly one explicit UUID');
  await expect(run(['not-a-uuid'])).rejects.toThrow('exactly one explicit UUID');
  await expect(run([workspaceId, '22222222-2222-4222-8222-222222222222'])).rejects.toThrow('exactly one explicit UUID');
  expect(f.iterator.iterate).not.toHaveBeenCalled();
  expect(f.orm.getRepository).not.toHaveBeenCalled();

  f.iterator.iterate.mockResolvedValueOnce({ fail: [{ workspaceId, error: new Error('manifest write failed') }], success: [] });
  await expect(run([workspaceId])).rejects.toThrow('Dashboard manifest failed');
  expect(f.iterator.iterate).toHaveBeenCalledWith(expect.objectContaining({ workspaceIds: [workspaceId], callback: expect.any(Function) }));
  expect(f.orm.getRepository).not.toHaveBeenCalled();
  f.iterator.iterate.mockResolvedValueOnce({ fail: [], success: [] });
  await expect(run([workspaceId])).rejects.toThrow('workspace was not processed');
});
