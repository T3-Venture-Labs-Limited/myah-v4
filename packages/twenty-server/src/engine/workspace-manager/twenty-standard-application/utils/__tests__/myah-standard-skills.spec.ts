import { MYAH_ASSISTANT_SKILL_TOOL_NAMES } from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { STANDARD_SKILL } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-skill.constant';
import { STANDARD_FLAT_SKILL_METADATA_BUILDERS_BY_SKILL_NAME } from 'src/engine/workspace-manager/twenty-standard-application/utils/skill-metadata/create-standard-flat-skill-metadata.util';

const buildSkill = (
  skillName: keyof typeof STANDARD_FLAT_SKILL_METADATA_BUILDERS_BY_SKILL_NAME,
) =>
  STANDARD_FLAT_SKILL_METADATA_BUILDERS_BY_SKILL_NAME[skillName]({
    workspaceId: 'workspace-id',
    twentyStandardApplicationId: 'application-id',
    now: '2026-09-03T00:00:00.000Z',
    standardObjectMetadataRelatedEntityIds: {} as never,
    dependencyFlatEntityMaps: {} as never,
  });

const expectedMyahToolNames: Record<string, true> = Object.fromEntries(
  MYAH_ASSISTANT_SKILL_TOOL_NAMES.map((toolName) => [toolName, true]),
);

