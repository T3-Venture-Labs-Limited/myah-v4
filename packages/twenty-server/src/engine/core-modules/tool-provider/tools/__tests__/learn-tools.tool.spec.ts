import { type ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { createLearnToolsTool } from 'src/engine/core-modules/tool-provider/tools/learn-tools.tool';
import { type ToolContext } from 'src/engine/core-modules/tool-provider/types/tool-context.type';

describe('createLearnToolsTool', () => {
  const context = {} as ToolContext;

  it('surfaces "did you mean" suggestions when a tool name is not found', async () => {
    const toolRegistry = {
      getToolInfo: jest.fn().mockResolvedValue([]),
      suggestSimilarToolNames: jest
        .fn()
        .mockResolvedValue({ group_by_person: ['group_by_people'] }),
    } as unknown as ToolRegistryService;

    const learnTools = createLearnToolsTool(toolRegistry, context);

    const result = await learnTools.execute({
      toolNames: ['group_by_person'],
      aspects: ['description', 'schema'],
    });

    expect(result.notFound).toEqual(['group_by_person']);
    expect(result.suggestions).toEqual({
      group_by_person: ['group_by_people'],
    });
    expect(result.message).toContain(
      'group_by_person (did you mean: group_by_people?)',
    );
  });

  it('does not look up suggestions when every tool resolves', async () => {
    const suggestSimilarToolNames = jest.fn();
    const toolRegistry = {
      getToolInfo: jest
        .fn()
        .mockResolvedValue([
          { name: 'group_by_people', description: 'Group people' },
        ]),
      suggestSimilarToolNames,
    } as unknown as ToolRegistryService;

    const learnTools = createLearnToolsTool(toolRegistry, context);

    const result = await learnTools.execute({
      toolNames: ['group_by_people'],
      aspects: ['description'],
    });

    expect(result.notFound).toEqual([]);
    expect(result.suggestions).toBeUndefined();
    expect(suggestSimilarToolNames).not.toHaveBeenCalled();
    expect(result.message).toBe('Learned 1 tool: group_by_people.');
  });

  it('pluralizes the learned-tools count', async () => {
    const toolRegistry = {
      getToolInfo: jest
        .fn()
        .mockResolvedValue([
          { name: 'find_many_people' },
          { name: 'group_by_people' },
        ]),
      suggestSimilarToolNames: jest.fn(),
    } as unknown as ToolRegistryService;

    const learnTools = createLearnToolsTool(toolRegistry, context);

    const result = await learnTools.execute({
      toolNames: ['find_many_people', 'group_by_people'],
      aspects: ['description'],
    });

    expect(result.message).toBe(
      'Learned 2 tools: find_many_people, group_by_people.',
    );
  });

  it('does not report excluded tools as not found or suggest alternatives', async () => {
    const suggestSimilarToolNames = jest.fn();
    const toolRegistry = {
      getToolInfo: jest.fn().mockResolvedValue([]),
      suggestSimilarToolNames,
    } as unknown as ToolRegistryService;

    const learnTools = createLearnToolsTool(
      toolRegistry,
      context,
      new Set(['code_interpreter']),
    );

    const result = await learnTools.execute({
      toolNames: ['code_interpreter'],
      aspects: ['description'],
    });

    expect(toolRegistry.getToolInfo).toHaveBeenCalledWith([], context, [
      'description',
    ]);
    expect(result.notFound).toEqual([]);
    expect(result.suggestions).toBeUndefined();
    expect(suggestSimilarToolNames).not.toHaveBeenCalled();
    expect(result.message).toBe('No matching tools found.');
  });

  describe('schema-only approval-gated tools', () => {
    const excluded = new Set([
      'update_one_creator',
      'code_interpreter',
      'send_outreach_email',
      'send_myah_inbox_reply',
      'send_instagram_reply',
      'send_email',
      'draft_email',
      'http_request',
    ]);
    const buildRegistry = () =>
      ({
        getToolInfo: jest.fn((names: string[]) =>
          Promise.resolve(
            names.map((name) => ({
              name,
              description: `Describe ${name}`,
              inputSchema: { type: 'object' },
            })),
          ),
        ),
        suggestSimilarToolNames: jest.fn().mockResolvedValue({}),
      }) as unknown as ToolRegistryService;

    it('returns a gated write schema marked as requiring approval', async () => {
      const toolRegistry = buildRegistry();
      const learnTools = createLearnToolsTool(
        toolRegistry,
        context,
        excluded,
        new Set(['update_one_creator']),
      );

      const result = await learnTools.execute({
        toolNames: [...excluded],
        aspects: ['description', 'schema'],
      });

      expect(toolRegistry.getToolInfo).toHaveBeenCalledWith(
        ['update_one_creator'],
        context,
        ['description', 'schema'],
      );
      expect(result.tools).toEqual([
        {
          name: 'update_one_creator',
          description: expect.stringContaining('Requires approval'),
          inputSchema: { type: 'object' },
          requiresApproval: true,
        },
      ]);
      expect(result.notFound).toEqual([]);
    });

    it('keeps send, email, external-write, and code schemas withheld as before', async () => {
      const toolRegistry = buildRegistry();
      const learnTools = createLearnToolsTool(
        toolRegistry,
        context,
        excluded,
        new Set(['update_one_creator']),
      );

      const result = await learnTools.execute({
        toolNames: [...excluded].filter(
          (name) => name !== 'update_one_creator',
        ),
        aspects: ['schema'],
      });

      expect(result.tools).toEqual([]);
      expect(toolRegistry.getToolInfo).toHaveBeenCalledWith([], context, [
        'schema',
      ]);
    });

    it('is unchanged when no schema-only set is passed (MCP)', async () => {
      const toolRegistry = buildRegistry();
      const learnTools = createLearnToolsTool(toolRegistry, context, excluded);

      const result = await learnTools.execute({
        toolNames: ['update_one_creator'],
        aspects: ['schema'],
      });

      expect(result.tools).toEqual([]);
    });
  });
});
