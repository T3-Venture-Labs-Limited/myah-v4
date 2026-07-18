import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';

import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';

@Entity({ name: 'actionApprovalBindingEvidenceLink', schema: 'core' })
export class ActionApprovalBindingEvidenceLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  actionApprovalBindingId: string;

  @Column({ type: 'uuid' })
  objectMetadataId: string;

  @Column({ type: 'uuid' })
  recordId: string;

  @Column({ type: 'varchar' })
  role: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(
    () => ActionApprovalBindingEntity,
    (binding) => binding.evidenceLinks,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'actionApprovalBindingId' })
  actionApprovalBinding: Relation<ActionApprovalBindingEntity>;
}
