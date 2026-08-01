import { type ToolSet } from 'ai';

import { MyahInboxToolWorkspaceService } from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const foreignThreadId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const workspace = { id: workspaceId };
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

const context = {
  workspaceId,
  roleId: '20202020-0b5c-4178-bed7-d371f6411eab',
  rolePermissionConfig: { unionOf: ['20202020-0b5c-4178-bed7-d371f6411eab'] },
  authContext: userAuthContext,
  userId,
  userWorkspaceId,
  actorContext: {
    source: 'AGENT',
    workspaceMemberId,
    name: 'Operator',
    context: {},
  },
  myahInboxSelection: {
    workspaceId,
    threadId,
  },
};

const executeTool = async (
  toolSet: ToolSet,
  name: string,
  args: Record<string, unknown>,
) => {
  const selectedTool = toolSet[name] as unknown as {
    execute: (parameters: Record<string, unknown>) => Promise<unknown>;
  };

  return selectedTool.execute(args);
};

describe('MyahInboxToolWorkspaceService', () => {
  it('exposes exactly the selected-thread context and reply-proposal tools', async () => {
    const proposalService = {
      getThreadContext: jest.fn().mockResolvedValue({ id: threadId }),
      generateReplyProposal: jest.fn().mockResolvedValue({
        subject: 'Re: Hello',
        body: { markdown: 'Thanks!', blocknote: null },
      }),
    };
    const service = new MyahInboxToolWorkspaceService(proposalService as never);

    const toolSet = await service.generateMyahInboxTools(context as never);

    expect(Object.keys(toolSet).sort()).toEqual([
      'generate_myah_inbox_reply_proposal',
      'get_myah_inbox_thread_context',
    ]);
    expect(Object.keys(toolSet)).not.toEqual(
      expect.arrayContaining([
        'update_myah_inbox_thread',
        'set_myah_inbox_owner',
        'set_myah_inbox_campaign',
        'snooze_myah_inbox_thread',
        'save_myah_inbox_draft',
        'send_myah_inbox_reply',
      ]),
    );
  });

  it('returns ToolOutput from the shared read and proposal service without writes or provider sends', async () => {
    const thread = { id: threadId, subject: 'Hello' };
    const proposal = {
      subject: 'Re: Hello',
      body: { markdown: 'Thanks!', blocknote: null },
    };
    const draftRepositoryUpdate = jest.fn();
    const messageProviderSend = jest.fn();
    const proposalService = {
      getThreadContext: jest.fn().mockResolvedValue(thread),
      generateReplyProposal: jest.fn().mockResolvedValue(proposal),
    };
    const service = new MyahInboxToolWorkspaceService(proposalService as never);
    const toolSet = await service.generateMyahInboxTools(context as never);

    await expect(
      executeTool(toolSet, 'get_myah_inbox_thread_context', {
        threadId: foreignThreadId,
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Retrieved Myah Inbox thread context',
      result: thread,
    });
    await expect(
      executeTool(toolSet, 'generate_myah_inbox_reply_proposal', {
        threadId: foreignThreadId,
        operatorInstructions: 'Thank them and confirm Tuesday.',
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Generated Myah Inbox reply proposal',
      result: proposal,
    });

    expect(proposalService.getThreadContext).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId,
    });
    expect(proposalService.generateReplyProposal).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId,
      operatorInstructions: 'Thank them and confirm Tuesday.',
    });
    expect(draftRepositoryUpdate).not.toHaveBeenCalled();
    expect(messageProviderSend).not.toHaveBeenCalled();
  });
});
