import { ArgsType, Field } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

import { type AiTopUpPreset } from '../services/managed-provider-customer-funding.service';

@ArgsType()
export class RequestManagedProviderCustomerFundingInput {
  @Field(() => String)
  @IsString()
  @IsIn(['AI_25_USD', 'AI_50_USD', 'AI_100_USD'])
  preset: AiTopUpPreset;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey: string;
}

@ArgsType()
export class ManagedProviderCustomerFundingActionInput {
  @Field(() => String)
  @IsUUID()
  actionId: string;
}

@ArgsType()
export class CompleteManagedProviderCustomerFundingPaymentMethodInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  setupIntentId: string;
}
