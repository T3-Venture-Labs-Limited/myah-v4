import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { OutreachEmailDraftService } from 'src/engine/core-modules/outreach-email/services/outreach-email-draft.service';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000002';
const CAMPAIGN_CREATOR_ID = '00000000-0000-4000-8000-000000000003';
const CREATOR_ID = '00000000-0000-4000-8000-000000000004';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000005';
const CONNECTED_ACCOUNT_ID = '00000000-0000-4000-8000-000000000006';
const MESSAGE_CHANNEL_ID = '00000000-0000-4000-8000-000000000007';
const PARENT_MESSAGE_ID = '00000000-0000-4000-8000-000000000008';
const MESSAGE_THREAD_ID = '00000000-0000-4000-8000-000000000009';
const CREATOR_EMAIL = 'creator@example.com';
const PARENT_HEADER_MESSAGE_ID = '<parent@example.com>';

const campaignCreator = {
  id: CAMPAIGN_CREATOR_ID,
  name: 'Creator in launch campaign',
  creatorId: CREATOR_ID,
  campaignId: CAMPAIGN_ID,
  selectedContactMethod: 'email',
};
const creator = {
  id: CREATOR_ID,
  name: 'Creator Name',
  email: CREATOR_EMAIL,
};
const campaign = {
  id: CAMPAIGN_ID,
  name: 'Launch Campaign',
};

const connectedAccount = {
  id: CONNECTED_ACCOUNT_ID,
  workspaceId: WORKSPACE_ID,
  handle: 'sender@example.com',
  name: 'Sender Name',
  provider: ConnectedAccountProvider.GOOGLE,
  archivedAt: null,
  accessToken: null,
  refreshToken: null,
  connectionParameters: null,
} as unknown as ConnectedAccountEntity;

const messageChannel = {
  id: MESSAGE_CHANNEL_ID,
  workspaceId: WORKSPACE_ID,
  connectedAccountId: CONNECTED_ACCOUNT_ID,
  handle: connectedAccount.handle,
} as unknown as MessageChannelEntity;

const buildComposedEmail = (
  overrides: Partial<ComposedEmail> = {},
): ComposedEmail => ({
  recipients: { to: [CREATOR_EMAIL], cc: [], bcc: [] },
  toRecipientsDisplay: CREATOR_EMAIL,
  sanitizedSubject: 'Partnership opportunity',
  plainTextBody: 'Would you like to collaborate?',
  sanitizedHtmlBody: '<p>Would you like to collaborate?</p>',
  attachments: [],
  connectedAccount,
  messageChannelId: MESSAGE_CHANNEL_ID,
  shouldPersistMessage: true,
  ...overrides,
});

