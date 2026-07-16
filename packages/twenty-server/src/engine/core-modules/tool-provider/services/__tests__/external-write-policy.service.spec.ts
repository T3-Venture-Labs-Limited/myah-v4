import { ActionToolProvider } from 'src/engine/core-modules/tool-provider/providers/action-tool.provider';
import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';

const ACTION_TOOL_NAMES = [
  'http_request',
  'send_email',
  'draft_email',
  'prepare_instagram_reply_draft',
  'send_instagram_reply',
  'create_calendar_event',
  'search_help_center',
  'code_interpreter',
  'navigate_app',
  'extract_json_paths',
  'search_output',
] as const;

const EXTERNAL_WRITE_TOOL_NAMES = [
  'http_request',
  'send_email',
  'draft_email',
  'send_instagram_reply',
  'create_calendar_event',
] as const;

const DECLARED_READ_OR_PREPARATION_TOOL_NAMES = [
  'prepare_instagram_reply_draft',
  'search_help_center',
  'code_interpreter',
  'navigate_app',
  'extract_json_paths',
  'search_output',
] as const;

const createTool = () => ({
  description: 'test tool',
  inputSchema: {},
  execute: jest.fn().mockResolvedValue({ result: { ok: true } }),
});

const buildProvider = () => {
  const tools = Object.fromEntries(
    ACTION_TOOL_NAMES.map((toolName) => [toolName, createTool()]),
  );
  const permissionsService = {
    hasToolPermission: jest.fn().mockResolvedValue(true),
  };

  return {
    tools,
    provider: new ActionToolProvider(
      tools.http_request as never,
      tools.send_email as never,
      tools.draft_email as never,
      tools.create_calendar_event as never,
      tools.search_help_center as never,
      tools.code_interpreter as never,
      tools.navigate_app as never,
      tools.extract_json_paths as never,
      tools.search_output as never,
      { isEnabled: jest.fn().mockReturnValue(true) } as never,
      tools.prepare_instagram_reply_draft as never,
      tools.send_instagram_reply as never,
      permissionsService as never,
      {} as never,
      new ExternalWritePolicyService(permissionsService as never),
    ),
  };
};

describe('external write policy static dispatch', () => {
  const context = {
    workspaceId: 'workspace-id',
    rolePermissionConfig: { canAccessAllTools: true },
  };

  it('keeps the static action inventory exact', () => {
    expect(ACTION_TOOL_NAMES).toEqual([
      'http_request',
      'send_email',
      'draft_email',
      'prepare_instagram_reply_draft',
      'send_instagram_reply',
      'create_calendar_event',
      'search_help_center',
      'code_interpreter',
      'navigate_app',
      'extract_json_paths',
      'search_output',
    ]);
  });

  it.each(EXTERNAL_WRITE_TOOL_NAMES)(
    'denies %s before Tool.execute even with role permission and canAccessAllTools',
    async (toolName) => {
      const { provider, tools } = buildProvider();

      await expect(
        provider.executeStaticTool(toolName, {}, context as never),
      ).rejects.toThrow('approval binding');

      expect(tools[toolName].execute).not.toHaveBeenCalled();
    },
  );

  it.each(DECLARED_READ_OR_PREPARATION_TOOL_NAMES)(
    'retains declared behavior for %s',
    async (toolName) => {
      const { provider, tools } = buildProvider();

      await expect(
        provider.executeStaticTool(toolName, {}, context as never),
      ).resolves.toEqual({ result: { ok: true } });

      expect(tools[toolName].execute).toHaveBeenCalledTimes(1);
    },
  );

  it('denies an unknown or missing-policy action before execution', async () => {
    const { provider, tools } = buildProvider();

    await expect(
      provider.executeStaticTool('unknown_action', {}, context as never),
    ).rejects.toThrow('No policy registered');

    expect(Object.values(tools).every((tool) => !tool.execute.mock.calls.length)).toBe(
      true,
    );
  });
});
