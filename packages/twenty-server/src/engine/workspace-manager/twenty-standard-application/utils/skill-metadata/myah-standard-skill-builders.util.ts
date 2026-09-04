import {
  MYAH_CAMPAIGN_OUTREACH_TOOL_NAMES,
  MYAH_CREATOR_OPS_TOOL_NAMES,
  MYAH_INBOX_TOOL_NAMES,
  MYAH_OUTREACH_EMAIL_TOOL_NAMES,
  REGISTERED_ACTION_TOOL_NAMES,
} from 'src/engine/core-modules/tool-provider/constants/myah-assistant-tool-names.constant';
import { REQUEST_APPROVAL_TOOL_NAME } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import {
  type CreateStandardSkillArgs,
  createStandardSkillFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/skill-metadata/create-standard-skill-flat-metadata.util';

const [
  addCreatorsToCreatorList,
  removeCreatorFromCreatorList,
  getCampaignAudience,
  addDirectCampaignCreators,
  attachCreatorListsToCampaign,
  detachCreatorListFromCampaign,
] = MYAH_CREATOR_OPS_TOOL_NAMES;

const [
  getCampaignOutreachWorkflow,
  createCampaignOutreachWorkflow,
  getCampaignOutreachWorkflowCurrentVersion,
  createCampaignOutreachWorkflowDraft,
  createCampaignOutreachWorkflowStep,
  updateCampaignOutreachWorkflowStep,
  deleteCampaignOutreachWorkflowStep,
  createCampaignOutreachWorkflowEdge,
  deleteCampaignOutreachWorkflowEdge,
  updateCampaignOutreachWorkflowTrigger,
  updateCampaignOutreachWorkflowPositions,
  computeCampaignOutreachStepOutputSchema,
  validateCampaignOutreachWorkflow,
  activateCampaignOutreachWorkflow,
  deactivateCampaignOutreachWorkflow,
  listCampaignOutreachWorkflowRuns,
  getCampaignOutreachWorkflowRun,
  listCampaignOutreachLogicFunctionTools,
  updateCampaignOutreachLogicFunctionSource,
  updateCampaignOutreachAgent,
] = MYAH_CAMPAIGN_OUTREACH_TOOL_NAMES;

const [
  searchMyahInboxThreads,
  getMyahInboxThreadContext,
  generateMyahInboxReplyProposal,
  updateMyahInboxThread,
  saveMyahInboxReplyDraft,
  getMyahInboxReplySendReadiness,
  getMyahInboxReplySendStatus,
] = MYAH_INBOX_TOOL_NAMES;

const [prepareOutreachEmailDraft, sendOutreachEmail] =
  MYAH_OUTREACH_EMAIL_TOOL_NAMES;

const sendMyahInboxReply = REGISTERED_ACTION_TOOL_NAMES.find(
  (toolName) => toolName === 'send_myah_inbox_reply',
);

if (sendMyahInboxReply === undefined) {
  throw new Error('Missing Myah Inbox registered action tool');
}

const internalWriteApproval = `Call ${REQUEST_APPROVAL_TOOL_NAME} immediately before every internal/generated write in its own step; after approval, execute exactly that one write and read back its returned state. Never authorize or describe more than one write tool call in the same approval.`;

const commonFailureHandling = `## Failure handling

- NOT_FOUND means the target is absent or permission-hidden; do not guess another record.
- PERMISSION_DENIED means stop and report that the current role cannot perform the action.
- VALIDATION_FAILED or NOT_READY means report the returned safe reason and required correction; do not bypass the domain rule.
- CONFLICT means stop, present the returned current state, and ask before proposing a new write.
- ALREADY_EXISTS is an idempotent no-op; read back the existing state instead of retrying.
- PENDING or UNKNOWN means do not retry or claim success. FAILED means report the safe failure and stop.
- Never expose raw provider, database, authentication, or cross-workspace error details.`;

export const MYAH_STANDARD_FLAT_SKILL_METADATA_BUILDERS_BY_SKILL_NAME = {
  'myah-inbox': (args: Omit<CreateStandardSkillArgs, 'context'>) =>
    createStandardSkillFlatMetadata({
      ...args,
      context: {
        skillName: 'myah-inbox',
        name: 'myah-inbox',
        label: 'Myah Inbox',
        icon: 'IconInbox',
        description:
          'Operate Myah Inbox threads safely, from context through approved delivery.',
        content: `# Myah Inbox

Inbox owns thread state, drafts, send readiness, and send receipts. Identify the thread from returned IDs, participants, channel, and recent context; never infer it from a display name.

## Procedure

1. For the current Inbox selection, call ${getMyahInboxThreadContext} directly without search and omit messageThreadId. Otherwise, find the thread with ${searchMyahInboxThreads}, resolve it from returned IDs, participants, channel, and recent context, then load ${getMyahInboxThreadContext}; use ${generateMyahInboxReplyProposal} only after the record is unambiguous.
2. ${internalWriteApproval} For a state change, call ${updateMyahInboxThread}, then read ${getMyahInboxThreadContext}.
3. Before saving, call ${getMyahInboxReplySendReadiness} and use its exact numeric revision. Preview the exact save input in the approval card: messageThreadId, expectedRevision, and body: { markdown: string, blocknote: null }. Then ${internalWriteApproval} Call ${saveMyahInboxReplyDraft}. If save returns CONFLICT, stop without retrying, present the returned current draft and revision, and ask whether to replace or reconcile it. If save returns SAVED, retain its returned draft revision and read ${getMyahInboxReplySendReadiness} again.
4. Delivery is registered: call ${REQUEST_APPROVAL_TOOL_NAME} in its own step with only toolName: "send_myah_inbox_reply" and actionInput: { messageThreadId, expectedDraftRevision }. Wait for approval, then call ${sendMyahInboxReply} with the actionApprovalBindingId. Never use a generic Inbox send.
5. Read ${getMyahInboxReplySendStatus} and report only its returned receipt/status.

## Safety

- Generic approval never substitutes for the registered approval binding.
- Do not create raw Message, MessageThread, or participant records to work around Inbox tools.
- Never claim a send, delivery, or read beyond returned tool results.

${commonFailureHandling}`,
        isCustom: false,
      },
    }),
  'myah-creators': (args: Omit<CreateStandardSkillArgs, 'context'>) =>
    createStandardSkillFlatMetadata({
      ...args,
      context: {
        skillName: 'myah-creators',
        name: 'myah-creators',
        label: 'Myah Creators',
        icon: 'IconUsers',
        description:
          'Find and manage Myah Creator records without changing campaign lifecycle state.',
        content: `# Myah Creators

Creator owns canonical identity, source, profile, social, and metric fields: name, email, phone, location, gender, language, profileType, creatorStatus, owner, source, sourceUrl, importSource, lastImportedAt, hasLinkInBio, hasBrandDeals, promotesAffiliateLinks, hasMerch, linksInBio, externalUrls, hashtagsUsed, categories, niches, notes, instagramUrl, instagramLink, instagramUsername, instagramBio, instagramFollowerCount, instagramEngagementPercent, instagramMostRecentPostDate, instagramMediaCount, instagramAvgLikes, instagramAvgComments, instagramReelsPercent, instagramReelsAvgViewCount, instagramPostingFrequencyRecentMonths, instagramEstimatedIncomeMin, instagramEstimatedIncomeMax, tiktokUrl, tiktokLink, tiktokUsername, tiktokBio, tiktokFollowerCount, tiktokMostRecentPostDate, tiktokEngagementPercent, tiktokVideoCount, tiktokPlayCountMedian, tiktokAvgLikes, tiktokAvgComments, tiktokAvgDownloads, tiktokPostingFrequencyRecentMonths, youtubeUrl, youtubeLink, youtubeCustomUrl, youtubeTitle, youtubeDescription, youtubeTopicDetails, youtubeSubscriberCount, youtubeLastUploadDate, youtubeLastStreamUploadDate, youtubeShortsPercentage, youtubeVideoCount, youtubeEngagementPercent, youtubeAvgViewsLong, youtubeAvgViewsShorts, youtubeAvgStreamViews, youtubeAvgStreamDuration, youtubePostingFrequencyRecentMonths, youtubeEstimatedIncomeMin, youtubeEstimatedIncomeMax, twitterUrl, twitterLink, twitterUsername, twitterBio, twitterFollowerCount, twitterEngagementPercent, twitchUrl, twitchUsername, twitchDisplayName, twitchTotalFollowers, and patreonUrl. Its read-only relations are listMemberships, campaignCreators, inboxThreads, taskTargets, noteTargets, timelineActivities, and attachments. CampaignCreator owns its Campaign-specific fields; do not use a Creator update to change campaign lifecycle or CampaignCreator.stage to overwrite the profile.

## Procedure

1. Use find_many_creators and find_one_creator to resolve stable IDs and the needed Creator fields; never select a Creator solely by display name.
2. For a new profile, ${internalWriteApproval} Call create_one_creator with only Creator-owned fields, then find_one_creator to read it back. For a profile correction, ${internalWriteApproval} call update_one_creator, then find_one_creator to verify returned fields.
3. Read List, Campaign, Inbox, Task, Note, Timeline, and attachment relations from the returned Creator record. For a native Creator Task follow-up, resolve the Creator, ${internalWriteApproval} call create_one_task, then ${internalWriteApproval} call create_one_task_target with task and targetCreator pointing to the returned Task and Creator; read back both records. For campaign membership, resolve Creator and Campaign, ${internalWriteApproval} call ${addDirectCampaignCreators}, then inspect ${getCampaignAudience}. Do not create raw CampaignCreator rows.
4. For a CampaignCreator update, resolve with find_many_campaign_creators and find_one_campaign_creator, ${internalWriteApproval} call update_one_campaign_creator only for CampaignCreator.stage, assignedManagedMailboxId, selectedContactMethod, nextActionAt, selectionReason, dealSummary, or outcomeSummary, then read it back.
5. Delete a Creator only after explicit destructive approval: ${internalWriteApproval} call delete_one_creator for the exact returned ID, then verify its absence with find_one_creator.

## Safety

- Do not conflate Campaign lifecycleStatus, Creator profile state, and CampaignCreator.stage.
- A generic approval does not authorize a registered external action.
- Duplicate Campaign membership is an idempotent no-op; never create raw CampaignCreator rows to force it.

${commonFailureHandling}`,
        isCustom: false,
      },
    }),
  'myah-creator-lists': (args: Omit<CreateStandardSkillArgs, 'context'>) =>
    createStandardSkillFlatMetadata({
      ...args,
      context: {
        skillName: 'myah-creator-lists',
        name: 'myah-creator-lists',
        label: 'Myah Creator Lists',
        icon: 'IconList',
        description:
          'Manage Myah Creator List membership and Campaign audience sources safely.',
        content: `# Myah Creator Lists

CreatorList owns name, source, description, and its reusable cohort. CampaignCreatorList is Campaign audience-source metadata, while CampaignCreator is resolved campaign membership. Resolve CreatorList, Creator, and Campaign IDs from returned records; names alone are not sufficient.

## Procedure

1. Use find_many_creator_lists and find_one_creator_list to resolve the list. For a new or changed list, ${internalWriteApproval} call create_one_creator_list or update_one_creator_list with only name, source, and description, then find_one_creator_list to read it back.
2. To add or remove a member, ${internalWriteApproval} call ${addCreatorsToCreatorList} or ${removeCreatorFromCreatorList}, then read back the affected list.
3. For the initial List attach, call attach_creator_lists_to_campaign directly after ${internalWriteApproval}; verify with ${getCampaignAudience}.
4. For later changes, call get_campaign_creator_list_addition_candidates, review returned additions, ${internalWriteApproval} call approve_campaign_creator_list_additions, then read get_campaign_audience without reattaching the List. Use ${detachCreatorListFromCampaign} only for the explicitly identified source and after ${internalWriteApproval}.

## Safety

- There are no raw Campaign-sensitive junction writes: use the dedicated list and audience tools only.
- Do not claim a list attached or a creator was added until readback returns it.
- Duplicate membership or attachment is an idempotent no-op; read back the existing relationship.
- Removing membership never deletes the Creator, CampaignCreator, or retained source history.

${commonFailureHandling}`,
        isCustom: false,
      },
    }),
  'myah-campaigns': (args: Omit<CreateStandardSkillArgs, 'context'>) =>
    createStandardSkillFlatMetadata({
      ...args,
      context: {
        skillName: 'myah-campaigns',
        name: 'myah-campaigns',
        label: 'Myah Campaigns',
        icon: 'IconTargetArrow',
        description:
          'Operate Myah Campaign audiences and outreach workflows with explicit validation.',
        content: `# Myah Campaigns

Campaign Home owns name, objective, owner, targetPlatforms, targetDemographics, icpGoal, budgetNotes, campaignBrief, communicationGuidelines, replyRules, escalationBoundaries, additionalNotes, and emailSignature. Campaign lifecycleStatus owns lifecycle; the legacy Campaign status is not a lifecycle control. CampaignCreator owns stage. Do not conflate Campaign status with Creator status or CampaignCreator.stage.

## Campaign Home and operations

1. Resolve a Campaign with find_many_campaigns and find_one_campaign. For a new Campaign, ${internalWriteApproval} call create_one_campaign, then find_one_campaign. For Campaign Home, Agent, or Operations changes, ${internalWriteApproval} call update_one_campaign, then find_one_campaign.
2. For lifecycleStatus, read the exact Campaign ID and observed lifecycleStatus, ${internalWriteApproval} call update_many_campaigns for exactly that Campaign ID, then find_one_campaign to read back lifecycleStatus. Never use update_one_campaign for lifecycle transitions.
3. Inspect audience with ${getCampaignAudience}. To add direct Creators, ${internalWriteApproval} call ${addDirectCampaignCreators}; for a List source, ${internalWriteApproval} call ${attachCreatorListsToCampaign}; read ${getCampaignAudience} after every change. Do not create raw Campaign-sensitive junction rows.
4. To create Campaign follow-up work, ${internalWriteApproval} call create_one_task, then ${internalWriteApproval} call create_one_task_target with task and targetCampaign pointing to the returned Task and Campaign; read back both records. To create a Campaign note, ${internalWriteApproval} call create_one_note, then ${internalWriteApproval} call create_one_note_target with note and targetCampaign pointing to the returned Note and Campaign; read back both records. Use find_many_tasks/find_one_task and find_many_notes/find_one_note before updates; ${internalWriteApproval} call update_one_task or update_one_note for the exact returned record, then read it back.
5. Influencer updates use find_many_campaign_creators/find_one_campaign_creator, then ${internalWriteApproval} update_one_campaign_creator only for CampaignCreator.stage, assignedManagedMailboxId, selectedContactMethod, nextActionAt, selectionReason, dealSummary, or outcomeSummary; read it back.

## Outreach workflow procedure

1. Load ${getCampaignOutreachWorkflow} and ${getCampaignOutreachWorkflowCurrentVersion}. If the workflow is missing, ${internalWriteApproval} call ${createCampaignOutreachWorkflow}; ${createCampaignOutreachWorkflow} creates the workflow and its initial DRAFT version atomically. Read ${getCampaignOutreachWorkflowCurrentVersion} afterward. Reuse an existing DRAFT version. Call ${createCampaignOutreachWorkflowDraft} only when an existing workflow has no editable DRAFT version, with its own approval, then read the returned current version.
2. For each draft write, ${internalWriteApproval} call exactly one of ${createCampaignOutreachWorkflowStep}, ${updateCampaignOutreachWorkflowStep}, ${deleteCampaignOutreachWorkflowStep}, ${createCampaignOutreachWorkflowEdge}, ${deleteCampaignOutreachWorkflowEdge}, ${updateCampaignOutreachWorkflowTrigger}, ${updateCampaignOutreachWorkflowPositions}, ${updateCampaignOutreachLogicFunctionSource}, or ${updateCampaignOutreachAgent}. Use ${listCampaignOutreachLogicFunctionTools} and ${computeCampaignOutreachStepOutputSchema} only for the identified draft. Validate with ${validateCampaignOutreachWorkflow}; ${internalWriteApproval} before ${activateCampaignOutreachWorkflow} or ${deactivateCampaignOutreachWorkflow}. Read ${listCampaignOutreachWorkflowRuns} and ${getCampaignOutreachWorkflowRun} before reporting run state.

## Approved outreach email

1. Resolve the selected Campaign Creator, Creator, Campaign, and sender; call ${prepareOutreachEmailDraft} with canonical IDs, subject, body, and optional parent header ID. Review its returned preview.
2. Call ${REQUEST_APPROVAL_TOOL_NAME} in its own step with only toolName: "send_outreach_email" and actionInput: { outreachActionId }, then wait for approval.
3. Only after approval, call ${sendOutreachEmail} with the actionApprovalBindingId. Read find_one_outreach_action and report only its returned receipt/status.

## Safety

- Generic and registered approval are distinct; never treat one as the other.
- Keep every workflow mutation tied to its returned workflow and version IDs.
- Do not report audience, activation, run, or delivery results beyond returned tool output.
- Duplicate direct audience additions and List attachments are idempotent no-ops; read back the existing audience.

${commonFailureHandling}`,
        isCustom: false,
      },
    }),
} satisfies Record<
  string,
  (
    args: Omit<CreateStandardSkillArgs, 'context'>,
  ) => ReturnType<typeof createStandardSkillFlatMetadata>
>;
