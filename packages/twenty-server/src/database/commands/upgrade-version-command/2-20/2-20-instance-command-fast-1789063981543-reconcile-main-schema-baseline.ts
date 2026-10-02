import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.20.0', 1789063981543)
export class ReconcileMainSchemaBaselineFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" DROP CONSTRAINT "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBindingEvidenceLink" DROP CONSTRAINT "FK_ACTION_APPROVAL_BINDING_EVIDENCE_LINK_BINDING"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" DROP CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_BINDING"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" DROP CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_WORKSPACE"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" DROP CONSTRAINT "FK_ACTION_APPROVAL_BINDING_WORKSPACE"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailOffer" DROP CONSTRAINT "FK_managedEmailOffer_workspace"');
    await queryRunner.query('DROP INDEX "core"."IDX_ACTION_EXECUTION_RECEIPT_STATE"');
    await queryRunner.query('DROP INDEX "core"."IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_AMOUNT_POSITIVE"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_RESERVED_AMOUNT_NON_NEGATIVE"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_QUOTED_AMOUNT_NON_NEGATIVE"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_PROVIDER_COST_NON_NEGATIVE"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE"');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" DROP CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE_FIELDS"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" DROP CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBindingEvidenceLink" DROP CONSTRAINT "UQ_ACTION_APPROVAL_BINDING_EVIDENCE_LINK"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" DROP CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY"');
    await queryRunner.query('CREATE TYPE "core"."instagramReplyExecutionReceipt_state_enum" AS ENUM(\'PROCESSING\', \'SENT\', \'FAILED\', \'BLOCKED\', \'UNKNOWN\')');
    await queryRunner.query('CREATE TABLE "core"."instagramReplyExecutionReceipt" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approvalRequestId" uuid NOT NULL, "state" "core"."instagramReplyExecutionReceipt_state_enum" NOT NULL DEFAULT \'PROCESSING\', "providerMessageId" text, "failureCode" text, "failureReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST" UNIQUE ("approvalRequestId"), CONSTRAINT "PK_1ecd8d74d2ebde2854db62b469e" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE" ON "core"."instagramReplyExecutionReceipt" ("state") ');
    await queryRunner.query('CREATE TYPE "core"."instagramReplyApprovalRequest_state_enum" AS ENUM(\'PENDING\', \'APPROVED\', \'REJECTED\', \'CHANGES_REQUESTED\')');
    await queryRunner.query('CREATE TABLE "core"."instagramReplyApprovalRequest" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userWorkspaceId" uuid NOT NULL, "threadId" uuid NOT NULL, "approvalId" uuid NOT NULL, "toolName" character varying NOT NULL, "connectedAccountId" character varying NOT NULL, "draftId" uuid NOT NULL, "conversationId" uuid NOT NULL, "providerConversationId" text, "recipientIgsid" text, "previewTextSha256" character varying(64) NOT NULL, "state" "core"."instagramReplyApprovalRequest_state_enum" NOT NULL DEFAULT \'PENDING\', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "decidedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID" UNIQUE ("workspaceId", "approvalId"), CONSTRAINT "PK_0570e6a0a7170ee067a969dcf27" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD" ON "core"."instagramReplyApprovalRequest" ("workspaceId", "threadId") ');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" DROP COLUMN "correctionOfActionId"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" DROP CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_BINDING"');
    await queryRunner.query('ALTER TYPE "core"."actionExecutionReceipt_state_enum" RENAME TO "actionExecutionReceipt_state_enum_old"');
    await queryRunner.query('CREATE TYPE "core"."actionExecutionReceipt_state_enum" AS ENUM(\'PROCESSING\', \'PROVIDER_ACCEPTED\', \'SENT\', \'BLOCKED\', \'FAILED\', \'UNKNOWN\')');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ALTER COLUMN "state" DROP DEFAULT');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ALTER COLUMN "state" TYPE "core"."actionExecutionReceipt_state_enum" USING "state"::"text"::"core"."actionExecutionReceipt_state_enum"');
    await queryRunner.query('DROP TYPE "core"."actionExecutionReceipt_state_enum_old"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "actionVersion" DROP DEFAULT');
    await queryRunner.query('ALTER TYPE "core"."actionApprovalBinding_state_enum" RENAME TO "actionApprovalBinding_state_enum_old"');
    await queryRunner.query('CREATE TYPE "core"."actionApprovalBinding_state_enum" AS ENUM(\'PENDING\', \'APPROVED\', \'REJECTED\', \'CHANGES_REQUESTED\', \'EXPIRED\', \'CONSUMED\')');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "state" DROP DEFAULT');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "state" TYPE "core"."actionApprovalBinding_state_enum" USING "state"::"text"::"core"."actionApprovalBinding_state_enum"');
    await queryRunner.query('DROP TYPE "core"."actionApprovalBinding_state_enum_old"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBindingEvidenceLink" ADD CONSTRAINT "FK_6ef99565414f9e656953e561ed6" FOREIGN KEY ("actionApprovalBindingId") REFERENCES "core"."actionApprovalBinding"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ADD CONSTRAINT "FK_58a7f46581974c5c5067c6989fe" FOREIGN KEY ("actionApprovalBindingId") REFERENCES "core"."actionApprovalBinding"("id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."managedEmailOffer" ADD CONSTRAINT "FK_fc4a6628915feb6c00f940c1a34" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."instagramReplyApprovalRequest" ADD CONSTRAINT "FK_617792f9cfed9d503e2333b2a83" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."instagramReplyApprovalRequest" DROP CONSTRAINT "FK_617792f9cfed9d503e2333b2a83"');
    await queryRunner.query('ALTER TABLE "core"."managedEmailOffer" DROP CONSTRAINT "FK_fc4a6628915feb6c00f940c1a34"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" DROP CONSTRAINT "FK_58a7f46581974c5c5067c6989fe"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBindingEvidenceLink" DROP CONSTRAINT "FK_6ef99565414f9e656953e561ed6"');
    await queryRunner.query('CREATE TYPE "core"."actionApprovalBinding_state_enum_old" AS ENUM(\'APPROVED\', \'CHANGES_REQUESTED\', \'CONSUMED\', \'EXPIRED\', \'PENDING\', \'REJECTED\')');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "state" TYPE "core"."actionApprovalBinding_state_enum_old" USING "state"::"text"::"core"."actionApprovalBinding_state_enum_old"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "state" SET DEFAULT \'PENDING\'');
    await queryRunner.query('DROP TYPE "core"."actionApprovalBinding_state_enum"');
    await queryRunner.query('ALTER TYPE "core"."actionApprovalBinding_state_enum_old" RENAME TO "actionApprovalBinding_state_enum"');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ALTER COLUMN "actionVersion" SET DEFAULT \'1\'');
    await queryRunner.query('CREATE TYPE "core"."actionExecutionReceipt_state_enum_old" AS ENUM(\'BLOCKED\', \'FAILED\', \'PROCESSING\', \'PROVIDER_ACCEPTED\', \'SENT\', \'UNKNOWN\')');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ALTER COLUMN "state" TYPE "core"."actionExecutionReceipt_state_enum_old" USING "state"::"text"::"core"."actionExecutionReceipt_state_enum_old"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ALTER COLUMN "state" SET DEFAULT \'PROCESSING\'');
    await queryRunner.query('DROP TYPE "core"."actionExecutionReceipt_state_enum"');
    await queryRunner.query('ALTER TYPE "core"."actionExecutionReceipt_state_enum_old" RENAME TO "actionExecutionReceipt_state_enum"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ADD CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_BINDING" UNIQUE ("actionApprovalBindingId")');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" ADD "correctionOfActionId" uuid');
    await queryRunner.query('DROP INDEX "core"."IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD"');
    await queryRunner.query('DROP TABLE "core"."instagramReplyApprovalRequest"');
    await queryRunner.query('DROP TYPE "core"."instagramReplyApprovalRequest_state_enum"');
    await queryRunner.query('DROP INDEX "core"."IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE"');
    await queryRunner.query('DROP TABLE "core"."instagramReplyExecutionReceipt"');
    await queryRunner.query('DROP TYPE "core"."instagramReplyExecutionReceipt_state_enum"');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ADD CONSTRAINT "UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY" UNIQUE ("workspaceId", "idempotencyKey")');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBindingEvidenceLink" ADD CONSTRAINT "UQ_ACTION_APPROVAL_BINDING_EVIDENCE_LINK" UNIQUE ("actionApprovalBindingId", "objectMetadataId", "recordId", "role")');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ADD CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION" CHECK ((("inboundDirection" IS NULL) OR ("inboundDirection" = \'INBOUND\'::text)))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE_FIELDS" CHECK ((((state <> ALL (ARRAY[\'USAGE_ACCEPTED\'::text, \'USAGE_SETTLED\'::text])) OR (("metronomeAcceptedAt" IS NOT NULL) AND ("settleAfter" IS NOT NULL))) AND ((state <> \'USAGE_SETTLED\'::text) OR ("settledAt" IS NOT NULL)) AND ((state <> \'RELEASED\'::text) OR ("releasedAt" IS NOT NULL))))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_STATE" CHECK ((state = ANY (ARRAY[\'RESERVED\'::text, \'USAGE_PENDING\'::text, \'USAGE_ACCEPTED\'::text, \'USAGE_SETTLED\'::text, \'RELEASED\'::text, \'RECONCILIATION_REQUIRED\'::text])))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_PROVIDER_COST_NON_NEGATIVE" CHECK ((("providerCostMicrousd" IS NULL) OR ("providerCostMicrousd" >= 0)))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_QUOTED_AMOUNT_NON_NEGATIVE" CHECK ((("quotedActualAmountCents" IS NULL) OR ("quotedActualAmountCents" >= 0)))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderOperation" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_OPERATION_RESERVED_AMOUNT_NON_NEGATIVE" CHECK (("reservedAmountCents" >= 0))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE" CHECK ((state = ANY (ARRAY[\'PENDING\'::text, \'METRONOME_EDIT_RECORDED\'::text, \'PAYMENT_PENDING\'::text, \'PAYMENT_ACTION_REQUIRED\'::text, \'RECONCILIATION_REQUIRED\'::text, \'SUCCEEDED\'::text, \'FAILED_DEFINITIVE\'::text, \'REFUND_INTENT_RECORDED\'::text, \'REFUND_RECONCILIATION_REQUIRED\'::text, \'REFUNDED\'::text])))');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" ADD CONSTRAINT "CHK_MANAGED_PROVIDER_FUNDING_ACTION_AMOUNT_POSITIVE" CHECK (("amountCents" > 0))');
    await queryRunner.query('CREATE INDEX "IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD" ON "core"."actionApprovalBinding" ("workspaceId", "threadId") ');
    await queryRunner.query('CREATE INDEX "IDX_ACTION_EXECUTION_RECEIPT_STATE" ON "core"."actionExecutionReceipt" ("state") ');
    await queryRunner.query('ALTER TABLE "core"."managedEmailOffer" ADD CONSTRAINT "FK_managedEmailOffer_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBinding" ADD CONSTRAINT "FK_ACTION_APPROVAL_BINDING_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ADD CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."actionExecutionReceipt" ADD CONSTRAINT "FK_ACTION_EXECUTION_RECEIPT_BINDING" FOREIGN KEY ("actionApprovalBindingId") REFERENCES "core"."actionApprovalBinding"("id") ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."actionApprovalBindingEvidenceLink" ADD CONSTRAINT "FK_ACTION_APPROVAL_BINDING_EVIDENCE_LINK_BINDING" FOREIGN KEY ("actionApprovalBindingId") REFERENCES "core"."actionApprovalBinding"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."managedProviderFundingAction" ADD CONSTRAINT "FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE SET NULL ON UPDATE NO ACTION');
  }
}
