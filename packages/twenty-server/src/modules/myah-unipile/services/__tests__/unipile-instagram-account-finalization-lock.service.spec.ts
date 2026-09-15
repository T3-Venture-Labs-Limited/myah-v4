import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { UnipileInstagramAccountFinalizationLockService } from 'src/modules/myah-unipile/services/unipile-instagram-account-finalization-lock.service';

type QueryRunner = {
  connect: jest.Mock;
  query: jest.Mock;
  release: jest.Mock;
};

type FinalizationLockService = {
  withSessionLock<T>(
    scope: {
      workspaceId: string;
      unipileAccountId: string;
      instagramUserId: string;
    },
    operation: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T>;
  withLock<T>(
    scope: {
      workspaceId: string;
      unipileAccountId: string;
      instagramUserId: string;
    },
    operation: (manager: { query: jest.Mock }) => Promise<T>,
    existingManager?: { query: jest.Mock },
  ): Promise<T>;
};

describe('UnipileInstagramAccountFinalizationLockService', () => {
  it('holds deterministic workspace, provider-account, and stable-owner session locks through its callback and releases them in reverse order', async () => {
    const events: string[] = [];
    const query = jest.fn(async (statement: string, [key]: [string]) => {
      events.push(
        `${statement.includes('pg_advisory_unlock') ? 'unlock' : 'lock'}:${key}`,
      );
    });
    const queryRunner: QueryRunner = {
      connect: jest.fn(async () => {
        events.push('connect');
      }),
      query,
      release: jest.fn(async () => {
        events.push('release');
      }),
    };
    const createQueryRunner = jest.fn(() => queryRunner);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnipileInstagramAccountFinalizationLockService,
        {
          provide: getDataSourceToken(),
          useValue: { createQueryRunner },
        },
      ],
    }).compile();
    const operation = jest.fn(async (runner: QueryRunner) => {
      expect(runner).toBe(queryRunner);
      events.push('operation');

      return 'finalized';
    });

    await expect(
      (
        module.get(
          UnipileInstagramAccountFinalizationLockService,
        ) as unknown as FinalizationLockService
      ).withSessionLock(
        {
          workspaceId: 'workspace-id',
          unipileAccountId: 'provider-account-id',
          instagramUserId: '17841400000000001',
        },
        operation,
      ),
    ).resolves.toBe('finalized');

    expect(createQueryRunner).toHaveBeenCalledTimes(1);
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_lock(hashtext($1))',
      ['unipile-instagram-account-finalization:workspace:workspace-id'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_lock(hashtext($1))',
      ['unipile-instagram-account-finalization:provider:provider-account-id'],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_advisory_lock(hashtext($1))',
      ['unipile-instagram-account-finalization:owner:17841400000000001'],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['unipile-instagram-account-finalization:owner:17841400000000001'],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['unipile-instagram-account-finalization:provider:provider-account-id'],
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['unipile-instagram-account-finalization:workspace:workspace-id'],
    );
    expect(events).toEqual([
      'connect',
      'lock:unipile-instagram-account-finalization:workspace:workspace-id',
      'lock:unipile-instagram-account-finalization:provider:provider-account-id',
      'lock:unipile-instagram-account-finalization:owner:17841400000000001',
      'operation',
      'unlock:unipile-instagram-account-finalization:owner:17841400000000001',
      'unlock:unipile-instagram-account-finalization:provider:provider-account-id',
      'unlock:unipile-instagram-account-finalization:workspace:workspace-id',
      'release',
    ]);
  });
  it('unlocks and releases its session when the callback rejects', async () => {
    const query = jest.fn();
    const queryRunner: QueryRunner = {
      connect: jest.fn(),
      query,
      release: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnipileInstagramAccountFinalizationLockService,
        {
          provide: getDataSourceToken(),
          useValue: { createQueryRunner: jest.fn(() => queryRunner) },
        },
      ],
    }).compile();
    const failure = new Error('finalization failed');

    await expect(
      (
        module.get(
          UnipileInstagramAccountFinalizationLockService,
        ) as unknown as FinalizationLockService
      ).withSessionLock(
        {
          workspaceId: 'workspace-id',
          unipileAccountId: 'provider-account-id',
          instagramUserId: '17841400000000001',
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);

    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.slice(3)).toEqual([
      [
        'SELECT pg_advisory_unlock(hashtext($1))',
        ['unipile-instagram-account-finalization:owner:17841400000000001'],
      ],
      [
        'SELECT pg_advisory_unlock(hashtext($1))',
        ['unipile-instagram-account-finalization:provider:provider-account-id'],
      ],
      [
        'SELECT pg_advisory_unlock(hashtext($1))',
        ['unipile-instagram-account-finalization:workspace:workspace-id'],
      ],
    ]);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
  it('retains the xact lifecycle locks for operations that must share a transaction', async () => {
    const query = jest.fn();
    const manager = { query };
    const transaction = jest.fn(
      async (
        operation: (transactionManager: typeof manager) => Promise<unknown>,
      ) => operation(manager),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnipileInstagramAccountFinalizationLockService,
        {
          provide: getDataSourceToken(),
          useValue: { transaction },
        },
      ],
    }).compile();

    await expect(
      (
        module.get(
          UnipileInstagramAccountFinalizationLockService,
        ) as unknown as FinalizationLockService
      ).withLock(
        {
          workspaceId: 'workspace-id',
          unipileAccountId: 'provider-account-id',
          instagramUserId: '17841400000000001',
        },
        async () => undefined,
      ),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['unipile-instagram-account-finalization:workspace:workspace-id'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['unipile-instagram-account-finalization:provider:provider-account-id'],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['unipile-instagram-account-finalization:owner:17841400000000001'],
    );
  });
});
