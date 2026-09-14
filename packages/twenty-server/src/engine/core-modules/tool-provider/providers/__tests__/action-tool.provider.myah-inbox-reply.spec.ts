import { z } from 'zod';

import { ActionToolProvider } from 'src/engine/core-modules/tool-provider/providers/action-tool.provider';
import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';

const createTool = () => ({
  description: 'test tool',
  inputSchema: z.object({}).strict(),
  execute: jest.fn().mockResolvedValue({ success: true, message: 'executed' }),
});

const buildProvider = ({
  hasPermission = true,
}: { hasPermission?: boolean } = {}) => {
  const sendMyahInboxReplyTool = createTool();
  const permissionsService = {
    hasToolPermission: jest.fn().mockResolvedValue(hasPermission),
  };

  return {
    sendMyahInboxReplyTool,
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
      createTool() as never,
      createTool() as never,
      createTool() as never,
      createTool() as never,
      sendMyahInboxReplyTool as never,
      permissionsService as never,
      { translateMessage: jest.fn(({ messageId }) => messageId) } as never,
      new ExternalWritePolicyService(permissionsService as never),
    ),
  };
};

describe('ActionToolProvider Inbox reply execution', () => {
  const actionApprovalBindingId = 'b24f28a7-64bd-4cb8-ac5f-837536ca11db';
  const context = {
    workspaceId: 'workspace-id',
    userId: 'user-id',
    userWorkspaceId: 'user-workspace-id',
    roleId: 'role-id',
    threadId: 'thread-id',
    rolePermissionConfig: {} as never,
  };

  it('registers and forwards the opaque Inbox reply binding unchanged', async () => {
    const { provider, sendMyahInboxReplyTool } = buildProvider();

    expect(ActionToolProvider.actionToolNames).toContain(
      'send_myah_inbox_reply',
    );
    await expect(
      provider.executeStaticTool(
        'send_myah_inbox_reply',
        { actionApprovalBindingId },
        context,
      ),
    ).resolves.toEqual({ success: true, message: 'executed' });

    expect(sendMyahInboxReplyTool.execute).toHaveBeenCalledWith(
      { actionApprovalBindingId },
      expect.objectContaining({
        workspaceId: context.workspaceId,
        userWorkspaceId: context.userWorkspaceId,
        threadId: context.threadId,
      }),
    );
  });

  it('catalogues the Inbox sender only with email permission and lets the registry resolve it', async () => {
    const permitted = buildProvider({ hasPermission: true });
    const denied = buildProvider({ hasPermission: false });

    const permittedCatalog = await permitted.provider.generateDescriptors(
      context,
      { includeSchemas: false },
    );
    const deniedCatalog = await denied.provider.generateDescriptors(context, {
      includeSchemas: false,
    });
    const registry = new ToolRegistryService(
      [permitted.provider] as never,
      {} as never,
      {} as never,
    );

    expect(permittedCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'send_myah_inbox_reply',
          executionRef: {
            kind: 'static',
            toolId: 'send_myah_inbox_reply',
          },
        }),
      ]),
    );
    expect(deniedCatalog).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'send_myah_inbox_reply' }),
      ]),
    );
    await expect(
      registry.resolveSchemas({
        toolNames: ['send_myah_inbox_reply'],
        context,
        precomputedCatalog: permittedCatalog,
      }),
    ).resolves.toEqual(
      new Map([['send_myah_inbox_reply', expect.any(Object)]]),
    );
  });
});
