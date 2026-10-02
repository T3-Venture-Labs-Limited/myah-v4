import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';

const NATIVE_TOOL_NAME = 'get_myah_inbox_thread_context';

const descriptor = (category: 'MYAH_INBOX' | 'LOGIC_FUNCTION') => ({
  name: NATIVE_TOOL_NAME,
  label: 'Get Inbox context',
  description: 'Read selected Inbox context.',
  inputSchema: { type: 'object', properties: {} },
  category,
  executionRef:
    category === 'MYAH_INBOX'
      ? ({ kind: 'static', toolId: NATIVE_TOOL_NAME } as const)
      : ({
          kind: 'logic_function',
          logicFunctionUniversalIdentifier: 'legacy-function-id',
        } as const),
});

const provider = ({
  category,
  available = true,
}: {
  category: 'MYAH_INBOX' | 'LOGIC_FUNCTION';
  available?: boolean;
}) => ({
  category,
  isAvailable: jest.fn().mockResolvedValue(available),
  generateDescriptors: jest.fn().mockResolvedValue([descriptor(category)]),
  executeStaticTool: jest.fn(),
});

describe('ToolRegistryService', () => {
  const context = {
    workspaceId: 'workspace-id',
    roleId: 'role-id',
    rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
  };

  it('keeps the native descriptor when a legacy logic function has the same name', async () => {
    const nativeProvider = provider({ category: 'MYAH_INBOX' });
    const legacyProvider = provider({ category: 'LOGIC_FUNCTION' });
    const registry = new ToolRegistryService(
      [nativeProvider, legacyProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([
      descriptor('MYAH_INBOX'),
    ]);
  });

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
    const logicFunctionDescriptor = {
      ...nativeDescriptor,
      category: 'LOGIC_FUNCTION',
      executionRef: {
        kind: 'logic_function',
        logicFunctionUniversalIdentifier: 'legacy-inbox-function-id',
      },
    };
    const nativeProvider = {
      category: 'MYAH_INBOX',
      isAvailable: jest.fn().mockResolvedValue(true),
      generateDescriptors: jest.fn().mockResolvedValue([nativeDescriptor]),
      executeStaticTool: jest.fn(),
    };
    const logicFunctionProvider = {
      category: 'LOGIC_FUNCTION',
      isAvailable: jest.fn().mockResolvedValue(true),
      generateDescriptors: jest
        .fn()
        .mockResolvedValue([logicFunctionDescriptor]),
      executeStaticTool: jest.fn(),
    };
    const registry = new ToolRegistryService(
      [logicFunctionProvider, nativeProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([
      nativeDescriptor,
    ]);
  });

  it('hydrates the native implementation when eager loading colliding tools', async () => {
    const nativeProvider = provider({ category: 'MYAH_INBOX' });
    const legacyProvider = provider({ category: 'LOGIC_FUNCTION' });
    const dispatch = jest.fn().mockResolvedValue({
      success: true,
      message: 'Inbox context loaded',
    });
    const registry = new ToolRegistryService(
      [nativeProvider, legacyProvider] as never,
      { dispatch } as never,
      {} as never,
    );

    const tools = await registry.getToolsByCategories(context);

    await tools[NATIVE_TOOL_NAME]?.execute?.(
      {},
      { toolCallId: 'tool-call-id', messages: [] },
    );
    expect(dispatch).toHaveBeenCalledWith(
      descriptor('MYAH_INBOX'),
      {},
      context,
    );
  });

  it('retains a legacy logic function when the native provider is unavailable', async () => {
    const nativeProvider = provider({
      category: 'MYAH_INBOX',
      available: false,
    });
    const legacyProvider = provider({ category: 'LOGIC_FUNCTION' });
    const registry = new ToolRegistryService(
      [nativeProvider, legacyProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([
      descriptor('LOGIC_FUNCTION'),
    ]);
  });
  it('never exposes retired Instagram app tools from stale installed metadata', async () => {
    const retiredToolNames = [
      'app_myah_list_instagram_conversations',
      'app_myah_list_instagram_messages',
      'app_myah_send_instagram_reply',
    ];
    const logicFunctionProvider = {
      category: 'LOGIC_FUNCTION',
      isAvailable: jest.fn().mockResolvedValue(true),
      generateDescriptors: jest.fn().mockResolvedValue(
        retiredToolNames.map((name) => ({
          name,
          label: name,
          description: 'Retired Instagram app tool.',
          inputSchema: { type: 'object', properties: {} },
          category: 'LOGIC_FUNCTION',
          executionRef: {
            kind: 'logic_function',
            logicFunctionUniversalIdentifier: `${name}-id`,
          },
        })),
      ),
      executeStaticTool: jest.fn(),
    };
    const registry = new ToolRegistryService(
      [logicFunctionProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([]);
  });
});
