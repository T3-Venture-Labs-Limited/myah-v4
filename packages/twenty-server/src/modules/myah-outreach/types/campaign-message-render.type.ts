import { type CampaignSequence } from 'twenty-shared/workflow';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

export const CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION =
  'campaign-email-render/v1' as const;

export const SUPPORTED_CREATOR_VARIABLES = [
  'creator.email',
  'creator.name',
] as const;

export type SupportedCreatorVariable =
  (typeof SUPPORTED_CREATOR_VARIABLES)[number];

type CampaignSequenceEmail = Extract<
  CampaignSequence['messages'][number],
  { channel: 'EMAIL' }
>;

export type CampaignSequenceEmailFile = CampaignSequenceEmail['files'][number];

export type CampaignMessageRenderCoordinates = Readonly<{
  workspaceId: string;
  campaignId: string;
  campaignCreatorId: string;
  workflowVersionId: string;
  messageId: string;
}>;

export type CampaignMessagePreviewThreadScope =
  | Readonly<{ kind: 'NEW_THREAD' }>
  | Readonly<{
      kind: 'PLANNED_PRIOR_STEP';
      priorMessageId: string;
    }>
  | Readonly<{
      kind: 'EXISTING_EVIDENCE';
      enrollmentId: string;
      occurrenceId: string;
      evidenceId: string;
    }>;

export type CampaignMessagePreviewContext = Readonly<{
  kind: 'PREVIEW';
  authContext: UserWorkspaceAuthContext;
  requesterUserId: string;
  requesterUserWorkspaceId: string;
  threadScope: CampaignMessagePreviewThreadScope;
}>;

export type VerifiedCampaignTestReservationBinding = Readonly<{
  kind: 'CAMPAIGN_TEST_RESERVATION';
  source: 'CAMPAIGN_TEST';
  workspaceId: string;
  campaignId: string;
  campaignCreatorId: string;
  workflowVersionId: string;
  messageId: string;
  attemptId: string;
  testPreparationProofId: string;
  reservedAt: Date;
  requesterUserId: string;
  requesterUserWorkspaceId: string;
  normalizedRecipient: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderHandle: string;
  senderPoolFingerprint: string;
  renderDigest: string;
  previewDigest: string;
  testTransportDigest: string;
}>;

export type CampaignMessageTestFinalizationContext = Readonly<{
  kind: 'TEST_FINALIZATION';
  authContext: UserWorkspaceAuthContext;
  requesterUserId: string;
  requesterUserWorkspaceId: string;
  threadScope: CampaignMessagePreviewThreadScope;
  reservationBinding: VerifiedCampaignTestReservationBinding;
}>;

export type AuthorizedCampaignSequenceRenderContext = Readonly<{
  kind: 'CAMPAIGN_SEQUENCE_RENDER';
  workspaceId: string;
  campaignId: string;
  campaignCreatorId: string;
  authorizationId: string;
  enrollmentId: string;
  occurrenceId: string;
  workflowVersionId: string;
  messageId: string;
  initiatorUserWorkspaceId: string;
  authorityFingerprint: string;
  senderPoolFingerprint: string;
  fixedMaterialFingerprint: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderHandle: string;
  replyEvidenceId: string | null;
}>;

export type VerifiedCampaignSenderBinding = Readonly<{
  connectedAccountId: string;
  messageChannelId: string;
  senderHandle: string;
  provider: ConnectedAccountProvider;
  senderPoolFingerprint: string;
}>;

export type VerifiedCampaignSequenceSentEvidence = Readonly<{
  evidenceId: string;
  enrollmentId: string;
  occurrenceId: string;
  priorMessageId: string;
  normalizedRecipient: string;
  connectedAccountId: string;
  messageChannelId: string;
  senderHandle: string;
  providerMessageId: string;
  providerThreadId: string;
}>;

export type CampaignSequenceFixedMaterialProof = Readonly<{
  fixedMaterialFingerprint: string;
  signatureDigest: string | null;
  orderedAttachmentProofs: readonly CampaignAttachmentProof[];
}>;

export type CampaignMessageDispatchContext = Readonly<{
  kind: 'DISPATCH';
  authContext: UserWorkspaceAuthContext;
  rolePermissionConfig: RolePermissionConfig;
  renderContext: AuthorizedCampaignSequenceRenderContext;
  senderBinding: VerifiedCampaignSenderBinding;
  replyEvidence:
    | VerifiedCampaignSequenceSentEvidence
    | Readonly<{ kind: 'NEW_THREAD' }>;
  fixedMaterialProof: CampaignSequenceFixedMaterialProof;
}>;

