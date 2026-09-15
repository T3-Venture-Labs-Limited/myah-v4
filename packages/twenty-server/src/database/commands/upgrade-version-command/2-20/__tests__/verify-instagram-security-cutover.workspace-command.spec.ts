import { type DataSource } from 'typeorm';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { repairInstagramSecurityChecks } from 'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

jest.mock(
  'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util',
  () => ({ repairInstagramSecurityChecks: jest.fn() }),
);

const permissions = [
  ['SEND_INSTAGRAM_REPLY_TOOL', 'b955e9a9-2d3e-4001-a43d-cf6a9608c122'],
  ['SEND_INSTAGRAM_FIRST_MESSAGE_TOOL', '05f383be-dcf2-4510-8fb0-386705d90506'],
  ['RESOLVE_INSTAGRAM_SEND_OUTCOME', '7e3b0a66-3730-43e9-ab10-993e721b8403'],
];
const columnFixtures = () => [
  ...[
    ['id', 'uuid', true],
    ['workspaceId', 'uuid', true],
    ['actionName', 'character varying', true],
    ['state', 'core.state_enum', true],
    ['decidedAt', 'timestamp with time zone', false],
    ['updatedAt', 'timestamp with time zone', true],
  ].map(([name, type, notNull]) => ({
    tableName: 'actionApprovalBinding',
    name,
    type,
    notNull,
    defaultValue: null as string | null,
    labels: name === 'state' ? ['PENDING', 'APPROVED', 'EXPIRED'] : [],
  })),
  ...[
    ['id', 'uuid'],
    ['actionApprovalBindingId', 'uuid'],
    ['objectMetadataId', 'uuid'],
    ['recordId', 'uuid'],
    ['role', 'character varying'],
    ['createdAt', 'timestamp with time zone'],
  ].map(([name, type]) => ({
    tableName: 'actionApprovalBindingEvidenceLink',
    name,
    type,
    notNull: true,
    defaultValue:
      name === 'id'
        ? 'uuid_generate_v4()'
        : name === 'createdAt'
          ? 'now()'
          : null,
    labels: [] as string[],
  })),
];

