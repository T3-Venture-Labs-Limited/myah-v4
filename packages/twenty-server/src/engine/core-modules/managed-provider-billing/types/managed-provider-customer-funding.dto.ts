import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('ManagedProviderAiTopUpPreset')
export class ManagedProviderAiTopUpPresetDTO {
  @Field(() => String)
  id: string;

  @Field(() => String)
  principalCents: string;
}

@ObjectType('ManagedProviderCustomerFundingHistoryItem')
export class ManagedProviderCustomerFundingHistoryItemDTO {
  @Field(() => String)
  id: string;

  @Field(() => String)
  fundingType: string;

  @Field(() => String)
  state: string;

  @Field(() => String, { nullable: true })
  presetId: string | null;

  @Field(() => String)
  principalCents: string;

  @Field(() => String, { nullable: true })
  taxCents: string | null;

  @Field(() => String, { nullable: true })
  collectedTotalCents: string | null;

  @Field(() => Date, { nullable: true })
  expiresAt: Date | null;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => String, { nullable: true })
  invoiceUrl: string | null;

  @Field(() => Boolean)
  actionRequired: boolean;
}

@ObjectType('ManagedProviderCustomerFundingPaymentMethod')
export class ManagedProviderCustomerFundingPaymentMethodDTO {
  @Field(() => Boolean)
  ready: boolean;

  @Field(() => String, { nullable: true })
  clientSecret: string | null;

  @Field(() => String, { nullable: true })
  publishableKey: string | null;

  @Field(() => String, { nullable: true })
  setupIntentId: string | null;
}

@ObjectType('ManagedProviderCustomerFundingPaymentAction')
export class ManagedProviderCustomerFundingPaymentActionDTO {
  @Field(() => String)
  clientSecret: string;

  @Field(() => String)
  paymentIntentId: string;

  @Field(() => String)
  stripeInvoiceId: string;
}