export type CampaignMessageRenderContext =
  | CampaignMessagePreviewContext
  | CampaignMessageTestFinalizationContext
  | CampaignMessageDispatchContext;

export type CampaignSenderBlockedReason =
  | 'ACCOUNT_UNAVAILABLE'
  | 'ACCOUNT_NOT_READY'
  | 'CAPACITY_UNAVAILABLE'
  | 'POLICY_MISMATCH';

type CampaignSenderReadinessCommon = Readonly<{
  campaignAccountId: string;
  connectedAccountId: string;
  messageChannelId: string;
  recoveryPath: string | null;
}>;

export type CampaignSenderReadiness = CampaignSenderReadinessCommon &
  (
    | Readonly<{
        bindingStatus: 'RESOLVED_BINDING';
        senderHandle: string;
        provider: ConnectedAccountProvider;
        dailySendLimit: number;
        minimumSendIntervalMs: number;
        status: 'READY' | 'BLOCKED';
        reason: CampaignSenderBlockedReason | null;
        missingBinding: null;
      }>
    | Readonly<{
        bindingStatus: 'MISSING_CORE_BINDING';
        senderHandle: null;
        provider: null;
        dailySendLimit: null;
        minimumSendIntervalMs: null;
        status: 'BLOCKED';
        reason: 'ACCOUNT_UNAVAILABLE';
        missingBinding: 'CONNECTED_ACCOUNT' | 'MESSAGE_CHANNEL' | 'BOTH';
      }>
  );

export type CampaignAttachmentProof = Readonly<{
  fileId: string;
  filename: string;
  contentType: string;
  size: number;
  contentDigest: string;
}>;

export type CampaignMessageMaterialThread =
  | Readonly<{ kind: 'NEW_THREAD' }>
  | Readonly<{
      kind: 'PLANNED_PRIOR_STEP';
      priorMessageId: string;
    }>
  | Readonly<{
      kind: 'REPLY';
      evidence: VerifiedCampaignSequenceSentEvidence;
    }>;

export type CampaignMessageMaterial = Readonly<{
  coordinates: CampaignMessageRenderCoordinates;
  workflowId: string;
  authored: Readonly<{
    subject: string;
    body: string;
    orderedFileRefs: readonly CampaignSequenceEmailFile[];
    replyToThread: boolean;
  }>;
  creator: Readonly<{
    creatorId: string;
    normalizedRecipient: string;
    variables: Readonly<Record<SupportedCreatorVariable, string>>;
  }>;
  signature: Readonly<{ html: string; digest: string }> | null;
  sender: Readonly<{
    connectedAccountId: string;
    messageChannelId: string;
    handle: string;
    provider: ConnectedAccountProvider;
    senderPoolFingerprint: string;
    authorizedEmailSenderPool: readonly CampaignSenderReadiness[];
    projectedSlotAt: Date | null;
    isPreviewProjection: boolean;
  }>;
  attachments: readonly (CampaignAttachmentProof &
    Readonly<{ bytes: Buffer }>)[];
  thread: CampaignMessageMaterialThread;
}>;

export type CampaignMessageBlockerCode =
  | 'CAMPAIGN_NOT_FOUND'
  | 'CREATOR_NOT_FOUND'
  | 'REVISION_NOT_FOUND'
  | 'MESSAGE_NOT_FOUND'
  | 'MESSAGE_NOT_EMAIL'
  | 'INVALID_SEQUENCE'
  | 'UNKNOWN_VARIABLE'
  | 'MISSING_VARIABLE'
  | 'INVALID_CONTENT'
  | 'ATTACHMENT_NOT_FOUND'
  | 'ATTACHMENT_FORBIDDEN'
  | 'ATTACHMENT_CHANGED'
  | 'SENDER_UNAVAILABLE'
  | 'SENDER_NOT_READY'
  | 'SENDER_POOL_STALE'
  | 'SENDER_PROJECTION_STALE'
  | 'THREAD_EVIDENCE_MISSING'
  | 'THREAD_EVIDENCE_AMBIGUOUS'
  | 'THREAD_IDENTITY_MISMATCH'
  | 'MATERIAL_STALE';

export type CampaignMessageBlocker = Readonly<{
  code: CampaignMessageBlockerCode;
  message: string;
  messageId?: string;
  fileId?: string;
}>;

export type CampaignSequenceFixedMaterialInput = Readonly<{
  workspaceId: string;
  campaignId: string;
  workflowVersionId: string;
  orderedMessageIds: readonly string[];
  authContext: UserWorkspaceAuthContext;
}>;

