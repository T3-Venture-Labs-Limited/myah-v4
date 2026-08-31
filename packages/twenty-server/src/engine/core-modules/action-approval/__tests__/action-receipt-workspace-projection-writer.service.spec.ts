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
          'connected-account-id',
          messageChannelId,
          'sender@example.com',
          senderDisplayName,
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([null, null, providerThreadExternalId]),
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
          role: 'creator',
        },
        {
          objectMetadataId: 'campaign-metadata-id',
          recordId: campaignId,
          role: 'campaign',
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
            'connected-account-id',
            'message-channel-id',
            'sender@example.com',
            null,
          ]),
        ),
        actionContextFingerprint: computeActionContentDigest(
          JSON.stringify([null, null, null]),
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
            role: 'creator',
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

  it('projects one native Inbox sent Message, clears only its approved revision, and replays after the draft is cleared', async () => {
    const workspaceId = '00000000-0000-4000-8000-000000000101';
    const messageThreadId = '00000000-0000-4000-8000-000000000102';
    const messageChannelId = '00000000-0000-4000-8000-000000000103';
    const parentMessageId = '00000000-0000-4000-8000-000000000104';
    const providerMessageId = '<sent@example.com>';
    const subject = 'Re: Partnership';
    const body = 'Thanks for the update';
    const projection = {
      receiptId: '00000000-0000-4000-8000-000000000105',
      workspaceId,
      draftId: messageThreadId,
      actionVersion: 1,
      threadId: messageThreadId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000106',
      actionName: 'send_inbox_reply' as const,
      contentDigest: computeActionContentDigest(
        JSON.stringify([subject, body]),
      ),
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify(['creator@example.com']),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          null,
          'connected-account-id',
          messageChannelId,
          'sender@example.com',
          'Sender',
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          4,
          '<incoming@example.com>',
          messageThreadId,
          'provider-thread-id',
          'incoming-provider-message-id',
          'connected-account-id',
          messageChannelId,
          'sender@example.com',
          'Sender',
        ]),
      ),
      providerMessageId,
      providerExternalMessageId: 'provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      evidenceLinks: [
        {
          objectMetadataId: 'message-thread-metadata-id',
          recordId: messageThreadId,
          role: 'draft',
        },
        {
          objectMetadataId: 'message-metadata-id',
          recordId: parentMessageId,
          role: 'thread_parent',
        },
      ],
    } as const;
    const canonicalGraph = {
      messageThreadId,
      draftRevision: 4,
      draftBody: { markdown: body, blocknote: null },
      connectedAccountId: 'connected-account-id',
      messageChannelId,
      senderEmail: 'sender@example.com',
      senderDisplayName: 'Sender',
      recipientEmail: 'creator@example.com',
      recipientLabel: 'Creator',
      subject,
      inReplyTo: '<incoming@example.com>',
      parentMessageId,
      providerMessageExternalId: 'incoming-provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      managedMailboxId: null,
      connectedAccount: {
        id: 'connected-account-id',
        workspaceId,
        handle: 'sender@example.com',
      },
    };
    const actionDefinition = {
      rebuildProjectionAuthority: jest.fn().mockResolvedValue({
        canonicalGraph,
        expectedActionBinding: { ...projection },
      }),
    };
    const operations: string[] = [];
    let messagePersisted = false;
    let duplicateCandidate = false;
    let revision = 4;
    let draftBody: string | null = body;
    const sentMessage = {
      id: '00000000-0000-4000-8000-000000000107',
      messageThreadId,
      subject,
      body,
      messageChannelId,
      messageExternalId: 'provider-message-id',
      messageThreadExternalId: 'provider-thread-id',
      recipientCount: 1,
      recipientEmail: 'creator@example.com',
      senderEmail: 'sender@example.com',
      senderCount: 1,
      senderDisplayName: 'Sender',
      connectedAccountId: 'connected-account-id',
      managedMailboxId: null,
      parentMessageId,
      parentHeaderMessageId: '<incoming@example.com>',
      parentMessageExternalId: 'incoming-provider-message-id',
      parentThreadExternalId: 'provider-thread-id',
    };
    const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('FOR UPDATE')) {
        operations.push('row-lock');
      }
      if (sql.includes('pg_advisory_xact_lock')) {
        return [];
      }
      if (sql.includes('core."objectMetadata"')) {
        return [
          {
            id: 'message-thread-metadata-id',
            universalIdentifier: parameters?.[1],
          },
          {
            id: 'message-metadata-id',
            universalIdentifier: parameters?.[2],
          },
        ];
      }
      if (sql.includes('"headerMessageId"')) {
        const matchesProviderIdentity =
          parameters?.[0] === providerMessageId ||
          parameters?.[1] === 'provider-message-id';
        if (!messagePersisted || !matchesProviderIdentity) {
          return [];
        }
        return duplicateCandidate
          ? [sentMessage, { ...sentMessage, id: 'different-message-id' }]
          : [sentMessage];
      }
      if (
        String(sql).trimStart().startsWith('UPDATE') &&
        sql.includes('"messageThread"')
      ) {
        operations.push('draft-cas');
        if (parameters?.[0] === messageThreadId && parameters?.[1] === 4) {
          draftBody = null;
          revision += 1;
          return [{ id: messageThreadId }];
        }
        return [];
      }
      if (sql.includes('"myahReplyDraftBody')) {
        return [
          {
            myahReplyDraftBody: draftBody,
            myahReplyDraftRevision: revision,
          },
        ];
      }
      return [];
    });
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: { query: typeof query }) => unknown) =>
          callback({ query }),
      ),
    };
    const persistSentMessage = jest.fn(async () => {
      operations.push('persist');
      messagePersisted = true;
      return { messageId: sentMessage.id, messageThreadId };
    });
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
      {} as never,
      { persistSentMessage } as never,
      actionDefinition as never,
    );

    await writer.project(projection);
    await writer.project(projection);

    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`myah-inbox-reply-projection:${workspaceId}:${messageThreadId}`],
    );
    expect(persistSentMessage).toHaveBeenCalledTimes(1);
    expect(operations).toEqual(['persist', 'draft-cas']);
    expect(persistSentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sendResult: {
          headerMessageId: providerMessageId,
          messageExternalId: 'provider-message-id',
          threadExternalId: 'provider-thread-id',
        },
        subject,
        body,
        recipients: { to: ['creator@example.com'], cc: [], bcc: [] },
        messageChannelId,
        inReplyTo: '<incoming@example.com>',
        parentThreadExternalId: 'provider-thread-id',
        workspaceId,
      }),
    );
    const messageLookup = query.mock.calls.find(([sql]) =>
      String(sql).includes('"recipientCount"'),
    );
    expect(messageLookup?.[0]).not.toContain('JOIN "messageParticipant"');
    expect(
      query.mock.calls.filter(
        ([sql]) =>
          String(sql).trimStart().startsWith('UPDATE') &&
          String(sql).includes('"messageThread"'),
      ),
    ).toHaveLength(1);
    expect(actionDefinition.rebuildProjectionAuthority).toHaveBeenCalledTimes(
      1,
    );

    draftBody = body;
    revision = 4;
    await writer.project(projection);
    expect(persistSentMessage).toHaveBeenCalledTimes(1);

    draftBody = body;
    revision = 4;
    sentMessage.senderEmail = 'unexpected@example.com';
    await expect(writer.project(projection)).rejects.toThrow(
      'The sent Inbox Message is unavailable for projection',
    );

    sentMessage.senderEmail = 'sender@example.com';
    draftBody = body;
    revision = 5;
    await expect(writer.project(projection)).rejects.toThrow(
      'The approved Inbox reply is unavailable for projection',
    );

    draftBody = body;
    revision = 4;
    await writer.project({
      ...projection,
      providerMessageId: '<alternate-sent@example.com>',
    });
    expect(persistSentMessage).toHaveBeenCalledTimes(1);

    duplicateCandidate = true;
    draftBody = null;
    revision = 5;
    await expect(writer.project(projection)).rejects.toThrow(
      'The sent Inbox Message is unavailable for projection',
    );
  });

  it.each([
    ['a content fingerprint mismatch', { contentDigest: 'wrong' }],
    ['a recipient fingerprint mismatch', { recipientFingerprint: 'wrong' }],
    ['a context fingerprint mismatch', { actionContextFingerprint: 'wrong' }],
    [
      'an evidence mismatch',
      {
        evidenceLinks: [
          {
            objectMetadataId: 'message-thread-metadata-id',
            recordId: 'different-thread-id',
            role: 'draft',
          },
        ],
      },
    ],
    [
      'a MessageThread metadata mismatch',
      {
        evidenceLinks: [
          {
            objectMetadataId: 'wrong-metadata-id',
            recordId: '00000000-0000-4000-8000-000000000112',
            role: 'draft',
          },
          {
            objectMetadataId: 'message-metadata-id',
            recordId: 'parent-message-id',
            role: 'thread_parent',
          },
        ],
      },
    ],
    [
      'an extra evidence link',
      {
        evidenceLinks: [
          {
            objectMetadataId: 'message-thread-metadata-id',
            recordId: '00000000-0000-4000-8000-000000000112',
            role: 'draft',
          },
          {
            objectMetadataId: 'message-metadata-id',
            recordId: 'parent-message-id',
            role: 'thread_parent',
          },
          {
            objectMetadataId: 'extra-metadata-id',
            recordId: 'extra-record-id',
            role: 'extra',
          },
        ],
      },
    ],
  ])('rejects an Inbox replay with %s', async (_label, override) => {
    const workspaceId = '00000000-0000-4000-8000-000000000111';
    const messageThreadId = '00000000-0000-4000-8000-000000000112';
    const subject = 'Re: Partnership';
    const body = 'Thanks for the update';
    const projection = {
      receiptId: 'receipt-id',
      workspaceId,
      draftId: messageThreadId,
      actionVersion: 1,
      threadId: messageThreadId,
      initiatorUserWorkspaceId: 'user-workspace-id',
      actionName: 'send_inbox_reply' as const,
      contentDigest: computeActionContentDigest(
        JSON.stringify([subject, body]),
      ),
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify(['creator@example.com']),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          null,
          'connected-account-id',
          'message-channel-id',
          'sender@example.com',
          'Sender',
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          4,
          '<incoming@example.com>',
          messageThreadId,
          'provider-thread-id',
          'incoming-provider-message-id',
          'connected-account-id',
          'message-channel-id',
          'sender@example.com',
          'Sender',
        ]),
      ),
      providerMessageId: '<sent@example.com>',
      providerExternalMessageId: 'provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      evidenceLinks: [
        {
          objectMetadataId: 'message-thread-metadata-id',
          recordId: messageThreadId,
          role: 'draft',
        },
        {
          objectMetadataId: 'message-metadata-id',
          recordId: 'parent-message-id',
          role: 'thread_parent',
        },
      ],
      ...override,
    };
    const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return [];
      }
      if (sql.includes('core."objectMetadata"')) {
        return [
          {
            id: 'message-thread-metadata-id',
            universalIdentifier: parameters?.[1],
          },
          {
            id: 'message-metadata-id',
            universalIdentifier: parameters?.[2],
          },
        ];
      }
      if (sql.includes('"headerMessageId"')) {
        return [
          {
            id: 'message-id',
            messageThreadId,
            subject,
            body,
            messageChannelId: 'message-channel-id',
            messageExternalId: 'provider-message-id',
            messageThreadExternalId: 'provider-thread-id',
            recipientEmail: 'creator@example.com',
            recipientCount: 1,
            senderEmail: 'sender@example.com',
            senderCount: 1,
            connectedAccountId: 'connected-account-id',
            parentMessageId: 'parent-message-id',
            parentHeaderMessageId: '<incoming@example.com>',
            parentMessageExternalId: 'incoming-provider-message-id',
            parentThreadExternalId: 'provider-thread-id',
          },
        ];
      }
      if (sql.includes('"myahReplyDraftBody')) {
        return [{ myahReplyDraftBody: null, myahReplyDraftRevision: 5 }];
      }
      return [];
    });
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: { query: typeof query }) => unknown) =>
          callback({ query }),
      ),
    };
    const Writer =
      ActionReceiptWorkspaceProjectionWriterService as unknown as new (
        ...args: unknown[]
      ) => { project: (input: typeof projection) => Promise<void> };
    const writer = new Writer(
      dataSource,
      {} as never,
      { persistSentMessage: jest.fn() },
      { rebuildProjectionAuthority: jest.fn() },
    );

    await expect(writer.project(projection)).rejects.toThrow(
      'The sent Inbox Message is unavailable for projection',
    );
  });
});

