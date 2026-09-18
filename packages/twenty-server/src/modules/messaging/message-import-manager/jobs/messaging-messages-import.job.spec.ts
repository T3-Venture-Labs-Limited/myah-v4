import { MessageChannelSyncStage } from 'twenty-shared/types';

import { MessagingMessagesImportJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-messages-import.job';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';

const createHarness = (syncStage: MessageChannelSyncStage) => {
  const messageChannel = {
    id: messageChannelId,
    workspaceId,
    isSyncEnabled: true,
    syncStage,
    connectedAccount: { id: 'connected-account-id' },
  };
  const processMessageBatchImport = jest.fn().mockResolvedValue(undefined);
  const markAsMessagesListFetchPending = jest.fn().mockResolvedValue(undefined);
  const restorePendingMessageExternalIds = jest.fn().mockResolvedValue(true);
  const findOne = jest.fn().mockResolvedValue(messageChannel);
  const withLock = jest
    .fn()
    .mockImplementation(
      async (_scope: unknown, operation: () => Promise<void>) => operation(),
    );
  const service = new MessagingMessagesImportJob(
    { processMessageBatchImport } as never,
    { withLock } as never,
    { markAsMessagesListFetchPending } as never,
    { track: jest.fn().mockResolvedValue(undefined) } as never,
    { restorePendingMessageExternalIds } as never,
    {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation((operation: () => Promise<void>) => operation()),
    } as never,
    { findOne } as never,
  );

  return {
    findOne,
    markAsMessagesListFetchPending,
    processMessageBatchImport,
    restorePendingMessageExternalIds,
    service,
    withLock,
  };
};

describe('MessagingMessagesImportJob recovery', () => {
  it.each([
    MessageChannelSyncStage.MESSAGES_IMPORT_SCHEDULED,
    MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
  ])('restores pending membership before processing %s', async (syncStage) => {
    const harness = createHarness(syncStage);

    await harness.service.handle({ messageChannelId, workspaceId });

    expect(harness.withLock).toHaveBeenCalledWith(
      { messageChannelId, workspaceId },
      expect.any(Function),
    );
    expect(harness.findOne).toHaveBeenCalledTimes(1);
    expect(harness.restorePendingMessageExternalIds).toHaveBeenCalledWith({
      messageChannelId,
      workspaceId,
    });
    expect(harness.processMessageBatchImport).toHaveBeenCalledTimes(1);
    expect(
      harness.restorePendingMessageExternalIds.mock.invocationCallOrder[0],
    ).toBeLessThan(
      harness.processMessageBatchImport.mock.invocationCallOrder[0],
    );
  });

  it('requests list re-enumeration when generation state is missing', async () => {
    const harness = createHarness(
      MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
    );

    harness.restorePendingMessageExternalIds.mockResolvedValue(false);

    await harness.service.handle({ messageChannelId, workspaceId });

    expect(harness.markAsMessagesListFetchPending).toHaveBeenCalledWith(
      [messageChannelId],
      workspaceId,
    );
    expect(harness.processMessageBatchImport).not.toHaveBeenCalled();
  });
});
