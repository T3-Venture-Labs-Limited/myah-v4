import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';

@Injectable()
export class InstagramMessageDraftLockService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async withLock<T>(
    input: { workspaceId: string; draftId: string },
    operation: () => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    const lockKey = `instagram-message-draft:${input.workspaceId}:${input.draftId}`;

    await queryRunner.connect();
    try {
      await queryRunner.query('SELECT pg_advisory_lock(hashtext($1))', [
        lockKey,
      ]);

      return await operation();
    } finally {
      try {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          lockKey,
        ]);
      } finally {
        await queryRunner.release();
      }
    }
  }
}
