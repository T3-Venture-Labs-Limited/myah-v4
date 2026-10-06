import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

@Entity({ name: 'myahWorkspaceSubscription', schema: 'core' })
export class MyahWorkspaceSubscriptionEntity {
  @PrimaryColumn({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne('WorkspaceEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'text', nullable: true, unique: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'text', nullable: true })
  stripeStatus: string | null;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  usagePeriodStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  usagePeriodEnd: Date | null;

  @Column({ default: false })
  hadPaidSubscription: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  instagramDisconnectedForLapseAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
