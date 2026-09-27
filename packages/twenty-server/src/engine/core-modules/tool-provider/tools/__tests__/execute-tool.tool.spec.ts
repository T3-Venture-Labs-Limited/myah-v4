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

  describe('approved action guard', () => {
    const buildRegistry = () =>
      ({
        resolveAndExecute: jest
          .fn()
          .mockResolvedValue({ success: true, message: 'Write complete' }),
      }) as unknown as ToolRegistryService;

    it('dispatches the approved write once when the guard passes', async () => {
      const toolRegistry = buildRegistry();
      const verifyAndConsume = jest.fn().mockResolvedValue(null);
      const recordOutcome = jest.fn().mockResolvedValue(undefined);
      const executeTool = createExecuteToolTool(toolRegistry, context, {
        approvedActionGuard: {
          toolName: 'approved-write',
          verifyAndConsume,
          recordOutcome,
        },
      });

      await expect(
        executeTool.execute({
          toolName: 'approved-write',
          arguments: { id: 'record-id' },
        }),
      ).resolves.toEqual({ success: true, message: 'Write complete' });
      expect(verifyAndConsume).toHaveBeenCalledWith({ id: 'record-id' });
      expect(toolRegistry.resolveAndExecute).toHaveBeenCalledTimes(1);
      expect(recordOutcome).toHaveBeenCalledWith('succeeded');
    });

    it('records a failed dispatch without claiming the write was not attempted', async () => {
      const toolRegistry = buildRegistry();
      jest.mocked(toolRegistry.resolveAndExecute).mockResolvedValue({
        success: false,
        message: 'Validation failed',
      });
      const recordOutcome = jest.fn().mockResolvedValue(undefined);
      const executeTool = createExecuteToolTool(toolRegistry, context, {
        approvedActionGuard: {
          toolName: 'approved-write',
          verifyAndConsume: jest.fn().mockResolvedValue(null),
          recordOutcome,
        },
      });

      await expect(
        executeTool.execute({ toolName: 'approved-write', arguments: {} }),
      ).resolves.toMatchObject({ success: false });
      expect(recordOutcome).toHaveBeenCalledWith('failed');
    });

    it('returns the actual write result if recording its outcome fails', async () => {
      const toolRegistry = buildRegistry();
      const recordOutcome = jest
        .fn()
        .mockRejectedValue(new Error('Receipt unavailable'));
      const executeTool = createExecuteToolTool(toolRegistry, context, {
        approvedActionGuard: {
          toolName: 'approved-write',
          verifyAndConsume: jest.fn().mockResolvedValue(null),
          recordOutcome,
        },
      });

      await expect(
        executeTool.execute({ toolName: 'approved-write', arguments: {} }),
      ).resolves.toEqual({ success: true, message: 'Write complete' });
      expect(toolRegistry.resolveAndExecute).toHaveBeenCalledTimes(1);
      expect(recordOutcome).toHaveBeenCalledWith('succeeded');
    });

    it('never dispatches when the guard refuses', async () => {
      const toolRegistry = buildRegistry();
      const refusal = {
        success: false,
        message: 'Approved action was not executed',
        error: 'ACTION_CHANGED',
      };
      const executeTool = createExecuteToolTool(toolRegistry, context, {
        approvedActionGuard: {
          toolName: 'approved-write',
          verifyAndConsume: jest.fn().mockResolvedValue(refusal),
        },
      });

      await expect(
        executeTool.execute({
          toolName: 'approved-write',
          arguments: { id: 'other-record-id' },
        }),
      ).resolves.toEqual(refusal);
      expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
    });

    it('keeps other excluded writes unavailable', async () => {
      const toolRegistry = buildRegistry();
      const verifyAndConsume = jest.fn().mockResolvedValue(null);
      const executeTool = createExecuteToolTool(toolRegistry, context, {
        excludeTools: new Set(['other-write']),
        approvedActionGuard: { toolName: 'approved-write', verifyAndConsume },
      });

      await expect(
        executeTool.execute({ toolName: 'other-write', arguments: {} }),
      ).resolves.toEqual(expect.objectContaining({ success: false }));
      expect(verifyAndConsume).not.toHaveBeenCalled();
      expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
    });
  });
});
