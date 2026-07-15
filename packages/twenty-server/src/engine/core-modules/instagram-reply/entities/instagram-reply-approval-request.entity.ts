import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export enum InstagramReplyApprovalState {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
}

@Index('IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD', [
  'workspaceId',
  'threadId',
])
@Unique('IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID', [
  'workspaceId',
  'approvalId',
])
@Entity({ name: 'instagramReplyApprovalRequest', schema: 'core' })
export class InstagramReplyApprovalRequestEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userWorkspaceId: string;

  @Column({ type: 'uuid' })
  threadId: string;

  @Column({ type: 'uuid' })
  approvalId: string;

  @Column()
  toolName: string;

  @Column()
  connectedAccountId: string;

  @Column({ type: 'uuid' })
  draftId: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'text', nullable: true })
  providerConversationId: string | null;

  @Column({ type: 'text', nullable: true })
  recipientIgsid: string | null;

  @Column({ length: 64 })
  previewTextSha256: string;

  @Column({
    type: 'enum',
    enum: InstagramReplyApprovalState,
    default: InstagramReplyApprovalState.PENDING,
  })
  state: InstagramReplyApprovalState;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
