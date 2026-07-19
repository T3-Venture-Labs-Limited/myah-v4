import { Field, GraphQLISODateTime, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('ManagedProviderCreditReceipt')
export class ManagedProviderCreditReceiptDTO {
  @Field(() => UUIDScalarType, { nullable: true })
  creditId: string | null;

  @Field(() => UUIDScalarType)
  customerId: string;

  @Field(() => UUIDScalarType)
  contractId: string;

  @Field(() => UUIDScalarType)
  fundingActionId: string;

  @Field(() => String)
  fundingActionState: string;

  @Field(() => String, { nullable: true })
  fundingActionErrorCode: string | null;

  @Field(() => GraphQLISODateTime)
  fundingActionCreatedAt: Date;

  @Field(() => GraphQLISODateTime)
  fundingActionUpdatedAt: Date;
}
