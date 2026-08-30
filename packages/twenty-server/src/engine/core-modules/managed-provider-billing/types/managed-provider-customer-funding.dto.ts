import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('ManagedProviderCustomerFundingBillingAddress')
export class ManagedProviderCustomerFundingBillingAddressDTO {
  @Field(() => String, { nullable: true })
  city: string | null;

  @Field(() => String, { nullable: true })
  country: string | null;

  @Field(() => String, { nullable: true })
  line1: string | null;

  @Field(() => String, { nullable: true })
  line2: string | null;

  @Field(() => String, { nullable: true })
  postalCode: string | null;

  @Field(() => String, { nullable: true })
  state: string | null;
}

@ObjectType('ManagedProviderCustomerFundingCardSummary')
export class ManagedProviderCustomerFundingCardSummaryDTO {
  @Field(() => String)
  brand: string;

  @Field(() => Number)
  expiryMonth: number;

  @Field(() => Number)
  expiryYear: number;

  @Field(() => String)
  last4: string;
}

@ObjectType('ManagedProviderCustomerFundingTaxIdSummary')
export class ManagedProviderCustomerFundingTaxIdSummaryDTO {
  @Field(() => String, { nullable: true })
  country: string | null;

  @Field(() => String)
  type: string;
}

@ObjectType('ManagedProviderCustomerFundingBillingSummary')
export class ManagedProviderCustomerFundingBillingSummaryDTO {
  @Field(() => ManagedProviderCustomerFundingBillingAddressDTO)
  address: ManagedProviderCustomerFundingBillingAddressDTO;

  @Field(() => ManagedProviderCustomerFundingCardSummaryDTO, {
    nullable: true,
  })
  card: ManagedProviderCustomerFundingCardSummaryDTO | null;

  @Field(() => String, { nullable: true })
  name: string | null;

  @Field(() => Boolean)
  paymentMethodReady: boolean;

  @Field(() => ManagedProviderCustomerFundingTaxIdSummaryDTO, {
    nullable: true,
  })
  taxId: ManagedProviderCustomerFundingTaxIdSummaryDTO | null;
}

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

  @Field(() => ManagedProviderCustomerFundingBillingSummaryDTO, {
    nullable: true,
  })
  billingSummary: ManagedProviderCustomerFundingBillingSummaryDTO | null;

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