const fixture = () => {
  const events: string[] = [];
  const columns = columnFixtures();
  const applications = [
    {
      id: 'instagram',
      universalIdentifier: '4738ebcd-6662-4ecc-a190-374fa0525951',
    },
    {
      id: 'standard',
      universalIdentifier: '20202020-64aa-4b6f-b003-9c74b97cee20',
    },
  ];
  const definitions = permissions.map(([key, universalIdentifier]) => ({
    key,
    universalIdentifier,
    applicationId: 'standard',
    permissionType: 'tool',
  }));
  const targets = [
    { bindingId: 'target', objectMetadataId: 'object', recordId: 'draft' },
    { bindingId: 'no-evidence', objectMetadataId: null, recordId: null },
  ];
  const state = {
    workspace: true,
    unique: true,
    remaining: '0',
    uncopied: '0',
    missingColumn: false,
    historyTables: true,
    schemaExists: true,
  };
  const core = {
    query: jest.fn(async (sql: string) => {
      if (
        sql.includes('SELECT w.id') &&
        sql.includes('JOIN pg_catalog.pg_namespace n ON n.nspname')
      )
        return state.workspace ? [{ id: 'workspace' }] : [];
      if (sql.includes('FROM core.application')) return applications;
      if (sql.includes('FROM core."permissionFlag"')) return definitions;
      if (sql.includes('format_type')) return columns;
      if (sql.includes('FROM pg_catalog.pg_index'))
        return state.unique ? [{ indexrelid: 'index' }] : [];
      if (sql.includes('LEFT JOIN core."actionApprovalBindingEvidenceLink"'))
        return targets;
      if (sql.includes('jsonb_to_recordset'))
        return [{ count: state.uncopied }];
      if (sql.includes('expiredBindings')) {
        events.push('invalidate');
        return [];
      }
      if (
        sql.includes('core.workspace') &&
        sql.includes('"databaseSchema"')
      )
        return state.schemaExists
          ? [
              {
                databaseSchema: sql.includes(
                  'WHERE id = $1 AND "databaseSchema" IS NULL',
                )
                  ? null
                  : getWorkspaceSchemaName(
                      '00000000-0000-4000-8000-000000000001',
                    ),
              },
            ]
          : [];
      if (sql.includes('information_schema.columns')) {
        events.push('column-preflight');
        return state.missingColumn
          ? [{ tableName: '_myahSocialConversation', columnName: 'id' }]
          : Object.entries({
              _myahSocialConversation: [
                'id',
                'provider',
                'lifecycle',
                'providerConversationId',
                'recipientIgsid',
              ],
              _myahSocialMessage: [
                'id',
                'provider',
                'conversationId',
                'text',
                'providerCreatedAt',
              ],
              _myahInstagramReplyDraft: [
                'id',
                'conversationId',
                'status',
                'sentAt',
                'sendBlockedReason',
              ],
            }).flatMap(([tableName, names]) =>
              names.map((columnName) => ({ tableName, columnName })),
            );
      }
      if (sql.includes('information_schema.tables'))
        return state.historyTables
          ? [
              { tableName: '_myahSocialConversation' },
              { tableName: '_myahSocialMessage' },
              { tableName: '_myahInstagramReplyDraft' },
            ]
          : [];
      if (sql.includes('legacyMessages')) {
        events.push('backfill');
        return [];
      }
      if (sql.includes('SELECT (')) {
        events.push('postconditions');
        return [{ count: state.remaining }];
      }
      throw new Error('Unexpected core SQL');
    }),
  };
  const workspace = {
    coreDataSource: core,
    query: jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        events.push('column-preflight');
        return state.missingColumn
          ? [{ tableName: '_myahSocialConversation', columnName: 'id' }]
          : Object.entries({
              _myahSocialConversation: [
                'id',
                'provider',
                'lifecycle',
                'providerConversationId',
                'recipientIgsid',
              ],
              _myahSocialMessage: [
                'id',
                'provider',
                'conversationId',
                'text',
                'providerCreatedAt',
              ],
              _myahInstagramReplyDraft: [
                'id',
                'conversationId',
                'status',
                'sentAt',
                'sendBlockedReason',
              ],
            }).flatMap(([tableName, names]) =>
              names.map((columnName) => ({ tableName, columnName })),
            );
      }
      if (sql.includes('expiredBindings')) {
        events.push('invalidate');
        return [];
      }
      if (sql.includes('legacyMessages')) {
        events.push('backfill');
        return [];
      }
      if (sql.includes('SELECT (')) {
        events.push('postconditions');
        return [{ count: state.remaining }];
      }
      throw new Error('Unexpected workspace SQL');
    }),
  };
  const iterator = {} as WorkspaceIteratorService;
  const backfill = new BackfillComposioInstagramHistoryWorkspaceCommand(
    iterator,
    core as unknown as DataSource,
  );
  const invalidator =
    new InvalidateComposioInstagramAuthoritiesWorkspaceCommand(
      iterator,
      core as unknown as DataSource,
    );
  const backfillSpy = jest.spyOn(backfill, 'runOnWorkspace');
  const invalidateSpy = jest.spyOn(invalidator, 'runOnWorkspace');
  jest
    .mocked(repairInstagramSecurityChecks)
    .mockImplementation(async (_source, options) => {
      events.push('core');
      return {
        dryRun: options?.dryRun ?? false,
        proposedRepairs: 2,
        completedRepairs: options?.dryRun ? 0 : 2,
        constraints: [],
      };
    });
  const verifier = new VerifyInstagramSecurityCutoverWorkspaceCommand(
    iterator,
    core as unknown as DataSource,
    invalidator,
    backfill,
  );
  const args: RunOnWorkspaceArgs = {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    dataSource: workspace as never,
    options: { verbose: false },
    index: 2,
    total: 4,
  };
  return {
    verifier,
    args,
    events,
    columns,
    applications,
    definitions,
    core,
    workspace,
    state,
    targets,
    backfillSpy,
    invalidateSpy,
  };
};

