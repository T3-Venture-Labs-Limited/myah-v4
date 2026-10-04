import { RepairCreatorSearchVectorCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1791100000001-repair-creator-search-vector.command';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const setup = (state: { hasTable: boolean; hasColumn: boolean }) => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('to_regclass')) return [state];
    if (sql.includes('core."searchFieldMetadata"'))
      return [
        { name: 'email', type: 'TEXT', position: 1, sortKey: 'b' },
        { name: 'name', type: 'TEXT', position: 0, sortKey: 'a' },
      ];
    return [];
  });
  const command = new RepairCreatorSearchVectorCommand({} as never);
  const args = {
    workspaceId,
    dataSource: { query },
    options: {},
  } as never;
  return { command, args, query };
};

describe('RepairCreatorSearchVectorCommand', () => {
  it('recreates a missing Creator searchVector from the current search fields', async () => {
    const { command, args, query } = setup({
      hasTable: true,
      hasColumn: false,
    });

    await command.runOnWorkspace(args);

    const alter = query.mock.calls.find(([sql]) => sql.startsWith('ALTER'));
    expect(alter?.[0]).toMatch(
      /^ALTER TABLE "workspace_[a-z0-9]+"\."creator" ADD COLUMN IF NOT EXISTS "searchVector" tsvector GENERATED ALWAYS AS \(to_tsvector\('simple', .*"name".*"email".*\) STORED$/s,
    );
  });

  it('leaves workspaces with the column, or without Creators, untouched', async () => {
    for (const state of [
      { hasTable: true, hasColumn: true },
      { hasTable: false, hasColumn: false },
    ]) {
      const { command, args, query } = setup(state);
      await command.runOnWorkspace(args);
      expect(query).toHaveBeenCalledTimes(1);
    }
  });
});
