import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import {
  getApprovedResumeActiveToolNames,
  getPreApprovalExcludedToolNames,
  hasLatestMessageApprovedApproval,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/approval-tool-availability.util';
import { ToolCategory } from 'twenty-shared/ai';

const toolEntry = ({
  name,
  operation,
}: {
  name: string;
  operation: string;
}): ToolIndexEntry =>
  ({
    name,
    label: name,
    description: name,
    category: ToolCategory.DATABASE_CRUD,
    executionRef: {
      kind: 'database_crud',
      objectNameSingular: 'company',
      operation,
    },
  }) as ToolIndexEntry;

describe('approval tool availability', () => {
  it('keeps write execution available but removes request approval during an approved resume', () => {
    expect(
      getApprovedResumeActiveToolNames([
        'execute_tool',
        REQUEST_APPROVAL_TOOL_NAME,
        'ask_questions',
      ]),
    ).toEqual(['execute_tool', 'ask_questions']);
  });

  it('excludes side-effecting and unknown tools before approval', () => {
    const excluded = getPreApprovalExcludedToolNames([
      toolEntry({ name: 'find_many_companies', operation: 'find_many' }),
      toolEntry({ name: 'group_by_companies', operation: 'group_by' }),
      toolEntry({ name: 'create_one_task', operation: 'create_one' }),
      toolEntry({ name: 'update_one_company', operation: 'update_one' }),
      {
        name: 'send_email',
        label: 'Send email',
        description: 'Send email',
        category: ToolCategory.ACTION,
        executionRef: { kind: 'static', toolId: 'send_email' },
      } as ToolIndexEntry,
    ]);

    expect(excluded.has('find_many_companies')).toBe(false);
    expect(excluded.has('group_by_companies')).toBe(false);
    expect(excluded.has('create_one_task')).toBe(true);
    expect(excluded.has('update_one_company')).toBe(true);
    expect(excluded.has('send_email')).toBe(true);
  });

  it('only treats a resolved approved approval on the latest assistant message as an approval grant', () => {
    expect(
      hasLatestMessageApprovedApproval([
        {
          role: 'assistant',
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
              output: { result: { status: 'resolved', decision: 'approved' } },
            },
          ],
        },
      ]),
    ).toBe(true);

    expect(
      hasLatestMessageApprovedApproval([
        {
          role: 'assistant',
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
              output: { result: { status: 'resolved', decision: 'approved' } },
            },
          ],
        },
        { role: 'user', parts: [] },
      ]),
    ).toBe(false);

    expect(
      hasLatestMessageApprovedApproval([
        {
          role: 'assistant',
          parts: [
            {
              type: `tool-${REQUEST_APPROVAL_TOOL_NAME}`,
              output: { result: { status: 'resolved', decision: 'rejected' } },
            },
          ],
        },
      ]),
    ).toBe(false);
  });
});
