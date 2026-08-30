import { Field, Int, ObjectType } from '@nestjs/graphql';

import {
  ManagedProviderAiTopUpPresetDTO,
  ManagedProviderCustomerFundingHistoryItemDTO,
} from './managed-provider-customer-funding.dto';

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

  @Field(() => Boolean)
  customerFundingAvailable?: boolean;

  @Field(() => Boolean)
  customerFundingPaymentMethodReady?: boolean;

  @Field(() => [ManagedProviderAiTopUpPresetDTO])
  customerFundingPresets?: ManagedProviderAiTopUpPresetDTO[];

  @Field(() => [ManagedProviderCustomerFundingHistoryItemDTO])
  customerFundingHistory?: ManagedProviderCustomerFundingHistoryItemDTO[];
}
