import { generateText } from 'ai';

import { AgentTitleGenerationService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-title-generation.service';

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn(),
}));

describe('AgentTitleGenerationService managed identity', () => {
  it('reuses the same managed request root when title generation is retried', async () => {
    (generateText as jest.Mock).mockResolvedValue({
      text: 'A title',
      usage: {},
      steps: [],
    });
    const managedOpenRouterModelService = {
      isManagedModel: jest.fn().mockReturnValue(true),
      wrapModel: jest.fn().mockReturnValue('wrapped-model'),
    };
    const service = new AgentTitleGenerationService(
      {
        getDefaultSpeedModel: jest.fn().mockReturnValue({
          modelId: 'managed',
          providerName: 'openrouter',
          model: 'model',
        }),
        getEffectiveModelConfig: jest.fn().mockReturnValue({}),
      } as never,
      {} as never,
      {} as never,
      managedOpenRouterModelService as never,
    );

    await service.generateThreadTitle(
      'hello',
      'workspace-id',
      'user-id',
      'thread-id',
    );
    await service.generateThreadTitle(
      'hello',
      'workspace-id',
      'user-id',
      'thread-id',
    );

    expect(
      managedOpenRouterModelService.wrapModel.mock.calls.map(
        ([context]) => context.requestIdRoot,
      ),
    ).toEqual(['thread-id:title', 'thread-id:title']);
  });
});
