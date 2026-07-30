import { CHAT_SYSTEM_PROMPTS } from 'src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const';

describe('CHAT_SYSTEM_PROMPTS', () => {
  it('guides generic CRM and workflow writes through every approval phase', () => {
    const prompt = CHAT_SYSTEM_PROMPTS.BASE;

    expect(prompt).toContain('## Approval-gated writes');
    expect(prompt).toContain(
      'Database reads (\`find_many_*\`, \`find_one_*\`, and \`group_by_*\`) and explicitly documented pre-approval-safe tools execute without approval',
    );
    expect(prompt).not.toContain('Read-only tools execute without approval');
    expect(prompt).toContain('CRM records, workflows, or metadata');
    expect(prompt).toContain("The user's original request is not approval");
    expect(prompt).toContain(
      'call \`request_approval\` in its own step before calling \`execute_tool\`',
    );
    expect(prompt).toContain('preview the complete write plan');
    expect(prompt).toContain('stop and wait without calling another tool');
    expect(prompt).toContain('execute the approved write');
    expect(prompt).toContain('Do not request approval again');
    expect(prompt).toContain('Execute only the approved plan');
    expect(prompt).toContain(
      'If the user rejects or requests changes, do not execute the write',
    );
    expect(prompt).toContain('present a new approval request when needed');
  });

  it('preserves the pre-approval Instagram draft before registered send approval', () => {
    const prompt = CHAT_SYSTEM_PROMPTS.BASE;

    expect(prompt).toContain(
      '\`prepare_instagram_reply_draft\` is the only current pre-approval write exception',
    );
    expect(prompt).toContain('persists only local review state');

    const prepareDraftIndex = prompt.indexOf(
      'Learn and execute \`prepare_instagram_reply_draft\`',
    );
    const requestApprovalIndex = prompt.indexOf(
      'call \`request_approval\` in its own step with only',
    );
    const sendReplyIndex = prompt.indexOf(
      'Only after the user approves, call \`send_instagram_reply\`',
    );

    expect(prepareDraftIndex).toBeGreaterThan(-1);
    expect(requestApprovalIndex).toBeGreaterThan(prepareDraftIndex);
    expect(sendReplyIndex).toBeGreaterThan(requestApprovalIndex);
  });
});
