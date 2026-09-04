import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type OutreachEmailDraftService } from 'src/engine/core-modules/outreach-email/services/outreach-email-draft.service';
import { type OutreachPreparationAuthority } from 'src/engine/core-modules/outreach-email/types/outreach-email.type';
import { type EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { OutreachEmailDraftInputZodSchema } from 'src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema';
import { PrepareOutreachEmailDraftTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/prepare-outreach-email-draft-tool';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const USER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000002';
const THREAD_ID = '00000000-0000-4000-8000-000000000003';
const CAMPAIGN_CREATOR_ID = '00000000-0000-4000-8000-000000000004';
const CONNECTED_ACCOUNT_ID = '00000000-0000-4000-8000-000000000005';
const MESSAGE_CHANNEL_ID = '00000000-0000-4000-8000-000000000006';
const OUTREACH_ACTION_ID = '00000000-0000-4000-8000-000000000007';
const CREATOR_ID = '00000000-0000-4000-8000-000000000008';
const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000009';

const input = {
  campaignCreatorId: CAMPAIGN_CREATOR_ID,
  connectedAccountId: CONNECTED_ACCOUNT_ID,
  subject: 'Partnership opportunity',
  body: '<p>Would you like to collaborate?</p>',
};

const authority: OutreachPreparationAuthority = {
  workspaceId: WORKSPACE_ID,
  outreachActionId: OUTREACH_ACTION_ID,
  campaignCreatorId: CAMPAIGN_CREATOR_ID,
  creatorId: CREATOR_ID,
  campaignId: CAMPAIGN_ID,
  recipientEmail: 'creator@example.com',
  recipientLabel: 'Creator Name',
  campaignLabel: 'Launch Campaign',
  campaignAccountId: null,
  mailboxSelection: {
    workspaceId: WORKSPACE_ID,
    outreachActionId: OUTREACH_ACTION_ID,
    connectedAccountId: CONNECTED_ACCOUNT_ID,
    messageChannelId: MESSAGE_CHANNEL_ID,
    senderEmail: 'sender@example.com',
    senderDisplayName: 'Sender Name',
  },
  inReplyTo: null,
  messageThreadId: null,
  messageThreadExternalId: null,
};

const connectedAccount = {
  id: CONNECTED_ACCOUNT_ID,
  workspaceId: WORKSPACE_ID,
  provider: ConnectedAccountProvider.GOOGLE,
  handle: authority.mailboxSelection.senderEmail,
} as unknown as ConnectedAccountEntity;

const composedEmail = {
  recipients: { to: [authority.recipientEmail], cc: [], bcc: [] },
  toRecipientsDisplay: authority.recipientEmail,
  sanitizedSubject: input.subject,
  plainTextBody: 'Would you like to collaborate?',
  sanitizedHtmlBody: input.body,
  attachments: [],
  connectedAccount,
  messageChannelId: MESSAGE_CHANNEL_ID,
  shouldPersistMessage: true,
};

const preparedDraft = {
  workspaceId: WORKSPACE_ID,
  outreachActionId: OUTREACH_ACTION_ID,
  campaignCreatorId: CAMPAIGN_CREATOR_ID,
  creatorId: CREATOR_ID,
  campaignId: CAMPAIGN_ID,
  recipientEmail: authority.recipientEmail,
  recipientLabel: authority.recipientLabel,
  campaignLabel: authority.campaignLabel,
  connectedAccountId: CONNECTED_ACCOUNT_ID,
  messageChannelId: MESSAGE_CHANNEL_ID,
  senderEmail: authority.mailboxSelection.senderEmail,
  senderDisplayName: authority.mailboxSelection.senderDisplayName,
  subject: input.subject,
  body: composedEmail.plainTextBody,
  contentDigest: 'a'.repeat(64),
  providerDraftExternalId: 'provider-draft-id',
  providerThreadExternalId: null,
  headerMessageId: '<provider-draft@example.com>',
  inReplyTo: null,
  messageThreadId: null,
};
const { headerMessageId: providerDraftHeaderMessageId, ...safePreparedDraft } =
  preparedDraft;
const preparedToolResult = {
  ...safePreparedDraft,
  providerDraftHeaderMessageId,
};

const buildTool = () => {
  const resolvePreparationAuthority = jest.fn().mockResolvedValue(authority);
  const persistPreparedDraft = jest.fn().mockResolvedValue(preparedDraft);
  const composeEmail = jest.fn().mockResolvedValue({
    success: true,
    data: composedEmail,
  });
  const outreachEmailDraftService = {
    resolvePreparationAuthority,
    persistPreparedDraft,
  } as unknown as OutreachEmailDraftService;
  const emailComposerService = {
    composeEmail,
  } as unknown as EmailComposerService;

  return {
    resolvePreparationAuthority,
    persistPreparedDraft,
    composeEmail,
    tool: new PrepareOutreachEmailDraftTool(
      outreachEmailDraftService,
      emailComposerService,
    ),
  };
};

describe('PrepareOutreachEmailDraftTool', () => {
  it('has strict input with no caller-controlled recipient', () => {
    expect(OutreachEmailDraftInputZodSchema.safeParse(input).success).toBe(
      true,
    );
    expect(
      OutreachEmailDraftInputZodSchema.safeParse({
        ...input,
        recipient: 'other@example.com',
      }).success,
    ).toBe(false);
  });

  it('requires an authenticated member-bound chat thread', async () => {
    const {
      tool,
      resolvePreparationAuthority,
      composeEmail,
      persistPreparedDraft,
    } = buildTool();

    await expect(
      tool.execute(input, {
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
      }),
    ).resolves.toMatchObject({ success: false });

    expect(resolvePreparationAuthority).not.toHaveBeenCalled();
    expect(composeEmail).not.toHaveBeenCalled();
    expect(persistPreparedDraft).not.toHaveBeenCalled();
  });

  it('resolves authority before composing only to the canonical Creator email', async () => {
    const {
      tool,
      resolvePreparationAuthority,
      composeEmail,
      persistPreparedDraft,
    } = buildTool();
    const context = {
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      threadId: THREAD_ID,
    };

    await expect(tool.execute(input, context)).resolves.toEqual({
      success: true,
      message: 'Outreach email draft prepared for approval.',
      result: preparedToolResult,
    });

    expect(resolvePreparationAuthority).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      campaignCreatorId: CAMPAIGN_CREATOR_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      inReplyTo: undefined,
    });
    expect(composeEmail).toHaveBeenCalledWith(
      {
        recipients: { to: authority.recipientEmail },
        connectedAccountId: CONNECTED_ACCOUNT_ID,
        subject: input.subject,
        body: input.body,
        files: [],
        inReplyTo: undefined,
      },
      context,
    );
    expect(persistPreparedDraft).toHaveBeenCalledWith({
      authority,
      composedEmail,
    });
    expect(
      resolvePreparationAuthority.mock.invocationCallOrder[0],
    ).toBeLessThan(composeEmail.mock.invocationCallOrder[0]);
    expect(composeEmail.mock.invocationCallOrder[0]).toBeLessThan(
      persistPreparedDraft.mock.invocationCallOrder[0],
    );
  });

  it('does not persist when composition fails', async () => {
    const { tool, composeEmail, persistPreparedDraft } = buildTool();
    const composerOutput = {
      success: false,
      message: 'Invalid email',
      error: 'Invalid email',
    };

    composeEmail.mockResolvedValueOnce({
      success: false,
      output: composerOutput,
    });

    await expect(
      tool.execute(input, {
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
        threadId: THREAD_ID,
      }),
    ).resolves.toEqual(composerOutput);
    expect(persistPreparedDraft).not.toHaveBeenCalled();
  });
});
