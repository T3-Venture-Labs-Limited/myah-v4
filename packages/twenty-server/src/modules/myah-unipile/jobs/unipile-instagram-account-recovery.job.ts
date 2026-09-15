import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN } from 'src/modules/myah-unipile/constants/unipile-instagram-account-recovery-cron-pattern.constant';
import { UnipileInstagramAccountRecoveryService } from 'src/modules/myah-unipile/services/unipile-instagram-account-recovery.service';
import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

const PROCESSING_GRACE_MS = 60_000;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class UnipileInstagramAccountRecoveryJob {
  constructor(
    private readonly recoveryService: UnipileInstagramAccountRecoveryService,
    private readonly dataSource: DataSource,
  ) {}

  @Process(UnipileInstagramAccountRecoveryJob.name)
  @SentryCronMonitor(
    UnipileInstagramAccountRecoveryJob.name,
    UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    let locked = false;

    try {
      await queryRunner.connect();
      const [lock] = await queryRunner.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        ['unipile-instagram-account-recovery'],
      );
      locked = lock?.locked === true;
      if (!locked) {
        return;
      }

      await this.recoveryService.recover({
        processingBefore: new Date(Date.now() - PROCESSING_GRACE_MS),
      });
    } finally {
      if (locked) {
        await queryRunner.query('SELECT pg_advisory_unlock(hashtext($1))', [
          'unipile-instagram-account-recovery',
        ]);
      }
      await queryRunner.release();
    }
  }
}
