import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  JSON: { input: any; output: any; }
  UUID: { input: any; output: any; }
};

export enum CalendarChannelVisibility {
  METADATA = 'METADATA',
  SHARE_EVERYTHING = 'SHARE_EVERYTHING'
}

export type CampaignOutreachWorkflow = {
  __typename?: 'CampaignOutreachWorkflow';
  campaignId: Scalars['UUID']['output'];
  currentVersionId?: Maybe<Scalars['UUID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  workflowId: Scalars['UUID']['output'];
};

export type CampaignSequenceAbsent = {
  __typename?: 'CampaignSequenceAbsent';
  campaignId: Scalars['UUID']['output'];
  kind: Scalars['String']['output'];
};

export type CampaignSequenceIssue = {
  __typename?: 'CampaignSequenceIssue';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  messageId?: Maybe<Scalars['UUID']['output']>;
  path: Scalars['String']['output'];
};

export type CampaignSequenceLegacy = {
  __typename?: 'CampaignSequenceLegacy';
  campaignId: Scalars['UUID']['output'];
  kind: Scalars['String']['output'];
  workflowId: Scalars['UUID']['output'];
};

export type CampaignSequenceLoadResult = CampaignSequenceAbsent | CampaignSequenceLegacy | CampaignSequencePresent;

export type CampaignSequencePresent = {
  __typename?: 'CampaignSequencePresent';
  kind: Scalars['String']['output'];
  snapshot: CampaignSequenceSnapshot;
};

export type CampaignSequenceSnapshot = {
  __typename?: 'CampaignSequenceSnapshot';
  campaignId: Scalars['UUID']['output'];
  editable: Scalars['Boolean']['output'];
  issues: Array<CampaignSequenceIssue>;
  lifecycleStatus?: Maybe<Scalars['String']['output']>;
  sequence: Scalars['JSON']['output'];
  versionId: Scalars['UUID']['output'];
  versionStatus: Scalars['String']['output'];
  workflowId: Scalars['UUID']['output'];
};

export type ComputeStepOutputSchemaInput = {
  /** Step JSON format */
  step: Scalars['JSON']['input'];
  /** Workflow version ID */
  workflowVersionId?: InputMaybe<Scalars['UUID']['input']>;
};

export type ConnectedAccountHandleDto = {
  __typename?: 'ConnectedAccountHandleDTO';
  handle: Scalars['String']['output'];
  id: Scalars['UUID']['output'];
  provider: Scalars['String']['output'];
};

export type CreateDraftFromWorkflowVersionInput = {
  /** Workflow ID */
  workflowId: Scalars['UUID']['input'];
  /** Workflow version ID */
  workflowVersionIdToCopy: Scalars['UUID']['input'];
};

export type CreateWorkflowVersionEdgeInput = {
  /** Workflow version source step ID */
  source: Scalars['String']['input'];
  /** Workflow version source step connection options */
  sourceConnectionOptions?: InputMaybe<Scalars['JSON']['input']>;
  /** Workflow version target step ID */
  target: Scalars['String']['input'];
  /** Workflow version ID */
  workflowVersionId: Scalars['String']['input'];
};

export type CreateWorkflowVersionStepInput = {
  /** Default settings for the step */
  defaultSettings?: InputMaybe<Scalars['JSON']['input']>;
  /** Step ID */
  id?: InputMaybe<Scalars['String']['input']>;
  /** Next step ID */
  nextStepId?: InputMaybe<Scalars['UUID']['input']>;
  /** Parent step connection options */
  parentStepConnectionOptions?: InputMaybe<Scalars['JSON']['input']>;
  /** Parent step ID */
  parentStepId?: InputMaybe<Scalars['String']['input']>;
  /** Step position */
  position?: InputMaybe<WorkflowStepPositionInput>;
  /** New step type */
  stepType: Scalars['String']['input'];
  /** Workflow version ID */
  workflowVersionId: Scalars['UUID']['input'];
};

export type DateTimeFilter = {
  eq?: InputMaybe<Scalars['DateTime']['input']>;
  gt?: InputMaybe<Scalars['DateTime']['input']>;
  gte?: InputMaybe<Scalars['DateTime']['input']>;
  in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  is?: InputMaybe<FilterIs>;
  lt?: InputMaybe<Scalars['DateTime']['input']>;
  lte?: InputMaybe<Scalars['DateTime']['input']>;
  neq?: InputMaybe<Scalars['DateTime']['input']>;
};

export type DeleteWorkflowVersionStepInput = {
  /** Step to delete ID */
  stepId: Scalars['String']['input'];
  /** Workflow version ID */
  workflowVersionId: Scalars['UUID']['input'];
};

export type DuplicateWorkflowInput = {
  /** Workflow ID to duplicate */
  workflowIdToDuplicate: Scalars['UUID']['input'];
  /** Workflow version ID to copy */
  workflowVersionIdToCopy: Scalars['UUID']['input'];
};

export type DuplicateWorkflowVersionStepInput = {
  stepId: Scalars['String']['input'];
  workflowVersionId: Scalars['String']['input'];
};

export enum FilterIs {
  NotNull = 'NotNull',
  Null = 'Null'
}

export type GenerateMyahInboxReplyProposalInput = {
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  operatorInstructions: Scalars['String']['input'];
  threadId: Scalars['UUID']['input'];
};

export type GetInstagramMessageDraftInput = {
  conversationRecordId?: InputMaybe<Scalars['UUID']['input']>;
  creatorRecordId?: InputMaybe<Scalars['UUID']['input']>;
  kind: Scalars['String']['input'];
};

export type InstagramActionUsage = {
  __typename?: 'InstagramActionUsage';
  dailyLimit: Scalars['Int']['output'];
  dailyRemaining: Scalars['Int']['output'];
  dailyUsed: Scalars['Int']['output'];
  hourlyLimit: Scalars['Int']['output'];
  hourlyRemaining: Scalars['Int']['output'];
  hourlyUsed: Scalars['Int']['output'];
  nextEligibleAt?: Maybe<Scalars['DateTime']['output']>;
};

export type InstagramMessageDraftResultDto = {
  __typename?: 'InstagramMessageDraftResultDto';
  body: Scalars['String']['output'];
  draftId: Scalars['UUID']['output'];
  executionLocked?: Maybe<Scalars['Boolean']['output']>;
  revision: Scalars['Int']['output'];
  status: Scalars['String']['output'];
};

export type InstagramMessageSendResultDto = {
  __typename?: 'InstagramMessageSendResultDto';
  blockedWindows?: Maybe<Array<Scalars['String']['output']>>;
  code?: Maybe<Scalars['String']['output']>;
  dailyLimit?: Maybe<Scalars['Int']['output']>;
  dailyRemaining?: Maybe<Scalars['Int']['output']>;
  dailyUsed?: Maybe<Scalars['Int']['output']>;
  hourlyLimit?: Maybe<Scalars['Int']['output']>;
  hourlyRemaining?: Maybe<Scalars['Int']['output']>;
  hourlyUsed?: Maybe<Scalars['Int']['output']>;
  nextEligibleAt?: Maybe<Scalars['DateTime']['output']>;
  receiptId: Scalars['UUID']['output'];
  status: Scalars['String']['output'];
};

export type InstagramMessageSendStatusDto = {
  __typename?: 'InstagramMessageSendStatusDto';
  outcome?: Maybe<Scalars['String']['output']>;
  providerCode?: Maybe<Scalars['String']['output']>;
  receiptId: Scalars['UUID']['output'];
  state: Scalars['String']['output'];
};

export type InstagramMessageSendStatusInput = {
  receiptId: Scalars['UUID']['input'];
};

export type InstagramSendOutcomeResolutionDto = {
  __typename?: 'InstagramSendOutcomeResolutionDto';
  id: Scalars['UUID']['output'];
  outcome: Scalars['String']['output'];
  receiptId: Scalars['UUID']['output'];
};

export type LinkMetadata = {
  __typename?: 'LinkMetadata';
  label: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type LinkMyahInboxContactCreatorInput = {
  contactId: Scalars['String']['input'];
  creatorId?: InputMaybe<Scalars['UUID']['input']>;
};

export type LinksMetadata = {
  __typename?: 'LinksMetadata';
  primaryLinkLabel: Scalars['String']['output'];
  primaryLinkUrl: Scalars['String']['output'];
  secondaryLinks?: Maybe<Array<LinkMetadata>>;
};

export enum MessageChannelVisibility {
  METADATA = 'METADATA',
  SHARE_EVERYTHING = 'SHARE_EVERYTHING',
  SUBJECT = 'SUBJECT'
}

export type Mutation = {
  __typename?: 'Mutation';
  activateWorkflowVersion: Scalars['Boolean']['output'];
  computeStepOutputSchema: Scalars['JSON']['output'];
  createCampaignOutreachWorkflow: CampaignOutreachWorkflow;
  createDraftFromWorkflowVersion: WorkflowVersionDto;
  createWorkflowVersionEdge: WorkflowVersionStepChanges;
  createWorkflowVersionStep: WorkflowVersionStepChanges;
  deactivateWorkflowVersion: Scalars['Boolean']['output'];
  deleteWorkflowVersionEdge: WorkflowVersionStepChanges;
  deleteWorkflowVersionStep: WorkflowVersionStepChanges;
  dismissMaintenanceModeBanner: Scalars['Boolean']['output'];
  dismissReconnectAccountBanner: Scalars['Boolean']['output'];
  duplicateWorkflow: WorkflowVersionDto;
  duplicateWorkflowVersionStep: WorkflowVersionStepChanges;
  generateMyahInboxReplyProposal: MyahInboxReplyProposal;
  linkMyahInboxContactCreator: Scalars['String']['output'];
  publishCampaignSequence: CampaignSequenceSnapshot;
  replaceLegacyCampaignSequence: CampaignSequenceSnapshot;
  resolveInstagramUnknownSend: InstagramSendOutcomeResolutionDto;
  retryWorkflowRun: WorkflowRun;
  runWorkflowVersion: RunWorkflowVersion;
  saveCampaignSequence: CampaignSequenceSnapshot;
  saveInstagramMessageDraft: InstagramMessageDraftResultDto;
  saveMyahInboxDraft: MyahInboxDraftSaveResult;
  sendInstagramMessage: InstagramMessageSendResultDto;
  sendMyahInboxReply: MyahInboxReplySendResult;
  stopWorkflowRun: WorkflowRun;
  submitFormStep: Scalars['Boolean']['output'];
  testHttpRequest: TestHttpRequest;
  updateMyahInboxContactTriage: MyahInboxContactTriage;
  updateMyahInboxThread: MyahInboxThreadSummary;
  updateWorkflowRunStep: WorkflowAction;
  updateWorkflowVersionPositions: Scalars['Boolean']['output'];
  updateWorkflowVersionStep: WorkflowAction;
  validateCampaignSequence: CampaignSequenceSnapshot;
};


export type MutationActivateWorkflowVersionArgs = {
  workflowVersionId: Scalars['UUID']['input'];
};


export type MutationComputeStepOutputSchemaArgs = {
  input: ComputeStepOutputSchemaInput;
};


export type MutationCreateCampaignOutreachWorkflowArgs = {
  campaignId: Scalars['UUID']['input'];
};


export type MutationCreateDraftFromWorkflowVersionArgs = {
  input: CreateDraftFromWorkflowVersionInput;
};


export type MutationCreateWorkflowVersionEdgeArgs = {
  input: CreateWorkflowVersionEdgeInput;
};


export type MutationCreateWorkflowVersionStepArgs = {
  input: CreateWorkflowVersionStepInput;
};


export type MutationDeactivateWorkflowVersionArgs = {
  workflowVersionId: Scalars['UUID']['input'];
};


export type MutationDeleteWorkflowVersionEdgeArgs = {
  input: CreateWorkflowVersionEdgeInput;
};


export type MutationDeleteWorkflowVersionStepArgs = {
  input: DeleteWorkflowVersionStepInput;
};


export type MutationDismissReconnectAccountBannerArgs = {
  connectedAccountId: Scalars['UUID']['input'];
};


export type MutationDuplicateWorkflowArgs = {
  input: DuplicateWorkflowInput;
};


export type MutationDuplicateWorkflowVersionStepArgs = {
  input: DuplicateWorkflowVersionStepInput;
};


export type MutationGenerateMyahInboxReplyProposalArgs = {
  input: GenerateMyahInboxReplyProposalInput;
};


export type MutationLinkMyahInboxContactCreatorArgs = {
  input: LinkMyahInboxContactCreatorInput;
};


export type MutationPublishCampaignSequenceArgs = {
  input: PublishCampaignSequenceInput;
};


export type MutationReplaceLegacyCampaignSequenceArgs = {
  input: ReplaceLegacyCampaignSequenceInput;
};


export type MutationResolveInstagramUnknownSendArgs = {
  input: ResolveInstagramSendOutcomeInput;
};


export type MutationRetryWorkflowRunArgs = {
  workflowRunId: Scalars['UUID']['input'];
};


export type MutationRunWorkflowVersionArgs = {
  input: RunWorkflowVersionInput;
};


export type MutationSaveCampaignSequenceArgs = {
  input: SaveCampaignSequenceInput;
};


export type MutationSaveInstagramMessageDraftArgs = {
  input: SaveInstagramMessageDraftInput;
};


export type MutationSaveMyahInboxDraftArgs = {
  input: SaveMyahInboxDraftInput;
};


export type MutationSendInstagramMessageArgs = {
  input: SendInstagramMessageInput;
};


export type MutationSendMyahInboxReplyArgs = {
  input: SendMyahInboxReplyInput;
};


export type MutationStopWorkflowRunArgs = {
  workflowRunId: Scalars['UUID']['input'];
};


export type MutationSubmitFormStepArgs = {
  input: SubmitFormStepInput;
};


export type MutationTestHttpRequestArgs = {
  input: TestHttpRequestInput;
};


export type MutationUpdateMyahInboxContactTriageArgs = {
  input: UpdateMyahInboxContactTriageInput;
};


export type MutationUpdateMyahInboxThreadArgs = {
  input: UpdateMyahInboxThreadInput;
};


export type MutationUpdateWorkflowRunStepArgs = {
  input: UpdateWorkflowRunStepInput;
};


export type MutationUpdateWorkflowVersionPositionsArgs = {
  input: UpdateWorkflowVersionPositionsInput;
};


export type MutationUpdateWorkflowVersionStepArgs = {
  input: UpdateWorkflowVersionStepInput;
};


export type MutationValidateCampaignSequenceArgs = {
  campaignId: Scalars['UUID']['input'];
  expectedVersionId: Scalars['UUID']['input'];
};

export type MyahInboxContactConnection = {
  __typename?: 'MyahInboxContactConnection';
  edges: Array<MyahInboxContactEdge>;
  pageInfo: MyahInboxContactPageInfo;
  totalCount: Scalars['Int']['output'];
};

export type MyahInboxContactEdge = {
  __typename?: 'MyahInboxContactEdge';
  cursor: Scalars['String']['output'];
  node: MyahInboxContactSummary;
};

export type MyahInboxContactEmailChannelSummary = {
  __typename?: 'MyahInboxContactEmailChannelSummary';
  isAvailable: Scalars['Boolean']['output'];
  latestThreadId?: Maybe<Scalars['UUID']['output']>;
  needsAttention: Scalars['Boolean']['output'];
  threadCount: Scalars['Int']['output'];
  threadIds: Array<Scalars['UUID']['output']>;
};

export type MyahInboxContactEmailMessage = {
  __typename?: 'MyahInboxContactEmailMessage';
  attachmentFileIds: Array<Scalars['UUID']['output']>;
  direction: Scalars['String']['output'];
  id: Scalars['UUID']['output'];
  messageThreadId: Scalars['UUID']['output'];
  participants: Array<MyahInboxContactEmailParticipant>;
  receivedAt: Scalars['String']['output'];
  subject?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
  visibility: Scalars['String']['output'];
};

export type MyahInboxContactEmailMessageConnection = {
  __typename?: 'MyahInboxContactEmailMessageConnection';
  edges: Array<MyahInboxContactEmailMessageEdge>;
  pageInfo: MyahInboxContactEmailMessagePageInfo;
};

export type MyahInboxContactEmailMessageEdge = {
  __typename?: 'MyahInboxContactEmailMessageEdge';
  cursor: Scalars['String']['output'];
  node: MyahInboxContactEmailMessage;
};

export type MyahInboxContactEmailMessagePageInfo = {
  __typename?: 'MyahInboxContactEmailMessagePageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type MyahInboxContactEmailParticipant = {
  __typename?: 'MyahInboxContactEmailParticipant';
  displayName?: Maybe<Scalars['String']['output']>;
  handle?: Maybe<Scalars['String']['output']>;
  role: Scalars['String']['output'];
};

export enum MyahInboxContactIdentityKind {
  CREATOR = 'CREATOR',
  EMAIL_THREAD = 'EMAIL_THREAD',
  INSTAGRAM_CONVERSATION = 'INSTAGRAM_CONVERSATION'
}

export type MyahInboxContactInstagramChannelSummary = {
  __typename?: 'MyahInboxContactInstagramChannelSummary';
  conversations: Array<MyahInboxContactInstagramConversation>;
  isAvailable: Scalars['Boolean']['output'];
  needsAttention: Scalars['Boolean']['output'];
  state: MyahInboxInstagramChannelState;
};

export type MyahInboxContactInstagramConversation = {
  __typename?: 'MyahInboxContactInstagramConversation';
  id: Scalars['UUID']['output'];
  lastActivityAt: Scalars['String']['output'];
  latestDirection?: Maybe<Scalars['String']['output']>;
  lifecycle: Scalars['String']['output'];
  provider: Scalars['String']['output'];
  providerConversationId: Scalars['String']['output'];
  recipientDisplayName?: Maybe<Scalars['String']['output']>;
  recipientUsername?: Maybe<Scalars['String']['output']>;
};

export enum MyahInboxContactLatestChannel {
  EMAIL = 'EMAIL',
  INSTAGRAM = 'INSTAGRAM'
}

export type MyahInboxContactPageInfo = {
  __typename?: 'MyahInboxContactPageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type MyahInboxContactSummary = {
  __typename?: 'MyahInboxContactSummary';
  creator?: Maybe<MyahInboxThreadContext>;
  displayName: Scalars['String']['output'];
  email: MyahInboxContactEmailChannelSummary;
  id: Scalars['String']['output'];
  identityKind: MyahInboxContactIdentityKind;
  instagram: MyahInboxContactInstagramChannelSummary;
  instagramUsername?: Maybe<Scalars['String']['output']>;
  lastActivityAt: Scalars['String']['output'];
  latestChannel: MyahInboxContactLatestChannel;
  needsAttention: Scalars['Boolean']['output'];
  preview?: Maybe<Scalars['String']['output']>;
  sender?: Maybe<Scalars['String']['output']>;
  triage: MyahInboxContactTriageSummary;
};

export type MyahInboxContactTriage = {
  __typename?: 'MyahInboxContactTriage';
  identityGeneration: Scalars['String']['output'];
  inboxOwnerId?: Maybe<Scalars['UUID']['output']>;
  inboxState: MyahInboxState;
  revision: Scalars['Int']['output'];
  snoozedUntil?: Maybe<Scalars['String']['output']>;
};

export type MyahInboxContactTriageSummary = {
  __typename?: 'MyahInboxContactTriageSummary';
  identityGeneration?: Maybe<Scalars['String']['output']>;
  inboxOwnerId?: Maybe<Scalars['UUID']['output']>;
  inboxState?: Maybe<MyahInboxState>;
  isAvailable: Scalars['Boolean']['output'];
  revision?: Maybe<Scalars['Int']['output']>;
  snoozedUntil?: Maybe<Scalars['String']['output']>;
};

export type MyahInboxDraftSaveResult = {
  __typename?: 'MyahInboxDraftSaveResult';
  body?: Maybe<MyahInboxRichText>;
  revision: Scalars['Int']['output'];
  status: MyahInboxDraftSaveStatus;
};

export enum MyahInboxDraftSaveStatus {
  CONFLICT = 'CONFLICT',
  SAVED = 'SAVED'
}

export type MyahInboxEmailCard = {
  __typename?: 'MyahInboxEmailCard';
  campaignLabel?: Maybe<Scalars['String']['output']>;
  historyBasis: Scalars['String']['output'];
  rootMessageId: Scalars['UUID']['output'];
  startTimestamp: Scalars['String']['output'];
  subject?: Maybe<Scalars['String']['output']>;
  threadId: Scalars['UUID']['output'];
};

export type MyahInboxEmailCardPage = {
  __typename?: 'MyahInboxEmailCardPage';
  cards: Array<MyahInboxEmailCard>;
  latestThreadId?: Maybe<Scalars['UUID']['output']>;
  olderCursor?: Maybe<Scalars['String']['output']>;
  snapshot: Scalars['String']['output'];
};

export type MyahInboxEmailCardProjection = {
  __typename?: 'MyahInboxEmailCardProjection';
  card?: Maybe<MyahInboxEmailCard>;
  snapshot: Scalars['String']['output'];
};

export type MyahInboxEmailDraft = {
  __typename?: 'MyahInboxEmailDraft';
  body?: Maybe<MyahInboxRichText>;
  revision: Scalars['Int']['output'];
  threadId: Scalars['UUID']['output'];
  workspaceId: Scalars['UUID']['output'];
};

export type MyahInboxEmailMessageLocation = {
  __typename?: 'MyahInboxEmailMessageLocation';
  card: MyahInboxEmailCard;
  messageId: Scalars['UUID']['output'];
  page: MyahInboxEmailMessagePage;
};

export type MyahInboxEmailMessagePage = {
  __typename?: 'MyahInboxEmailMessagePage';
  messages: Array<MyahInboxContactEmailMessage>;
  newerCursor?: Maybe<Scalars['String']['output']>;
  olderCursor?: Maybe<Scalars['String']['output']>;
  root: MyahInboxContactEmailMessage;
  threadId: Scalars['UUID']['output'];
};

export enum MyahInboxInstagramChannelState {
  AMBIGUOUS = 'AMBIGUOUS',
  READY = 'READY',
  UNAVAILABLE = 'UNAVAILABLE'
}

export type MyahInboxInstagramMessage = {
  __typename?: 'MyahInboxInstagramMessage';
  attachmentCount: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  deliveryState: Scalars['String']['output'];
  direction: Scalars['String']['output'];
  hasAttachments: Scalars['Boolean']['output'];
  id: Scalars['String']['output'];
  provider: Scalars['String']['output'];
  providerCreatedAt?: Maybe<Scalars['String']['output']>;
  sentVia: Scalars['String']['output'];
  text?: Maybe<Scalars['String']['output']>;
};

export type MyahInboxInstagramMessageConnection = {
  __typename?: 'MyahInboxInstagramMessageConnection';
  edges: Array<MyahInboxInstagramMessageEdge>;
  pageInfo: MyahInboxInstagramMessagePageInfo;
};

export type MyahInboxInstagramMessageEdge = {
  __typename?: 'MyahInboxInstagramMessageEdge';
  cursor: Scalars['String']['output'];
  node: MyahInboxInstagramMessage;
};

export type MyahInboxInstagramMessagePageInfo = {
  __typename?: 'MyahInboxInstagramMessagePageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type MyahInboxReplyProposal = {
  __typename?: 'MyahInboxReplyProposal';
  body: MyahInboxReplyProposalBody;
};

export type MyahInboxReplyProposalBody = {
  __typename?: 'MyahInboxReplyProposalBody';
  blocknote?: Maybe<Scalars['String']['output']>;
  markdown: Scalars['String']['output'];
};

export enum MyahInboxReplySendOutcome {
  FAILED = 'FAILED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  STALE = 'STALE',
  UNKNOWN = 'UNKNOWN'
}

export type MyahInboxReplySendReadiness = {
  __typename?: 'MyahInboxReplySendReadiness';
  body?: Maybe<MyahInboxRichText>;
  reason?: Maybe<Scalars['String']['output']>;
  revision: Scalars['Int']['output'];
  status: MyahInboxReplySendReadinessStatus;
};

export enum MyahInboxReplySendReadinessStatus {
  MAILBOX_INELIGIBLE = 'MAILBOX_INELIGIBLE',
  OUTCOME_PENDING = 'OUTCOME_PENDING',
  OUTCOME_UNKNOWN = 'OUTCOME_UNKNOWN',
  READY = 'READY',
  RECIPIENT_UNAVAILABLE = 'RECIPIENT_UNAVAILABLE',
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  SENDER_UNAVAILABLE = 'SENDER_UNAVAILABLE',
  THREAD_UNAVAILABLE = 'THREAD_UNAVAILABLE'
}

export type MyahInboxReplySendResult = {
  __typename?: 'MyahInboxReplySendResult';
  body?: Maybe<MyahInboxRichText>;
  outcome: MyahInboxReplySendOutcome;
  receiptId?: Maybe<Scalars['String']['output']>;
  revision: Scalars['Int']['output'];
};

export type MyahInboxReplySendStatus = {
  __typename?: 'MyahInboxReplySendStatus';
  body?: Maybe<MyahInboxRichText>;
  outcome: MyahInboxReplySendOutcome;
  receiptId?: Maybe<Scalars['String']['output']>;
  revision: Scalars['Int']['output'];
};

export type MyahInboxReplySendStatusInput = {
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  receiptId: Scalars['UUID']['input'];
  threadId: Scalars['UUID']['input'];
};

export type MyahInboxRichText = {
  __typename?: 'MyahInboxRichText';
  blocknote?: Maybe<Scalars['String']['output']>;
  markdown: Scalars['String']['output'];
};

export type MyahInboxRichTextInput = {
  blocknote?: InputMaybe<Scalars['String']['input']>;
  markdown: Scalars['String']['input'];
};

export enum MyahInboxSnoozeStatus {
  ACTIVE = 'ACTIVE',
  DUE = 'DUE'
}

export enum MyahInboxState {
  CLOSED = 'CLOSED',
  NEEDS_REPLY = 'NEEDS_REPLY',
  SNOOZED = 'SNOOZED',
  WAITING_ON_CREATOR = 'WAITING_ON_CREATOR'
}

export type MyahInboxThreadConnection = {
  __typename?: 'MyahInboxThreadConnection';
  edges: Array<MyahInboxThreadEdge>;
  pageInfo: MyahInboxThreadPageInfo;
};

export type MyahInboxThreadContext = {
  __typename?: 'MyahInboxThreadContext';
  id: Scalars['UUID']['output'];
  name?: Maybe<Scalars['String']['output']>;
};

export type MyahInboxThreadEdge = {
  __typename?: 'MyahInboxThreadEdge';
  cursor: Scalars['String']['output'];
  node: MyahInboxThreadSummary;
};

export type MyahInboxThreadPageInfo = {
  __typename?: 'MyahInboxThreadPageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type MyahInboxThreadSummary = {
  __typename?: 'MyahInboxThreadSummary';
  campaign?: Maybe<MyahInboxThreadContext>;
  creator?: Maybe<MyahInboxThreadContext>;
  id: Scalars['UUID']['output'];
  lastActivityAt: Scalars['String']['output'];
  lastMessagePreview?: Maybe<Scalars['String']['output']>;
  lastMessageSender?: Maybe<Scalars['String']['output']>;
  subject?: Maybe<Scalars['String']['output']>;
};

export type ObjectRecordFilterInput = {
  and?: InputMaybe<Array<ObjectRecordFilterInput>>;
  createdAt?: InputMaybe<DateTimeFilter>;
  deletedAt?: InputMaybe<DateTimeFilter>;
  id?: InputMaybe<UuidFilter>;
  not?: InputMaybe<ObjectRecordFilterInput>;
  or?: InputMaybe<Array<ObjectRecordFilterInput>>;
  updatedAt?: InputMaybe<DateTimeFilter>;
};

export type PublishCampaignSequenceInput = {
  campaignId: Scalars['UUID']['input'];
  expectedVersionId: Scalars['UUID']['input'];
};

export type Query = {
  __typename?: 'Query';
  campaignSequence: CampaignSequenceLoadResult;
  findCampaignOutreachWorkflow?: Maybe<CampaignOutreachWorkflow>;
  /** @deprecated Use getTimelineCalendarEventsFromObjectRecord instead */
  getTimelineCalendarEventsFromCompanyId: TimelineCalendarEventsWithTotal;
  getTimelineCalendarEventsFromObjectRecord: TimelineCalendarEventsWithTotal;
  /** @deprecated Use getTimelineCalendarEventsFromObjectRecord instead */
  getTimelineCalendarEventsFromOpportunityId: TimelineCalendarEventsWithTotal;
  /** @deprecated Use getTimelineCalendarEventsFromObjectRecord instead */
  getTimelineCalendarEventsFromPersonId: TimelineCalendarEventsWithTotal;
  /** @deprecated Use getTimelineThreadsFromObjectRecord instead */
  getTimelineThreadsFromCompanyId: TimelineThreadsWithTotal;
  getTimelineThreadsFromObjectRecord: TimelineThreadsWithTotal;
  /** @deprecated Use getTimelineThreadsFromObjectRecord instead */
  getTimelineThreadsFromOpportunityId: TimelineThreadsWithTotal;
  /** @deprecated Use getTimelineThreadsFromObjectRecord instead */
  getTimelineThreadsFromPersonId: TimelineThreadsWithTotal;
  instagramActionUsage: InstagramActionUsage;
  instagramMessageDraft?: Maybe<InstagramMessageDraftResultDto>;
  instagramMessageSendStatus: InstagramMessageSendStatusDto;
  isMaintenanceModeBannerDismissed: Scalars['Boolean']['output'];
  myahInboxContact: MyahInboxContactSummary;
  myahInboxContactEmailCard: MyahInboxEmailCardProjection;
  myahInboxContactEmailCardMessages: MyahInboxEmailMessagePage;
  myahInboxContactEmailCards: MyahInboxEmailCardPage;
  myahInboxContactEmailMessageLocation?: Maybe<MyahInboxEmailMessageLocation>;
  myahInboxContactEmailMessages: MyahInboxContactEmailMessageConnection;
  myahInboxContacts: MyahInboxContactConnection;
  myahInboxEmailDraft: MyahInboxEmailDraft;
  myahInboxInstagramMessages: MyahInboxInstagramMessageConnection;
  myahInboxReplySendReadiness: MyahInboxReplySendReadiness;
  myahInboxReplySendStatus: MyahInboxReplySendStatus;
  myahInboxThreads: MyahInboxThreadConnection;
  search: SearchResultConnection;
  workflowStepConnectedAccountHandle?: Maybe<ConnectedAccountHandleDto>;
};


export type QueryCampaignSequenceArgs = {
  campaignId: Scalars['UUID']['input'];
};


export type QueryFindCampaignOutreachWorkflowArgs = {
  campaignId: Scalars['UUID']['input'];
};


export type QueryGetTimelineCalendarEventsFromCompanyIdArgs = {
  companyId: Scalars['UUID']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
};


export type QueryGetTimelineCalendarEventsFromObjectRecordArgs = {
  objectNameSingular: Scalars['String']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
  recordId: Scalars['UUID']['input'];
};


export type QueryGetTimelineCalendarEventsFromOpportunityIdArgs = {
  opportunityId: Scalars['UUID']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
};


export type QueryGetTimelineCalendarEventsFromPersonIdArgs = {
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
  personId: Scalars['UUID']['input'];
};


export type QueryGetTimelineThreadsFromCompanyIdArgs = {
  companyId: Scalars['UUID']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
};


export type QueryGetTimelineThreadsFromObjectRecordArgs = {
  objectNameSingular: Scalars['String']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
  recordId: Scalars['UUID']['input'];
};


export type QueryGetTimelineThreadsFromOpportunityIdArgs = {
  opportunityId: Scalars['UUID']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
};


export type QueryGetTimelineThreadsFromPersonIdArgs = {
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
  personId: Scalars['UUID']['input'];
};


export type QueryInstagramMessageDraftArgs = {
  input: GetInstagramMessageDraftInput;
};


export type QueryInstagramMessageSendStatusArgs = {
  input: InstagramMessageSendStatusInput;
};


export type QueryMyahInboxContactArgs = {
  contactId: Scalars['String']['input'];
};


export type QueryMyahInboxContactEmailCardArgs = {
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  threadId: Scalars['UUID']['input'];
};


export type QueryMyahInboxContactEmailCardMessagesArgs = {
  contactId: Scalars['String']['input'];
  cursor?: InputMaybe<Scalars['String']['input']>;
  expectedWorkspaceId: Scalars['UUID']['input'];
  snapshot: Scalars['String']['input'];
  threadId: Scalars['UUID']['input'];
};


export type QueryMyahInboxContactEmailCardsArgs = {
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  olderCursor?: InputMaybe<Scalars['String']['input']>;
  snapshot?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMyahInboxContactEmailMessageLocationArgs = {
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  messageId: Scalars['UUID']['input'];
  snapshot: Scalars['String']['input'];
};


export type QueryMyahInboxContactEmailMessagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  contactId: Scalars['String']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMyahInboxContactsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  campaignId?: InputMaybe<Scalars['String']['input']>;
  contactId?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  snoozeStatus?: InputMaybe<MyahInboxSnoozeStatus>;
  states?: InputMaybe<Array<MyahInboxState>>;
};


export type QueryMyahInboxEmailDraftArgs = {
  expectedWorkspaceId: Scalars['UUID']['input'];
  threadId: Scalars['UUID']['input'];
};


export type QueryMyahInboxInstagramMessagesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  conversationId: Scalars['String']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMyahInboxReplySendReadinessArgs = {
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  threadId: Scalars['UUID']['input'];
};


export type QueryMyahInboxReplySendStatusArgs = {
  input: MyahInboxReplySendStatusInput;
};


export type QueryMyahInboxThreadsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  campaignId?: InputMaybe<Scalars['String']['input']>;
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  threadId?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySearchArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  excludedObjectNameSingulars?: InputMaybe<Array<Scalars['String']['input']>>;
  filter?: InputMaybe<ObjectRecordFilterInput>;
  includedObjectNameSingulars?: InputMaybe<Array<Scalars['String']['input']>>;
  limit: Scalars['Int']['input'];
  searchInput: Scalars['String']['input'];
};


export type QueryWorkflowStepConnectedAccountHandleArgs = {
  connectedAccountId: Scalars['UUID']['input'];
};

export type ReplaceLegacyCampaignSequenceInput = {
  campaignId: Scalars['UUID']['input'];
  expectedWorkflowId: Scalars['UUID']['input'];
};

export type ResolveInstagramSendOutcomeInput = {
  notes?: InputMaybe<Scalars['String']['input']>;
  outcome: Scalars['String']['input'];
  receiptId: Scalars['UUID']['input'];
  recipientUiReviewed?: InputMaybe<Scalars['Boolean']['input']>;
  senderUiReviewed?: InputMaybe<Scalars['Boolean']['input']>;
};

export type RunWorkflowVersion = {
  __typename?: 'RunWorkflowVersion';
  workflowRunId: Scalars['UUID']['output'];
};

export type RunWorkflowVersionInput = {
  /** Execution result in JSON format */
  payload?: InputMaybe<Scalars['JSON']['input']>;
  /** Workflow run ID */
  workflowRunId?: InputMaybe<Scalars['UUID']['input']>;
  /** Workflow version ID */
  workflowVersionId: Scalars['UUID']['input'];
};

export type SaveCampaignSequenceInput = {
  campaignId: Scalars['UUID']['input'];
  expectedVersionId: Scalars['UUID']['input'];
  sequence: Scalars['JSON']['input'];
};

export type SaveInstagramMessageDraftInput = {
  body: Scalars['String']['input'];
  conversationRecordId?: InputMaybe<Scalars['UUID']['input']>;
  creatorRecordId?: InputMaybe<Scalars['UUID']['input']>;
  draftId: Scalars['UUID']['input'];
  expectedRevision: Scalars['Int']['input'];
  kind: Scalars['String']['input'];
};

export type SaveMyahInboxDraftInput = {
  body?: InputMaybe<MyahInboxRichTextInput>;
  expectedRevision: Scalars['Int']['input'];
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  threadId: Scalars['UUID']['input'];
};

export type SearchRecord = {
  __typename?: 'SearchRecord';
  imageUrl?: Maybe<Scalars['String']['output']>;
  label: Scalars['String']['output'];
  objectLabelSingular: Scalars['String']['output'];
  objectNameSingular: Scalars['String']['output'];
  recordId: Scalars['UUID']['output'];
  tsRank: Scalars['Float']['output'];
  tsRankCD: Scalars['Float']['output'];
};

export type SearchResultConnection = {
  __typename?: 'SearchResultConnection';
  edges: Array<SearchResultEdge>;
  pageInfo: SearchResultPageInfo;
};

export type SearchResultEdge = {
  __typename?: 'SearchResultEdge';
  cursor: Scalars['String']['output'];
  node: SearchRecord;
};

export type SearchResultPageInfo = {
  __typename?: 'SearchResultPageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type SendInstagramMessageInput = {
  draftId: Scalars['UUID']['input'];
  expectedRevision: Scalars['Int']['input'];
};

export type SendMyahInboxReplyInput = {
  expectedDraftRevision: Scalars['Int']['input'];
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  threadId: Scalars['UUID']['input'];
};

export type SubmitFormStepInput = {
  /** Form response in JSON format */
  response: Scalars['JSON']['input'];
  /** Workflow step ID */
  stepId: Scalars['UUID']['input'];
  /** Workflow run ID */
  workflowRunId: Scalars['UUID']['input'];
};

export type TestHttpRequest = {
  __typename?: 'TestHttpRequest';
  /** Error information */
  error?: Maybe<Scalars['JSON']['output']>;
  /** Response headers */
  headers?: Maybe<Scalars['JSON']['output']>;
  /** Message describing the result */
  message: Scalars['String']['output'];
  /** Response data */
  result?: Maybe<Scalars['JSON']['output']>;
  /** HTTP status code */
  status?: Maybe<Scalars['Float']['output']>;
  /** HTTP status text */
  statusText?: Maybe<Scalars['String']['output']>;
  /** Whether the request was successful */
  success: Scalars['Boolean']['output'];
};

export type TestHttpRequestInput = {
  /** Request body */
  body?: InputMaybe<Scalars['JSON']['input']>;
  /** HTTP headers */
  headers?: InputMaybe<Scalars['JSON']['input']>;
  /** HTTP method */
  method: Scalars['String']['input'];
  /** URL to make the request to */
  url: Scalars['String']['input'];
};

export type TimelineCalendarEvent = {
  __typename?: 'TimelineCalendarEvent';
  conferenceLink: LinksMetadata;
  conferenceSolution: Scalars['String']['output'];
  description: Scalars['String']['output'];
  endsAt: Scalars['DateTime']['output'];
  id: Scalars['UUID']['output'];
  isCanceled: Scalars['Boolean']['output'];
  isFullDay: Scalars['Boolean']['output'];
  location: Scalars['String']['output'];
  participants: Array<TimelineCalendarEventParticipant>;
  startsAt: Scalars['DateTime']['output'];
  title: Scalars['String']['output'];
  visibility: CalendarChannelVisibility;
};

export type TimelineCalendarEventParticipant = {
  __typename?: 'TimelineCalendarEventParticipant';
  avatarUrl: Scalars['String']['output'];
  displayName: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  handle: Scalars['String']['output'];
  lastName: Scalars['String']['output'];
  personId?: Maybe<Scalars['UUID']['output']>;
  workspaceMemberId?: Maybe<Scalars['UUID']['output']>;
};

export type TimelineCalendarEventsWithTotal = {
  __typename?: 'TimelineCalendarEventsWithTotal';
  relatedPersonIds: Array<Scalars['UUID']['output']>;
  timelineCalendarEvents: Array<TimelineCalendarEvent>;
  totalNumberOfCalendarEvents: Scalars['Int']['output'];
};

export type TimelineThread = {
  __typename?: 'TimelineThread';
  firstParticipant: TimelineThreadParticipant;
  id: Scalars['UUID']['output'];
  lastMessageBody: Scalars['String']['output'];
  lastMessageIsDraft: Scalars['Boolean']['output'];
  lastMessageReceivedAt: Scalars['DateTime']['output'];
  lastTwoParticipants: Array<TimelineThreadParticipant>;
  numberOfMessagesInThread: Scalars['Float']['output'];
  participantCount: Scalars['Float']['output'];
  read: Scalars['Boolean']['output'];
  subject: Scalars['String']['output'];
  visibility: MessageChannelVisibility;
};

export type TimelineThreadParticipant = {
  __typename?: 'TimelineThreadParticipant';
  avatarUrl: Scalars['String']['output'];
  displayName: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  handle: Scalars['String']['output'];
  lastName: Scalars['String']['output'];
  personId?: Maybe<Scalars['UUID']['output']>;
  workspaceMemberId?: Maybe<Scalars['UUID']['output']>;
};

export type TimelineThreadsWithTotal = {
  __typename?: 'TimelineThreadsWithTotal';
  relatedPersonIds: Array<Scalars['UUID']['output']>;
  timelineThreads: Array<TimelineThread>;
  totalNumberOfThreads: Scalars['Int']['output'];
};

export type UuidFilter = {
  eq?: InputMaybe<Scalars['UUID']['input']>;
  gt?: InputMaybe<Scalars['UUID']['input']>;
  gte?: InputMaybe<Scalars['UUID']['input']>;
  in?: InputMaybe<Array<Scalars['UUID']['input']>>;
  is?: InputMaybe<FilterIs>;
  lt?: InputMaybe<Scalars['UUID']['input']>;
  lte?: InputMaybe<Scalars['UUID']['input']>;
  neq?: InputMaybe<Scalars['UUID']['input']>;
};

export type UpdateMyahInboxContactTriageInput = {
  contactId: Scalars['String']['input'];
  expectedIdentityGeneration: Scalars['String']['input'];
  expectedRevision: Scalars['Int']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  inboxOwnerId?: InputMaybe<Scalars['UUID']['input']>;
  inboxState?: InputMaybe<MyahInboxState>;
  snoozedUntil?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateMyahInboxThreadInput = {
  campaignId?: InputMaybe<Scalars['UUID']['input']>;
  creatorId?: InputMaybe<Scalars['UUID']['input']>;
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
  threadId: Scalars['UUID']['input'];
};

export type UpdateWorkflowRunStepInput = {
  /** Step to update in JSON format */
  step: Scalars['JSON']['input'];
  /** Workflow run ID */
  workflowRunId: Scalars['UUID']['input'];
};

export type UpdateWorkflowVersionPositionsInput = {
  /** Workflow version updated positions */
  positions: Array<WorkflowStepPositionUpdateInput>;
  /** Workflow version ID */
  workflowVersionId: Scalars['UUID']['input'];
};

export type UpdateWorkflowVersionStepInput = {
  /** Step to update in JSON format */
  step: Scalars['JSON']['input'];
  /** Workflow version ID */
  workflowVersionId: Scalars['UUID']['input'];
};

export type WorkflowAction = {
  __typename?: 'WorkflowAction';
  id: Scalars['UUID']['output'];
  name: Scalars['String']['output'];
  nextStepIds?: Maybe<Array<Scalars['UUID']['output']>>;
  position?: Maybe<WorkflowStepPosition>;
  settings: Scalars['JSON']['output'];
  type: WorkflowActionType;
  valid: Scalars['Boolean']['output'];
};

export enum WorkflowActionType {
  AI_AGENT = 'AI_AGENT',
  CODE = 'CODE',
  CREATE_CALENDAR_EVENT = 'CREATE_CALENDAR_EVENT',
  CREATE_RECORD = 'CREATE_RECORD',
  DELAY = 'DELAY',
  DELETE_RECORD = 'DELETE_RECORD',
  DRAFT_EMAIL = 'DRAFT_EMAIL',
  EMPTY = 'EMPTY',
  FILTER = 'FILTER',
  FIND_RECORDS = 'FIND_RECORDS',
  FORM = 'FORM',
  HTTP_REQUEST = 'HTTP_REQUEST',
  IF_ELSE = 'IF_ELSE',
  ITERATOR = 'ITERATOR',
  LOGIC_FUNCTION = 'LOGIC_FUNCTION',
  PICK_RECORD = 'PICK_RECORD',
  SEND_EMAIL = 'SEND_EMAIL',
  UPDATE_RECORD = 'UPDATE_RECORD',
  UPSERT_RECORD = 'UPSERT_RECORD'
}

export type WorkflowRun = {
  __typename?: 'WorkflowRun';
  id: Scalars['UUID']['output'];
  status: WorkflowRunStatusEnum;
};

/** Status of the workflow run */
export enum WorkflowRunStatusEnum {
  COMPLETED = 'COMPLETED',
  ENQUEUED = 'ENQUEUED',
  FAILED = 'FAILED',
  NOT_STARTED = 'NOT_STARTED',
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  STOPPING = 'STOPPING'
}

export type WorkflowStepPosition = {
  __typename?: 'WorkflowStepPosition';
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};

export type WorkflowStepPositionInput = {
  x: Scalars['Float']['input'];
  y: Scalars['Float']['input'];
};

export type WorkflowStepPositionUpdateInput = {
  /** Step or trigger ID */
  id: Scalars['String']['input'];
  /** Position of the step or trigger */
  position: WorkflowStepPositionInput;
};

export type WorkflowVersionDto = {
  __typename?: 'WorkflowVersionDTO';
  createdAt: Scalars['String']['output'];
  id: Scalars['UUID']['output'];
  name: Scalars['String']['output'];
  status: Scalars['String']['output'];
  steps?: Maybe<Scalars['JSON']['output']>;
  trigger?: Maybe<Scalars['JSON']['output']>;
  updatedAt: Scalars['String']['output'];
  workflowId: Scalars['UUID']['output'];
};

export type WorkflowVersionStepChanges = {
  __typename?: 'WorkflowVersionStepChanges';
  stepsDiff?: Maybe<Scalars['JSON']['output']>;
  triggerDiff?: Maybe<Scalars['JSON']['output']>;
};

export type TimelineCalendarEventFragmentFragment = { __typename?: 'TimelineCalendarEvent', id: any, title: string, description: string, location: string, startsAt: string, endsAt: string, isFullDay: boolean, visibility: CalendarChannelVisibility, participants: Array<{ __typename?: 'TimelineCalendarEventParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }> };

export type TimelineCalendarEventParticipantFragmentFragment = { __typename?: 'TimelineCalendarEventParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string };

export type TimelineCalendarEventsWithTotalFragmentFragment = { __typename?: 'TimelineCalendarEventsWithTotal', totalNumberOfCalendarEvents: number, relatedPersonIds: Array<any>, timelineCalendarEvents: Array<{ __typename?: 'TimelineCalendarEvent', id: any, title: string, description: string, location: string, startsAt: string, endsAt: string, isFullDay: boolean, visibility: CalendarChannelVisibility, participants: Array<{ __typename?: 'TimelineCalendarEventParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }> }> };

export type GetTimelineCalendarEventsFromObjectRecordQueryVariables = Exact<{
  objectNameSingular: Scalars['String']['input'];
  recordId: Scalars['UUID']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
}>;


export type GetTimelineCalendarEventsFromObjectRecordQuery = { __typename?: 'Query', getTimelineCalendarEventsFromObjectRecord: { __typename?: 'TimelineCalendarEventsWithTotal', totalNumberOfCalendarEvents: number, relatedPersonIds: Array<any>, timelineCalendarEvents: Array<{ __typename?: 'TimelineCalendarEvent', id: any, title: string, description: string, location: string, startsAt: string, endsAt: string, isFullDay: boolean, visibility: CalendarChannelVisibility, participants: Array<{ __typename?: 'TimelineCalendarEventParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }> }> } };

export type ParticipantFragmentFragment = { __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string };

export type TimelineThreadFragmentFragment = { __typename?: 'TimelineThread', id: any, read: boolean, visibility: MessageChannelVisibility, lastMessageReceivedAt: string, lastMessageBody: string, subject: string, numberOfMessagesInThread: number, participantCount: number, lastMessageIsDraft: boolean, firstParticipant: { __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }, lastTwoParticipants: Array<{ __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }> };

export type TimelineThreadsWithTotalFragmentFragment = { __typename?: 'TimelineThreadsWithTotal', totalNumberOfThreads: number, relatedPersonIds: Array<any>, timelineThreads: Array<{ __typename?: 'TimelineThread', id: any, read: boolean, visibility: MessageChannelVisibility, lastMessageReceivedAt: string, lastMessageBody: string, subject: string, numberOfMessagesInThread: number, participantCount: number, lastMessageIsDraft: boolean, firstParticipant: { __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }, lastTwoParticipants: Array<{ __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }> }> };

export type GetTimelineThreadsFromObjectRecordQueryVariables = Exact<{
  objectNameSingular: Scalars['String']['input'];
  recordId: Scalars['UUID']['input'];
  page: Scalars['Int']['input'];
  pageSize: Scalars['Int']['input'];
}>;


export type GetTimelineThreadsFromObjectRecordQuery = { __typename?: 'Query', getTimelineThreadsFromObjectRecord: { __typename?: 'TimelineThreadsWithTotal', totalNumberOfThreads: number, relatedPersonIds: Array<any>, timelineThreads: Array<{ __typename?: 'TimelineThread', id: any, read: boolean, visibility: MessageChannelVisibility, lastMessageReceivedAt: string, lastMessageBody: string, subject: string, numberOfMessagesInThread: number, participantCount: number, lastMessageIsDraft: boolean, firstParticipant: { __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }, lastTwoParticipants: Array<{ __typename?: 'TimelineThreadParticipant', personId?: any | null, workspaceMemberId?: any | null, firstName: string, lastName: string, displayName: string, avatarUrl: string, handle: string }> }> } };

export type SearchQueryVariables = Exact<{
  searchInput: Scalars['String']['input'];
  limit: Scalars['Int']['input'];
  after?: InputMaybe<Scalars['String']['input']>;
  excludedObjectNameSingulars?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  includedObjectNameSingulars?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  filter?: InputMaybe<ObjectRecordFilterInput>;
}>;


export type SearchQuery = { __typename?: 'Query', search: { __typename?: 'SearchResultConnection', edges: Array<{ __typename?: 'SearchResultEdge', cursor: string, node: { __typename?: 'SearchRecord', recordId: any, objectNameSingular: string, objectLabelSingular: string, label: string, imageUrl?: string | null, tsRankCD: number, tsRank: number } }>, pageInfo: { __typename?: 'SearchResultPageInfo', hasNextPage: boolean, endCursor?: string | null } } };

export type FindCampaignOutreachWorkflowQueryVariables = Exact<{
  campaignId: Scalars['UUID']['input'];
}>;


export type FindCampaignOutreachWorkflowQuery = { __typename?: 'Query', findCampaignOutreachWorkflow?: { __typename?: 'CampaignOutreachWorkflow', campaignId: any, currentVersionId?: any | null, name?: string | null, workflowId: any } | null };

export type CreateCampaignOutreachWorkflowMutationVariables = Exact<{
  campaignId: Scalars['UUID']['input'];
}>;


export type CreateCampaignOutreachWorkflowMutation = { __typename?: 'Mutation', createCampaignOutreachWorkflow: { __typename?: 'CampaignOutreachWorkflow', campaignId: any, currentVersionId?: any | null, name?: string | null, workflowId: any } };

export type CampaignSequenceSnapshotFieldsFragment = { __typename?: 'CampaignSequenceSnapshot', campaignId: any, workflowId: any, versionId: any, sequence: any, lifecycleStatus?: string | null, versionStatus: string, editable: boolean, issues: Array<{ __typename?: 'CampaignSequenceIssue', code: string, path: string, message: string, messageId?: any | null }> };

export type CampaignSequenceQueryVariables = Exact<{
  campaignId: Scalars['UUID']['input'];
}>;


export type CampaignSequenceQuery = { __typename?: 'Query', campaignSequence:
    | { __typename: 'CampaignSequenceAbsent', kind: string, campaignId: any }
    | { __typename: 'CampaignSequenceLegacy', kind: string, campaignId: any, workflowId: any }
    | { __typename: 'CampaignSequencePresent', kind: string, snapshot: { __typename?: 'CampaignSequenceSnapshot', campaignId: any, workflowId: any, versionId: any, sequence: any, lifecycleStatus?: string | null, versionStatus: string, editable: boolean, issues: Array<{ __typename?: 'CampaignSequenceIssue', code: string, path: string, message: string, messageId?: any | null }> } }
   };

export type SaveCampaignSequenceMutationVariables = Exact<{
  input: SaveCampaignSequenceInput;
}>;


export type SaveCampaignSequenceMutation = { __typename?: 'Mutation', saveCampaignSequence: { __typename?: 'CampaignSequenceSnapshot', campaignId: any, workflowId: any, versionId: any, sequence: any, lifecycleStatus?: string | null, versionStatus: string, editable: boolean, issues: Array<{ __typename?: 'CampaignSequenceIssue', code: string, path: string, message: string, messageId?: any | null }> } };

export type PublishCampaignSequenceMutationVariables = Exact<{
  input: PublishCampaignSequenceInput;
}>;


export type PublishCampaignSequenceMutation = { __typename?: 'Mutation', publishCampaignSequence: { __typename?: 'CampaignSequenceSnapshot', campaignId: any, workflowId: any, versionId: any, sequence: any, lifecycleStatus?: string | null, versionStatus: string, editable: boolean, issues: Array<{ __typename?: 'CampaignSequenceIssue', code: string, path: string, message: string, messageId?: any | null }> } };

export type ValidateCampaignSequenceMutationVariables = Exact<{
  campaignId: Scalars['UUID']['input'];
  expectedVersionId: Scalars['UUID']['input'];
}>;


export type ValidateCampaignSequenceMutation = { __typename?: 'Mutation', validateCampaignSequence: { __typename?: 'CampaignSequenceSnapshot', campaignId: any, workflowId: any, versionId: any, sequence: any, lifecycleStatus?: string | null, versionStatus: string, editable: boolean, issues: Array<{ __typename?: 'CampaignSequenceIssue', code: string, path: string, message: string, messageId?: any | null }> } };

export type ReplaceLegacyCampaignSequenceMutationVariables = Exact<{
  input: ReplaceLegacyCampaignSequenceInput;
}>;


export type ReplaceLegacyCampaignSequenceMutation = { __typename?: 'Mutation', replaceLegacyCampaignSequence: { __typename?: 'CampaignSequenceSnapshot', campaignId: any, workflowId: any, versionId: any, sequence: any, lifecycleStatus?: string | null, versionStatus: string, editable: boolean, issues: Array<{ __typename?: 'CampaignSequenceIssue', code: string, path: string, message: string, messageId?: any | null }> } };

export type MyahInboxThreadsQueryVariables = Exact<{
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  campaignId?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  threadId?: InputMaybe<Scalars['String']['input']>;
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type MyahInboxThreadsQuery = { __typename?: 'Query', myahInboxThreads: { __typename?: 'MyahInboxThreadConnection', edges: Array<{ __typename?: 'MyahInboxThreadEdge', cursor: string, node: { __typename?: 'MyahInboxThreadSummary', id: any, lastActivityAt: string, subject?: string | null, lastMessagePreview?: string | null, lastMessageSender?: string | null, creator?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null, campaign?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null } }>, pageInfo: { __typename?: 'MyahInboxThreadPageInfo', hasNextPage: boolean, endCursor?: string | null } } };

export type UpdateMyahInboxThreadMutationVariables = Exact<{
  input: UpdateMyahInboxThreadInput;
}>;


export type UpdateMyahInboxThreadMutation = { __typename?: 'Mutation', updateMyahInboxThread: { __typename?: 'MyahInboxThreadSummary', id: any, lastActivityAt: string, subject?: string | null, lastMessagePreview?: string | null, lastMessageSender?: string | null, creator?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null, campaign?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null } };

export type SaveMyahInboxDraftMutationVariables = Exact<{
  input: SaveMyahInboxDraftInput;
}>;


export type SaveMyahInboxDraftMutation = { __typename?: 'Mutation', saveMyahInboxDraft: { __typename?: 'MyahInboxDraftSaveResult', status: MyahInboxDraftSaveStatus, revision: number, body?: { __typename?: 'MyahInboxRichText', markdown: string, blocknote?: string | null } | null } };

export type GenerateMyahInboxReplyProposalMutationVariables = Exact<{
  input: GenerateMyahInboxReplyProposalInput;
}>;


export type GenerateMyahInboxReplyProposalMutation = { __typename?: 'Mutation', generateMyahInboxReplyProposal: { __typename?: 'MyahInboxReplyProposal', body: { __typename?: 'MyahInboxReplyProposalBody', markdown: string, blocknote?: string | null } } };

export type MyahInboxReplySendReadinessQueryVariables = Exact<{
  threadId: Scalars['UUID']['input'];
  expectedWorkspaceId?: InputMaybe<Scalars['UUID']['input']>;
}>;


export type MyahInboxReplySendReadinessQuery = { __typename?: 'Query', myahInboxReplySendReadiness: { __typename?: 'MyahInboxReplySendReadiness', status: MyahInboxReplySendReadinessStatus, reason?: string | null } };

export type SendMyahInboxReplyMutationVariables = Exact<{
  input: SendMyahInboxReplyInput;
}>;


export type SendMyahInboxReplyMutation = { __typename?: 'Mutation', sendMyahInboxReply: { __typename?: 'MyahInboxReplySendResult', outcome: MyahInboxReplySendOutcome, receiptId?: string | null, revision: number, body?: { __typename?: 'MyahInboxRichText', markdown: string, blocknote?: string | null } | null } };

export type MyahInboxReplySendStatusQueryVariables = Exact<{
  input: MyahInboxReplySendStatusInput;
}>;


export type MyahInboxReplySendStatusQuery = { __typename?: 'Query', myahInboxReplySendStatus: { __typename?: 'MyahInboxReplySendStatus', outcome: MyahInboxReplySendOutcome, receiptId?: string | null, revision: number, body?: { __typename?: 'MyahInboxRichText', markdown: string, blocknote?: string | null } | null } };

export type MyahInboxContactFieldsFragment = { __typename?: 'MyahInboxContactSummary', id: string, identityKind: MyahInboxContactIdentityKind, displayName: string, instagramUsername?: string | null, lastActivityAt: string, latestChannel: MyahInboxContactLatestChannel, preview?: string | null, sender?: string | null, needsAttention: boolean, triage: { __typename?: 'MyahInboxContactTriageSummary', isAvailable: boolean, inboxOwnerId?: any | null, inboxState?: MyahInboxState | null, snoozedUntil?: string | null, revision?: number | null, identityGeneration?: string | null }, creator?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null, email: { __typename?: 'MyahInboxContactEmailChannelSummary', isAvailable: boolean, threadCount: number, threadIds: Array<any>, latestThreadId?: any | null, needsAttention: boolean }, instagram: { __typename?: 'MyahInboxContactInstagramChannelSummary', isAvailable: boolean, state: MyahInboxInstagramChannelState, needsAttention: boolean, conversations: Array<{ __typename?: 'MyahInboxContactInstagramConversation', id: any, providerConversationId: string, provider: string, lifecycle: string, recipientUsername?: string | null, recipientDisplayName?: string | null, lastActivityAt: string, latestDirection?: string | null }> } };

export type MyahInboxContactsQueryVariables = Exact<{
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  contactId?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
  campaignId?: InputMaybe<Scalars['String']['input']>;
  states?: InputMaybe<Array<MyahInboxState> | MyahInboxState>;
  snoozeStatus?: InputMaybe<MyahInboxSnoozeStatus>;
  search?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyahInboxContactsQuery = { __typename?: 'Query', myahInboxContacts: { __typename?: 'MyahInboxContactConnection', edges: Array<{ __typename?: 'MyahInboxContactEdge', cursor: string, node: { __typename?: 'MyahInboxContactSummary', id: string, identityKind: MyahInboxContactIdentityKind, displayName: string, instagramUsername?: string | null, lastActivityAt: string, latestChannel: MyahInboxContactLatestChannel, preview?: string | null, sender?: string | null, needsAttention: boolean, triage: { __typename?: 'MyahInboxContactTriageSummary', isAvailable: boolean, inboxOwnerId?: any | null, inboxState?: MyahInboxState | null, snoozedUntil?: string | null, revision?: number | null, identityGeneration?: string | null }, creator?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null, email: { __typename?: 'MyahInboxContactEmailChannelSummary', isAvailable: boolean, threadCount: number, threadIds: Array<any>, latestThreadId?: any | null, needsAttention: boolean }, instagram: { __typename?: 'MyahInboxContactInstagramChannelSummary', isAvailable: boolean, state: MyahInboxInstagramChannelState, needsAttention: boolean, conversations: Array<{ __typename?: 'MyahInboxContactInstagramConversation', id: any, providerConversationId: string, provider: string, lifecycle: string, recipientUsername?: string | null, recipientDisplayName?: string | null, lastActivityAt: string, latestDirection?: string | null }> } } }>, pageInfo: { __typename?: 'MyahInboxContactPageInfo', hasNextPage: boolean, endCursor?: string | null } } };

export type MyahInboxContactQueryVariables = Exact<{
  contactId: Scalars['String']['input'];
}>;


export type MyahInboxContactQuery = { __typename?: 'Query', myahInboxContact: { __typename?: 'MyahInboxContactSummary', id: string, identityKind: MyahInboxContactIdentityKind, displayName: string, instagramUsername?: string | null, lastActivityAt: string, latestChannel: MyahInboxContactLatestChannel, preview?: string | null, sender?: string | null, needsAttention: boolean, triage: { __typename?: 'MyahInboxContactTriageSummary', isAvailable: boolean, inboxOwnerId?: any | null, inboxState?: MyahInboxState | null, snoozedUntil?: string | null, revision?: number | null, identityGeneration?: string | null }, creator?: { __typename?: 'MyahInboxThreadContext', id: any, name?: string | null } | null, email: { __typename?: 'MyahInboxContactEmailChannelSummary', isAvailable: boolean, threadCount: number, threadIds: Array<any>, latestThreadId?: any | null, needsAttention: boolean }, instagram: { __typename?: 'MyahInboxContactInstagramChannelSummary', isAvailable: boolean, state: MyahInboxInstagramChannelState, needsAttention: boolean, conversations: Array<{ __typename?: 'MyahInboxContactInstagramConversation', id: any, providerConversationId: string, provider: string, lifecycle: string, recipientUsername?: string | null, recipientDisplayName?: string | null, lastActivityAt: string, latestDirection?: string | null }> } } };

export type UpdateMyahInboxContactTriageMutationVariables = Exact<{
  input: UpdateMyahInboxContactTriageInput;
}>;


export type UpdateMyahInboxContactTriageMutation = { __typename?: 'Mutation', updateMyahInboxContactTriage: { __typename?: 'MyahInboxContactTriage', inboxOwnerId?: any | null, inboxState: MyahInboxState, snoozedUntil?: string | null, revision: number, identityGeneration: string } };

export type MyahInboxInstagramMessagesQueryVariables = Exact<{
  conversationId: Scalars['String']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyahInboxInstagramMessagesQuery = { __typename?: 'Query', myahInboxInstagramMessages: { __typename?: 'MyahInboxInstagramMessageConnection', edges: Array<{ __typename?: 'MyahInboxInstagramMessageEdge', cursor: string, node: { __typename?: 'MyahInboxInstagramMessage', id: string, text?: string | null, direction: string, sentVia: string, provider: string, deliveryState: string, providerCreatedAt?: string | null, createdAt: string, hasAttachments: boolean, attachmentCount: number } }>, pageInfo: { __typename?: 'MyahInboxInstagramMessagePageInfo', hasNextPage: boolean, endCursor?: string | null } } };

export type MyahInboxContactEmailMessagesQueryVariables = Exact<{
  contactId: Scalars['String']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyahInboxContactEmailMessagesQuery = { __typename?: 'Query', myahInboxContactEmailMessages: { __typename?: 'MyahInboxContactEmailMessageConnection', edges: Array<{ __typename?: 'MyahInboxContactEmailMessageEdge', cursor: string, node: { __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> } }>, pageInfo: { __typename?: 'MyahInboxContactEmailMessagePageInfo', hasNextPage: boolean, endCursor?: string | null } } };

export type MyahInboxEmailCardFieldsFragment = { __typename?: 'MyahInboxEmailCard', threadId: any, rootMessageId: any, startTimestamp: string, subject?: string | null, campaignLabel?: string | null, historyBasis: string };

export type MyahInboxEmailStoredMessageFieldsFragment = { __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> };

export type MyahInboxEmailMessagePageFieldsFragment = { __typename?: 'MyahInboxEmailMessagePage', threadId: any, olderCursor?: string | null, newerCursor?: string | null, root: { __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> }, messages: Array<{ __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> }> };

export type MyahInboxContactEmailCardsQueryVariables = Exact<{
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  snapshot?: InputMaybe<Scalars['String']['input']>;
  olderCursor?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyahInboxContactEmailCardsQuery = { __typename?: 'Query', myahInboxContactEmailCards: { __typename?: 'MyahInboxEmailCardPage', snapshot: string, olderCursor?: string | null, latestThreadId?: any | null, cards: Array<{ __typename?: 'MyahInboxEmailCard', threadId: any, rootMessageId: any, startTimestamp: string, subject?: string | null, campaignLabel?: string | null, historyBasis: string }> } };

export type MyahInboxContactEmailCardQueryVariables = Exact<{
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  threadId: Scalars['UUID']['input'];
}>;


export type MyahInboxContactEmailCardQuery = { __typename?: 'Query', myahInboxContactEmailCard: { __typename?: 'MyahInboxEmailCardProjection', snapshot: string, card?: { __typename?: 'MyahInboxEmailCard', threadId: any, rootMessageId: any, startTimestamp: string, subject?: string | null, campaignLabel?: string | null, historyBasis: string } | null } };

export type MyahInboxContactEmailCardMessagesQueryVariables = Exact<{
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  threadId: Scalars['UUID']['input'];
  snapshot: Scalars['String']['input'];
  cursor?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyahInboxContactEmailCardMessagesQuery = { __typename?: 'Query', myahInboxContactEmailCardMessages: { __typename?: 'MyahInboxEmailMessagePage', threadId: any, olderCursor?: string | null, newerCursor?: string | null, root: { __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> }, messages: Array<{ __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> }> } };

export type MyahInboxContactEmailMessageLocationQueryVariables = Exact<{
  contactId: Scalars['String']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
  messageId: Scalars['UUID']['input'];
  snapshot: Scalars['String']['input'];
}>;


export type MyahInboxContactEmailMessageLocationQuery = { __typename?: 'Query', myahInboxContactEmailMessageLocation?: { __typename?: 'MyahInboxEmailMessageLocation', messageId: any, card: { __typename?: 'MyahInboxEmailCard', threadId: any, rootMessageId: any, startTimestamp: string, subject?: string | null, campaignLabel?: string | null, historyBasis: string }, page: { __typename?: 'MyahInboxEmailMessagePage', threadId: any, olderCursor?: string | null, newerCursor?: string | null, root: { __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> }, messages: Array<{ __typename?: 'MyahInboxContactEmailMessage', id: any, messageThreadId: any, subject?: string | null, text?: string | null, receivedAt: string, direction: string, visibility: string, attachmentFileIds: Array<any>, participants: Array<{ __typename?: 'MyahInboxContactEmailParticipant', role: string, handle?: string | null, displayName?: string | null }> }> } } | null };

export type MyahInboxEmailDraftQueryVariables = Exact<{
  threadId: Scalars['UUID']['input'];
  expectedWorkspaceId: Scalars['UUID']['input'];
}>;


export type MyahInboxEmailDraftQuery = { __typename?: 'Query', myahInboxEmailDraft: { __typename?: 'MyahInboxEmailDraft', workspaceId: any, threadId: any, revision: number, body?: { __typename?: 'MyahInboxRichText', markdown: string, blocknote?: string | null } | null } };

export type LinkMyahInboxContactCreatorMutationVariables = Exact<{
  input: LinkMyahInboxContactCreatorInput;
}>;


export type LinkMyahInboxContactCreatorMutation = { __typename?: 'Mutation', linkMyahInboxContactCreator: string };

export type InstagramMessageDraftQueryVariables = Exact<{
  input: GetInstagramMessageDraftInput;
}>;


export type InstagramMessageDraftQuery = { __typename?: 'Query', instagramMessageDraft?: { __typename?: 'InstagramMessageDraftResultDto', status: string, draftId: any, revision: number, body: string, executionLocked?: boolean | null } | null };

export type SaveInstagramMessageDraftMutationVariables = Exact<{
  input: SaveInstagramMessageDraftInput;
}>;


export type SaveInstagramMessageDraftMutation = { __typename?: 'Mutation', saveInstagramMessageDraft: { __typename?: 'InstagramMessageDraftResultDto', status: string, draftId: any, revision: number, body: string } };

export type SendInstagramMessageMutationVariables = Exact<{
  input: SendInstagramMessageInput;
}>;


export type SendInstagramMessageMutation = { __typename?: 'Mutation', sendInstagramMessage: { __typename?: 'InstagramMessageSendResultDto', status: string, receiptId: any, code?: string | null, nextEligibleAt?: string | null } };

export type InstagramMessageSendStatusQueryVariables = Exact<{
  input: InstagramMessageSendStatusInput;
}>;


export type InstagramMessageSendStatusQuery = { __typename?: 'Query', instagramMessageSendStatus: { __typename?: 'InstagramMessageSendStatusDto', receiptId: any, state: string, providerCode?: string | null, outcome?: string | null } };

export type WorkflowDiffFragmentFragment = { __typename?: 'WorkflowVersionStepChanges', triggerDiff?: any | null, stepsDiff?: any | null };

export type ActivateWorkflowVersionMutationVariables = Exact<{
  workflowVersionId: Scalars['UUID']['input'];
}>;


export type ActivateWorkflowVersionMutation = { __typename?: 'Mutation', activateWorkflowVersion: boolean };

export type ComputeStepOutputSchemaMutationVariables = Exact<{
  input: ComputeStepOutputSchemaInput;
}>;


export type ComputeStepOutputSchemaMutation = { __typename?: 'Mutation', computeStepOutputSchema: any };

export type CreateDraftFromWorkflowVersionMutationVariables = Exact<{
  input: CreateDraftFromWorkflowVersionInput;
}>;


export type CreateDraftFromWorkflowVersionMutation = { __typename?: 'Mutation', createDraftFromWorkflowVersion: { __typename?: 'WorkflowVersionDTO', id: any, name: string, status: string, trigger?: any | null, steps?: any | null, createdAt: string, updatedAt: string } };

export type CreateWorkflowVersionEdgeMutationVariables = Exact<{
  input: CreateWorkflowVersionEdgeInput;
}>;


export type CreateWorkflowVersionEdgeMutation = { __typename?: 'Mutation', createWorkflowVersionEdge: { __typename?: 'WorkflowVersionStepChanges', triggerDiff?: any | null, stepsDiff?: any | null } };

export type CreateWorkflowVersionStepMutationVariables = Exact<{
  input: CreateWorkflowVersionStepInput;
}>;


export type CreateWorkflowVersionStepMutation = { __typename?: 'Mutation', createWorkflowVersionStep: { __typename?: 'WorkflowVersionStepChanges', triggerDiff?: any | null, stepsDiff?: any | null } };

export type DeactivateWorkflowVersionMutationVariables = Exact<{
  workflowVersionId: Scalars['UUID']['input'];
}>;


export type DeactivateWorkflowVersionMutation = { __typename?: 'Mutation', deactivateWorkflowVersion: boolean };

export type DeleteWorkflowVersionEdgeMutationVariables = Exact<{
  input: CreateWorkflowVersionEdgeInput;
}>;


export type DeleteWorkflowVersionEdgeMutation = { __typename?: 'Mutation', deleteWorkflowVersionEdge: { __typename?: 'WorkflowVersionStepChanges', triggerDiff?: any | null, stepsDiff?: any | null } };

export type DeleteWorkflowVersionStepMutationVariables = Exact<{
  input: DeleteWorkflowVersionStepInput;
}>;


export type DeleteWorkflowVersionStepMutation = { __typename?: 'Mutation', deleteWorkflowVersionStep: { __typename?: 'WorkflowVersionStepChanges', triggerDiff?: any | null, stepsDiff?: any | null } };

export type DuplicateWorkflowMutationVariables = Exact<{
  input: DuplicateWorkflowInput;
}>;


export type DuplicateWorkflowMutation = { __typename?: 'Mutation', duplicateWorkflow: { __typename?: 'WorkflowVersionDTO', id: any, name: string, status: string, trigger?: any | null, steps?: any | null, createdAt: string, updatedAt: string, workflowId: any } };

export type DuplicateWorkflowVersionStepMutationVariables = Exact<{
  input: DuplicateWorkflowVersionStepInput;
}>;


export type DuplicateWorkflowVersionStepMutation = { __typename?: 'Mutation', duplicateWorkflowVersionStep: { __typename?: 'WorkflowVersionStepChanges', triggerDiff?: any | null, stepsDiff?: any | null } };

export type RetryWorkflowRunMutationVariables = Exact<{
  workflowRunId: Scalars['UUID']['input'];
}>;


export type RetryWorkflowRunMutation = { __typename?: 'Mutation', retryWorkflowRun: { __typename: 'WorkflowRun', id: any, status: WorkflowRunStatusEnum } };

export type RunWorkflowVersionMutationVariables = Exact<{
  input: RunWorkflowVersionInput;
}>;


export type RunWorkflowVersionMutation = { __typename?: 'Mutation', runWorkflowVersion: { __typename?: 'RunWorkflowVersion', workflowRunId: any } };

export type StopWorkflowRunMutationVariables = Exact<{
  workflowRunId: Scalars['UUID']['input'];
}>;


export type StopWorkflowRunMutation = { __typename?: 'Mutation', stopWorkflowRun: { __typename: 'WorkflowRun', id: any, status: WorkflowRunStatusEnum } };

export type UpdateWorkflowRunStepMutationVariables = Exact<{
  input: UpdateWorkflowRunStepInput;
}>;


export type UpdateWorkflowRunStepMutation = { __typename?: 'Mutation', updateWorkflowRunStep: { __typename?: 'WorkflowAction', id: any, name: string, type: WorkflowActionType, settings: any, valid: boolean, nextStepIds?: Array<any> | null, position?: { __typename?: 'WorkflowStepPosition', x: number, y: number } | null } };

export type UpdateWorkflowVersionStepMutationVariables = Exact<{
  input: UpdateWorkflowVersionStepInput;
}>;


export type UpdateWorkflowVersionStepMutation = { __typename?: 'Mutation', updateWorkflowVersionStep: { __typename?: 'WorkflowAction', id: any, name: string, type: WorkflowActionType, settings: any, valid: boolean, nextStepIds?: Array<any> | null, position?: { __typename?: 'WorkflowStepPosition', x: number, y: number } | null } };

export type WorkflowStepConnectedAccountHandleQueryVariables = Exact<{
  connectedAccountId: Scalars['UUID']['input'];
}>;


export type WorkflowStepConnectedAccountHandleQuery = { __typename?: 'Query', workflowStepConnectedAccountHandle?: { __typename?: 'ConnectedAccountHandleDTO', id: any, handle: string, provider: string } | null };

export type SubmitFormStepMutationVariables = Exact<{
  input: SubmitFormStepInput;
}>;


export type SubmitFormStepMutation = { __typename?: 'Mutation', submitFormStep: boolean };

export type TestHttpRequestMutationVariables = Exact<{
  input: TestHttpRequestInput;
}>;


export type TestHttpRequestMutation = { __typename?: 'Mutation', testHttpRequest: { __typename?: 'TestHttpRequest', success: boolean, message: string, result?: any | null, error?: any | null, status?: number | null, statusText?: string | null, headers?: any | null } };

export type UpdateWorkflowVersionPositionsMutationVariables = Exact<{
  input: UpdateWorkflowVersionPositionsInput;
}>;


export type UpdateWorkflowVersionPositionsMutation = { __typename?: 'Mutation', updateWorkflowVersionPositions: boolean };

export const TimelineCalendarEventParticipantFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEventParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}}]} as unknown as DocumentNode<TimelineCalendarEventParticipantFragmentFragment, unknown>;
export const TimelineCalendarEventFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"startsAt"}},{"kind":"Field","name":{"kind":"Name","value":"endsAt"}},{"kind":"Field","name":{"kind":"Name","value":"isFullDay"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEventParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}}]} as unknown as DocumentNode<TimelineCalendarEventFragmentFragment, unknown>;
export const TimelineCalendarEventsWithTotalFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventsWithTotalFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEventsWithTotal"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalNumberOfCalendarEvents"}},{"kind":"Field","name":{"kind":"Name","value":"relatedPersonIds"}},{"kind":"Field","name":{"kind":"Name","value":"timelineCalendarEvents"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineCalendarEventFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEventParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"startsAt"}},{"kind":"Field","name":{"kind":"Name","value":"endsAt"}},{"kind":"Field","name":{"kind":"Name","value":"isFullDay"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"}}]}}]}}]} as unknown as DocumentNode<TimelineCalendarEventsWithTotalFragmentFragment, unknown>;
export const ParticipantFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThreadParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}}]} as unknown as DocumentNode<ParticipantFragmentFragment, unknown>;
export const TimelineThreadFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineThreadFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThread"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"read"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"firstParticipant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ParticipantFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastTwoParticipants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ParticipantFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageReceivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageBody"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfMessagesInThread"}},{"kind":"Field","name":{"kind":"Name","value":"participantCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageIsDraft"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThreadParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}}]} as unknown as DocumentNode<TimelineThreadFragmentFragment, unknown>;
export const TimelineThreadsWithTotalFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineThreadsWithTotalFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThreadsWithTotal"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalNumberOfThreads"}},{"kind":"Field","name":{"kind":"Name","value":"relatedPersonIds"}},{"kind":"Field","name":{"kind":"Name","value":"timelineThreads"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineThreadFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThreadParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineThreadFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThread"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"read"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"firstParticipant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ParticipantFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastTwoParticipants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ParticipantFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageReceivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageBody"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfMessagesInThread"}},{"kind":"Field","name":{"kind":"Name","value":"participantCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageIsDraft"}}]}}]} as unknown as DocumentNode<TimelineThreadsWithTotalFragmentFragment, unknown>;
export const CampaignSequenceSnapshotFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceSnapshot"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}},{"kind":"Field","name":{"kind":"Name","value":"versionId"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycleStatus"}},{"kind":"Field","name":{"kind":"Name","value":"versionStatus"}},{"kind":"Field","name":{"kind":"Name","value":"editable"}},{"kind":"Field","name":{"kind":"Name","value":"issues"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"messageId"}}]}}]}}]} as unknown as DocumentNode<CampaignSequenceSnapshotFieldsFragment, unknown>;
export const MyahInboxContactFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxContactFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactSummary"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"identityKind"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"instagramUsername"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"latestChannel"}},{"kind":"Field","name":{"kind":"Name","value":"preview"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}},{"kind":"Field","name":{"kind":"Name","value":"triage"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"inboxOwnerId"}},{"kind":"Field","name":{"kind":"Name","value":"inboxState"}},{"kind":"Field","name":{"kind":"Name","value":"snoozedUntil"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"identityGeneration"}}]}},{"kind":"Field","name":{"kind":"Name","value":"creator"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"email"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"threadCount"}},{"kind":"Field","name":{"kind":"Name","value":"threadIds"}},{"kind":"Field","name":{"kind":"Name","value":"latestThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}}]}},{"kind":"Field","name":{"kind":"Name","value":"instagram"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}},{"kind":"Field","name":{"kind":"Name","value":"conversations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"providerConversationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycle"}},{"kind":"Field","name":{"kind":"Name","value":"recipientUsername"}},{"kind":"Field","name":{"kind":"Name","value":"recipientDisplayName"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"latestDirection"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxContactFieldsFragment, unknown>;
export const MyahInboxEmailCardFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailCard"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"rootMessageId"}},{"kind":"Field","name":{"kind":"Name","value":"startTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"campaignLabel"}},{"kind":"Field","name":{"kind":"Name","value":"historyBasis"}}]}}]} as unknown as DocumentNode<MyahInboxEmailCardFieldsFragment, unknown>;
export const MyahInboxEmailStoredMessageFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactEmailMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"messageThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"receivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"direction"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attachmentFileIds"}}]}}]} as unknown as DocumentNode<MyahInboxEmailStoredMessageFieldsFragment, unknown>;
export const MyahInboxEmailMessagePageFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailMessagePageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailMessagePage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"olderCursor"}},{"kind":"Field","name":{"kind":"Name","value":"newerCursor"}},{"kind":"Field","name":{"kind":"Name","value":"root"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"messages"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactEmailMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"messageThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"receivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"direction"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attachmentFileIds"}}]}}]} as unknown as DocumentNode<MyahInboxEmailMessagePageFieldsFragment, unknown>;
export const WorkflowDiffFragmentFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WorkflowDiffFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WorkflowVersionStepChanges"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"triggerDiff"}},{"kind":"Field","name":{"kind":"Name","value":"stepsDiff"}}]}}]} as unknown as DocumentNode<WorkflowDiffFragmentFragment, unknown>;
export const GetTimelineCalendarEventsFromObjectRecordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTimelineCalendarEventsFromObjectRecord"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectNameSingular"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"recordId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"page"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getTimelineCalendarEventsFromObjectRecord"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objectNameSingular"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectNameSingular"}}},{"kind":"Argument","name":{"kind":"Name","value":"recordId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"recordId"}}},{"kind":"Argument","name":{"kind":"Name","value":"page"},"value":{"kind":"Variable","name":{"kind":"Name","value":"page"}}},{"kind":"Argument","name":{"kind":"Name","value":"pageSize"},"value":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineCalendarEventsWithTotalFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEventParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"location"}},{"kind":"Field","name":{"kind":"Name","value":"startsAt"}},{"kind":"Field","name":{"kind":"Name","value":"endsAt"}},{"kind":"Field","name":{"kind":"Name","value":"isFullDay"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineCalendarEventParticipantFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineCalendarEventsWithTotalFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineCalendarEventsWithTotal"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalNumberOfCalendarEvents"}},{"kind":"Field","name":{"kind":"Name","value":"relatedPersonIds"}},{"kind":"Field","name":{"kind":"Name","value":"timelineCalendarEvents"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineCalendarEventFragment"}}]}}]}}]} as unknown as DocumentNode<GetTimelineCalendarEventsFromObjectRecordQuery, GetTimelineCalendarEventsFromObjectRecordQueryVariables>;
export const GetTimelineThreadsFromObjectRecordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTimelineThreadsFromObjectRecord"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"objectNameSingular"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"recordId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"page"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getTimelineThreadsFromObjectRecord"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"objectNameSingular"},"value":{"kind":"Variable","name":{"kind":"Name","value":"objectNameSingular"}}},{"kind":"Argument","name":{"kind":"Name","value":"recordId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"recordId"}}},{"kind":"Argument","name":{"kind":"Name","value":"page"},"value":{"kind":"Variable","name":{"kind":"Name","value":"page"}}},{"kind":"Argument","name":{"kind":"Name","value":"pageSize"},"value":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineThreadsWithTotalFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"ParticipantFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThreadParticipant"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"personId"}},{"kind":"Field","name":{"kind":"Name","value":"workspaceMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"avatarUrl"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineThreadFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThread"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"read"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"firstParticipant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ParticipantFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastTwoParticipants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"ParticipantFragment"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageReceivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageBody"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"numberOfMessagesInThread"}},{"kind":"Field","name":{"kind":"Name","value":"participantCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageIsDraft"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineThreadsWithTotalFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineThreadsWithTotal"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalNumberOfThreads"}},{"kind":"Field","name":{"kind":"Name","value":"relatedPersonIds"}},{"kind":"Field","name":{"kind":"Name","value":"timelineThreads"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineThreadFragment"}}]}}]}}]} as unknown as DocumentNode<GetTimelineThreadsFromObjectRecordQuery, GetTimelineThreadsFromObjectRecordQueryVariables>;
export const SearchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Search"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"searchInput"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"excludedObjectNameSingulars"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"includedObjectNameSingulars"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ObjectRecordFilterInput"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"search"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"searchInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"searchInput"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}},{"kind":"Argument","name":{"kind":"Name","value":"excludedObjectNameSingulars"},"value":{"kind":"Variable","name":{"kind":"Name","value":"excludedObjectNameSingulars"}}},{"kind":"Argument","name":{"kind":"Name","value":"includedObjectNameSingulars"},"value":{"kind":"Variable","name":{"kind":"Name","value":"includedObjectNameSingulars"}}},{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recordId"}},{"kind":"Field","name":{"kind":"Name","value":"objectNameSingular"}},{"kind":"Field","name":{"kind":"Name","value":"objectLabelSingular"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"imageUrl"}},{"kind":"Field","name":{"kind":"Name","value":"tsRankCD"}},{"kind":"Field","name":{"kind":"Name","value":"tsRank"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}}]} as unknown as DocumentNode<SearchQuery, SearchQueryVariables>;
export const FindCampaignOutreachWorkflowDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FindCampaignOutreachWorkflow"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"findCampaignOutreachWorkflow"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"campaignId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"currentVersionId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}}]}}]}}]} as unknown as DocumentNode<FindCampaignOutreachWorkflowQuery, FindCampaignOutreachWorkflowQueryVariables>;
export const CreateCampaignOutreachWorkflowDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateCampaignOutreachWorkflow"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createCampaignOutreachWorkflow"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"campaignId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"currentVersionId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}}]}}]}}]} as unknown as DocumentNode<CreateCampaignOutreachWorkflowMutation, CreateCampaignOutreachWorkflowMutationVariables>;
export const CampaignSequenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CampaignSequence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignSequence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"campaignId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceAbsent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"campaignId"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceLegacy"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequencePresent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"kind"}},{"kind":"Field","name":{"kind":"Name","value":"snapshot"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"}}]}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceSnapshot"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}},{"kind":"Field","name":{"kind":"Name","value":"versionId"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycleStatus"}},{"kind":"Field","name":{"kind":"Name","value":"versionStatus"}},{"kind":"Field","name":{"kind":"Name","value":"editable"}},{"kind":"Field","name":{"kind":"Name","value":"issues"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"messageId"}}]}}]}}]} as unknown as DocumentNode<CampaignSequenceQuery, CampaignSequenceQueryVariables>;
export const SaveCampaignSequenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SaveCampaignSequence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SaveCampaignSequenceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"saveCampaignSequence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceSnapshot"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}},{"kind":"Field","name":{"kind":"Name","value":"versionId"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycleStatus"}},{"kind":"Field","name":{"kind":"Name","value":"versionStatus"}},{"kind":"Field","name":{"kind":"Name","value":"editable"}},{"kind":"Field","name":{"kind":"Name","value":"issues"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"messageId"}}]}}]}}]} as unknown as DocumentNode<SaveCampaignSequenceMutation, SaveCampaignSequenceMutationVariables>;
export const PublishCampaignSequenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PublishCampaignSequence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PublishCampaignSequenceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"publishCampaignSequence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceSnapshot"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}},{"kind":"Field","name":{"kind":"Name","value":"versionId"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycleStatus"}},{"kind":"Field","name":{"kind":"Name","value":"versionStatus"}},{"kind":"Field","name":{"kind":"Name","value":"editable"}},{"kind":"Field","name":{"kind":"Name","value":"issues"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"messageId"}}]}}]}}]} as unknown as DocumentNode<PublishCampaignSequenceMutation, PublishCampaignSequenceMutationVariables>;
export const ValidateCampaignSequenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ValidateCampaignSequence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedVersionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"validateCampaignSequence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"campaignId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedVersionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedVersionId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceSnapshot"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}},{"kind":"Field","name":{"kind":"Name","value":"versionId"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycleStatus"}},{"kind":"Field","name":{"kind":"Name","value":"versionStatus"}},{"kind":"Field","name":{"kind":"Name","value":"editable"}},{"kind":"Field","name":{"kind":"Name","value":"issues"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"messageId"}}]}}]}}]} as unknown as DocumentNode<ValidateCampaignSequenceMutation, ValidateCampaignSequenceMutationVariables>;
export const ReplaceLegacyCampaignSequenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ReplaceLegacyCampaignSequence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ReplaceLegacyCampaignSequenceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"replaceLegacyCampaignSequence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CampaignSequenceSnapshotFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CampaignSequenceSnapshot"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"campaignId"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}},{"kind":"Field","name":{"kind":"Name","value":"versionId"}},{"kind":"Field","name":{"kind":"Name","value":"sequence"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycleStatus"}},{"kind":"Field","name":{"kind":"Name","value":"versionStatus"}},{"kind":"Field","name":{"kind":"Name","value":"editable"}},{"kind":"Field","name":{"kind":"Name","value":"issues"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"path"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"messageId"}}]}}]}}]} as unknown as DocumentNode<ReplaceLegacyCampaignSequenceMutation, ReplaceLegacyCampaignSequenceMutationVariables>;
export const MyahInboxThreadsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxThreads"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxThreads"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}},{"kind":"Argument","name":{"kind":"Name","value":"campaignId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"threadId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cursor"}},{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessagePreview"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageSender"}},{"kind":"Field","name":{"kind":"Name","value":"creator"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"campaign"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxThreadsQuery, MyahInboxThreadsQueryVariables>;
export const UpdateMyahInboxThreadDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateMyahInboxThread"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateMyahInboxThreadInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateMyahInboxThread"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessagePreview"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageSender"}},{"kind":"Field","name":{"kind":"Name","value":"creator"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"campaign"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateMyahInboxThreadMutation, UpdateMyahInboxThreadMutationVariables>;
export const SaveMyahInboxDraftDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SaveMyahInboxDraft"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SaveMyahInboxDraftInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"saveMyahInboxDraft"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"body"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markdown"}},{"kind":"Field","name":{"kind":"Name","value":"blocknote"}}]}}]}}]}}]} as unknown as DocumentNode<SaveMyahInboxDraftMutation, SaveMyahInboxDraftMutationVariables>;
export const GenerateMyahInboxReplyProposalDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GenerateMyahInboxReplyProposal"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GenerateMyahInboxReplyProposalInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"generateMyahInboxReplyProposal"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"body"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markdown"}},{"kind":"Field","name":{"kind":"Name","value":"blocknote"}}]}}]}}]}}]} as unknown as DocumentNode<GenerateMyahInboxReplyProposalMutation, GenerateMyahInboxReplyProposalMutationVariables>;
export const MyahInboxReplySendReadinessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxReplySendReadiness"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxReplySendReadiness"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"threadId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"reason"}}]}}]}}]} as unknown as DocumentNode<MyahInboxReplySendReadinessQuery, MyahInboxReplySendReadinessQueryVariables>;
export const SendMyahInboxReplyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendMyahInboxReply"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SendMyahInboxReplyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendMyahInboxReply"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"receiptId"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"body"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markdown"}},{"kind":"Field","name":{"kind":"Name","value":"blocknote"}}]}}]}}]}}]} as unknown as DocumentNode<SendMyahInboxReplyMutation, SendMyahInboxReplyMutationVariables>;
export const MyahInboxReplySendStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxReplySendStatus"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxReplySendStatusInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxReplySendStatus"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"outcome"}},{"kind":"Field","name":{"kind":"Name","value":"receiptId"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"body"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markdown"}},{"kind":"Field","name":{"kind":"Name","value":"blocknote"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxReplySendStatusQuery, MyahInboxReplySendStatusQueryVariables>;
export const MyahInboxContactsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContacts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"owner"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"states"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxState"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"snoozeStatus"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxSnoozeStatus"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContacts"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}},{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}},{"kind":"Argument","name":{"kind":"Name","value":"owner"},"value":{"kind":"Variable","name":{"kind":"Name","value":"owner"}}},{"kind":"Argument","name":{"kind":"Name","value":"campaignId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"campaignId"}}},{"kind":"Argument","name":{"kind":"Name","value":"states"},"value":{"kind":"Variable","name":{"kind":"Name","value":"states"}}},{"kind":"Argument","name":{"kind":"Name","value":"snoozeStatus"},"value":{"kind":"Variable","name":{"kind":"Name","value":"snoozeStatus"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cursor"}},{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxContactFields"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxContactFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactSummary"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"identityKind"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"instagramUsername"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"latestChannel"}},{"kind":"Field","name":{"kind":"Name","value":"preview"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}},{"kind":"Field","name":{"kind":"Name","value":"triage"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"inboxOwnerId"}},{"kind":"Field","name":{"kind":"Name","value":"inboxState"}},{"kind":"Field","name":{"kind":"Name","value":"snoozedUntil"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"identityGeneration"}}]}},{"kind":"Field","name":{"kind":"Name","value":"creator"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"email"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"threadCount"}},{"kind":"Field","name":{"kind":"Name","value":"threadIds"}},{"kind":"Field","name":{"kind":"Name","value":"latestThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}}]}},{"kind":"Field","name":{"kind":"Name","value":"instagram"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}},{"kind":"Field","name":{"kind":"Name","value":"conversations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"providerConversationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycle"}},{"kind":"Field","name":{"kind":"Name","value":"recipientUsername"}},{"kind":"Field","name":{"kind":"Name","value":"recipientDisplayName"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"latestDirection"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxContactsQuery, MyahInboxContactsQueryVariables>;
export const MyahInboxContactDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContact"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContact"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxContactFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxContactFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactSummary"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"identityKind"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"instagramUsername"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"latestChannel"}},{"kind":"Field","name":{"kind":"Name","value":"preview"}},{"kind":"Field","name":{"kind":"Name","value":"sender"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}},{"kind":"Field","name":{"kind":"Name","value":"triage"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"inboxOwnerId"}},{"kind":"Field","name":{"kind":"Name","value":"inboxState"}},{"kind":"Field","name":{"kind":"Name","value":"snoozedUntil"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"identityGeneration"}}]}},{"kind":"Field","name":{"kind":"Name","value":"creator"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"email"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"threadCount"}},{"kind":"Field","name":{"kind":"Name","value":"threadIds"}},{"kind":"Field","name":{"kind":"Name","value":"latestThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}}]}},{"kind":"Field","name":{"kind":"Name","value":"instagram"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isAvailable"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"needsAttention"}},{"kind":"Field","name":{"kind":"Name","value":"conversations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"providerConversationId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"lifecycle"}},{"kind":"Field","name":{"kind":"Name","value":"recipientUsername"}},{"kind":"Field","name":{"kind":"Name","value":"recipientDisplayName"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"latestDirection"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxContactQuery, MyahInboxContactQueryVariables>;
export const UpdateMyahInboxContactTriageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateMyahInboxContactTriage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateMyahInboxContactTriageInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateMyahInboxContactTriage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"inboxOwnerId"}},{"kind":"Field","name":{"kind":"Name","value":"inboxState"}},{"kind":"Field","name":{"kind":"Name","value":"snoozedUntil"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"identityGeneration"}}]}}]}}]} as unknown as DocumentNode<UpdateMyahInboxContactTriageMutation, UpdateMyahInboxContactTriageMutationVariables>;
export const MyahInboxInstagramMessagesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxInstagramMessages"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"conversationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxInstagramMessages"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"conversationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"conversationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cursor"}},{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"direction"}},{"kind":"Field","name":{"kind":"Name","value":"sentVia"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"deliveryState"}},{"kind":"Field","name":{"kind":"Name","value":"providerCreatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"hasAttachments"}},{"kind":"Field","name":{"kind":"Name","value":"attachmentCount"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxInstagramMessagesQuery, MyahInboxInstagramMessagesQueryVariables>;
export const MyahInboxContactEmailMessagesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContactEmailMessages"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContactEmailMessages"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cursor"}},{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"messageThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"receivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"direction"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attachmentFileIds"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxContactEmailMessagesQuery, MyahInboxContactEmailMessagesQueryVariables>;
export const MyahInboxContactEmailCardsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContactEmailCards"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"snapshot"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"olderCursor"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContactEmailCards"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"snapshot"},"value":{"kind":"Variable","name":{"kind":"Name","value":"snapshot"}}},{"kind":"Argument","name":{"kind":"Name","value":"olderCursor"},"value":{"kind":"Variable","name":{"kind":"Name","value":"olderCursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"snapshot"}},{"kind":"Field","name":{"kind":"Name","value":"olderCursor"}},{"kind":"Field","name":{"kind":"Name","value":"latestThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"cards"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailCardFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailCard"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"rootMessageId"}},{"kind":"Field","name":{"kind":"Name","value":"startTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"campaignLabel"}},{"kind":"Field","name":{"kind":"Name","value":"historyBasis"}}]}}]} as unknown as DocumentNode<MyahInboxContactEmailCardsQuery, MyahInboxContactEmailCardsQueryVariables>;
export const MyahInboxContactEmailCardDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContactEmailCard"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContactEmailCard"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"threadId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"snapshot"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailCardFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailCard"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"rootMessageId"}},{"kind":"Field","name":{"kind":"Name","value":"startTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"campaignLabel"}},{"kind":"Field","name":{"kind":"Name","value":"historyBasis"}}]}}]} as unknown as DocumentNode<MyahInboxContactEmailCardQuery, MyahInboxContactEmailCardQueryVariables>;
export const MyahInboxContactEmailCardMessagesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContactEmailCardMessages"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"snapshot"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContactEmailCardMessages"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"threadId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}}},{"kind":"Argument","name":{"kind":"Name","value":"snapshot"},"value":{"kind":"Variable","name":{"kind":"Name","value":"snapshot"}}},{"kind":"Argument","name":{"kind":"Name","value":"cursor"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cursor"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailMessagePageFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactEmailMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"messageThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"receivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"direction"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attachmentFileIds"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailMessagePageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailMessagePage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"olderCursor"}},{"kind":"Field","name":{"kind":"Name","value":"newerCursor"}},{"kind":"Field","name":{"kind":"Name","value":"root"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"messages"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"}}]}}]}}]} as unknown as DocumentNode<MyahInboxContactEmailCardMessagesQuery, MyahInboxContactEmailCardMessagesQueryVariables>;
export const MyahInboxContactEmailMessageLocationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxContactEmailMessageLocation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"snapshot"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxContactEmailMessageLocation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"contactId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"contactId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}},{"kind":"Argument","name":{"kind":"Name","value":"messageId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"messageId"}}},{"kind":"Argument","name":{"kind":"Name","value":"snapshot"},"value":{"kind":"Variable","name":{"kind":"Name","value":"snapshot"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"messageId"}},{"kind":"Field","name":{"kind":"Name","value":"card"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailCardFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailMessagePageFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxContactEmailMessage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"messageThreadId"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"receivedAt"}},{"kind":"Field","name":{"kind":"Name","value":"direction"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"participants"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attachmentFileIds"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailCardFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailCard"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"rootMessageId"}},{"kind":"Field","name":{"kind":"Name","value":"startTimestamp"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"campaignLabel"}},{"kind":"Field","name":{"kind":"Name","value":"historyBasis"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MyahInboxEmailMessagePageFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"MyahInboxEmailMessagePage"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"olderCursor"}},{"kind":"Field","name":{"kind":"Name","value":"newerCursor"}},{"kind":"Field","name":{"kind":"Name","value":"root"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"messages"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MyahInboxEmailStoredMessageFields"}}]}}]}}]} as unknown as DocumentNode<MyahInboxContactEmailMessageLocationQuery, MyahInboxContactEmailMessageLocationQueryVariables>;
export const MyahInboxEmailDraftDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyahInboxEmailDraft"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myahInboxEmailDraft"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"threadId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"threadId"}}},{"kind":"Argument","name":{"kind":"Name","value":"expectedWorkspaceId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"expectedWorkspaceId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"workspaceId"}},{"kind":"Field","name":{"kind":"Name","value":"threadId"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"body"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markdown"}},{"kind":"Field","name":{"kind":"Name","value":"blocknote"}}]}}]}}]}}]} as unknown as DocumentNode<MyahInboxEmailDraftQuery, MyahInboxEmailDraftQueryVariables>;
export const LinkMyahInboxContactCreatorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"LinkMyahInboxContactCreator"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LinkMyahInboxContactCreatorInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"linkMyahInboxContactCreator"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<LinkMyahInboxContactCreatorMutation, LinkMyahInboxContactCreatorMutationVariables>;
export const InstagramMessageDraftDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"InstagramMessageDraft"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetInstagramMessageDraftInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"instagramMessageDraft"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"draftId"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"body"}},{"kind":"Field","name":{"kind":"Name","value":"executionLocked"}}]}}]}}]} as unknown as DocumentNode<InstagramMessageDraftQuery, InstagramMessageDraftQueryVariables>;
export const SaveInstagramMessageDraftDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SaveInstagramMessageDraft"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SaveInstagramMessageDraftInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"saveInstagramMessageDraft"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"draftId"}},{"kind":"Field","name":{"kind":"Name","value":"revision"}},{"kind":"Field","name":{"kind":"Name","value":"body"}}]}}]}}]} as unknown as DocumentNode<SaveInstagramMessageDraftMutation, SaveInstagramMessageDraftMutationVariables>;
export const SendInstagramMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendInstagramMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SendInstagramMessageInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendInstagramMessage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"receiptId"}},{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"nextEligibleAt"}}]}}]}}]} as unknown as DocumentNode<SendInstagramMessageMutation, SendInstagramMessageMutationVariables>;
export const InstagramMessageSendStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"InstagramMessageSendStatus"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InstagramMessageSendStatusInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"instagramMessageSendStatus"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"receiptId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"providerCode"}},{"kind":"Field","name":{"kind":"Name","value":"outcome"}}]}}]}}]} as unknown as DocumentNode<InstagramMessageSendStatusQuery, InstagramMessageSendStatusQueryVariables>;
export const ActivateWorkflowVersionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ActivateWorkflowVersion"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"workflowVersionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"activateWorkflowVersion"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"workflowVersionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"workflowVersionId"}}}]}]}}]} as unknown as DocumentNode<ActivateWorkflowVersionMutation, ActivateWorkflowVersionMutationVariables>;
export const ComputeStepOutputSchemaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ComputeStepOutputSchema"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ComputeStepOutputSchemaInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"computeStepOutputSchema"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<ComputeStepOutputSchemaMutation, ComputeStepOutputSchemaMutationVariables>;
export const CreateDraftFromWorkflowVersionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateDraftFromWorkflowVersion"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateDraftFromWorkflowVersionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createDraftFromWorkflowVersion"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"steps"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateDraftFromWorkflowVersionMutation, CreateDraftFromWorkflowVersionMutationVariables>;
export const CreateWorkflowVersionEdgeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateWorkflowVersionEdge"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateWorkflowVersionEdgeInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createWorkflowVersionEdge"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WorkflowDiffFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WorkflowDiffFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WorkflowVersionStepChanges"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"triggerDiff"}},{"kind":"Field","name":{"kind":"Name","value":"stepsDiff"}}]}}]} as unknown as DocumentNode<CreateWorkflowVersionEdgeMutation, CreateWorkflowVersionEdgeMutationVariables>;
export const CreateWorkflowVersionStepDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateWorkflowVersionStep"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateWorkflowVersionStepInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createWorkflowVersionStep"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WorkflowDiffFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WorkflowDiffFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WorkflowVersionStepChanges"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"triggerDiff"}},{"kind":"Field","name":{"kind":"Name","value":"stepsDiff"}}]}}]} as unknown as DocumentNode<CreateWorkflowVersionStepMutation, CreateWorkflowVersionStepMutationVariables>;
export const DeactivateWorkflowVersionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeactivateWorkflowVersion"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"workflowVersionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deactivateWorkflowVersion"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"workflowVersionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"workflowVersionId"}}}]}]}}]} as unknown as DocumentNode<DeactivateWorkflowVersionMutation, DeactivateWorkflowVersionMutationVariables>;
export const DeleteWorkflowVersionEdgeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteWorkflowVersionEdge"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateWorkflowVersionEdgeInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteWorkflowVersionEdge"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WorkflowDiffFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WorkflowDiffFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WorkflowVersionStepChanges"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"triggerDiff"}},{"kind":"Field","name":{"kind":"Name","value":"stepsDiff"}}]}}]} as unknown as DocumentNode<DeleteWorkflowVersionEdgeMutation, DeleteWorkflowVersionEdgeMutationVariables>;
export const DeleteWorkflowVersionStepDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteWorkflowVersionStep"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DeleteWorkflowVersionStepInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteWorkflowVersionStep"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WorkflowDiffFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WorkflowDiffFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WorkflowVersionStepChanges"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"triggerDiff"}},{"kind":"Field","name":{"kind":"Name","value":"stepsDiff"}}]}}]} as unknown as DocumentNode<DeleteWorkflowVersionStepMutation, DeleteWorkflowVersionStepMutationVariables>;
export const DuplicateWorkflowDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DuplicateWorkflow"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DuplicateWorkflowInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"duplicateWorkflow"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"steps"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"workflowId"}}]}}]}}]} as unknown as DocumentNode<DuplicateWorkflowMutation, DuplicateWorkflowMutationVariables>;
export const DuplicateWorkflowVersionStepDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DuplicateWorkflowVersionStep"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DuplicateWorkflowVersionStepInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"duplicateWorkflowVersionStep"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WorkflowDiffFragment"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WorkflowDiffFragment"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WorkflowVersionStepChanges"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"triggerDiff"}},{"kind":"Field","name":{"kind":"Name","value":"stepsDiff"}}]}}]} as unknown as DocumentNode<DuplicateWorkflowVersionStepMutation, DuplicateWorkflowVersionStepMutationVariables>;
export const RetryWorkflowRunDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RetryWorkflowRun"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"workflowRunId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"retryWorkflowRun"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"workflowRunId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"workflowRunId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"__typename"}}]}}]}}]} as unknown as DocumentNode<RetryWorkflowRunMutation, RetryWorkflowRunMutationVariables>;
export const RunWorkflowVersionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RunWorkflowVersion"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RunWorkflowVersionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"runWorkflowVersion"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"workflowRunId"}}]}}]}}]} as unknown as DocumentNode<RunWorkflowVersionMutation, RunWorkflowVersionMutationVariables>;
export const StopWorkflowRunDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"StopWorkflowRun"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"workflowRunId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"stopWorkflowRun"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"workflowRunId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"workflowRunId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"__typename"}}]}}]}}]} as unknown as DocumentNode<StopWorkflowRunMutation, StopWorkflowRunMutationVariables>;
export const UpdateWorkflowRunStepDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateWorkflowRunStep"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateWorkflowRunStepInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateWorkflowRunStep"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"settings"}},{"kind":"Field","name":{"kind":"Name","value":"valid"}},{"kind":"Field","name":{"kind":"Name","value":"nextStepIds"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateWorkflowRunStepMutation, UpdateWorkflowRunStepMutationVariables>;
export const UpdateWorkflowVersionStepDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateWorkflowVersionStep"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateWorkflowVersionStepInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateWorkflowVersionStep"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"settings"}},{"kind":"Field","name":{"kind":"Name","value":"valid"}},{"kind":"Field","name":{"kind":"Name","value":"nextStepIds"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}}]}}]}}]}}]} as unknown as DocumentNode<UpdateWorkflowVersionStepMutation, UpdateWorkflowVersionStepMutationVariables>;
export const WorkflowStepConnectedAccountHandleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WorkflowStepConnectedAccountHandle"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"connectedAccountId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UUID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"workflowStepConnectedAccountHandle"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"connectedAccountId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"connectedAccountId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"handle"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}}]}}]}}]} as unknown as DocumentNode<WorkflowStepConnectedAccountHandleQuery, WorkflowStepConnectedAccountHandleQueryVariables>;
export const SubmitFormStepDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SubmitFormStep"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SubmitFormStepInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"submitFormStep"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SubmitFormStepMutation, SubmitFormStepMutationVariables>;
export const TestHttpRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"TestHttpRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"TestHttpRequestInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"testHttpRequest"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"success"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"result"}},{"kind":"Field","name":{"kind":"Name","value":"error"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"statusText"}},{"kind":"Field","name":{"kind":"Name","value":"headers"}}]}}]}}]} as unknown as DocumentNode<TestHttpRequestMutation, TestHttpRequestMutationVariables>;
export const UpdateWorkflowVersionPositionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateWorkflowVersionPositions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateWorkflowVersionPositionsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateWorkflowVersionPositions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<UpdateWorkflowVersionPositionsMutation, UpdateWorkflowVersionPositionsMutationVariables>;