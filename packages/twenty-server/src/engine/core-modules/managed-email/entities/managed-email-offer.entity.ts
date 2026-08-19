import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type ManagedEmailProposal } from '../types/managed-email-proposal.type';
import { type ManagedEmailQuote } from '../types/managed-email-quote.type';
import {
  managedEmailProposalSnapshotTransformer,
  managedEmailQuoteSnapshotTransformer,
} from '../utils/validate-managed-email-offer-json.util';

@Entity({ name: 'managedEmailOffer', schema: 'core' })
@Unique('UQ_MANAGED_EMAIL_OFFER_WORKSPACE_ID', ['workspaceId', 'id'])
@Unique('UQ_MANAGED_EMAIL_OFFER_WORKSPACE_IDEMPOTENCY', [
  'workspaceId',
  'idempotencyKey',
])
@Index('IDX_MANAGED_EMAIL_OFFER_EXPIRY', ['expiresAt'])
@Index('IDX_MANAGED_EMAIL_OFFER_PROPOSAL', ['workspaceId', 'proposalId'], {
  unique: true,
  where: `"kind" = 'PROPOSAL'`,
})
@Index('IDX_MANAGED_EMAIL_OFFER_QUOTE', ['workspaceId', 'quoteId'], {
  unique: true,
})
export class ManagedEmailOfferEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', update: false }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;
  @Column({ type: 'uuid', update: false }) actorWorkspaceMemberId: string;
  @Column({ type: 'text' }) kind: 'BUNDLE' | 'PROPOSAL' | 'QUOTE';
  @Column({ type: 'text' }) state: 'ACTIVE' | 'CONSUMED';
  @Column({ nullable: true, type: 'uuid', update: false }) proposalId:
    | string
    | null;
  @Column({ nullable: true, type: 'uuid', update: false }) quoteId:
    | string
    | null;
  @Column({ nullable: true, type: 'text', update: false })
  providerInventoryId: string | null;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ nullable: true, type: 'text', update: false }) fingerprint:
    | string
    | null;
  @Column({ nullable: true, type: 'text', update: false }) proposalFingerprint:
    | string
    | null;
  @Column({ nullable: true, type: 'text', update: false }) quoteFingerprint:
    | string
    | null;
  @Column({
    nullable: true,
    type: 'jsonb',
    transformer: managedEmailProposalSnapshotTransformer,
    update: false,
  })
  proposalSnapshot: ManagedEmailProposal | null;
  @Column({
    nullable: true,
    type: 'jsonb',
    transformer: managedEmailQuoteSnapshotTransformer,
    update: false,
  })
  quoteSnapshot: ManagedEmailQuote | null;
  @Column({ nullable: true, type: 'uuid' }) consumedOperationId: string | null;
  @Column({ nullable: true, type: 'text' }) idempotencyKey: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
