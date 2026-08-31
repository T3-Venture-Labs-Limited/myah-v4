import { gql } from '@apollo/client';

export const MANAGED_PROVIDER_CUSTOMER_FUNDING_ITEM_FRAGMENT = gql`
  fragment ManagedProviderCustomerFundingItem on ManagedProviderCustomerFundingHistoryItem {
    id
    fundingType
    state
    presetId
    principalCents
    taxCents
    collectedTotalCents
    expiresAt
    createdAt
    updatedAt
    invoiceUrl
    actionRequired
  }
`;

export const GET_MANAGED_PROVIDER_BILLING_STATUS = gql`
  query GetManagedProviderBillingStatus {
    managedProviderBillingStatus {
      available
      prepaidBalanceCents
      pendingOperationCount
      reconciliationRequiredOperationCount
      customerFundingAvailable
      customerFundingPaymentMethodReady
      customerFundingPresets {
        id
        principalCents
      }
      customerFundingBillingSummary {
        name
        paymentMethodReady
        address {
          city
          country
          line1
          line2
          postalCode
          state
        }
        card {
          brand
          expiryMonth
          expiryYear
          last4
        }
        taxId {
          country
          type
        }
      }
      customerFundingHistory {
        ...ManagedProviderCustomerFundingItem
      }
    }
  }
  ${MANAGED_PROVIDER_CUSTOMER_FUNDING_ITEM_FRAGMENT}
`;

export const GET_MANAGED_PROVIDER_CUSTOMER_FUNDING_ACTION = gql`
  query GetManagedProviderCustomerFundingAction($actionId: String!) {
    managedProviderCustomerFundingAction(actionId: $actionId) {
      ...ManagedProviderCustomerFundingItem
    }
  }
  ${MANAGED_PROVIDER_CUSTOMER_FUNDING_ITEM_FRAGMENT}
`;

export const PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD = gql`
  mutation PrepareManagedProviderCustomerFundingPaymentMethod {
    prepareManagedProviderCustomerFundingPaymentMethod {
      ready
      clientSecret
      publishableKey
      setupIntentId
      billingSummary {
        name
        paymentMethodReady
        address {
          city
          country
          line1
          line2
          postalCode
          state
        }
        card {
          brand
          expiryMonth
          expiryYear
          last4
        }
        taxId {
          country
          type
        }
      }
    }
  }
`;

export const COMPLETE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_METHOD = gql`
  mutation CompleteManagedProviderCustomerFundingPaymentMethod(
    $setupIntentId: String
    $name: String!
    $line1: String!
    $line2: String
    $city: String!
    $state: String
    $postalCode: String!
    $country: String!
    $taxIdType: String
    $taxIdValue: String
  ) {
    completeManagedProviderCustomerFundingPaymentMethod(
      setupIntentId: $setupIntentId
      name: $name
      line1: $line1
      line2: $line2
      city: $city
      state: $state
      postalCode: $postalCode
      country: $country
      taxIdType: $taxIdType
      taxIdValue: $taxIdValue
    ) {
      ready
      clientSecret
      publishableKey
      setupIntentId
      billingSummary {
        name
        paymentMethodReady
        address {
          city
          country
          line1
          line2
          postalCode
          state
        }
        card {
          brand
          expiryMonth
          expiryYear
          last4
        }
        taxId {
          country
          type
        }
      }
    }
  }
`;

export const REQUEST_MANAGED_PROVIDER_CUSTOMER_FUNDING = gql`
  mutation RequestManagedProviderCustomerFunding(
    $preset: String!
    $idempotencyKey: String!
  ) {
    requestManagedProviderCustomerFunding(
      preset: $preset
      idempotencyKey: $idempotencyKey
    ) {
      ...ManagedProviderCustomerFundingItem
    }
  }
  ${MANAGED_PROVIDER_CUSTOMER_FUNDING_ITEM_FRAGMENT}
`;

export const PREPARE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION = gql`
  mutation PrepareManagedProviderCustomerFundingPaymentAction(
    $actionId: String!
  ) {
    prepareManagedProviderCustomerFundingPaymentAction(actionId: $actionId) {
      clientSecret
    }
  }
`;

export const ACKNOWLEDGE_MANAGED_PROVIDER_CUSTOMER_FUNDING_PAYMENT_ACTION = gql`
  mutation AcknowledgeManagedProviderCustomerFundingPaymentAction(
    $actionId: String!
  ) {
    acknowledgeManagedProviderCustomerFundingPaymentAction(
      actionId: $actionId
    ) {
      ...ManagedProviderCustomerFundingItem
    }
  }
  ${MANAGED_PROVIDER_CUSTOMER_FUNDING_ITEM_FRAGMENT}
`;

export const GET_MANAGED_EMAIL_SUBSCRIPTIONS = gql`
  query GetManagedEmailSubscriptions {
    managedEmailSubscriptions {
      action
      billingInterval
      currency
      paidThrough
      productKey
      quantity
      recurringAmountCents
      resourceIds
      resourceLabels
      resourceType
      service
      status
      unitPriceCents
    }
  }
`;
