import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { type MyahReplyContextSnapshot } from 'src/engine/core-modules/action-approval/types/action-approval.type';

export enum ActionApprovalBindingState {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  EXPIRED = 'EXPIRED',
  CONSUMED = 'CONSUMED',
}

export const ActionApprovalInteractionContextType = {
  MYAH_INBOX_INSTAGRAM_DRAFT: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  MYAH_INBOX_EMAIL_CONTEXT_DRAFT: 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT',
} as const;

export type ActionApprovalInteractionContextType =
  (typeof ActionApprovalInteractionContextType)[keyof typeof ActionApprovalInteractionContextType];

@Entity({ name: 'actionApprovalBinding', schema: 'core' })
@Check(
  'CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT',
  `(
    (
      "actionName" = 'send_instagram_message'
      AND "actionVersion" = 2
      AND "actionKind" IN ('START_CHAT', 'REPLY')
      AND "myahReplyContextSnapshot" IS NULL
      AND (
        (
          "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL
          AND "interactionContextId" IS NULL
        )
        OR
        (
          "threadId" IS NULL
          AND "interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT'
          AND "interactionContextId" = "draftId"
        )
      )
    )
    OR
    (
      "actionName" = 'send_inbox_reply'
      AND "actionVersion" = 1
      AND "actionKind" IS NULL
      AND "threadId" IS NOT NULL
      AND "interactionContextType" IS NULL
      AND "interactionContextId" IS NULL
      AND "myahReplyContextSnapshot" IS NULL
    )
    OR
    (
      "actionName" = 'send_inbox_reply'
      AND "actionVersion" = 2
      AND "actionKind" IS NULL
      AND "myahReplyContextSnapshot" IS NOT NULL
          AND jsonb_typeof("myahReplyContextSnapshot") = 'object'
          AND "myahReplyContextSnapshot" ->> 'schemaVersion' = '1'
          AND "myahReplyContextSnapshot" ->> 'channel' = 'EMAIL'
          AND "myahReplyContextSnapshot" ->> 'draftId' = "draftId"::text
          AND "myahReplyContextSnapshot" ->> 'deliveryTargetId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND "myahReplyContextSnapshot" ->> 'contextFingerprint' ~ '^[0-9a-f]{64}$'
          AND "myahReplyContextSnapshot" ->> 'eligibilityEvidenceDigest' ~ '^[0-9a-f]{64}$'
          AND "myahReplyContextSnapshot" #>> '{contactAnchor,kind}' IN ('CREATOR', 'EMAIL_THREAD')
          AND "myahReplyContextSnapshot" #>> '{contactAnchor,id}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (("myahReplyContextSnapshot" #>> '{replyContext,kind}' = 'GENERAL'
                AND "myahReplyContextSnapshot" #>> '{replyContext,campaignId}' IS NULL)
            OR ("myahReplyContextSnapshot" #>> '{replyContext,kind}' = 'CAMPAIGN'
                AND "myahReplyContextSnapshot" #>> '{replyContext,campaignId}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      AND (
        (
          "threadId" IS NOT NULL
          AND "interactionContextType" IS NULL
          AND "interactionContextId" IS NULL
        )
        OR
        (
          "threadId" IS NULL
          AND "interactionContextType" = 'MYAH_INBOX_EMAIL_CONTEXT_DRAFT'
          AND "interactionContextId" = "draftId"
        )
      )
    )
    OR
    (
      "actionName" NOT IN ('send_instagram_message', 'send_inbox_reply')
      AND "actionKind" IS NULL
      AND "threadId" IS NOT NULL
      AND "interactionContextType" IS NULL
      AND "interactionContextId" IS NULL
      AND "myahReplyContextSnapshot" IS NULL
    )
  ) IS TRUE`,
)
export class ActionApprovalBindingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  initiatorUserWorkspaceId: string;

  @Column({ type: 'varchar' })
  actionName: string;

  @Column({ type: 'integer' })
  actionVersion: number;

  @Column({ type: 'varchar', nullable: true })
  actionKind: 'START_CHAT' | 'REPLY' | null;

  @Column({ type: 'uuid' })
  draftId: string;

  @Column({ type: 'varchar', length: 64 })
  contentDigest: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  recipientFingerprint: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sendingAccountFingerprint: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  actionContextFingerprint: string | null;

  @Column({ type: 'text', nullable: true })
  inboundMessageId: string | null;

  @Column({ type: 'text', nullable: true })
  inboundSenderIgsid: string | null;

  @Column({ type: 'text', nullable: true })
  inboundDirection: 'INBOUND' | null;

  @Column({ type: 'timestamptz', nullable: true })
  inboundReceivedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  threadId: string | null;

  @Column({ type: 'varchar', nullable: true })
  interactionContextType: ActionApprovalInteractionContextType | null;

  @Column({ type: 'uuid', nullable: true })
  interactionContextId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  myahReplyContextSnapshot: MyahReplyContextSnapshot | null;

  @Column({
    type: 'enum',
    enum: ActionApprovalBindingState,
    enumName: 'actionApprovalBinding_state_enum',
  })
  state: ActionApprovalBindingState;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(
    () => ActionApprovalBindingEvidenceLinkEntity,
    (evidenceLink) => evidenceLink.actionApprovalBinding,
  )
  evidenceLinks: Relation<ActionApprovalBindingEvidenceLinkEntity[]>;

  @OneToMany(
    () => ActionExecutionReceiptEntity,
    (receipt) => receipt.actionApprovalBinding,
  )
  receipts: Relation<ActionExecutionReceiptEntity[]>;
}
