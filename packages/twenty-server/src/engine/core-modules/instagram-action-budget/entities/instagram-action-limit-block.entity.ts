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

import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export enum InstagramActionBlockedWindow {
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
}

@Unique('UQ_INSTAGRAM_ACTION_LIMIT_BLOCK_RECEIPT', ['actionExecutionReceiptId'])
@Entity({ name: 'instagramActionLimitBlock', schema: 'core' })
export class InstagramActionLimitBlockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  instagramAccountRecordId: string;

  @Column({ type: 'uuid' })
  actionExecutionReceiptId: string;

  @Column({
    type: 'varchar',
    default: 'INSTAGRAM_ACTION_LIMIT_REACHED',
  })
  errorCode: string;

  @Column({ type: 'integer' })
  hourlyUsed: number;

  @Column({ type: 'integer' })
  hourlyLimit: number;

  @Column({ type: 'integer' })
  hourlyRemaining: number;

  @Column({ type: 'integer' })
  dailyUsed: number;

  @Column({ type: 'integer' })
  dailyLimit: number;

  @Column({ type: 'integer' })
  dailyRemaining: number;

  @Column({ type: 'text', array: true })
  blockedWindows: InstagramActionBlockedWindow[];

  @Column({ type: 'timestamptz' })
  nextEligibleAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId', referencedColumnName: 'id' })
  workspace: Relation<WorkspaceEntity>;

  @ManyToOne(() => ActionExecutionReceiptEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actionExecutionReceiptId', referencedColumnName: 'id' })
  actionExecutionReceipt: Relation<ActionExecutionReceiptEntity>;
}
