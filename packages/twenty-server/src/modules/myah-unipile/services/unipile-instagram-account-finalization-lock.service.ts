import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type QueryRunner } from 'typeorm';

@Injectable()
export class UnipileInstagramAccountFinalizationLockService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async withSessionLock<T>(
    scope: {
      workspaceId: string;
      unipileAccountId: string;
      instagramUserId: string;
    },
    operation: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    const keys = [
      `unipile-instagram-account-finalization:workspace:${scope.workspaceId}`,
      `unipile-instagram-account-finalization:provider:${scope.unipileAccountId}`,
      `unipile-instagram-account-finalization:owner:${scope.instagramUserId}`,
    ];
    const acquiredKeys: string[] = [];

    try {
      await queryRunner.connect();

      for (const key of keys) {
        await queryRunner.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
        acquiredKeys.push(key);
      }

      return await operation(queryRunner);
    } finally {
      try {
        for (const key of [...acquiredKeys].reverse()) {
          await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
            key,
          ]);
        }
      } finally {
        await queryRunner.release();
      }
    }
  }

  async withLock<T>(
    scope: {
      workspaceId: string;
      unipileAccountId: string;
      instagramUserId: string;
    },
    operation: (manager: EntityManager) => Promise<T>,
    existingManager?: EntityManager,
  ): Promise<T> {
    const runWithLock = async (manager: EntityManager): Promise<T> => {
      for (const key of [
        `unipile-instagram-account-finalization:workspace:${scope.workspaceId}`,
        `unipile-instagram-account-finalization:provider:${scope.unipileAccountId}`,
        `unipile-instagram-account-finalization:owner:${scope.instagramUserId}`,
      ]) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          key,
        ]);
      }

      return operation(manager);
    };

    return existingManager
      ? runWithLock(existingManager)
      : this.dataSource.transaction(runWithLock);
  }
}
