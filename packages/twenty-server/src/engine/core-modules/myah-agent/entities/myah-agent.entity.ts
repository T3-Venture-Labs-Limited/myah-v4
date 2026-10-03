import {
  Check,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export const MYAH_AGENT_SENDING_MODES = [
  'DRAFT_FOR_APPROVAL',
  'SEND_AUTOMATICALLY',
] as const;

export type MyahAgentSendingMode = (typeof MYAH_AGENT_SENDING_MODES)[number];

// One reply agent per workspace for now; the id keeps a second agent possible.
@Entity({ name: 'myahAgent', schema: 'core' })
@Unique('UQ_MYAH_AGENT_WORKSPACE', ['workspaceId'])
@Check(
  'CHK_MYAH_AGENT_SENDING_MODE',
  `"sendingMode" IN ('DRAFT_FOR_APPROVAL','SEND_AUTOMATICALLY')`,
)
export class MyahAgentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'text', nullable: true })
  tone: string | null;

  @Column({ type: 'text', nullable: true })
  responseLength: string | null;

  @Column({ type: 'text', nullable: true })
  language: string | null;

  @Column({ type: 'text', nullable: true })
  brandInformation: string | null;

  @Column({ type: 'text', nullable: true })
  replyRules: string | null;

  @Column({ type: 'text', nullable: true })
  escalationBoundaries: string | null;

  @Column({ type: 'text', default: 'DRAFT_FOR_APPROVAL' })
  sendingMode: MyahAgentSendingMode;

  @Column({ type: 'uuid', nullable: true })
  sendingModeEnabledByUserWorkspaceId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sendingModeEnabledAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
