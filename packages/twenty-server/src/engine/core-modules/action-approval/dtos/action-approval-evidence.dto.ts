import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

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

  @Field(() => String)
  state: string;

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


export const toActionApprovalProposalDTO = (
  binding: ActionApprovalBindingEntity,
): ActionApprovalProposalDTO => ({
  action: binding.actionName,
  state: binding.state,
  occurredAt: binding.decidedAt ?? binding.createdAt,
  evidenceLinks: binding.evidenceLinks.map(
    ({ objectMetadataId, recordId, role }) => ({
      objectMetadataId,
      recordId,
      role,
    }),
  ),
});

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
