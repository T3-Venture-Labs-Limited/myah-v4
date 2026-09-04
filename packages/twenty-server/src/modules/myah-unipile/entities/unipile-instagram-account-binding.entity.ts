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

import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export enum UnipileInstagramAccountBindingStatus {
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  NEEDS_RECONNECT = 'NEEDS_RECONNECT',
  ERROR = 'ERROR',
  INACTIVE = 'INACTIVE',
  DELETE_UNKNOWN = 'DELETE_UNKNOWN',
}

@Entity({ name: 'unipileInstagramAccountBinding', schema: 'core' })
@Index('IDX_UNIPILE_IG_BINDING_ACTIVE_INSTAGRAM_OWNER', ['instagramUserId'], {
  unique: true,
  where: '"deactivatedAt" IS NULL',
})
@Unique('UQ_UNIPILE_IG_BINDING_UNIPILE_ACCOUNT', ['unipileAccountId'])
export class UnipileInstagramAccountBindingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  workspaceInstagramAccountRecordId: string;

  @Column({ type: 'text' })
  unipileAccountId: string;

  @Column({ type: 'text' })
  instagramUserId: string;

  @Column({ type: 'uuid', nullable: true })
  connectedByUserWorkspaceId: string | null;

  @Column({
    type: 'varchar',
    default: UnipileInstagramAccountBindingStatus.CONNECTING,
  })
  status: UnipileInstagramAccountBindingStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId', referencedColumnName: 'id' })
  workspace: Relation<WorkspaceEntity>;

  @ManyToOne(() => UserWorkspaceEntity, { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'connectedByUserWorkspaceId',
    referencedColumnName: 'id',
  })
  connectedByUserWorkspace: Relation<UserWorkspaceEntity> | null;
}
