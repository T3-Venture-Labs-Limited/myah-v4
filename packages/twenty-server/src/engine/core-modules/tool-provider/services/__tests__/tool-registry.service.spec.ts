import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';

const context = {
  workspaceId: 'workspace-id',
  roleId: 'role-id',
  rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
};

const logicFunctionProvider = (toolNames: string[]) => ({
  category: 'LOGIC_FUNCTION',
  isAvailable: jest.fn().mockResolvedValue(true),
  generateDescriptors: jest.fn().mockResolvedValue(
    toolNames.map((name) => ({
      name,
      label: name,
      description: 'Installed application tool.',
      inputSchema: { type: 'object', properties: {} },
      category: 'LOGIC_FUNCTION',
      executionRef: {
        kind: 'logic_function',
        logicFunctionUniversalIdentifier: `${name}-id`,
      },
    })),
  ),
  executeStaticTool: jest.fn(),
});

describe('ToolRegistryService', () => {
  it('keeps the native selected-Inbox tool when a logic function has the same name', async () => {
    const name = 'get_myah_inbox_thread_context';
    const nativeDescriptor = {
      name,
      label: 'Get Inbox context',
      description: 'Read selected Inbox context.',
      inputSchema: { type: 'object', properties: {} },
      category: 'MYAH_INBOX',
      executionRef: { kind: 'static', toolId: name },
    };
    const legacyProvider = logicFunctionProvider([name]);
    const nativeProvider = {
      category: 'MYAH_INBOX',
      isAvailable: jest.fn().mockResolvedValue(true),
      generateDescriptors: jest.fn().mockResolvedValue([nativeDescriptor]),
      executeStaticTool: jest.fn(),
    };
    const registry = new ToolRegistryService(
      [legacyProvider, nativeProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([
      nativeDescriptor,
    ]);
  });

  it('rejects retired Brand Brain tools from stale installed metadata', async () => {
    const retiredToolNames = [
      'app_brand_brain_get_context',
      'app_brand_brain_search_or_read',
      'app_brand_brain_seed_or_update_from_brief',
      'app_brand_brain_update_page_content',
    ];
    const dispatch = jest.fn();
    const registry = new ToolRegistryService(
      [logicFunctionProvider(retiredToolNames)] as never,
      { dispatch } as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([]);
    await expect(
      registry.resolveAndExecute(retiredToolNames[0], {}, context),
    ).resolves.toEqual({
      success: false,
      message: `Tool "${retiredToolNames[0]}" not found`,
      error: `Tool "${retiredToolNames[0]}" not found. Use learn_tools to discover available tools.`,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('never exposes retired Instagram app tools from stale installed metadata', async () => {
    const retiredToolNames = [
      'app_myah_list_instagram_conversations',
      'app_myah_list_instagram_messages',
      'app_myah_send_instagram_reply',
    ];
    const registry = new ToolRegistryService(
      [logicFunctionProvider(retiredToolNames)] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([]);
  });
});
