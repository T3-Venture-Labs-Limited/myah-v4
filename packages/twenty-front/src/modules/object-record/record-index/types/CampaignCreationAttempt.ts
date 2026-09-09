import { type Store } from 'jotai/vanilla/store';
import { type RecordGqlNode } from '@/object-record/graphql/types/RecordGqlNode';
import { type ViewOpenRecordIn } from '~/generated-metadata/graphql';

export type CampaignCreationIdentity = Readonly<{
  workspaceId: string;
  userId: string;
  userWorkspaceId: string;
  workspaceMemberId?: string;
  isImpersonating: boolean;
  impersonatorUserWorkspaceId?: string;
  impersonatedUserWorkspaceId?: string;
}>;

export type CampaignCreationOrigin = Readonly<{
  recordIndexId: string;
  contextStoreInstanceId: string;
  returnPath: string;
  openRecordIn: ViewOpenRecordIn;
  shouldCloseAfterCreation: boolean;
  position: 'first' | 'last' | null;
  groupFieldMetadataId?: string;
}>;

export type CampaignCreationWarning =
  | 'cache'
  | 'store'
  | 'group'
  | 'aggregate'
  | 'event';
export type CampaignCreationAttempt = {
  readonly recordId: string;
  readonly objectMetadataId: string;
  readonly identity: CampaignCreationIdentity;
  readonly origin: CampaignCreationOrigin;
  // null only during synchronous preparing; immutable JSON string thereafter.
  readonly inputJson: string | null;
  phase: 'preparing' | 'creating' | 'checking' | 'unconfirmed' | 'saved';
  runId: number | null;
  uncertain: boolean;
  savedNode?: RecordGqlNode;
  savedBoundaryGeneration?: number;
  completionAttempted: boolean;
  warnings: CampaignCreationWarning[];
};

export type CampaignCreationState = {
  sessionGeneration: number;
  boundaryGeneration: number;
  actorKey: string | null;
  observedIdentityKey: string | null;
  nextRunId: number;
  attempts: Record<string, CampaignCreationAttempt>;
  mountedOrigins: Record<string, number>;
};

export type CampaignCreationOperationContext = {
  store: Store;
  attemptKey: string;
  runId: number;
  sessionGeneration: number;
  boundaryGeneration: number;
  identity: CampaignCreationIdentity;
  objectMetadataId: string;
  kind: 'create' | 'read';
  transport: { dispatched: boolean; uncertain: boolean };
  invalidated: boolean;
};

export type CampaignCreationRequest = {
  context: CampaignCreationOperationContext;
  intent: 'create' | 'retry' | 'open-saved';
};
export type CreateOneRecordOptions = {
  campaignCreation?: CampaignCreationRequest;
};
