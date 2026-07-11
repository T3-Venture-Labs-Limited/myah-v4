import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';

const buildService = ({
  toolOutput,
}: {
  toolOutput?: Record<string, unknown>;
} = {}) => {
  const toolRegistry = {
    resolveAndExecute: jest.fn().mockResolvedValue(
      toolOutput ?? {
        success: true,
        message: 'ok',
        result: {
          brandSlug: 'acme-beauty-labs',
          pageCount: 11,
          hasRoot: true,
          hasIndex: true,
          hasLog: true,
          contextMarkdown:
            '# Brand Brain Context: acme-beauty-labs\n\nOffer: 15% creator affiliate code\nAudience: Women 25-40\nPositioning: Premium but simple beauty routine upgrade\nConstraints: Avoid medical claims; avoid guaranteed growth.',
        },
      },
    ),
  };

  const service = new BrandBrainPreflightService(toolRegistry as never);

  return { service, toolRegistry };
};

const toolContext = {
  workspaceId: 'workspace-id',
  roleId: 'role-id',
  userId: 'user-id',
  userWorkspaceId: 'user-workspace-id',
  threadId: 'thread-id',
};

describe('BrandBrainPreflightService', () => {
  it('skips generic affiliate questions that are not about a brand', async () => {
    const { service, toolRegistry } = buildService();

    const result = await service.run({
      lastUserMessageText:
        'Explain affiliate marketing in three short sentences. Do not discuss a specific brand.',
      toolContext,
    });

    expect(result.required).toBe(false);
    expect(result.contextPart).toBeNull();
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
  });

  it('calls Brand Brain get-context once for known brand campaign work and returns prompt context', async () => {
    const { service, toolRegistry } = buildService();

    const result = await service.run({
      lastUserMessageText:
        'Write three affiliate campaign angles for Acme Beauty Labs. Use available workspace knowledge.',
      toolContext,
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledTimes(1);
    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      {
        brandNameOrSlug: 'Acme Beauty Labs',
        task: 'Write three affiliate campaign angles for Acme Beauty Labs. Use available workspace knowledge.',
      },
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );

    expect(result).toMatchObject({
      required: true,
      called: true,
      brandNameOrSlug: 'Acme Beauty Labs',
      brandSlug: 'acme-beauty-labs',
      pageCount: 11,
      cacheHit: false,
    });
    expect(result.contextPart).toContain('<brand_brain_preflight');
    expect(result.contextPart).toContain('15% creator affiliate code');
    expect(result.contextPart).toContain('Avoid medical claims');
    expect(result.contextPart).toContain(
      'Do not invent brand facts outside this context',
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('normalizes quoted and explicit brand prefixes before calling Brand Brain', async () => {
    const { service, toolRegistry } = buildService();

    await service.run({
      lastUserMessageText:
        'Draft creator outreach for the brand "Acme Beauty Labs". Include the offer and claims constraints.',
      toolContext,
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      expect.objectContaining({
        brandNameOrSlug: 'Acme Beauty Labs',
      }),
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );
  });

  it('extracts an exact title-case brand before affiliate campaign keywords', async () => {
    const { service, toolRegistry } = buildService();

    await service.run({
      lastUserMessageText:
        'Create Acme Beauty Labs affiliate campaign angles using available workspace knowledge.',
      toolContext,
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      expect.objectContaining({
        brandNameOrSlug: 'Acme Beauty Labs',
      }),
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );
  });

  it('extracts a title-case brand from prefixed eval or routing text', async () => {
    const { service, toolRegistry } = buildService();

    await service.run({
      lastUserMessageText:
        'EVAL P2 marker: Create Acme Beauty Labs affiliate campaign angles using available workspace knowledge.',
      toolContext,
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      expect.objectContaining({
        brandNameOrSlug: 'Acme Beauty Labs',
      }),
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );
  });

  it('does not treat generic title-case marketing concepts as a brand', async () => {
    const { service, toolRegistry } = buildService();

    const result = await service.run({
      lastUserMessageText:
        'Create Affiliate Marketing campaign examples without discussing a specific brand.',
      toolContext,
    });

    expect(result.called).toBe(false);
    expect(result.contextPart).toContain('missing_brand_name');
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
  });

  it('extracts exact quoted brand names from similar-brand isolation prompts', async () => {
    const { service, toolRegistry } = buildService();

    await service.run({
      lastUserMessageText:
        "There are similar brands. For exactly 'Acme Affiliate Labs', what is the current commission marker? Do not use facts from 'Acme Affiliate Primary'.",
      toolContext,
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      expect.objectContaining({
        brandNameOrSlug: 'Acme Affiliate Labs',
      }),
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );
  });

  it.each([
    "Use Brand Brain for 'Acme Affiliate Primary' to draft a concise affiliate creator outreach message.",
    "Use Brand Brain memory/tools only for 'Acme Affiliate Primary'. What is the current affiliate commission marker?",
  ])(
    'extracts quoted brands after plain for before task text: %s',
    async (lastUserMessageText) => {
      const { service, toolRegistry } = buildService();

      await service.run({
        lastUserMessageText,
        toolContext,
      });

      expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
        'app_brand_brain_get_context',
        expect.objectContaining({
          brandNameOrSlug: 'Acme Affiliate Primary',
        }),
        toolContext,
        { compactOutput: true, spillLargeOutput: false },
      );
    },
  );

  it('extracts quoted brand slugs without including the word slug', async () => {
    const { service, toolRegistry } = buildService();

    await service.run({
      lastUserMessageText:
        "For brand slug 'OrBiT-BlOoM-EdGeCaSe-20260708101754', what is the current commission marker?",
      toolContext,
    });

    expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
      'app_brand_brain_get_context',
      expect.objectContaining({
        brandNameOrSlug: 'OrBiT-BlOoM-EdGeCaSe-20260708101754',
      }),
      toolContext,
      { compactOutput: true, spillLargeOutput: false },
    );
  });

  it.each([
    'Please add a note to this record.',
    'Write a friendly email for Sarah.',
    'Can you draft an email to the accounting team?',
    'Summarize this content.',
    'Open the admin page.',
    'Update my deadline.',
  ])('skips non-brand chat work: %s', async (lastUserMessageText) => {
    const { service, toolRegistry } = buildService();

    const result = await service.run({
      lastUserMessageText,
      toolContext,
    });

    expect(result.required).toBe(false);
    expect(result.called).toBe(false);
    expect(result.contextPart).toBeNull();
    expect(toolRegistry.resolveAndExecute).not.toHaveBeenCalled();
  });

  it.each([
    ['What is Lashglow positioning?', 'Lashglow'],
    ['Explain Lashglow creator offer.', 'Lashglow'],
    ["Summarize Lashglow's content guidelines.", 'Lashglow'],
    ['Create Nike ads using workspace knowledge.', 'Nike'],
    ['Draft Apple email copy for affiliates.', 'Apple'],
  ])(
    'loads Brand Brain for common brand question: %s',
    async (lastUserMessageText, brandNameOrSlug) => {
      const { service, toolRegistry } = buildService();

      const result = await service.run({
        lastUserMessageText,
        toolContext,
      });

      expect(result.required).toBe(true);
      expect(result.called).toBe(true);
      expect(toolRegistry.resolveAndExecute).toHaveBeenCalledWith(
        'app_brand_brain_get_context',
        expect.objectContaining({ brandNameOrSlug }),
        toolContext,
        { compactOutput: true, spillLargeOutput: false },
      );
    },
  );

  it('does not turn a spilled Brand Brain result into a false no-context guardrail', async () => {
    const { service } = buildService({
      toolOutput: {
        success: true,
        message: 'ok',
        result: {
          spilled: true,
          outputRef: {
            fileId: 'file-id',
            filename: 'tool-output-app_brand_brain_get_context-file-id.json',
          },
          preview: {
            result: {
              brandSlug: 'acme-beauty-labs',
              pageCount: 24,
            },
          },
          hint: 'Output too large to inline.',
        },
      },
    });

    const result = await service.run({
      lastUserMessageText:
        'Write three affiliate campaign angles for Acme Beauty Labs.',
      toolContext,
    });

    expect(result.required).toBe(true);
    expect(result.called).toBe(true);
    expect(result.error).toContain('spilled');
    expect(result.contextPart).toContain('Brand Brain preflight failed');
    expect(result.contextPart).not.toContain(
      'No Brand Brain context was found',
    );
  });

  it('injects a no-context guardrail for unknown brands without creating memory', async () => {
    const { service } = buildService({
      toolOutput: {
        success: true,
        message: 'ok',
        result: {
          brandSlug: 'starling-foam-co',
          pageCount: 0,
          hasRoot: false,
          hasIndex: false,
          hasLog: false,
          contextMarkdown:
            '# Brand Brain Context: starling-foam-co\n\nNo Brand Brain pages found.',
        },
      },
    });

    const result = await service.run({
      lastUserMessageText:
        'Draft a creator outreach brief for Starling Foam Co. If you do not have enough brand details, say what is missing instead of inventing details.',
      toolContext,
    });

    expect(result.required).toBe(true);
    expect(result.called).toBe(true);
    expect(result.brandNameOrSlug).toBe('Starling Foam Co');
    expect(result.pageCount).toBe(0);
    expect(result.contextPart).toContain('No Brand Brain context was found');
    expect(result.contextPart).toContain('Do not invent brand facts');
  });

  it('skips injection when the Brand Brain tool is unavailable in the workspace', async () => {
    const { service } = buildService({
      toolOutput: {
        success: false,
        message: 'Tool not found',
        error:
          'Tool "app_brand_brain_get_context" not found. Use learn_tools to discover available tools.',
      },
    });

    const result = await service.run({
      lastUserMessageText: 'Draft creator outreach for Lashglow.',
      toolContext,
    });

    expect(result.required).toBe(false);
    expect(result.called).toBe(true);
    expect(result.error).toContain('not found');
    expect(result.contextPart).toBeNull();
  });

  it('returns a failed preflight guardrail if the Brand Brain tool execution fails', async () => {
    const { service } = buildService({
      toolOutput: {
        success: false,
        message: 'Execution failed',
        error: 'Brand Brain context query timed out',
      },
    });

    const result = await service.run({
      lastUserMessageText: 'Draft creator outreach for Lashglow.',
      toolContext,
    });

    expect(result.required).toBe(true);
    expect(result.called).toBe(true);
    expect(result.error).toContain('Brand Brain context query timed out');
    expect(result.contextPart).toContain('Brand Brain preflight failed');
    expect(result.contextPart).toContain('Do not invent brand-specific facts');
  });

  it('injects preflight context into the last user message without changing prior messages', () => {
    const { service } = buildService();
    const messages = [
      {
        id: 'user-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Earlier message' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'Earlier answer' }],
      },
      {
        id: 'user-2',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Draft outreach for Lashglow' }],
      },
    ];

    const injected = service.injectContextIntoLastUserMessage(
      messages,
      '<brand_brain_preflight>context</brand_brain_preflight>',
    );

    expect(injected[0]).toBe(messages[0]);
    expect(injected[1]).toBe(messages[1]);
    expect(injected[2]).not.toBe(messages[2]);
    expect(injected[2].parts).toEqual([
      { type: 'text', text: 'Draft outreach for Lashglow' },
      {
        type: 'text',
        text: '<brand_brain_preflight>context</brand_brain_preflight>',
      },
    ]);
  });
});
