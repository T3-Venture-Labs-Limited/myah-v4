import { ASK_QUESTIONS_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/ask-questions.tool';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import { assertHumanInputToolCallIsExclusive } from 'src/engine/metadata-modules/ai/ai-chat/utils/assert-human-input-tool-call-is-exclusive.util';
import { AiExceptionCode } from 'src/engine/metadata-modules/ai/ai.exception';

describe('assertHumanInputToolCallIsExclusive', () => {
  it('allows a human-input tool when it is the only tool call in the step', () => {
    expect(() =>
      assertHumanInputToolCallIsExclusive([
        { toolName: REQUEST_APPROVAL_TOOL_NAME },
      ]),
    ).not.toThrow();
  });

  it('allows multiple non-human-input tool calls in one step', () => {
    expect(() =>
      assertHumanInputToolCallIsExclusive([
        { toolName: 'search_companies' },
        { toolName: 'learn_tools' },
      ]),
    ).not.toThrow();
  });

  it.each([ASK_QUESTIONS_TOOL_NAME, REQUEST_APPROVAL_TOOL_NAME])(
    'rejects %s when mixed with another tool call in the same step',
    (toolName) => {
      expect(() =>
        assertHumanInputToolCallIsExclusive([
          { toolName },
          { toolName: 'create_one_task' },
        ]),
      ).toThrow(
        expect.objectContaining({ code: AiExceptionCode.INVALID_AGENT_INPUT }),
      );
    },
  );
});