describe('VerifyInstagramSecurityCutoverWorkspaceCommand', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses copied dry-run preflight, core helper, exact invalidator, backfill and scoped postconditions in order', async () => {
    const f = fixture();
    const before = { ...f.args, options: { ...f.args.options } };
    await f.verifier.runOnWorkspace(f.args);
    expect(f.events).toEqual([
      'column-preflight',
      'core',
      'invalidate',
      'column-preflight',
      'backfill',
      'postconditions',
    ]);
    expect(f.args).toEqual(before);
    expect(f.backfillSpy.mock.calls[0][0]).toEqual({
      ...f.args,
      options: { ...f.args.options, dryRun: true },
    });
    expect(f.backfillSpy.mock.calls[0][0]).not.toBe(f.args);
    expect(f.backfillSpy.mock.calls[0][0].options).not.toBe(f.args.options);
    expect(f.invalidateSpy).toHaveBeenCalledWith(f.args);
    expect(f.core.query).toHaveBeenCalledWith(
      expect.stringContaining('jsonb_to_recordset'),
      [JSON.stringify(f.targets), f.args.workspaceId],
    );
    expect(f.core.query).toHaveBeenCalledWith(
      expect.stringContaining('expiredBindings'),
      [f.args.workspaceId],
    );
    const coreMutations = f.core.query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => !/^\s*SELECT/.test(sql));

    expect(coreMutations).toHaveLength(2);
    expect(coreMutations[0]).toContain('expiredBindings');
    expect(coreMutations[1]).toContain('legacyMessages');
  });

  it('dry-run reports remaining work with no invalidation/backfill DML or argument mutation', async () => {
    const f = fixture();
    f.args.options.dryRun = true;
    f.state.remaining = '12';
    await f.verifier.runOnWorkspace(f.args);
    expect(f.events).toEqual(['column-preflight', 'core', 'postconditions']);
    expect(f.invalidateSpy).not.toHaveBeenCalled();
    expect(
      f.core.query.mock.calls.some(([sql]) =>
        sql.includes('jsonb_to_recordset'),
      ),
    ).toBe(false);
    expect(repairInstagramSecurityChecks).toHaveBeenCalledWith(f.core, {
      dryRun: true,
    });
  });

  it.each(['workspace', 'unique', 'missingColumn'] as const)(
    'fails %s prerequisite before core mutation',
    async (key) => {
      const f = fixture();
      f.state[key] = key === 'missingColumn';
      await expect(f.verifier.runOnWorkspace(f.args)).rejects.toThrow();
      expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    },
  );

  it.each(['empty-id', 'no-source', 'core-source', 'wrong-core'])(
    'rejects %s',
    async (mode) => {
      const f = fixture();
      if (mode === 'empty-id') f.args.workspaceId = '';
      if (mode === 'no-source') f.args.dataSource = undefined;
      if (mode === 'core-source') f.args.dataSource = f.core as never;
      if (mode === 'wrong-core') f.workspace.coreDataSource = {} as never;
      await expect(f.verifier.preflight(f.args)).rejects.toThrow('dedicated');
      expect(f.core.query).not.toHaveBeenCalled();
    },
  );

  it('skips a workspace where the historical Instagram app tables never existed', async () => {
    const f = fixture();

    f.state.historyTables = false;

    await expect(f.verifier.runOnWorkspace(f.args)).resolves.toBeUndefined();
    expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    expect(f.invalidateSpy).not.toHaveBeenCalled();
    expect(f.backfillSpy).not.toHaveBeenCalled();
  });

  it('fails before the no-history skip when the recorded workspace schema does not physically exist', async () => {
    const f = fixture();

    f.state.historyTables = false;
    f.state.schemaExists = false;

    await expect(f.verifier.runOnWorkspace(f.args)).rejects.toThrow(
      'dedicated data source',
    );
    expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    expect(f.invalidateSpy).not.toHaveBeenCalled();
    expect(f.backfillSpy).not.toHaveBeenCalled();
  });

  it('skips a workspace only after confirming that it has no database schema', async () => {
    const f = fixture();

    f.args.dataSource = undefined;

    await expect(f.verifier.runOnWorkspace(f.args)).resolves.toBeUndefined();
    expect(f.core.query).toHaveBeenCalledWith(
      expect.stringContaining('"databaseSchema" IS NULL'),
      [f.args.workspaceId],
    );
    expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
    expect(f.invalidateSpy).not.toHaveBeenCalled();
    expect(f.backfillSpy).not.toHaveBeenCalled();
  });

  it.each([
    'missing-instagram',
    'display-name-only',
    'missing-standard',
    'duplicate-app',
  ])('rejects %s application ownership', async (mode) => {
    const f = fixture();
    if (mode === 'missing-instagram') f.applications.shift();
    if (mode === 'display-name-only')
      f.applications[0].universalIdentifier = 'Instagram 0.2.0';
    if (mode === 'missing-standard') f.applications.pop();
    if (mode === 'duplicate-app') f.applications.push({ ...f.applications[0] });
    await expect(f.verifier.preflight(f.args)).rejects.toThrow('ownership');
    expect(repairInstagramSecurityChecks).not.toHaveBeenCalled();
  });

  it.each(
    permissions.flatMap(([key], index) =>
      ['missing', 'wrong-id', 'misbound', 'wrong-type', 'conflict'].map(
        (mode) => ({ key, index, mode }),
      ),
    ),
  )(
    'rejects $key $mode definitions, never inspects grants',
    async ({ index, mode }) => {
      const f = fixture();
      if (mode === 'missing') f.definitions.splice(index, 1);
      if (mode === 'wrong-id')
        f.definitions[index].universalIdentifier = 'wrong';
      if (mode === 'misbound') f.definitions[index].applicationId = 'instagram';
      if (mode === 'wrong-type')
        f.definitions[index].permissionType = 'settings';
      if (mode === 'conflict') f.definitions.push({ ...f.definitions[index] });
      await expect(f.verifier.preflight(f.args)).rejects.toThrow('definition');
      expect(
        f.core.query.mock.calls.every(
          ([sql]) => !/rolePermission|UPDATE|INSERT|DELETE/.test(sql),
        ),
      ).toBe(true);
    },
  );

  it.each(
    columnFixtures().map((column, index) => ({
      name: `${column.tableName}.${column.name}`,
      index,
    })),
  )('requires exact invalidator column $name', async ({ index }) => {
    const f = fixture();
    f.columns.splice(index, 1);
    await expect(f.verifier.preflight(f.args)).rejects.toThrow(
      'column prerequisite',
    );
  });

  it.each(['type', 'nullable', 'enum', 'uuid-default', 'date-default'])(
    'fails invalidator %s drift',
    async (mode) => {
      const f = fixture();
      if (mode === 'type') f.columns[0].type = 'text';
      if (mode === 'nullable') f.columns[0].notNull = false;
      if (mode === 'enum') f.columns[3].labels = ['PENDING'];
      if (mode === 'uuid-default') f.columns[6].defaultValue = null;
      if (mode === 'date-default') f.columns[11].defaultValue = null;
      await expect(f.verifier.preflight(f.args)).rejects.toThrow(
        'prerequisite',
      );
    },
  );

  it.each(['remaining', 'uncopied'] as const)(
    'fails %s postconditions honestly after mutations',
    async (key) => {
      const f = fixture();
      f.state[key] = '1';
      await expect(f.verifier.runOnWorkspace(f.args)).rejects.toThrow(
        'partial changes',
      );
      expect(f.events).toContain('backfill');
    },
  );

  it('does not expose the inherited partial-workspace CLI', async () => {
    await expect(fixture().verifier.run()).rejects.toThrow('Use upgrade');
  });
});
