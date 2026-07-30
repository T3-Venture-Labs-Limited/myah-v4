import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ManagedProviderPoolState } from '../enums/managed-provider-pool-state.enum';

@Entity({ name: 'managedProviderPool', schema: 'core' })
export class ManagedProviderPoolEntity {
  @PrimaryColumn({ type: 'text' })
  providerKey: string;

  @Column({ type: 'text' })
  state: ManagedProviderPoolState;

  @Column({ nullable: true, type: 'text' })
  activeTariffVersion: string | null;

  @Column({ nullable: true, type: 'text' })
  activeConfigurationDigest: string | null;

  @Column({ type: 'bigint', default: 0 })
  appliedDesiredStateEpoch: string;

  @Column({ nullable: true, type: 'text' })
  appliedDesiredStateDigest: string | null;

  @Column({ type: 'integer', default: 0 })
  rowVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
