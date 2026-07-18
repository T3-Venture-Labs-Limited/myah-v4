import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

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
      if (sql.includes('SELECT "body"')) {
        return [{ body: 'Bound reply', conversationId }];
      }

      return [];
    });
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: { query: typeof query }) => unknown) =>
          callback({ query }),
      ),
    };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
    );

    await writer.project({
      receiptId,
      workspaceId,
      draftId,
      contentDigest: computeActionContentDigest('Bound reply'),
    } as never);

    const insert = query.mock.calls.find(
      ([sql]) =>
        sql.includes('INSERT INTO') && sql.includes('_myahSocialMessage'),
    );
    expect(insert?.[0]).toContain('"conversationId"');
    expect(insert?.[1]).toContain(conversationId);
  });

  it('does not project a changed draft body after provider acceptance', async () => {
    const receiptId = '00000000-0000-4000-8000-000000000001';
    const workspaceId = '00000000-0000-4000-8000-000000000002';
    const draftId = '00000000-0000-4000-8000-000000000003';
    const conversationId = '00000000-0000-4000-8000-000000000004';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT "id"')) {
        return [];
      }
      if (sql.includes('SELECT "body"')) {
        return [{ body: 'Changed after approval', conversationId }];
      }

      return [];
    });
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: { query: typeof query }) => unknown) =>
          callback({ query }),
      ),
    };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
    );

    await expect(
      writer.project({
        receiptId,
        workspaceId,
        draftId,
        contentDigest: computeActionContentDigest('Bound reply'),
      } as never),
    ).rejects.toThrow('The approved draft is unavailable for projection');

    expect(
      query.mock.calls.some(
        ([sql]) =>
          String(sql).trimStart().startsWith('UPDATE ') &&
          String(sql).includes('_myahInstagramReplyDraft'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          String(sql).includes('INSERT INTO') &&
          String(sql).includes('_myahSocialMessage'),
      ),
    ).toBe(false);
  });
});
