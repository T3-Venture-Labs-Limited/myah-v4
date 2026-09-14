import { type ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { createExecuteToolTool } from 'src/engine/core-modules/tool-provider/tools/execute-tool.tool';
import { type ToolContext } from 'src/engine/core-modules/tool-provider/types/tool-context.type';

describe('createExecuteToolTool', () => {
  const context = {} as ToolContext;

  it('allows a source-approved read tool despite the generic exclusion set', async () => {
    const result = { success: true, message: 'Read complete' };
    const toolRegistry = {
      resolveAndExecute: jest.fn().mockResolvedValue(result),
    } as unknown as ToolRegistryService;

    const executeTool = createExecuteToolTool(toolRegistry, context, {
      excludeTools: new Set(['safe-read-tool']),
      allowedTools: new Set(['safe-read-tool']),
    });

    await expect(
      executeTool.execute({
        toolName: 'safe-read-tool',
        arguments: { limit: 1 },
      }),
    ).resolves.toEqual(result);
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'safe-read-tool',
      { limit: 1 },
      context,
      { compactOutput: undefined, spillLargeOutput: undefined },
    );
  });

  it('allows an approved write exactly once', async () => {
    const result = { success: true, message: 'Write complete' };
    const toolRegistry = {
      resolveAndExecute: jest.fn().mockResolvedValue(result),
    } as unknown as ToolRegistryService;
    const executeTool = createExecuteToolTool(toolRegistry, context, {
      singleUseToolName: 'approved-write',
    });

    await expect(
      executeTool.execute({
        toolName: 'approved-write',
        arguments: { id: 'record-id' },
      }),
    ).resolves.toEqual(result);
    await expect(
      executeTool.execute({
        toolName: 'approved-write',
        arguments: { id: 'other-record-id' },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        success: false,
        message: 'Tool "approved-write" approval is already consumed',
      }),
    );
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledTimes(1);
  });
});
