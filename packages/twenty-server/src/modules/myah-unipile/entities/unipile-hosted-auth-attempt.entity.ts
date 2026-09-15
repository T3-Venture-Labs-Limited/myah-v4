import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

export enum UnipileHostedAuthAttemptOperation {
  CREATE = 'CREATE',
  RECONNECT = 'RECONNECT',
}

export enum UnipileHostedAuthAttemptStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ name: 'unipileHostedAuthAttempt', schema: 'core' })
@Unique('UQ_UNIPILE_AUTH_ATTEMPT_CALLBACK_SECRET', ['callbackSecretHash'])
export class UnipileHostedAuthAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid', nullable: true })
  userWorkspaceId: string | null;

  @Column({
    type: 'enum',
    enum: UnipileHostedAuthAttemptOperation,
    enumName: 'unipileHostedAuthAttempt_operation_enum',
  })
  operation: UnipileHostedAuthAttemptOperation;

  @Column({ type: 'uuid', nullable: true })
  expectedBindingId: string | null;

  @Column({ type: 'text' })
  callbackSecretHash: string;

  @Column({ type: 'text', nullable: true })
  callbackDigest: string | null;

  @Column({ type: 'text', nullable: true })
  callbackAccountId: string | null;

  @Column({ type: 'text', nullable: true })
  callbackStatus: string | null;

  @Column({
    type: 'enum',
    enum: UnipileHostedAuthAttemptStatus,
    enumName: 'unipileHostedAuthAttempt_status_enum',
    default: UnipileHostedAuthAttemptStatus.PENDING,
  })
  status: UnipileHostedAuthAttemptStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  failureCode: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId', referencedColumnName: 'id' })
  workspace: Relation<WorkspaceEntity>;

  @ManyToOne(() => UserWorkspaceEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userWorkspaceId', referencedColumnName: 'id' })
  userWorkspace: Relation<UserWorkspaceEntity> | null;

  @ManyToOne(() => UnipileInstagramAccountBindingEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'expectedBindingId', referencedColumnName: 'id' })
  expectedBinding: Relation<UnipileInstagramAccountBindingEntity> | null;
}
