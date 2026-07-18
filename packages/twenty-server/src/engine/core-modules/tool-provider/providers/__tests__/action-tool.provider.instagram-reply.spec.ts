import { ActionToolProvider } from 'src/engine/core-modules/tool-provider/providers/action-tool.provider';
import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';

const createTool = () => ({
  description: 'test tool',
  inputSchema: {},
  execute: jest.fn().mockResolvedValue({ success: true, message: 'executed' }),
});

const buildProvider = ({ hasPermission }: { hasPermission: boolean }) => {
  const prepareInstagramReplyDraftTool = createTool();
  const sendInstagramReplyTool = createTool();
  const permissionsService = {
    hasToolPermission: jest.fn().mockResolvedValue(hasPermission),
  };

  return {
    prepareInstagramReplyDraftTool,
    sendInstagramReplyTool,
    permissionsService,
    provider: new ActionToolProvider(
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      { isEnabled: jest.fn().mockReturnValue(true) } as never,
      prepareInstagramReplyDraftTool as never,
      sendInstagramReplyTool as never,
      permissionsService as never,
      {} as never,
      new ExternalWritePolicyService(permissionsService as never),
    ),
  };
};

describe('ActionToolProvider Instagram reply execution', () => {
  const context = {
    workspaceId: 'workspace-id',
    rolePermissionConfig: {},
  };

  it('refuses an Instagram reply action when the role lacks its explicit permission', async () => {
    const { provider, sendInstagramReplyTool } = buildProvider({
      hasPermission: false,
    });

    await expect(
      provider.executeStaticTool(
        'send_instagram_reply',
        { actionApprovalBindingId: 'b3ccec70-56c3-4ae6-b1f2-71d93957b5a6' },
        context as never,
      ),
    ).rejects.toThrow(
      'Missing permission to execute action tool "send_instagram_reply".',
    );

    expect(sendInstagramReplyTool.execute).not.toHaveBeenCalled();
  });

  it('executes an Instagram reply only after the permission check succeeds', async () => {
    const { provider, permissionsService, sendInstagramReplyTool } =
      buildProvider({ hasPermission: true });

    await expect(
      provider.executeStaticTool(
        'send_instagram_reply',
        { actionApprovalBindingId: 'b3ccec70-56c3-4ae6-b1f2-71d93957b5a6' },
        context as never,
      ),
    ).resolves.toEqual({ success: true, message: 'executed' });

    expect(permissionsService.hasToolPermission).toHaveBeenCalledTimes(1);
    expect(sendInstagramReplyTool.execute).toHaveBeenCalledWith(
      { actionApprovalBindingId: 'b3ccec70-56c3-4ae6-b1f2-71d93957b5a6' },
      expect.objectContaining({ workspaceId: 'workspace-id' }),
    );
  });

  it('gates draft preparation behind the same explicit Instagram reply permission', async () => {
    const { provider, prepareInstagramReplyDraftTool } = buildProvider({
      hasPermission: false,
    });

    await expect(
      provider.executeStaticTool(
        'prepare_instagram_reply_draft',
        {},
        context as never,
      ),
    ).rejects.toThrow(
      'Missing permission to execute action tool "prepare_instagram_reply_draft".',
    );

    expect(prepareInstagramReplyDraftTool.execute).not.toHaveBeenCalled();
  });
});