describe('Inbox projected Message association grouping', () => {
  const setup = ({
    draftBody,
    revision,
    associationMode,
  }: {
    draftBody: string | null;
    revision: number;
    associationMode:
      | 'one-matching-and-one-nonmatching'
      | 'two-matching-associations'
      | 'two-distinct-messages'
      | 'two-matching-associations-and-message'
      | 'matching-and-content-mismatched-messages';
  }) => {
    const workspaceId = '00000000-0000-4000-8000-000000000201';
    const messageThreadId = '00000000-0000-4000-8000-000000000202';
    const messageChannelId = '00000000-0000-4000-8000-000000000203';
    const parentMessageId = '00000000-0000-4000-8000-000000000204';
    const subject = 'Re: Partnership';
    const body = 'Thanks for the update';
    const projection = {
      receiptId: '00000000-0000-4000-8000-000000000205',
      workspaceId,
      draftId: messageThreadId,
      actionVersion: 1,
      threadId: messageThreadId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000206',
      actionName: 'send_inbox_reply' as const,
      contentDigest: computeActionContentDigest(
        JSON.stringify([subject, body]),
      ),
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify(['creator@example.com']),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          null,
          'connected-account-id',
          messageChannelId,
          'sender@example.com',
          'Sender',
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          4,
          '<incoming@example.com>',
          messageThreadId,
          'provider-thread-id',
          'incoming-provider-message-id',
          'connected-account-id',
          messageChannelId,
          'sender@example.com',
          'Sender',
        ]),
      ),
      providerMessageId: '<sent@example.com>',
      providerExternalMessageId: 'provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      evidenceLinks: [
        {
          objectMetadataId: 'message-thread-metadata-id',
          recordId: messageThreadId,
          role: 'draft',
        },
        {
          objectMetadataId: 'message-metadata-id',
          recordId: parentMessageId,
          role: 'thread_parent',
        },
      ],
    } as const;
    const canonicalGraph = {
      messageThreadId,
      draftRevision: 4,
      draftBody: { markdown: body, blocknote: null },
      connectedAccountId: 'connected-account-id',
      messageChannelId,
      senderEmail: 'sender@example.com',
      senderDisplayName: 'Sender',
      recipientEmail: 'creator@example.com',
      recipientLabel: 'Creator',
      subject,
      inReplyTo: '<incoming@example.com>',
      parentMessageId,
      providerMessageExternalId: 'incoming-provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      managedMailboxId: null,
      connectedAccount: {
        id: 'connected-account-id',
        workspaceId,
        handle: 'sender@example.com',
      },
    };
    const sentMessage = {
      id: '00000000-0000-4000-8000-000000000207',
      messageThreadId,
      subject,
      body,
      messageChannelId,
      messageExternalId: 'provider-message-id',
      messageThreadExternalId: 'provider-thread-id',
      recipientCount: 1,
      recipientEmail: 'creator@example.com',
      senderEmail: 'sender@example.com',
      senderCount: 1,
      senderDisplayName: 'Sender',
      connectedAccountId: 'connected-account-id',
      managedMailboxId: null,
      parentMessageId,
      parentHeaderMessageId: '<incoming@example.com>',
      parentMessageExternalId: 'incoming-provider-message-id',
      parentThreadExternalId: 'provider-thread-id',
    };
    const sentMessages =
      associationMode === 'one-matching-and-one-nonmatching'
        ? [
            sentMessage,
            {
              ...sentMessage,
              messageExternalId: 'other-provider-message-id',
            },
          ]
        : associationMode === 'two-matching-associations'
          ? [sentMessage, { ...sentMessage }]
          : associationMode === 'two-distinct-messages'
            ? [
                { ...sentMessage },
                { ...sentMessage, id: 'different-message-id' },
              ]
            : associationMode === 'two-matching-associations-and-message'
              ? [
                  sentMessage,
                  { ...sentMessage },
                  { ...sentMessage, id: 'different-message-id' },
                ]
              : [
                  sentMessage,
                  {
                    ...sentMessage,
                    id: 'different-message-id',
                    body: 'A different provider candidate',
                  },
                ];
    const actionDefinition = {
      rebuildProjectionAuthority: jest.fn().mockResolvedValue({
        canonicalGraph,
        expectedActionBinding: projection,
      }),
    };
    const query = jest.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return [];
      }
      if (sql.includes('core."objectMetadata"')) {
        return [
          {
            id: 'message-thread-metadata-id',
            universalIdentifier: parameters?.[1],
          },
          {
            id: 'message-metadata-id',
            universalIdentifier: parameters?.[2],
          },
        ];
      }
      if (sql.includes('"headerMessageId"')) {
        return sentMessages;
      }
      if (
        String(sql).trimStart().startsWith('UPDATE') &&
        sql.includes('"messageThread"')
      ) {
        return [{ id: messageThreadId }];
      }
      if (sql.includes('"myahReplyDraftBody"')) {
        return [
          {
            myahReplyDraftBody: draftBody,
            myahReplyDraftRevision: revision,
          },
        ];
      }
      return [];
    });
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: { query: typeof query }) => unknown) =>
          callback({ query }),
      ),
    };
    const persistSentMessage = jest.fn();
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource as never,
      {} as never,
      { persistSentMessage } as never,
      actionDefinition as never,
    );

    return { actionDefinition, persistSentMessage, projection, query, writer };
  };

  it.each([
    ['an active draft projection', 'Thanks for the update', 4, 1],
    ['a cleared-draft replay', null, 5, 0],
  ])(
    'accepts one matching and one nonmatching association for %s',
    async (_label, draftBody, revision, authorityCalls) => {
      const fixture = setup({
        draftBody,
        revision,
        associationMode: 'one-matching-and-one-nonmatching',
      });

      await fixture.writer.project(fixture.projection);

      expect(fixture.persistSentMessage).not.toHaveBeenCalled();
      expect(
        fixture.actionDefinition.rebuildProjectionAuthority,
      ).toHaveBeenCalledTimes(authorityCalls);
    },
  );

  it.each([
    [
      'two matching associations on one Message',
      'Thanks for the update',
      4,
      1,
      'two-matching-associations',
    ],
    ['two matching distinct Message IDs', null, 5, 0, 'two-distinct-messages'],
  ] as const)(
    'rejects %s without hiding candidates behind a SQL row limit',
    async (_label, draftBody, revision, authorityCalls, associationMode) => {
      const fixture = setup({ draftBody, revision, associationMode });

      await expect(fixture.writer.project(fixture.projection)).rejects.toThrow(
        'The sent Inbox Message is unavailable for projection',
      );

      expect(fixture.persistSentMessage).not.toHaveBeenCalled();
      expect(
        fixture.actionDefinition.rebuildProjectionAuthority,
      ).toHaveBeenCalledTimes(authorityCalls);
      const lookups = fixture.query.mock.calls.filter(([sql]) =>
        String(sql).includes('"headerMessageId"'),
      );
      expect(lookups).toHaveLength(1);
      expect(lookups.every(([sql]) => !/\bLIMIT\b/i.test(String(sql)))).toBe(
        true,
      );
    },
  );
  it.each([
    [
      'two matching associations on Message A plus Message B',
      'two-matching-associations-and-message',
      'Thanks for the update',
      4,
      1,
    ],
    [
      'Message A matching plus content-mismatched provider candidate Message B',
      'matching-and-content-mismatched-messages',
      null,
      5,
      0,
    ],
  ] as const)(
    'rejects ambiguous provider-identity candidates for %s',
    async (_label, associationMode, draftBody, revision, authorityCalls) => {
      const fixture = setup({ associationMode, draftBody, revision });

      await expect(fixture.writer.project(fixture.projection)).rejects.toThrow(
        'The sent Inbox Message is unavailable for projection',
      );

      expect(fixture.persistSentMessage).not.toHaveBeenCalled();
      expect(
        fixture.actionDefinition.rebuildProjectionAuthority,
      ).toHaveBeenCalledTimes(authorityCalls);
    },
  );
});
