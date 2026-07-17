import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

import { type ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { type ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';

@ObjectType('ActionApprovalEvidenceLink')
export class ActionApprovalEvidenceLinkDTO {
  @Field(() => String)
  objectMetadataId: string;

  @Field(() => String)
  recordId: string;

  @Field(() => String)
  role: string;
}

@ObjectType('ActionApprovalProposal')
export class ActionApprovalProposalDTO {
  @Field(() => String)
  action: string;

  @Field(() => Int)
  actionVersion: number;

  @Field(() => String, { nullable: true })
  body: string | null;

  @Field(() => String, { nullable: true })
  recipientLabel: string | null;

  @Field(() => String, { nullable: true })
  sendingAccountLabel: string | null;

  @Field(() => String)
  state: string;

  @Field(() => GraphQLISODateTime)
  expiresAt: Date;

  @Field(() => GraphQLISODateTime)
  occurredAt: Date;

  @Field(() => [ActionApprovalEvidenceLinkDTO])
  evidenceLinks: ActionApprovalEvidenceLinkDTO[];
}

@ObjectType('ActionExecutionReceipt')
export class ActionExecutionReceiptDTO {
  @Field(() => String)
  state: string;

  @Field(() => GraphQLISODateTime)
  occurredAt: Date;

  @Field(() => String, { nullable: true })
  outcome: string | null;

  @Field(() => [ActionApprovalEvidenceLinkDTO])
  evidenceLinks: ActionApprovalEvidenceLinkDTO[];
}



export const toActionExecutionReceiptDTO = ({
  receipt,
  binding,
}: {
  receipt: ActionExecutionReceiptEntity;
  binding: ActionApprovalBindingEntity;
}): ActionExecutionReceiptDTO => ({
  state: receipt.state,
  occurredAt: receipt.updatedAt,
  outcome: receipt.redactedOutcome,
  evidenceLinks: binding.evidenceLinks.map(
    ({ objectMetadataId, recordId, role }) => ({
      objectMetadataId,
      recordId,
      role,
    }),
  ),
});
