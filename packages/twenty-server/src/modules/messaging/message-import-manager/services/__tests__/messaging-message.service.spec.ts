import { MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';

describe('MessagingMessageService source locking', () => {
  it('takes the migration marker before the canonical Email source lock', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const manager = {
      internalContext: {
        workspaceId: '00000000-0000-4000-8000-000000000001',
      },
      queryRunner: { query },
    } as never;
    const receiptService = new MyahInboxContactTriageReceiptService();
    const messageService = new MessagingMessageService({} as never);
    const threadId = '00000000-0000-4000-8000-000000000002';

    await receiptService.recordInTransaction(
      {
        channel: 'EMAIL',
        persistedMessageId: '00000000-0000-4000-8000-000000000003',
        sourceRecordId: threadId,
        sourceGenerationId: 'generation',
        mode: 'LIVE',
        direction: 'INBOUND',
        providerOccurredAt: null,
        originalCreatedAt: '2026-09-15T10:00:00.000Z',
        firstPersistence: true,
      },
      manager,
    );
    const sourceLocker = messageService as unknown as {
      acquireEmailThreadSourceLockInTransaction: (
        sourceId: string,
        transactionManager: typeof manager,
      ) => Promise<void>;
    };

    await sourceLocker.acquireEmailThreadSourceLockInTransaction(
      threadId,
      manager,
    );

    // Receipt recording owns the marker first: producers take the marker's write
    // lock while MIGRATING and its lighter key-share lock once READY.
    const markerLockIndex = query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('"myahInboxTriageMigration" WHERE id=true FOR'),
    );
    const sourceLockIndex = query.mock.calls.findIndex(
      ([sql]) => sql === MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
    );

    expect(markerLockIndex).toBeGreaterThanOrEqual(0);
    expect(sourceLockIndex).toBeGreaterThan(markerLockIndex);
    expect(query).toHaveBeenCalledWith(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
      `EMAIL_THREAD:${threadId}`,
    ]);
  });
});
