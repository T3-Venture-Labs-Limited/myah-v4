import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';

const BRAND_BRAIN_TOOL_NAME = 'app_brand_brain_get_context';

const descriptor = (category: 'BRAND_BRAIN' | 'LOGIC_FUNCTION') => ({
  name: BRAND_BRAIN_TOOL_NAME,
  label: 'Get Brand Brain Context',
  description: 'Read Brand Brain context.',
  inputSchema: { type: 'object', properties: {} },
  category,
  executionRef:
    category === 'BRAND_BRAIN'
      ? ({ kind: 'static', toolId: BRAND_BRAIN_TOOL_NAME } as const)
      : ({
          kind: 'logic_function',
          logicFunctionUniversalIdentifier: 'legacy-function-id',
        } as const),
});

const provider = ({
  category,
  available = true,
}: {
  category: 'BRAND_BRAIN' | 'LOGIC_FUNCTION';
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

  it('keeps the native Brand Brain descriptor when a legacy logic function has the same name', async () => {
    const nativeProvider = provider({ category: 'BRAND_BRAIN' });
    const legacyProvider = provider({ category: 'LOGIC_FUNCTION' });
    const registry = new ToolRegistryService(
      [nativeProvider, legacyProvider] as never,
      {} as never,
      {} as never,
    );

    await expect(registry.getCatalog(context)).resolves.toEqual([
      descriptor('BRAND_BRAIN'),
    ]);
  });

  it('hydrates the native implementation when eager loading colliding tools', async () => {
    const nativeProvider = provider({ category: 'BRAND_BRAIN' });
    const legacyProvider = provider({ category: 'LOGIC_FUNCTION' });
    const dispatch = jest.fn().mockResolvedValue({
      success: true,
      message: 'Brand Brain context loaded',
    });
    const registry = new ToolRegistryService(
      [nativeProvider, legacyProvider] as never,
      { dispatch } as never,
      {} as never,
    );

    const tools = await registry.getToolsByCategories(context);

    await tools[BRAND_BRAIN_TOOL_NAME]?.execute?.(
      {},
      { toolCallId: 'tool-call-id', messages: [] },
    );
    expect(dispatch).toHaveBeenCalledWith(
      descriptor('BRAND_BRAIN'),
      {},
      context,
    );
  });

  it('retains a legacy Brand Brain logic function when the native provider is unavailable', async () => {
    const nativeProvider = provider({
      category: 'BRAND_BRAIN',
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
});
