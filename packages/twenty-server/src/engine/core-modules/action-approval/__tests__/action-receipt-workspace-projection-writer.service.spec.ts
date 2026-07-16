import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';

describe('ActionReceiptWorkspaceProjectionWriterService', () => {
  it('projects an accepted draft as an outbound message in that draft conversation', async () => {
    const receiptId = '00000000-0000-4000-8000-000000000001';
    const workspaceId = '00000000-0000-4000-8000-000000000002';
    const draftId = '00000000-0000-4000-8000-000000000003';
    const conversationId = '00000000-0000-4000-8000-000000000004';
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('SELECT "id"')) {
        return [];
      }
      if (sql.includes('UPDATE') && sql.includes('_myahInstagramReplyDraft')) {
        return [[{ body: 'Bound reply', conversationId }], 1];
      }

      return [];
    });
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: { query: typeof query }) => unknown) =>
        callback({ query }),
      ),
    };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
    );

    await writer.project({ receiptId, workspaceId, draftId });

    const insert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO') && sql.includes('_myahSocialMessage'),
    );
    expect(insert?.[0]).toContain('"conversationId"');
    expect(insert?.[1]).toContain(conversationId);
  });
});
