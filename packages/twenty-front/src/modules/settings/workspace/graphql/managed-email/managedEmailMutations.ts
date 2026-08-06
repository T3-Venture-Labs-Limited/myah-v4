import { gql } from '@apollo/client';

export const CONFIRM_MANAGED_EMAIL_PREWARMED_PURCHASE = gql`
  mutation ConfirmManagedEmailPrewarmedPurchase(
    $input: ManagedEmailPurchaseInput!
  ) {
    confirmManagedEmailPrewarmedPurchase(input: $input) {
      accepted
      operationId
    }
  }
`;

export const CONFIRM_MANAGED_EMAIL_ORDINARY_PURCHASE = gql`
  mutation ConfirmManagedEmailOrdinaryPurchase(
    $input: ManagedEmailPurchaseInput!
  ) {
    confirmManagedEmailOrdinaryPurchase(input: $input) {
      accepted
      operationId
    }
  }
`;

export const RETRY_MANAGED_EMAIL_PAYMENT = gql`
  mutation RetryManagedEmailPayment($input: ManagedEmailRetryPaymentInput!) {
    retryManagedEmailPayment(input: $input) {
      accepted
      operationId
    }
  }
`;
