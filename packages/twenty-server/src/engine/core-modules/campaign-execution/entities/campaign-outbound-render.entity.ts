import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  PrimaryColumn,
} from 'typeorm';

import { OutboundEmailAttemptEntity } from 'src/engine/core-modules/campaign-execution/entities/outbound-email-attempt.entity';

@Entity({ name: 'campaignOutboundRender', schema: 'core' })
@ForeignKey(
  () => OutboundEmailAttemptEntity,
  [
    'workspaceId',
    'campaignId',
    'enrollmentId',
    'occurrenceId',
    'authorizationId',
    'workflowVersionId',
    'messageId',
    'attemptId',
    'renderDigest',
  ],
  [
    'workspaceId',
    'campaignId',
    'enrollmentId',
    'occurrenceId',
    'authorizationId',
    'workflowVersionId',
    'messageId',
    'attemptId',
    'renderDigest',
  ],
  {
    name: 'FK_COR_EXACT_ATTEMPT',
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  },
)
@Check('CHK_COR_RENDER_DIGEST', `"renderDigest" ~ '^[0-9a-f]{64}$'`)
@Check(
  'CHK_COR_SIGNATURE_DIGEST',
  `"signatureDigest" IS NULL OR "signatureDigest" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CHK_COR_NONEMPTY_MATERIAL',
  `btrim("rendererRevision") <> '' AND btrim(subject) <> '' AND btrim(html) <> '' AND btrim("toRecipient") <> ''`,
)
@Check(
  'CHK_COR_RECIPIENT_NORMALIZED',
  `"toRecipient" = lower(btrim("toRecipient"))`,
)
@Check(
  'CHK_COR_THREAD_MATERIAL',
  `("inReplyTo" IS NULL OR btrim("inReplyTo") <> '') AND ("threadExternalId" IS NULL OR btrim("threadExternalId") <> '')`,
)
@Check(
  'CHK_COR_REFERENCES',
  `jsonb_typeof("references") = 'array' AND NOT jsonb_path_exists("references", '$[*] ? (@.type() != "string" || @ == "")')`,
)
export class CampaignOutboundRenderEntity {
  @PrimaryColumn({
    type: 'uuid',
    primaryKeyConstraintName: 'PK_CAMPAIGN_OUTBOUND_RENDER',
  })
  attemptId: string;

  @Column({ type: 'uuid', update: false }) workspaceId: string;
  @Column({ type: 'uuid', update: false }) campaignId: string;
  @Column({ type: 'uuid', update: false }) enrollmentId: string;
  @Column({ type: 'uuid', update: false }) occurrenceId: string;
  @Column({ type: 'uuid', update: false }) authorizationId: string;
  @Column({ type: 'uuid', update: false }) workflowVersionId: string;
  @Column({ type: 'uuid', update: false }) messageId: string;
  @Column({ type: 'text', update: false }) renderDigest: string;
  @Column({ type: 'text', nullable: true, update: false }) signatureDigest:
    | string
    | null;
  @Column({ type: 'text', update: false }) rendererRevision: string;
  @Column({ type: 'text', update: false }) subject: string;
  @Column({ type: 'text', update: false }) html: string;
  @Column({ type: 'text', update: false }) text: string;
  @Column({ type: 'text', update: false }) bodyWithSignature: string;
  @Column({ type: 'text', update: false }) toRecipient: string;
  @Column({ type: 'text', nullable: true, update: false }) inReplyTo:
    | string
    | null;
  @Column({ type: 'text', nullable: true, update: false }) threadExternalId:
    | string
    | null;
  @Column({ type: 'jsonb', update: false }) references: string[];
  @CreateDateColumn({ type: 'timestamptz', update: false }) createdAt: Date;
}
