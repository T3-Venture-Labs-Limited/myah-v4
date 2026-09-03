import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsDivisibleBy,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { AI_TOP_UP_POLICY } from '../services/managed-provider-customer-funding.service';
import { type WorkspaceBillingDetailsInput } from '../stripe/managed-provider-stripe.service';

@ArgsType()
export class RequestManagedProviderCustomerFundingInput {
  @Field(() => Int)
  @IsInt()
  @Min(AI_TOP_UP_POLICY.minimumPrincipalCents)
  @Max(AI_TOP_UP_POLICY.maximumPrincipalCents)
  @IsDivisibleBy(AI_TOP_UP_POLICY.incrementCents)
  principalCents: number;

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
export class CompleteManagedProviderCustomerFundingPaymentMethodInput implements WorkspaceBillingDetailsInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  setupIntentId?: string | null;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2: string | null;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state: string | null;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode: string;

  @Field(() => String)
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  country: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  taxIdType: WorkspaceBillingDetailsInput['taxIdType'];

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxIdValue: string | null;
}
