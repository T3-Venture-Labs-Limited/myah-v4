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
      {} as never,
      {} as never,
      {} as never,
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
      {} as never,
      {} as never,
      {} as never,
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
    const campaignCreatorObjectMetadataId =
      '00000000-0000-4000-8000-000000000020';
    const creatorId = '00000000-0000-4000-8000-000000000015';
    const campaignId = '00000000-0000-4000-8000-000000000016';
    const campaignAccountId = '00000000-0000-4000-8000-000000000022';
    const messageChannelId = '00000000-0000-4000-8000-000000000017';
    const messageId = '00000000-0000-4000-8000-000000000018';
    const messageThreadId = '00000000-0000-4000-8000-000000000019';
    const providerMessageId = '<sent@example.com>';
    const providerExternalMessageId = 'provider-message-id';
    const providerThreadExternalId = 'provider-thread-id';
    const senderDisplayName = 'Sender Name';
    const subject = 'Approved subject';
    const body = 'Approved body';
    let projected = false;
    let messageAvailable = false;
    const query = jest.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.includes('FROM') && sql.includes('"timelineActivity"')) {
        return projected ? [{ id: receiptId }] : [];
      }
      if (sql.includes('core."objectMetadata"')) {
        return [{ id: campaignCreatorObjectMetadataId }];
      }
      if (
        sql.includes('FROM') &&
        sql.includes('"outreachAction"') &&
        sql.includes('"campaignCreator"') &&
        sql.includes('"status" = \'PENDING\'')
      ) {
        return [
          {
            subject,
            recipientEmail: 'creator@example.com',
            body,
            campaignCreatorId,
            creatorId,
            campaignId,
            assignedManagedMailboxId: null,
            campaignAccountId,
            connectedAccountId: 'connected-account-id',
            messageChannelId,
            senderEmail: 'sender@example.com',
            senderDisplayName,
            providerDraftExternalId: 'provider-draft-id',
            providerThreadExternalId: 'provider-thread-id',
            messageThreadId: null,
            inReplyTo: null,
            executionReceiptId: null,
          },
        ];
      }
      if (
        messageAvailable &&
        sql.includes('FROM') &&
        sql.includes('"message"')
      ) {
        return [
          {
            id: messageId,
            messageThreadId,
            messageExternalId: providerExternalMessageId,
            messageThreadExternalId: providerThreadExternalId,
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
      query,
      transaction: jest.fn(
        async (
          callback: (manager: {
            query: typeof query;
            createQueryBuilder: typeof createQueryBuilder;
          }) => unknown,
        ) => callback({ query, createQueryBuilder }),
      ),
    };
    const persistSentMessage = jest.fn(async () => {
      messageAvailable = true;
      return { messageId, messageThreadId };
    });
    const connectedAccountRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'connected-account-id',
        workspaceId,
        handle: 'sender@example.com',
        archivedAt: null,
      }),
    };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
      connectedAccountRepository as never,
      { persistSentMessage } as never,
      {} as never,
    );
    const projection = {
      receiptId,
      workspaceId,
      actionVersion: 1,
      threadId: draftId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000021',
      draftId,
      contentDigest: computeActionContentDigest(
        JSON.stringify([subject, body]),
      ),
      actionName: 'send_outreach_email',
      providerMessageId,
      providerExternalMessageId,
      providerThreadExternalId,
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify(['creator@example.com']),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          null,
          campaignAccountId,
          'connected-account-id',
          messageChannelId,
          'sender@example.com',
          senderDisplayName,
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          'provider-draft-id',
          null,
          null,
          providerThreadExternalId,
        ]),
      ),
      evidenceLinks: [
        {
          objectMetadataId: 'campaign-creator-metadata-id',
          recordId: campaignCreatorId,
          role: 'campaign_creator',
        },
        {
          objectMetadataId: 'creator-metadata-id',
          recordId: creatorId,
          role: 'recipient',
        },
        {
          objectMetadataId: 'campaign-metadata-id',
          recordId: campaignId,
          role: 'campaign',
        },
        {
          objectMetadataId: 'campaign-account-metadata-id',
          recordId: campaignAccountId,
          role: 'campaign_account',
        },
      ],
    } as const;

    await writer.project(projection);
    await writer.project(projection);

    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`outreach-action-projection:${workspaceId}:${draftId}`],
    );
    const actionSelect = query.mock.calls.find(
      ([sql]) =>
        sql.includes('"outreachAction"') &&
        sql.includes('"campaignCreator"') &&
        sql.includes('FOR UPDATE'),
    );
    expect(actionSelect?.[0]).toContain('FOR UPDATE');
    expect(actionSelect?.[0]).toContain(
      'campaign_creator."assignedManagedMailboxId"',
    );
    expect(actionSelect?.[0]).toContain('outreach_action."campaignAccountId"');
    expect(actionSelect?.[0]).not.toContain('"_outreachAction"');
    const messageSelect = query.mock.calls.find(
      ([sql]) => sql.includes('"message"') && sql.includes('"headerMessageId"'),
    );
    expect(messageSelect?.[1]).toEqual([providerMessageId, messageChannelId]);
    const actionUpdate = query.mock.calls.find(
      ([sql]) =>
        String(sql).trimStart().startsWith('UPDATE') &&
        sql.includes('"outreachAction"'),
    );
    expect(actionUpdate?.[0]).toContain('"status" = \'APPLIED\'');
    expect(actionUpdate?.[0]).toContain('AND "status" = \'PENDING\'');
    expect(actionUpdate?.[1]).toEqual(
      expect.arrayContaining([
        receiptId,
        providerMessageId,
        providerExternalMessageId,
        providerThreadExternalId,
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
        linkedRecordId: campaignCreatorId,
        linkedObjectMetadataId: campaignCreatorObjectMetadataId,
        properties: {
          outreachActionId: draftId,
          creatorId,
          campaignId,
          messageId,
          status: 'SENT',
        },
      }),
    );
    expect(values).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetCampaignCreatorId: expect.anything() }),
    );
    expect(persistSentMessage).toHaveBeenCalledTimes(1);
    expect(persistSentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sendResult: {
          headerMessageId: providerMessageId,
          messageExternalId: providerExternalMessageId,
          threadExternalId: providerThreadExternalId,
        },
        subject,
        body,
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        messageChannelId,
        workspaceId,
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
      if (
        sql.includes('"outreachAction"') &&
        sql.includes('"campaignCreator"')
      ) {
        return [
          {
            subject,
            body: changedContent ? 'Changed body' : body,
            recipientEmail: 'creator@example.com',
            campaignCreatorId: 'campaign-creator-id',
            creatorId: 'creator-id',
            campaignId: 'campaign-id',
            assignedManagedMailboxId: null,
            campaignAccountId: null,
            connectedAccountId: 'connected-account-id',
            messageChannelId: 'message-channel-id',
            senderEmail: 'sender@example.com',
            senderDisplayName: null,
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
      query,
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
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { persistSentMessage: jest.fn() } as never,
      {} as never,
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
        providerExternalMessageId: null,
        providerThreadExternalId: null,
        recipientFingerprint: computeActionContentDigest(
          JSON.stringify(['creator@example.com']),
        ),
        sendingAccountFingerprint: computeActionContentDigest(
          JSON.stringify([
            null,
            null,
            'connected-account-id',
            'message-channel-id',
            'sender@example.com',
            null,
          ]),
        ),
        actionContextFingerprint: computeActionContentDigest(
          JSON.stringify(['provider-draft-id', null, null, null]),
        ),
        evidenceLinks: [
          {
            objectMetadataId: 'campaign-creator-metadata-id',
            recordId: 'campaign-creator-id',
            role: 'campaign_creator',
          },
          {
            objectMetadataId: 'creator-metadata-id',
            recordId: 'creator-id',
            role: 'recipient',
          },
          {
            objectMetadataId: 'campaign-metadata-id',
            recordId: 'campaign-id',
            role: 'campaign',
          },
        ],
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

  it('dispatches an Inbox receipt to the Inbox projection service', async () => {
    const inboxProjectionService = { project: jest.fn() };
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      {} as never,
      {} as never,
      {} as never,
      inboxProjectionService as never,
    );
    const input = {
      workspaceId: '00000000-0000-4000-8000-000000000001',
      actionName: 'send_inbox_reply' as const,
    } as never;

    await writer.project(input);

    expect(inboxProjectionService.project).toHaveBeenCalledWith(input);
  });
});
