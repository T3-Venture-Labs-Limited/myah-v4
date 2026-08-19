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
      getReplyBriefing: jest
        .fn()
        .mockResolvedValue({ thread: { id: threadId } }),
      generateReplyProposal: jest.fn().mockResolvedValue({
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

  it('returns the selected-thread reply briefing and proposal', async () => {
    const briefing = {
      thread: { id: threadId, subject: 'Hello' },
      history: [
        {
          receivedAt: '2026-07-24T09:00:00.000Z',
          sender: 'creator@example.com',
          subject: 'Hello',
          text: 'Can we launch next Tuesday?',
        },
      ],
      campaign: {
        objective: 'Recruit reviewers',
        icpGoal: 'Reach skincare shoppers',
        agent: {
          campaignBrief: 'Hydration launch',
          communicationGuidelines: 'Be warm',
          replyRules: 'No compensation promises',
          escalationBoundaries: 'Escalate contracts',
          additionalNotes: 'Confirm shade',
        },
      },
      campaignCreator: {
        stage: 'SHORTLISTED',
        selectedContactMethod: 'Email',
        nextActionAt: '2026-07-25T10:00:00.000Z',
        selectionReason: 'Relevant content',
        dealSummary: 'Gifted collaboration',
      },
      creator: {
        name: 'Ada Creator',
        language: 'English',
        location: 'London',
        categories: ['Beauty'],
        niches: ['Skincare'],
      },
    };
    const proposal = {
      body: { markdown: 'Thanks!', blocknote: null },
    };
    const proposalService = {
      getReplyBriefing: jest.fn().mockResolvedValue(briefing),
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
      result: briefing,
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

    expect(proposalService.getReplyBriefing).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId,
    });
    expect(proposalService.generateReplyProposal).toHaveBeenCalledWith({
      authContext: userAuthContext,
      threadId,
      operatorInstructions: 'Thank them and confirm Tuesday.',
    });
  });
});
