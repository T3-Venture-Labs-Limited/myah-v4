import type { ToolCategory } from 'twenty-shared/ai';

import { SystemPromptBuilderService } from 'src/engine/metadata-modules/ai/ai-chat/services/system-prompt-builder.service';

describe('SystemPromptBuilderService', () => {
  it('labels Campaign Outreach tools', () => {
    const service = new SystemPromptBuilderService(
      null as never,
      null as never,
      null as never,
    );

    expect(
      service['getCategoryLabel']('MYAH_CAMPAIGN_OUTREACH' as ToolCategory),
    ).toBe('Campaign Outreach Tools (manage Campaign-scoped workflows)');
  });
});
