import { CHAT_SYSTEM_PROMPTS } from 'src/engine/metadata-modules/ai/ai-chat/constants/chat-system-prompts.const';

describe('CHAT_SYSTEM_PROMPTS', () => {
  it('identifies the user-facing product as Myah instead of Twenty CRM', () => {
    const prompt = CHAT_SYSTEM_PROMPTS.BASE;

    expect(prompt).toContain('user-facing product is Myah');
    expect(prompt).toContain('creator operations CRM');
    expect(prompt).toContain(
      'Never call the product or yourself Twenty or Twenty CRM',
    );
    expect(prompt).not.toContain('integrated into Twenty');
    expect(prompt).not.toContain('ALL Twenty CRM data operations');
    expect(prompt).not.toContain('dashboard in Twenty?');
  });

  it('requires the focused skill for every Myah domain request', () => {
    const prompt = CHAT_SYSTEM_PROMPTS.BASE;

    expect(prompt).toContain(
      'Myah Inbox, Creator, Creator List, and Campaign requests always require their matching Myah skill',
    );
    expect(prompt).not.toContain(
      'For simple CRUD operations (find/create/update/delete a record), you do NOT need a skill',
    );
  });

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
    expect(prompt).toContain('preview the complete input for that one write');
    expect(prompt).toContain(
      'One approval request may authorize exactly one write tool call',
    );
    expect(prompt).toContain(
      'Approval-gated write tools are intentionally unavailable to \`learn_tools\` before approval',
    );
    expect(prompt).toContain(
      'Do not use \`learn_tools\` to discover them before approval',
    );
    expect(prompt).not.toContain(
      'For multiple related writes, preview the complete write plan in one approval request',
    );
    expect(prompt).toContain('stop and wait without calling another tool');
    expect(prompt).toContain('execute the approved write');
    expect(prompt).toContain('Do not request approval again');
    expect(prompt).toContain('Execute only the approved plan');
    expect(prompt).toContain(
      'If the user rejects or requests changes, do not execute the write',
    );
    expect(prompt).toContain('present a new approval request when needed');
  });

  it('identifies Myah read, proposal, and status tools as pre-approval safe', () => {
    const prompt = CHAT_SYSTEM_PROMPTS.BASE;

    expect(prompt).toContain('get_campaign_audience');
    expect(prompt).toContain('get_campaign_outreach_workflow');
    expect(prompt).toContain('generate_myah_inbox_reply_proposal');
    expect(prompt).toContain('get_myah_inbox_reply_send_status');
    expect(prompt).toContain(
      'They do not authorize internal writes or registered sends.',
    );
  });

  it('preserves pre-approval drafts before registered send approval', () => {
    const prompt = CHAT_SYSTEM_PROMPTS.BASE;

    expect(prompt).toContain(
      '\`prepare_instagram_reply_draft\` and \`prepare_outreach_email_draft\` are the current pre-approval write exceptions',
    );
    expect(prompt).toContain('persists only local review state');
    expect(prompt).toContain(
      'both send tools still require registered approval',
    );

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
