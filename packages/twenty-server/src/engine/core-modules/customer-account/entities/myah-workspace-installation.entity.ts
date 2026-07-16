import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { CustomerAccountEntity } from 'src/engine/core-modules/customer-account/entities/customer-account.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'myahWorkspaceInstallation', schema: 'core' })
@Index('IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE', ['workspaceId'], {
  unique: true,
})
@Index('IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID', [
  'customerAccountId',
])
@Index(
  'IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE',
  ['metronomeCustomerId'],
  {
    unique: true,
    where: '"metronomeCustomerId" IS NOT NULL',
  },
)
export class MyahWorkspaceInstallationEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customerAccountId: string;
  @Column({ nullable: true, type: 'uuid' })
  metronomeCustomerId: string | null;


  @ManyToOne(
    () => CustomerAccountEntity,
    (customerAccount) => customerAccount.installations,
  )
  @JoinColumn({ name: 'customerAccountId' })
  customerAccount: Relation<CustomerAccountEntity>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