describe('OutreachEmailDraftService', () => {
  const campaignCreatorRepository = { findOne: jest.fn() };
  const creatorRepository = { findOne: jest.fn() };
  const campaignRepository = { findOne: jest.fn() };
  const outreachActionRepository = { save: jest.fn() };
  const messageRepository = { find: jest.fn() };
  const associationRepository = { find: jest.fn() };
  const workspaceRepositories: Record<string, unknown> = {
    campaignCreator: campaignCreatorRepository,
    creator: creatorRepository,
    campaign: campaignRepository,
    outreachAction: outreachActionRepository,
    message: messageRepository,
    messageChannelMessageAssociation: associationRepository,
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(),
    getRepository: jest.fn(),
  };

  const connectedAccountRepository = {
    findOne: jest.fn(),
  };
  const messageChannelRepository = {
    find: jest.fn(),
  };
  const createDraft = jest.fn();
  const deleteDraft = jest.fn();
  const messageOutboundService = {
    createDraft,
    deleteDraft,
  } as unknown as MessagingMessageOutboundService;

  let service: OutreachEmailDraftService;

  beforeEach(() => {
    jest.resetAllMocks();
    globalWorkspaceOrmManager.executeInWorkspaceContext.mockImplementation(
      async (callback: () => unknown) => callback(),
    );
    globalWorkspaceOrmManager.getRepository.mockImplementation(
      async (_workspaceId: string, objectName: string) =>
        workspaceRepositories[objectName],
    );
    campaignCreatorRepository.findOne.mockResolvedValue(campaignCreator);
    creatorRepository.findOne.mockResolvedValue(creator);
    campaignRepository.findOne.mockResolvedValue(campaign);
    outreachActionRepository.save.mockImplementation(async (value) => value);
    messageRepository.find.mockResolvedValue([]);
    associationRepository.find.mockResolvedValue([]);
    connectedAccountRepository.findOne.mockResolvedValue(connectedAccount);
    messageChannelRepository.find.mockResolvedValue([messageChannel]);
    createDraft.mockResolvedValue({
      headerMessageId: '<provider-draft@example.com>',
      draftExternalId: 'provider-draft-id',
      threadExternalId: 'provider-created-thread-id',
    });
    deleteDraft.mockResolvedValue(undefined);

    service = new OutreachEmailDraftService(
      globalWorkspaceOrmManager as unknown as GlobalWorkspaceOrmManager,
      connectedAccountRepository as unknown as Repository<ConnectedAccountEntity>,
      messageChannelRepository as unknown as Repository<MessageChannelEntity>,
      messageOutboundService,
    );
  });

  const resolveAuthority = (inReplyTo?: string) =>
    service.resolvePreparationAuthority({
      workspaceId: WORKSPACE_ID,
      campaignCreatorId: CAMPAIGN_CREATOR_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      inReplyTo,
    });

  it('loads canonical workspace records and persists one safe first-contact draft', async () => {
    const authority = await resolveAuthority();

    expect(authority).toMatchObject({
      workspaceId: WORKSPACE_ID,
      campaignCreatorId: CAMPAIGN_CREATOR_ID,
      creatorId: CREATOR_ID,
      campaignId: CAMPAIGN_ID,
      recipientEmail: CREATOR_EMAIL,
      recipientLabel: creator.name,
      campaignLabel: campaign.name,
      messageThreadId: null,
      messageThreadExternalId: null,
      mailboxSelection: {
        workspaceId: WORKSPACE_ID,
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        messageChannelId: MESSAGE_CHANNEL_ID,
        senderEmail: connectedAccount.handle,
        senderDisplayName: connectedAccount.name,
      },
    });
    expect(authority.outreachActionId).toEqual(expect.any(String));
    expect(authority.mailboxSelection.outreachActionId).toBe(
      authority.outreachActionId,
    );
    for (const objectName of ['campaignCreator', 'creator', 'campaign']) {
      expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
        WORKSPACE_ID,
        objectName,
        { shouldBypassPermissionChecks: true },
      );
    }

    const composedEmail = buildComposedEmail();
    const result = await service.persistPreparedDraft({
      authority,
      composedEmail,
    });
    const contentDigest = computeActionContentDigest(
      JSON.stringify([
        composedEmail.sanitizedSubject,
        composedEmail.plainTextBody,
      ]),
    );

    expect(createDraft).toHaveBeenCalledWith(
      {
        to: [CREATOR_EMAIL],
        subject: composedEmail.sanitizedSubject,
        body: composedEmail.plainTextBody,
        html: composedEmail.sanitizedHtmlBody,
        attachments: [],
        inReplyTo: undefined,
        threadExternalId: undefined,
        references: undefined,
      },
      connectedAccount,
    );
    expect(outreachActionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: authority.outreachActionId,
        campaignCreatorId: CAMPAIGN_CREATOR_ID,
        channel: 'EMAIL',
        status: 'PENDING',
        subject: composedEmail.sanitizedSubject,
        body: composedEmail.plainTextBody,
        contentDigest,
        recipientEmail: CREATOR_EMAIL,
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        messageChannelId: MESSAGE_CHANNEL_ID,
        senderEmail: connectedAccount.handle,
        senderDisplayName: connectedAccount.name,
        providerDraftExternalId: 'provider-draft-id',
        providerThreadExternalId: 'provider-created-thread-id',
        messageThreadId: null,
        inReplyTo: null,
      }),
    );
    expect(result).toEqual({
      workspaceId: WORKSPACE_ID,
      outreachActionId: authority.outreachActionId,
      campaignCreatorId: CAMPAIGN_CREATOR_ID,
      creatorId: CREATOR_ID,
      campaignId: CAMPAIGN_ID,
      recipientEmail: CREATOR_EMAIL,
      recipientLabel: creator.name,
      campaignLabel: campaign.name,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      messageChannelId: MESSAGE_CHANNEL_ID,
      senderEmail: connectedAccount.handle,
      senderDisplayName: connectedAccount.name,
      subject: composedEmail.sanitizedSubject,
      body: composedEmail.plainTextBody,
      contentDigest,
      providerDraftExternalId: 'provider-draft-id',
      providerThreadExternalId: 'provider-created-thread-id',
      headerMessageId: '<provider-draft@example.com>',
      inReplyTo: null,
      messageThreadId: null,
    });
    expect(result).not.toHaveProperty('connectedAccount');
    expect(result).not.toHaveProperty('connectionParameters');
    expect(result).not.toHaveProperty('accessToken');
  });

  it('accepts EMAIL case-insensitively and rejects missing relations or another method', async () => {
    await expect(resolveAuthority()).resolves.toBeDefined();

    campaignCreatorRepository.findOne.mockResolvedValueOnce({
      ...campaignCreator,
      creatorId: null,
    });
    await expect(resolveAuthority()).rejects.toThrow(
      'Campaign Creator must reference one Creator and one Campaign',
    );

    campaignCreatorRepository.findOne.mockResolvedValueOnce({
      ...campaignCreator,
      campaignId: null,
    });
    await expect(resolveAuthority()).rejects.toThrow(
      'Campaign Creator must reference one Creator and one Campaign',
    );

    campaignCreatorRepository.findOne.mockResolvedValueOnce({
      ...campaignCreator,
      selectedContactMethod: 'INSTAGRAM',
    });
    await expect(resolveAuthority()).rejects.toThrow(
      'Campaign Creator is not selected for email outreach',
    );
  });

  it.each([
    [
      'a different recipient',
      buildComposedEmail({
        recipients: { to: ['other@example.com'], cc: [], bcc: [] },
      }),
    ],
    [
      'a second recipient',
      buildComposedEmail({
        recipients: {
          to: [CREATOR_EMAIL, 'other@example.com'],
          cc: [],
          bcc: [],
        },
      }),
    ],
    [
      'a CC recipient',
      buildComposedEmail({
        recipients: { to: [CREATOR_EMAIL], cc: ['cc@example.com'], bcc: [] },
      }),
    ],
    [
      'a BCC recipient',
      buildComposedEmail({
        recipients: { to: [CREATOR_EMAIL], cc: [], bcc: ['bcc@example.com'] },
      }),
    ],
    [
      'an attachment',
      buildComposedEmail({
        attachments: [
          {
            filename: 'brief.txt',
            content: Buffer.from('brief'),
            contentType: 'text/plain',
          },
        ],
      }),
    ],
  ])('rejects composed email with %s', async (_label, composedEmail) => {
    const authority = await resolveAuthority();

    await expect(
      service.persistPreparedDraft({ authority, composedEmail }),
    ).rejects.toThrow('Composed outreach email does not match its authority');

    expect(createDraft).not.toHaveBeenCalled();
  });

  it.each([
    [
      'another workspace account',
      { ...connectedAccount, workspaceId: OTHER_WORKSPACE_ID },
      [messageChannel],
    ],
    [
      'an archived account',
      { ...connectedAccount, archivedAt: new Date() },
      [messageChannel],
    ],
    [
      'an unsupported email-group account',
      { ...connectedAccount, provider: ConnectedAccountProvider.EMAIL_GROUP },
      [messageChannel],
    ],
    [
      'another workspace channel',
      connectedAccount,
      [{ ...messageChannel, workspaceId: OTHER_WORKSPACE_ID }],
    ],
    [
      'another account channel',
      connectedAccount,
      [{ ...messageChannel, connectedAccountId: 'other-account-id' }],
    ],
    [
      'a channel with a different handle',
      connectedAccount,
      [{ ...messageChannel, handle: 'other-sender@example.com' }],
    ],
  ])('rejects %s', async (_label, account, channels) => {
    connectedAccountRepository.findOne.mockResolvedValueOnce(account);
    messageChannelRepository.find.mockResolvedValueOnce(channels);

    await expect(resolveAuthority()).rejects.toThrow(
      'Selected outreach mailbox is unavailable',
    );
  });

  it('snapshots only a parent message on the selected channel', async () => {
    messageRepository.find.mockResolvedValue([
      {
        id: PARENT_MESSAGE_ID,
        headerMessageId: PARENT_HEADER_MESSAGE_ID,
        messageThreadId: MESSAGE_THREAD_ID,
      },
    ]);
    associationRepository.find.mockResolvedValue([
      {
        id: 'association-id',
        messageId: PARENT_MESSAGE_ID,
        messageChannelId: MESSAGE_CHANNEL_ID,
        messageThreadExternalId: 'provider-parent-thread-id',
      },
    ]);

    const authority = await resolveAuthority(PARENT_HEADER_MESSAGE_ID);

    expect(authority).toMatchObject({
      inReplyTo: PARENT_HEADER_MESSAGE_ID,
      messageThreadId: MESSAGE_THREAD_ID,
      messageThreadExternalId: 'provider-parent-thread-id',
    });
    expect(messageRepository.find).toHaveBeenCalledWith({
      where: { headerMessageId: PARENT_HEADER_MESSAGE_ID },
      take: 2,
    });
    expect(associationRepository.find).toHaveBeenCalledWith({
      where: {
        messageId: PARENT_MESSAGE_ID,
        messageChannelId: MESSAGE_CHANNEL_ID,
      },
      take: 2,
    });
  });

  it('rejects a parent association outside the selected channel', async () => {
    messageRepository.find.mockResolvedValue([
      {
        id: PARENT_MESSAGE_ID,
        headerMessageId: PARENT_HEADER_MESSAGE_ID,
        messageThreadId: MESSAGE_THREAD_ID,
      },
    ]);
    associationRepository.find.mockResolvedValue([
      {
        id: 'association-id',
        messageId: PARENT_MESSAGE_ID,
        messageChannelId: 'another-channel-id',
        messageThreadExternalId: 'provider-parent-thread-id',
      },
    ]);

    await expect(resolveAuthority(PARENT_HEADER_MESSAGE_ID)).rejects.toThrow(
      'Reply parent does not belong to the selected mailbox',
    );
  });

  it('revalidates authority before creating a provider draft', async () => {
    const authority = await resolveAuthority();
    creatorRepository.findOne.mockResolvedValue({
      ...creator,
      email: 'changed@example.com',
    });

    await expect(
      service.persistPreparedDraft({
        authority,
        composedEmail: buildComposedEmail(),
      }),
    ).rejects.toThrow('Outreach preparation authority has changed');

    expect(createDraft).not.toHaveBeenCalled();
  });

  it('deletes the exact provider draft and preserves the save error', async () => {
    const authority = await resolveAuthority();
    const persistenceError = new Error('workspace persistence failed');

    outreachActionRepository.save.mockRejectedValueOnce(persistenceError);

    await expect(
      service.persistPreparedDraft({
        authority,
        composedEmail: buildComposedEmail(),
      }),
    ).rejects.toBe(persistenceError);
    expect(deleteDraft).toHaveBeenCalledWith(
      'provider-draft-id',
      connectedAccount,
    );
  });

  it('does not compensate when provider draft creation itself fails', async () => {
    const authority = await resolveAuthority();
    const providerError = new Error('provider credential=secret');

    createDraft.mockRejectedValueOnce(providerError);

    await expect(
      service.persistPreparedDraft({
        authority,
        composedEmail: buildComposedEmail(),
      }),
    ).rejects.toThrow('Provider draft creation failed');
    expect(outreachActionRepository.save).not.toHaveBeenCalled();
    expect(deleteDraft).not.toHaveBeenCalled();
  });
});
