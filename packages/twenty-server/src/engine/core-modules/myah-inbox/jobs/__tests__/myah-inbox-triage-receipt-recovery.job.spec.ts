import { MODULE_METADATA } from '@nestjs/common/constants';

import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import {
  MessageQueue,
  PROCESSOR_METADATA,
} from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MyahInboxContactTriageModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-contact-triage.module';
import { MyahInboxTriageReceiptRecoveryCronCommand } from 'src/engine/core-modules/myah-inbox/jobs/myah-inbox-triage-receipt-recovery.cron-command';
import {
  MyahInboxTriageReceiptRecoveryCronJob,
  MyahInboxTriageReceiptRecoveryJob,
} from 'src/engine/core-modules/myah-inbox/jobs/myah-inbox-triage-receipt-recovery.job';

describe('MyahInbox triage receipt recovery', () => {
  it('registers the cron command and jobs with the contact triage module', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxContactTriageModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        MyahInboxTriageReceiptRecoveryCronCommand,
        MyahInboxTriageReceiptRecoveryCronJob,
        MyahInboxTriageReceiptRecoveryJob,
      ]),
    );
  });

  it('schedules recovery on the cron queue every minute', async () => {
    const addCron = jest.fn().mockResolvedValue(undefined);
    const command = new MyahInboxTriageReceiptRecoveryCronCommand({
      addCron,
    } as never);

    await command.run();

    expect(addCron).toHaveBeenCalledWith({
      jobName: MyahInboxTriageReceiptRecoveryCronJob.name,
      data: undefined,
      options: { repeat: { every: 60_000 } },
    });
  });

  it('discovers a committed unqueued receipt in an active workspace', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000001';
    const enqueueRecovery = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockResolvedValue([{ sequence: '1' }]);
    const executeInWorkspaceContext = jest
      .fn()
      .mockImplementation((callback: () => Promise<unknown>) => callback());
    const job = new MyahInboxTriageReceiptRecoveryCronJob(
      {
        find: jest.fn().mockResolvedValue([{ id: workspaceId }]),
      } as never,
      {
        executeInWorkspaceContext,
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
      } as never,
      { enqueueRecovery } as never,
    );

    await job.handle();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"myahInboxTriageTransitionReceipt"'),
    );
    expect(executeInWorkspaceContext).toHaveBeenCalledWith(
      expect.any(Function),
      buildSystemAuthContext({ workspace: { id: workspaceId } as never }),
    );
    expect(enqueueRecovery).toHaveBeenCalledTimes(1);
    expect(enqueueRecovery).toHaveBeenCalledWith(workspaceId);
  });

  it('eventually completes a committed receipt that was never enqueued', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000001';
    let receiptStatus: 'PENDING' | 'COMPLETE' = 'PENDING';
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT status,')) {
        return Promise.resolve([
          { status: 'READY', baselineFenceSequence: '1' },
        ]);
      }
      if (sql.includes('SELECT sequence')) {
        return Promise.resolve(
          receiptStatus === 'PENDING' ? [{ sequence: '1' }] : [],
        );
      }
      if (sql.includes('UPDATE') && sql.includes('completedAt')) {
        receiptStatus = 'COMPLETE';
      }

      return Promise.resolve([]);
    });
    const executeInWorkspaceContext = jest
      .fn()
      .mockImplementation((callback: () => Promise<unknown>) => callback());
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext,
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
        query,
        manager: { queryRunner: {} },
      }),
    };
    let recoveryJob: MyahInboxTriageReceiptRecoveryJob;
    const messageQueueService = {
      add: jest
        .fn()
        .mockImplementation(async (_jobName, data) => recoveryJob.handle(data)),
    };
    const receiptService = new MyahInboxContactTriageReceiptService(
      globalWorkspaceOrmManager as never,
      messageQueueService as never,
      {
        applyReceiptInTransaction: jest.fn().mockResolvedValue(undefined),
        resolveDueSnoozesInTransaction: jest.fn().mockResolvedValue(0),
        lockIdentityKeysInTransaction: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    recoveryJob = new MyahInboxTriageReceiptRecoveryJob(
      receiptService,
      globalWorkspaceOrmManager as never,
    );
    const cronJob = new MyahInboxTriageReceiptRecoveryCronJob(
      { find: jest.fn().mockResolvedValue([{ id: workspaceId }]) } as never,
      globalWorkspaceOrmManager as never,
      receiptService,
    );

    await cronJob.handle();

    expect(messageQueueService.add).toHaveBeenCalledWith(
      'MyahInboxTriageReceiptRecoveryJob',
      { workspaceId },
    );
    expect(receiptStatus).toBe('COMPLETE');
  });

  it('drains READY work and re-enqueues a full bounded batch only when another receipt is eligible', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000001';
    const drain = jest.fn().mockResolvedValue(100);
    const enqueueRecovery = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockResolvedValue([{ sequence: '101' }]);
    const job = new MyahInboxTriageReceiptRecoveryJob(
      { drain, enqueueRecovery } as never,
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((callback: () => Promise<unknown>) => callback()),
        getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
      } as never,
    );

    await job.handle({ workspaceId });

    expect(drain).toHaveBeenCalledWith({
      workspaceId,
      throughSequence: '9223372036854775807',
      purpose: 'READY_RECOVERY',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status='PENDING'"),
    );
    expect(enqueueRecovery).toHaveBeenCalledWith(workspaceId);
  });

  it('does not re-enqueue an exact full batch with no remaining eligible receipt', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000001';
    const enqueueRecovery = jest.fn().mockResolvedValue(undefined);
    const job = new MyahInboxTriageReceiptRecoveryJob(
      { drain: jest.fn().mockResolvedValue(100), enqueueRecovery } as never,
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((callback: () => Promise<unknown>) => callback()),
        getGlobalWorkspaceDataSource: jest
          .fn()
          .mockResolvedValue({ query: jest.fn().mockResolvedValue([]) }),
      } as never,
    );

    await job.handle({ workspaceId });

    expect(enqueueRecovery).not.toHaveBeenCalled();
  });

  it('uses cron scheduling and the messaging worker queue', () => {
    expect(
      Reflect.getMetadata(
        PROCESSOR_METADATA,
        MyahInboxTriageReceiptRecoveryCronJob,
      ),
    ).toMatchObject({ queueName: MessageQueue.cronQueue });
    expect(
      Reflect.getMetadata(
        PROCESSOR_METADATA,
        MyahInboxTriageReceiptRecoveryJob,
      ),
    ).toMatchObject({ queueName: MessageQueue.messagingQueue });
  });
});