describe('Myah standard skills', () => {
  it.each([
    ['myah-inbox', 'Myah Inbox', 'IconInbox'],
    ['myah-creators', 'Myah Creators', 'IconUsers'],
    ['myah-creator-lists', 'Myah Creator Lists', 'IconList'],
    ['myah-campaigns', 'Myah Campaigns', 'IconTargetArrow'],
  ] as const)(
    'defines %s with its source-controlled identity',
    (skillName, label, icon) => {
      const skill = buildSkill(skillName);

      expect(skill).toMatchObject({
        universalIdentifier: STANDARD_SKILL[skillName].universalIdentifier,
        name: skillName,
        label,
        icon,
        isCustom: false,
        isActive: true,
      });
      expect(skill.description).toEqual(expect.any(String));
      expect(skill.content).toEqual(expect.any(String));
    },
  );

  it('gives Inbox its read, draft, registered-send, and readback procedure', () => {
    const myahInbox = buildSkill('myah-inbox');

    expect(myahInbox.content).toEqual(
      expect.stringContaining('search_myah_inbox_threads'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('save_myah_inbox_reply_draft'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('send_myah_inbox_reply'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('get_myah_inbox_reply_send_status'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('Never use a generic Inbox send'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining(
        'toolName: "send_myah_inbox_reply" and actionInput: { messageThreadId, expectedDraftRevision }',
      ),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('actionApprovalBindingId'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('request_approval'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining(
        'Before saving, call get_myah_inbox_reply_send_readiness and use its exact numeric revision',
      ),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining('body: { markdown: string, blocknote: null }'),
    );
    expect(myahInbox.content).toEqual(
      expect.stringContaining(
        'If save returns CONFLICT, stop without retrying',
      ),
    );
  });

  it('gives Creators their generated CRUD paths and field ownership', () => {
    const creators = buildSkill('myah-creators');

    for (const toolName of [
      'find_many_creators',
      'find_one_creator',
      'create_one_creator',
      'update_one_creator',
      'find_many_campaign_creators',
      'update_one_campaign_creator',
    ]) {
      expect(creators.content).toEqual(expect.stringContaining(toolName));
    }
    expect(creators.content).toEqual(
      expect.stringContaining('Creator owns canonical identity'),
    );
    expect(creators.content).toEqual(
      expect.stringContaining(
        'CampaignCreator owns its Campaign-specific fields',
      ),
    );
    expect(creators.content).toEqual(
      expect.stringContaining('request_approval immediately before'),
    );
    for (const fieldOrRelation of [
      'gender',
      'source',
      'sourceUrl',
      'language',
      'categories',
      'niches',
      'notes',
      'instagram',
      'tiktok',
      'youtube',
      'twitter',
      'twitch',
      'listMemberships',
      'campaignCreators',
      'inboxThreads',
      'taskTargets',
      'noteTargets',
      'timelineActivities',
      'attachments',
      'delete_one_creator',
      'destructive approval',
      'create_one_task_target with task and targetCreator',
    ]) {
      expect(creators.content).toEqual(
        expect.stringContaining(fieldOrRelation),
      );
    }
  });

  it('attaches an initial Creator List directly and gates only later changes through candidates', () => {
    const creatorLists = buildSkill('myah-creator-lists');
    const initialAttach = creatorLists.content.indexOf(
      'For the initial List attach, call attach_creator_lists_to_campaign directly',
    );
    const laterCandidates = creatorLists.content.indexOf(
      'For later changes, call get_campaign_creator_list_addition_candidates',
    );

    expect(initialAttach).toBeGreaterThanOrEqual(0);
    expect(laterCandidates).toBeGreaterThan(initialAttach);
    expect(creatorLists.content).toEqual(
      expect.stringContaining(
        'then read get_campaign_audience without reattaching the List',
      ),
    );
    expect(creatorLists.content).not.toEqual(
      expect.stringContaining(
        'call approve_campaign_creator_list_additions, then Call request_approval',
      ),
    );
  });

  it('gives Creator Lists their generated CRUD paths and field ownership', () => {
    const creatorLists = buildSkill('myah-creator-lists');

    for (const toolName of [
      'find_many_creator_lists',
      'find_one_creator_list',
      'create_one_creator_list',
      'update_one_creator_list',
    ]) {
      expect(creatorLists.content).toEqual(expect.stringContaining(toolName));
    }
    expect(creatorLists.content).toEqual(
      expect.stringContaining('CreatorList owns name, source, description'),
    );
    expect(creatorLists.content).toEqual(
      expect.stringContaining('request_approval immediately before'),
    );
    for (const fieldName of ['name', 'source', 'description']) {
      expect(creatorLists.content).toEqual(expect.stringContaining(fieldName));
    }
  });

  it('gives Campaigns generated Home, lifecycle, Agent, Operations, Task, Note, and Influencer paths', () => {
    const myahCampaigns = buildSkill('myah-campaigns');

    for (const toolName of [
      'find_many_campaigns',
      'find_one_campaign',
      'create_one_campaign',
      'update_one_campaign',
      'find_many_tasks',
      'create_one_task',
      'update_one_task',
      'find_many_notes',
      'create_one_note',
      'update_one_note',
      'find_many_campaign_creators',
      'update_one_campaign_creator',
    ]) {
      expect(myahCampaigns.content).toEqual(expect.stringContaining(toolName));
    }
    for (const fieldName of [
      'Campaign Home',
      'lifecycleStatus',
      'campaignBrief',
      'communicationGuidelines',
      'Campaign follow-up work',
      'Influencer updates',
    ]) {
      expect(myahCampaigns.content).toEqual(expect.stringContaining(fieldName));
    }
    expect(myahCampaigns.content).toEqual(
      expect.stringContaining('request_approval immediately before'),
    );
  });

  it('transitions campaign lifecycle by exact ID with approval and readback', () => {
    const myahCampaigns = buildSkill('myah-campaigns');

    expect(myahCampaigns.content).toEqual(
      expect.stringContaining(
        'read the exact Campaign ID and observed lifecycleStatus',
      ),
    );
    expect(myahCampaigns.content).toEqual(
      expect.stringContaining(
        'call update_many_campaigns for exactly that Campaign ID, then find_one_campaign to read back lifecycleStatus',
      ),
    );
  });

  it('creates Campaign Tasks and Notes with their target relations', () => {
    const myahCampaigns = buildSkill('myah-campaigns');

    for (const procedureDetail of [
      'create_one_task_target with task and targetCampaign pointing to the returned Task and Campaign',
      'create_one_note_target with note and targetCampaign pointing to the returned Note and Campaign',
      'read back both records',
    ]) {
      expect(myahCampaigns.content).toEqual(
        expect.stringContaining(procedureDetail),
      );
    }
  });

  it('updates all CampaignCreator operational fields', () => {
    const myahCampaigns = buildSkill('myah-campaigns');

    for (const fieldName of [
      'CampaignCreator.stage',
      'assignedManagedMailboxId',
      'selectedContactMethod',
      'nextActionAt',
      'selectionReason',
      'dealSummary',
      'outcomeSummary',
    ]) {
      expect(myahCampaigns.content).toEqual(expect.stringContaining(fieldName));
    }
  });

  it('sequences outreach preparation, registered approval, delivery, and receipt readback', () => {
    const myahCampaigns = buildSkill('myah-campaigns');
    const prepare = myahCampaigns.content.indexOf(
      'prepare_outreach_email_draft',
    );
    const approve = myahCampaigns.content.indexOf(
      'toolName: "send_outreach_email" and actionInput: { outreachActionId }',
    );
    const send = myahCampaigns.content.indexOf(
      'call send_outreach_email with the actionApprovalBindingId',
    );
    const readback = myahCampaigns.content.indexOf('find_one_outreach_action');

    expect(prepare).toBeGreaterThanOrEqual(0);
    expect(approve).toBeGreaterThan(prepare);
    expect(send).toBeGreaterThan(approve);
    expect(readback).toBeGreaterThan(send);
  });

  it('names generic approval immediately before every internal write', () => {
    for (const skillName of [
      'myah-inbox',
      'myah-creators',
      'myah-creator-lists',
      'myah-campaigns',
    ] as const) {
      expect(buildSkill(skillName).content).toEqual(
        expect.stringContaining(
          'Call request_approval immediately before every internal/generated write',
        ),
      );
    }
  });

  it('limits each generic approval to one write tool call', () => {
    for (const skillName of [
      'myah-inbox',
      'myah-creators',
      'myah-creator-lists',
      'myah-campaigns',
    ] as const) {
      expect(buildSkill(skillName).content).toEqual(
        expect.stringContaining(
          'Never authorize or describe more than one write tool call in the same approval',
        ),
      );
    }

    const campaigns = buildSkill('myah-campaigns');

    expect(campaigns.content).toEqual(
      expect.stringContaining(
        'create_campaign_outreach_workflow creates the workflow and its initial DRAFT version atomically',
      ),
    );
    expect(campaigns.content).toEqual(
      expect.stringContaining(
        'Call create_campaign_outreach_workflow_draft only when an existing workflow has no editable DRAFT version',
      ),
    );
    expect(campaigns.content).not.toEqual(
      expect.stringContaining(
        'After create_campaign_outreach_workflow returns the workflow ID, request a separate approval before create_campaign_outreach_workflow_draft',
      ),
    );
  });

  it('uses the registered Inbox approval action input exactly', () => {
    const myahInbox = buildSkill('myah-inbox');

    expect(myahInbox.content).toEqual(
      expect.stringContaining(
        'toolName: "send_myah_inbox_reply" and actionInput: { messageThreadId, expectedDraftRevision }',
      ),
    );
    expect(myahInbox.content).not.toEqual(
      expect.stringContaining('actionInput: { draftId }'),
    );
  });

  it('gives Creator Lists their canonical audience and approval procedure', () => {
    const creatorLists = buildSkill('myah-creator-lists');

    expect(creatorLists.content).toEqual(
      expect.stringContaining('get_campaign_creator_list_addition_candidates'),
    );
    expect(creatorLists.content).toEqual(
      expect.stringContaining('approve_campaign_creator_list_additions'),
    );
    expect(creatorLists.content).toEqual(
      expect.stringContaining('attach_creator_lists_to_campaign'),
    );
    expect(creatorLists.content).toEqual(
      expect.stringContaining('no raw Campaign-sensitive junction writes'),
    );
  });

  it('gives Campaigns their lifecycle and outreach workflow procedure', () => {
    const myahCampaigns = buildSkill('myah-campaigns');

    expect(myahCampaigns.content).toEqual(
      expect.stringContaining('CampaignCreator.stage'),
    );
    expect(myahCampaigns.content).toEqual(
      expect.stringContaining('attach_creator_lists_to_campaign'),
    );
    expect(myahCampaigns.content).toEqual(
      expect.stringContaining('create_campaign_outreach_workflow'),
    );
    expect(myahCampaigns.content).toEqual(
      expect.stringContaining('validate_campaign_outreach_workflow'),
    );
    expect(myahCampaigns.content).toEqual(
      expect.stringContaining(
        'Do not conflate Campaign status with Creator status',
      ),
    );
  });

  it.each([
    'myah-inbox',
    'myah-creators',
    'myah-creator-lists',
    'myah-campaigns',
  ] as const)(
    'defines permission, missing-data, and failure handling for %s',
    (skillName) => {
      const content = buildSkill(skillName).content;

      for (const category of [
        'NOT_FOUND',
        'PERMISSION_DENIED',
        'VALIDATION_FAILED',
        'CONFLICT',
        'ALREADY_EXISTS',
        'NOT_READY',
        'PENDING',
        'FAILED',
        'UNKNOWN',
      ]) {
        expect(content).toContain(category);
      }
    },
  );

  it('defines Creator List duplicate and removal invariants', () => {
    const content = buildSkill('myah-creator-lists').content;

    expect(content).toContain(
      'Duplicate membership or attachment is an idempotent no-op',
    );
    expect(content).toContain(
      'Removing membership never deletes the Creator, CampaignCreator, or retained source history',
    );
  });

  it('uses all source-controlled custom tools', () => {
    const skillContent = Object.keys(
      STANDARD_FLAT_SKILL_METADATA_BUILDERS_BY_SKILL_NAME,
    )
      .filter(
        (
          skillName,
        ): skillName is Extract<
          keyof typeof STANDARD_FLAT_SKILL_METADATA_BUILDERS_BY_SKILL_NAME,
          string
        > => skillName.startsWith('myah-'),
      )
      .map((skillName) => buildSkill(skillName).content)
      .join('\n');

    for (const toolName of Object.keys(expectedMyahToolNames)) {
      expect(skillContent).toEqual(expect.stringContaining(toolName));
    }
  });
  it('brands the code-interpreter bridge as Myah while preserving its runtime identifier', () => {
    const codeInterpreter = buildSkill('code-interpreter');

    expect(codeInterpreter.content).toContain(
      '## Calling Myah Tools from Python (MCP Bridge)',
    );
    expect(codeInterpreter.content).toContain(
      'The `twenty` variable is an internal compatibility identifier',
    );
    expect(codeInterpreter.content).toContain(
      'Never expose that internal name as the product brand',
    );
    expect(codeInterpreter.content).not.toContain(
      '## Calling Twenty Tools from Python (MCP Bridge)',
    );
  });
});
