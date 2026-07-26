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
      actionName: 'send_instagram_reply',
      providerMessageId: null,
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
        actionName: 'send_instagram_reply',
        providerMessageId: null,
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

  it('projects outreach once through its sent Message and receipt-keyed timeline event', async () => {
    const receiptId = '00000000-0000-4000-8000-000000000011';
    const workspaceId = '00000000-0000-4000-8000-000000000012';
    const draftId = '00000000-0000-4000-8000-000000000013';
    const campaignCreatorId = '00000000-0000-4000-8000-000000000014';
    const creatorId = '00000000-0000-4000-8000-000000000015';
    const campaignId = '00000000-0000-4000-8000-000000000016';
    const messageChannelId = '00000000-0000-4000-8000-000000000017';
    const messageId = '00000000-0000-4000-8000-000000000018';
    const messageThreadId = '00000000-0000-4000-8000-000000000019';
    const providerMessageId = '<sent@example.com>';
    const subject = 'Approved subject';
    const body = 'Approved body';
    let projected = false;
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('FROM') && sql.includes('"timelineActivity"')) {
        return projected ? [{ id: receiptId }] : [];
      }
      if (sql.includes('FROM') && sql.includes('"_outreachAction"')) {
        return [
          {
            subject,
            body,
            campaignCreatorId,
            creatorId,
            campaignId,
            connectedAccountId: 'connected-account-id',
            messageChannelId,
            senderEmail: 'sender@example.com',
            providerDraftExternalId: 'provider-draft-id',
            providerThreadExternalId: 'provider-thread-id',
            messageThreadId: null,
            inReplyTo: null,
            executionReceiptId: null,
          },
        ];
      }
      if (sql.includes('FROM') && sql.includes('"message"')) {
        return [
          {
            id: messageId,
            messageThreadId,
            messageExternalId: 'provider-message-id',
            messageThreadExternalId: 'provider-thread-id',
          },
        ];
      }

      return [];
    });
    const execute = jest.fn(async () => {
      projected = true;
      return { identifiers: [{ id: receiptId }] };
    });
    const orIgnore = jest.fn(() => ({ execute }));
    const values = jest.fn(() => ({ orIgnore }));
    const into = jest.fn(() => ({ values }));
    const insert = jest.fn(() => ({ into }));
    const createQueryBuilder = jest.fn(() => ({ insert }));
    const dataSource = {
      transaction: jest.fn(
        async (
          callback: (manager: {
            query: typeof query;
            createQueryBuilder: typeof createQueryBuilder;
          }) => unknown,
        ) => callback({ query, createQueryBuilder }),
      ),
    };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
    );
    const projection = {
      receiptId,
      workspaceId,
      draftId,
      contentDigest: computeActionContentDigest(
        JSON.stringify([subject, body]),
      ),
      actionName: 'send_outreach_email',
      providerMessageId,
    } as const;

    await writer.project(projection);
    await writer.project(projection);

    const actionSelect = query.mock.calls.find(([sql]) =>
      sql.includes('"_outreachAction"'),
    );
    expect(actionSelect?.[0]).toContain('FOR UPDATE');
    const messageSelect = query.mock.calls.find(
      ([sql]) => sql.includes('"message"') && sql.includes('"headerMessageId"'),
    );
    expect(messageSelect?.[1]).toEqual([providerMessageId, messageChannelId]);
    const actionUpdate = query.mock.calls.find(
      ([sql]) =>
        String(sql).trimStart().startsWith('UPDATE') &&
        sql.includes('"_outreachAction"'),
    );
    expect(actionUpdate?.[0]).toContain('"status" = \'SENT\'');
    expect(actionUpdate?.[1]).toEqual(
      expect.arrayContaining([
        receiptId,
        providerMessageId,
        'provider-message-id',
        'provider-thread-id',
        messageId,
        messageThreadId,
        draftId,
      ]),
    );
    expect(into).toHaveBeenCalledWith(
      expect.stringContaining('timelineActivity'),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: receiptId,
        name: 'outreachAction.sent',
        targetCampaignCreatorId: campaignCreatorId,
        properties: {
          outreachActionId: draftId,
          creatorId,
          campaignId,
          messageId,
          status: 'SENT',
        },
      }),
    );
    expect(orIgnore).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(
      query.mock.calls.filter(([sql]) =>
        String(sql).trimStart().startsWith('UPDATE'),
      ),
    ).toHaveLength(1);
  });

  it.each([
    ['changed content', true],
    ['missing sent Message', false],
  ])('rejects outreach projection with %s', async (_label, changedContent) => {
    const subject = 'Approved subject';
    const body = 'Approved body';
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('"timelineActivity"')) {
        return [];
      }
      if (sql.includes('"_outreachAction"')) {
        return [
          {
            subject,
            body: changedContent ? 'Changed body' : body,
            campaignCreatorId: 'campaign-creator-id',
            creatorId: 'creator-id',
            campaignId: 'campaign-id',
            connectedAccountId: 'connected-account-id',
            messageChannelId: 'message-channel-id',
            senderEmail: 'sender@example.com',
            providerDraftExternalId: 'provider-draft-id',
            providerThreadExternalId: null,
            messageThreadId: null,
            inReplyTo: null,
            executionReceiptId: null,
          },
        ];
      }
      if (sql.includes('"message"')) {
        return [];
      }

      return [];
    });
    const execute = jest.fn();
    const createQueryBuilder = jest.fn(() => ({
      insert: () => ({
        into: () => ({
          values: () => ({ orIgnore: () => ({ execute }) }),
        }),
      }),
    }));
    const dataSource = {
      transaction: jest.fn(
        async (
          callback: (manager: {
            query: typeof query;
            createQueryBuilder: typeof createQueryBuilder;
          }) => unknown,
        ) => callback({ query, createQueryBuilder }),
      ),
    };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
    );

    await expect(
      writer.project({
        receiptId: 'receipt-id',
        workspaceId: '00000000-0000-4000-8000-000000000020',
        draftId: 'draft-id',
        contentDigest: computeActionContentDigest(
          JSON.stringify([subject, body]),
        ),
        actionName: 'send_outreach_email',
        providerMessageId: '<sent@example.com>',
      } as never),
    ).rejects.toThrow(
      changedContent
        ? 'The approved outreach action is unavailable for projection'
        : 'The sent outreach Message is unavailable for projection',
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).trimStart().startsWith('UPDATE'),
      ),
    ).toBe(false);
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });
});
