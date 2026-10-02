import { type DataSource, type QueryRunner } from 'typeorm';
import { MigrationExecutor } from 'typeorm/migration/MigrationExecutor';

// Exercise the installed TypeORM executor, not a reimplementation of its
// ordering/receipt logic. All SQL boundaries are isolated in an in-memory runner.
describe('installed TypeORM 0.3 migration executor on a pinned runner', () => {
  const makeFixture = (failReceipt = false) => {
    const events: string[] = [];
    let active = false;
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(true),
      beforeMigration: jest.fn(async () => {
        events.push('before');
      }),
      afterMigration: jest.fn(async () => {
        events.push('after');
      }),
      startTransaction: jest.fn(async () => {
        active = true;
        events.push('begin');
      }),
      commitTransaction: jest.fn(async () => {
        events.push('commit');
        active = false;
      }),
      rollbackTransaction: jest.fn(async () => {
        events.push('rollback');
        active = false;
      }),
      manager: {
        createQueryBuilder: () => ({
          insert: () => ({
            into: () => ({
              values: () => ({
                execute: async () => {
                  events.push('receipt');
                  if (failReceipt) throw new Error('receipt failed');
                },
              }),
            }),
          }),
        }),
      },
      get isTransactionActive() {
        return active;
      },
    } as unknown as QueryRunner;
    const allAppliedRows = [
      {
        id: '73',
        timestamp: '1770000000000',
        name: 'Applied1770000000000',
      },
    ];
    const dataSource = {
      options: { migrationsTableName: '_typeorm_migrations' },
      driver: {
        options: { type: 'postgres', schema: 'core' },
        database: 'test',
        buildTableName: (table: string, schema: string) => `${schema}.${table}`,
        createSchemaBuilder: () => ({}),
        escape: (column: string) => `"${column}"`,
      },
      manager: {
        createQueryBuilder: (usedRunner: QueryRunner) => {
          expect(usedRunner).toBe(queryRunner);
          return {
            select: () => ({
              orderBy: () => ({
                from: () => ({ getRawMany: async () => allAppliedRows }),
              }),
            }),
          };
        },
      },
      logger: { logSchemaBuild: jest.fn(), logMigration: jest.fn() },
      migrations: [
        { name: 'Applied1770000000000', up: jest.fn() },
        {
          name: 'Pending1780000000000',
          up: async (usedRunner: QueryRunner) => {
            expect(usedRunner).toBe(queryRunner);
            expect(active).toBe(true);
            events.push('sql');
          },
        },
      ],
      createQueryRunner: jest.fn(() => {
        throw new Error('pooled backend used');
      }),
    } as unknown as DataSource;
    return { events, queryRunner, dataSource };
  };

  it('recognizes existing IDs and commits migration SQL and original TypeORM receipt together', async () => {
    const { events, queryRunner, dataSource } = makeFixture();
    const executor = new MigrationExecutor(dataSource, queryRunner);
    executor.transaction = 'each';

    const pending = await executor.getPendingMigrations();
    expect(pending.map((migration) => migration.name)).toEqual([
      'Pending1780000000000',
    ]);
    await executor.executePendingMigrations();

    expect(events).toEqual([
      'before',
      'begin',
      'sql',
      'receipt',
      'commit',
      'after',
    ]);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(dataSource.migrations[0].up).not.toHaveBeenCalled();
  });

  it('does not insert a receipt when the pinned backend fails during migration SQL', async () => {
    const { events, queryRunner, dataSource } = makeFixture();
    dataSource.migrations[1].up = async () => {
      events.push('sql-backend-lost');
      throw new Error('backend lost');
    };
    const executor = new MigrationExecutor(dataSource, queryRunner);
    executor.transaction = 'each';

    await expect(executor.executePendingMigrations()).rejects.toThrow(
      'backend lost',
    );
    expect(events).toEqual(['before', 'begin', 'sql-backend-lost', 'rollback']);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('rolls back the SQL if inserting the original TypeORM receipt fails', async () => {
    const { events, queryRunner, dataSource } = makeFixture(true);
    const executor = new MigrationExecutor(dataSource, queryRunner);
    executor.transaction = 'each';

    await expect(executor.executePendingMigrations()).rejects.toThrow(
      'receipt failed',
    );
    expect(events).toEqual(['before', 'begin', 'sql', 'receipt', 'rollback']);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
