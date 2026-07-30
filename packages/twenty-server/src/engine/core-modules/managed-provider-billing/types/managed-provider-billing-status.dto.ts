import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ManagedProviderBillingStatus')
export class ManagedProviderBillingStatusDTO {
  @Field(() => Boolean)
  available: boolean;

  @Field(() => String, { nullable: true })
  prepaidBalanceCents: string | null;

  @Field(() => Int)
  pendingOperationCount: number;

  @Field(() => Int)
  reconciliationRequiredOperationCount: number;
}
