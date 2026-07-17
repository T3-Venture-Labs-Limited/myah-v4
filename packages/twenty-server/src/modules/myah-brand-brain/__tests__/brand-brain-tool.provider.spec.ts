import { z } from 'zod';

import { BrandBrainToolProvider } from 'src/engine/core-modules/tool-provider/providers/brand-brain-tool.provider';

describe('BrandBrainToolProvider', () => {
  it('exposes and executes the preflight-compatible context tool', async () => {
    const execute = jest.fn().mockResolvedValue({ brandSlug: 'acme' });
    const workspaceService = {
      generateBrandBrainTools: jest.fn().mockReturnValue({
        'brand-brain-get-context': {
          description: 'Read Brand Brain context.',
          inputSchema: z.object({ brandNameOrSlug: z.string() }),
          execute,
        },
      }),
    };
    const provider = new BrandBrainToolProvider(workspaceService as never);
    const context = {
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
      roleId: 'role-id',
    } as const;

    await expect(provider.generateDescriptors(context)).resolves.toEqual([
      expect.objectContaining({
        name: 'app_brand_brain_get_context',
        executionRef: { kind: 'static', toolId: 'app_brand_brain_get_context' },
      }),
    ]);

    await expect(
      provider.executeStaticTool(
        'app_brand_brain_get_context',
        { brandNameOrSlug: 'Acme' },
        context,
      ),
    ).resolves.toEqual({ brandSlug: 'acme' });
    expect(execute).toHaveBeenCalledWith(
      { brandNameOrSlug: 'Acme' },
      expect.objectContaining({ toolCallId: '', messages: [] }),
    );
  });

  it('is unavailable until the Brand Brain workspace service is registered', async () => {
    const provider = new BrandBrainToolProvider(null as never);

    await expect(
      provider.isAvailable({
        workspaceId: 'workspace-id',
        rolePermissionConfig: { shouldBypassPermissionChecks: true as const },
        roleId: 'role-id',
      }),
    ).resolves.toBe(false);
  });
});
