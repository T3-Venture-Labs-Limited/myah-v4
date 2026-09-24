import { ConflictException } from '@nestjs/common';
import { type Repository } from 'typeorm';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const messageId = '00000000-0000-4000-8000-000000000002';
const threadId = '00000000-0000-4000-8000-000000000003';
const channelId = '00000000-0000-4000-8000-000000000004';
const creatorId = '00000000-0000-4000-8000-000000000005';

// Loading lazily lets the first run fail for the absent command behavior,
// before adding the explicitly invoked entry point.
const loadCommand = () => {
  try {
    return require('../myah-inbox-backfill-campaign-reply-evidence.command')
      .MyahInboxBackfillCampaignReplyEvidenceCommand;
  } catch (error) {
    throw error;
  }
};

const harness = () => {
  const Command = loadCommand();

  expect(Command).toBeDefined();
  const rows = [
    {
      messageId,
      threadId,
      channelId,
      threadExternalId: 'provider-thread',
      sender: 'creator@example.com',
    },
  ];
  const query = jest.fn().mockResolvedValue(rows);
  const manager = {
    queryRunner: {
      isTransactionActive: true,
      query: jest.fn().mockResolvedValue([]),
    },
  };
  const transaction = jest.fn(
    async (mutate: (manager: unknown) => Promise<void>) => mutate(manager),
  );
  const dataSource = { query, transaction };
  const orm = {
    executeInWorkspaceContext: jest.fn(async (run: () => Promise<void>) =>
      run(),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
  };
  const reply = {
    prepareInboundCandidateCreatorsInTransaction: jest
      .fn()
      .mockResolvedValue([creatorId]),
    reconcileInboundMessageInTransaction: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const lifecycle = {
    withCreatorMutationLocksInTransaction: jest.fn(
      async ({ mutate }: { mutate: () => Promise<void> }) => mutate(),
    ),
  };
  const command = new Command(
    {
      existsBy: jest.fn().mockResolvedValue(true),
    } as unknown as Repository<WorkspaceEntity>,
    orm as unknown as GlobalWorkspaceOrmManager,
    reply as unknown as CampaignReplyService,
    lifecycle as unknown as MyahInboxContactTriageLifecycleService,
  );

  return { command, query, transaction, reply, rows, manager, lifecycle };
};

describe('explicit Campaign reply evidence backfill', () => {
  it('dry-runs bounded historical incoming rows without a transaction or writes', async () => {
    const { command, query, transaction, reply } = harness();

    await command.run([], { workspaceId, limit: 25 });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "association.direction='INCOMING'",
    );
    expect(query.mock.calls[0][0]).toContain('core."outboundEmailAttempt"');
    expect(query.mock.calls[0][1]).toEqual([workspaceId, null, 25]);
    // The global workspace datasource rejects raw SQL without an explicit system bypass.
    expect(query.mock.calls[0][3]).toEqual({
      shouldBypassPermissionChecks: true,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(reply.reconcileInboundMessageInTransaction).not.toHaveBeenCalled();
  });

  it('prelocks accepted A and current thread Creator B before an applied historical reply', async () => {
    const creatorB = '00000000-0000-4000-8000-000000000006';
    const { command, manager, lifecycle, reply } = harness();
    manager.queryRunner.query.mockResolvedValue([{ creatorId: creatorB }]);

    await command.run([], { workspaceId, apply: true });

    expect(
      lifecycle.withCreatorMutationLocksInTransaction,
    ).toHaveBeenCalledWith({
      creatorIds: [creatorId, creatorB],
      manager,
      mutate: expect.any(Function),
    });
    expect(
      lifecycle.withCreatorMutationLocksInTransaction.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      reply.reconcileInboundMessageInTransaction.mock.invocationCallOrder[0],
    );
  });

  it('retries the whole historical candidate transaction when Creator coverage changes', async () => {
    const { command, reply, transaction } = harness();
    reply.reconcileInboundMessageInTransaction
      .mockRejectedValueOnce(
        new ConflictException(
          'Inbox Creator lock coverage changed before source mutation',
        ),
      )
      .mockResolvedValueOnce(undefined);

    await command.run([], { workspaceId, apply: true });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(
      reply.prepareInboundCandidateCreatorsInTransaction,
    ).toHaveBeenCalledTimes(2);
    expect(reply.reconcileInboundMessageInTransaction).toHaveBeenCalledTimes(2);
  });

  it('requires a real workspace and an explicit apply before mutating, then reuses the safe reconciler with no invented parent tokens', async () => {
    const { command, reply, transaction, query, rows } = harness();

    await expect(
      command.run([], { workspaceId: 'bad', apply: true }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    await command.run([], {
      workspaceId,
      afterMessageId: messageId,
      apply: true,
    });

    expect(query.mock.calls[0][1]).toEqual([workspaceId, messageId, 100]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(
      reply.prepareInboundCandidateCreatorsInTransaction,
    ).toHaveBeenCalledWith(
      {
        workspaceId,
        messageChannelId: channelId,
        candidates: [
          {
            threadExternalId: 'provider-thread',
            normalizedSender: 'creator@example.com',
          },
        ],
      },
      expect.anything(),
    );
    expect(reply.reconcileInboundMessageInTransaction).toHaveBeenCalledWith(
      {
        workspaceId,
        messageChannelId: channelId,
        threadExternalId: rows[0].threadExternalId,
        fromHandle: rows[0].sender,
        inboundEvidenceId: messageId,
        inboundMessageThreadId: threadId,
        inReplyToTokens: [],
        coveredCreatorIds: [creatorId],
      },
      expect.anything(),
    );
    expect(
      reply.prepareInboundCandidateCreatorsInTransaction.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      reply.reconcileInboundMessageInTransaction.mock.invocationCallOrder[0],
    );
  });
});
