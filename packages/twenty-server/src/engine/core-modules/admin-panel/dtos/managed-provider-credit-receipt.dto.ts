import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('ManagedProviderCreditReceipt')
export class ManagedProviderCreditReceiptDTO {
  @Field(() => UUIDScalarType)
  creditId: string;

  @Field(() => UUIDScalarType)
  customerId: string;

  @Field(() => UUIDScalarType)
  contractId: string;
}