export type CampaignSequenceFixedMaterialResult =
  | Readonly<{
      kind: 'READY';
      value: Readonly<{
        workspaceId: string;
        campaignId: string;
        workflowVersionId: string;
        signatureDigest: string | null;
        messages: readonly Readonly<{
          messageId: string;
          subject: string;
          body: string;
          replyToThread: boolean;
          orderedFileRefs: readonly CampaignSequenceEmailFile[];
          orderedAttachmentProofs: readonly CampaignAttachmentProof[];
        }>[];
      }>;
    }>
  | Readonly<{
      kind: 'BLOCKED';
      blockers: readonly CampaignMessageBlocker[];
    }>;

export type CampaignMessageMaterialResult =
  | Readonly<{ kind: 'READY'; material: CampaignMessageMaterial }>
  | Readonly<{
      kind: 'BLOCKED';
      blockers: readonly CampaignMessageBlocker[];
    }>;

export type CampaignMessageRenderResult =
  | Readonly<{
      kind: 'READY';
      render: Readonly<{
        coordinates: CampaignMessageRenderCoordinates;
        creatorId: string;
        normalizedRecipient: string;
        sender: Readonly<{
          connectedAccountId: string;
          messageChannelId: string;
          handle: string;
          provider: ConnectedAccountProvider;
          senderPoolFingerprint: string;
          isPreviewProjection: boolean;
        }>;
        subject: string;
        html: string;
        text: string;
        bodyWithSignature: string;
        variables: readonly Readonly<{
          key: SupportedCreatorVariable;
          value: string;
        }>[];
        signature: Readonly<{ html: string; digest: string }> | null;
        orderedAttachmentProofs: readonly CampaignAttachmentProof[];
        replyIntent: boolean;
        thread:
          | Readonly<{ kind: 'NEW_THREAD' }>
          | Readonly<{
              kind: 'PLANNED_PRIOR_STEP';
              priorMessageId: string;
            }>
          | Readonly<{
              kind: 'REPLY';
              evidenceId: string;
              priorMessageId: string;
            }>;
        renderDigest: string;
        rendererRevision: typeof CAMPAIGN_EMAIL_RENDER_SCHEMA_VERSION;
        composedEmail: ComposedEmail;
      }>;
    }>
  | Readonly<{
      kind: 'BLOCKED';
      blockers: readonly CampaignMessageBlocker[];
    }>;

export type CampaignMaterialPortResult<T> =
  | Readonly<{ kind: 'READY'; value: T }>
  | Readonly<{
      kind: 'BLOCKED';
      blockers: readonly CampaignMessageBlocker[];
    }>;

export type CampaignCreatorMaterial = Readonly<{
  creatorId: string;
  normalizedRecipient: string;
  variables: Readonly<
    Partial<Record<SupportedCreatorVariable, string>> &
      Record<string, string | undefined>
  >;
}>;

export interface CampaignCreatorMaterialPort {
  load(
    input: Readonly<{
      coordinates: CampaignMessageRenderCoordinates;
      authContext: UserWorkspaceAuthContext;
    }>,
  ): Promise<CampaignMaterialPortResult<CampaignCreatorMaterial>>;
}

export interface CampaignSignatureMaterialPort {
  load(
    input: Readonly<{
      workspaceId: string;
      campaignId: string;
      authContext: UserWorkspaceAuthContext;
    }>,
  ): Promise<
    CampaignMaterialPortResult<Readonly<{ html: string | null }> | null>
  >;
}

export interface CampaignSenderMaterialPort {
  load(
    input: Readonly<{
      coordinates: CampaignMessageRenderCoordinates;
      context: CampaignMessageRenderContext;
    }>,
  ): Promise<CampaignMaterialPortResult<CampaignMessageMaterial['sender']>>;
}

export type CampaignAttachmentLoadResult =
  | Readonly<{
      kind: 'READY';
      value: Readonly<{
        filename: string;
        contentType: string;
        bytes: Buffer;
      }>;
    }>
  | Readonly<{ kind: 'NOT_FOUND' }>
  | Readonly<{ kind: 'FORBIDDEN' }>
  | Readonly<{ kind: 'CHANGED' }>;

export interface CampaignAttachmentStoragePort {
  load(
    input: Readonly<{
      workspaceId: string;
      file: CampaignSequenceEmailFile;
      authContext: UserWorkspaceAuthContext;
    }>,
  ): Promise<CampaignAttachmentLoadResult>;
}

export interface CampaignThreadMaterialPort {
  load(
    input: Readonly<{
      coordinates: CampaignMessageRenderCoordinates;
      context: CampaignMessageRenderContext;
      replyToThread: boolean;
      normalizedRecipient: string;
      sender: CampaignMessageMaterial['sender'];
    }>,
  ): Promise<CampaignMaterialPortResult<CampaignMessageMaterialThread>>;
}
