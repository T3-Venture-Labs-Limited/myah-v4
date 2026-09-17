import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  MYAH_INBOX_TRIAGE_RECEIPT_RECOVERY_JOB_NAME,
  MyahInboxContactTriageReceiptService,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const RECEIPT_BATCH_SIZE = 100;

type MyahInboxTriageReceiptRecoveryJobData = {
  workspaceId: string;
};

@Injectable()
@Processor(MessageQueue.messagingQueue)
export class MyahInboxTriageReceiptRecoveryJob {
  constructor(
    private readonly receiptService: MyahInboxContactTriageReceiptService,
    private readonly globalWorkspaceOrmManager?: GlobalWorkspaceOrmManager,
  ) {}

  @Process(MYAH_INBOX_TRIAGE_RECEIPT_RECOVERY_JOB_NAME)
  async handle(data: MyahInboxTriageReceiptRecoveryJobData): Promise<void> {
    const drained = await this.receiptService.drain({
      workspaceId: data.workspaceId,
      throughSequence: '9223372036854775807',
      purpose: 'READY_RECOVERY',
    });

    if (
      drained === RECEIPT_BATCH_SIZE &&
      (await this.hasAnotherEligibleReceipt(data.workspaceId))
    ) {
      await this.receiptService.enqueueRecovery(data.workspaceId);
    }
  }

  private async hasAnotherEligibleReceipt(
    workspaceId: string,
  ): Promise<boolean> {
    if (!this.globalWorkspaceOrmManager) return false;

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager!.getGlobalWorkspaceDataSource();
        const schema = escapeIdentifier(getWorkspaceSchemaName(workspaceId));
        const receipts = await dataSource.query<{ sequence: string }[]>(
          `SELECT sequence
           FROM ${schema}."myahInboxTriageTransitionReceipt"
           WHERE status='PENDING' AND sequence <= 9223372036854775807::bigint
           ORDER BY sequence
           LIMIT 1`,
        );

        return receipts.length > 0;
      },
      buildSystemAuthContext({ workspace: { id: workspaceId } as never }),
    );
  }
}

@Injectable()
@Processor(MessageQueue.cronQueue)
export class MyahInboxTriageReceiptRecoveryCronJob {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly receiptService: MyahInboxContactTriageReceiptService,
  ) {}

  @Process(MyahInboxTriageReceiptRecoveryCronJob.name)
  async handle(): Promise<void> {
    const workspaces = await this.workspaceRepository.find({
      where: {
        activationStatus: WorkspaceActivationStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      select: { id: true },
    });

    for (const workspace of workspaces) {
      if (await this.hasPendingReceipts(workspace.id)) {
        await this.receiptService.enqueueRecovery(workspace.id);
      }
    }
  }

  private async hasPendingReceipts(workspaceId: string): Promise<boolean> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schema = escapeIdentifier(getWorkspaceSchemaName(workspaceId));
        // The schema is derived from the internal workspace UUID and escaped.
        const receipts = await dataSource.query<{ sequence: string }[]>(
          `SELECT sequence
           FROM ${schema}."myahInboxTriageTransitionReceipt"
           WHERE status='PENDING'
           ORDER BY sequence
           LIMIT ${RECEIPT_BATCH_SIZE}`,
        );

        return receipts.length > 0;
      },
      buildSystemAuthContext({ workspace: { id: workspaceId } as never }),
    );
  }
}
