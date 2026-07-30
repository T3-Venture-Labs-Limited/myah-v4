import { Logger } from '@nestjs/common';
import { generateText } from 'ai';

import { AgentTurnGraderService } from 'src/engine/metadata-modules/ai/ai-agent-monitor/services/agent-turn-grader.service';

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn(),
}));

describe('AgentTurnGraderService managed privacy', () => {
  it('does not log malformed grader JSON for managed evaluations', async () => {
    const rawMalformedJson = '{"score":42,"comment":"secret grader output"';
    (generateText as jest.Mock).mockRejectedValueOnce(
      new Error(`Malformed grader response: ${rawMalformedJson}`),
    );
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const turnRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'turn-id',
        messages: [],
      }),
    };
    const evaluationRepository = {
      save: jest.fn().mockResolvedValue({}),
    };
    const aiModelRegistryService = {
      getDefaultSpeedModel: jest.fn().mockReturnValue({
        modelId: 'managed-model',
        providerName: 'openrouter',
        model: 'model',
      }),
      getEffectiveModelConfig: jest.fn().mockReturnValue({}),
    };
    const managedOpenRouterModelService = {
      isManagedModel: jest.fn().mockReturnValue(true),
      wrapModel: jest.fn().mockReturnValue('wrapped-model'),
    };
    const service = new AgentTurnGraderService(
      turnRepository as never,
      evaluationRepository as never,
      aiModelRegistryService as never,
      managedOpenRouterModelService as never,
    );

    await service.evaluateTurn({
      turnId: 'turn-id',
      workspaceId: 'workspace-id',
    });

    expect(loggerError.mock.calls.flat().join(' ')).not.toContain(
      rawMalformedJson,
    );
    expect(managedOpenRouterModelService.wrapModel).toHaveBeenCalledWith(
      expect.objectContaining({ requestIdRoot: 'turn-id:evaluation' }),
    );
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to evaluate turn with AI (managed response omitted)',
    );
  });
});
