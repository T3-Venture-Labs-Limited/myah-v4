import type { ToolCategory } from 'twenty-shared/ai';

import { SystemPromptBuilderService } from 'src/engine/metadata-modules/ai/ai-chat/services/system-prompt-builder.service';

describe('SystemPromptBuilderService', () => {
  it('labels Brand Brain tools', () => {
    const service = new SystemPromptBuilderService(
      null as never,
      null as never,
      null as never,
    );

    expect(service['getCategoryLabel']('BRAND_BRAIN' as ToolCategory)).toBe(
      'Brand Brain Tools (manage brand knowledge and campaign context)',
    );
  });
});
