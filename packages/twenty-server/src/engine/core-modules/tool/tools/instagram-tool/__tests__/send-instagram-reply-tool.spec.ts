import { SendInstagramReplyTool } from 'src/engine/core-modules/tool/tools/instagram-tool/send-instagram-reply-tool';

const actionApprovalBindingId = '00000000-0000-4000-8000-000000000001';
const context = {
  workspaceId: 'workspace-id',
  userWorkspaceId: 'user-workspace-id',
  threadId: 'thread-id',
  rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
};

describe('SendInstagramReplyTool', () => {
  it('delegates the approved AgentChatThread reply to the single Unipile v2 authority', async () => {
    const sendService = {
      executeApproved: jest.fn().mockResolvedValue({
        status: 'SENT',
        receiptId: 'receipt-id',
      }),
    };
    const tool = new SendInstagramReplyTool(sendService as never);

    await expect(
      tool.execute({ actionApprovalBindingId }, context),
    ).resolves.toMatchObject({
      success: true,
      message: 'Instagram reply accepted.',
      result: { status: 'SENT', receiptId: 'receipt-id' },
    });
    expect(sendService.executeApproved).toHaveBeenCalledWith({
      workspaceId: context.workspaceId,
      initiatorUserWorkspaceId: context.userWorkspaceId,
      approvalBindingId: actionApprovalBindingId,
      threadId: context.threadId,
      interactionContextType: null,
      interactionContextId: null,
      rolePermissionConfig: context.rolePermissionConfig,
    });
    expect(Object.keys(sendService)).toEqual(['executeApproved']);
  });

  it('never forwards caller-forged manual eligibility from an agent tool context', async () => {
    const sendService = {
      executeApproved: jest
        .fn()
        .mockRejectedValue(new Error('route permission denied')),
    };
    const tool = new SendInstagramReplyTool(sendService as never);
    const forgedContext = {
      ...context,
      manualHumanAccess: {
        userWorkspaceId: context.userWorkspaceId,
        workspaceMemberId: 'member-id',
      },
    };
    await expect(
      tool.execute({ actionApprovalBindingId }, forgedContext),
    ).resolves.toMatchObject({ success: false });
    expect(sendService.executeApproved).toHaveBeenCalledWith(
      expect.not.objectContaining({ manualHumanAccess: expect.anything() }),
    );
  });

  it('does not claim success for known failure, limit block, or Unknown outcomes', async () => {
    for (const status of ['FAILED', 'BLOCKED', 'UNKNOWN'] as const) {
      const sendService = {
        executeApproved: jest.fn().mockResolvedValue({
          status,
          receiptId: 'receipt-id',
        }),
      };
      const tool = new SendInstagramReplyTool(sendService as never);

      await expect(
        tool.execute({ actionApprovalBindingId }, context),
      ).resolves.toMatchObject({ success: false, result: { status } });
      expect(sendService.executeApproved).toHaveBeenCalledTimes(1);
    }
  });

  it('requires a valid opaque binding, authenticated thread, and current role permissions', async () => {
    const sendService = { executeApproved: jest.fn() };
    const tool = new SendInstagramReplyTool(sendService as never);

    await expect(
      tool.execute({ actionApprovalBindingId: 'not-a-uuid' }, context),
    ).resolves.toMatchObject({ success: false });
    await expect(
      tool.execute(
        { actionApprovalBindingId },
        {
          workspaceId: context.workspaceId,
          userWorkspaceId: context.userWorkspaceId,
          threadId: context.threadId,
        },
      ),
    ).resolves.toMatchObject({ success: false });
    expect(sendService.executeApproved).not.toHaveBeenCalled();
  });
});
