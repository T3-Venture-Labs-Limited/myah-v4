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

import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';

@Entity({ name: 'unipileInstagramChatCheckpoint', schema: 'core' })
@Unique('UQ_UNIPILE_IG_CHAT_CHECKPOINT_BINDING_CHAT', [
  'bindingId',
  'unipileChatId',
])
export class UnipileInstagramChatCheckpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bindingId: string;

  @Column({ type: 'text' })
  unipileChatId: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedMessageHighWaterAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => UnipileInstagramAccountBindingEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bindingId', referencedColumnName: 'id' })
  binding: Relation<UnipileInstagramAccountBindingEntity>;
}
