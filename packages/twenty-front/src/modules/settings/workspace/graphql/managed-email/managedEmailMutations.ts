import { gql } from '@apollo/client';
export const PREPARE_MANAGED_EMAIL_PAYMENT_METHOD = gql`
  mutation PrepareManagedEmailPaymentMethod {
    prepareManagedEmailPaymentMethod {
      clientSecret
      publishableKey
      ready
      setupIntentId
    }
  }
`;

export const COMPLETE_MANAGED_EMAIL_PAYMENT_METHOD = gql`
  mutation CompleteManagedEmailPaymentMethod(
    $input: ManagedEmailCompletePaymentMethodInput!
  ) {
    completeManagedEmailPaymentMethod(input: $input) {
      ready
    }
  }
`;

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

export const SET_MANAGED_EMAIL_CAMPAIGN_CAP = gql`
  mutation SetManagedEmailCampaignCap($input: ManagedEmailCampaignCapInput!) {
    setManagedEmailCampaignCap(input: $input) {
      accepted
    }
  }
`;

export const CANCEL_MANAGED_EMAIL_WARMUP = gql`
  mutation CancelManagedEmailWarmup($input: ManagedEmailMailboxActionInput!) {
    cancelManagedEmailWarmup(input: $input) {
      accepted
    }
  }
`;

export const PAUSE_MANAGED_EMAIL_WARMUP = gql`
  mutation PauseManagedEmailWarmup($input: ManagedEmailMailboxActionInput!) {
    pauseManagedEmailWarmup(input: $input) {
      accepted
    }
  }
`;

export const RESUME_MANAGED_EMAIL_WARMUP = gql`
  mutation ResumeManagedEmailWarmup($input: ManagedEmailMailboxActionInput!) {
    resumeManagedEmailWarmup(input: $input) {
      accepted
    }
  }
`;

export const STOP_MANAGED_EMAIL_MAILBOX = gql`
  mutation StopManagedEmailMailbox($input: ManagedEmailMailboxActionInput!) {
    stopManagedEmailMailbox(input: $input) {
      accepted
    }
  }
`;

export const CANCEL_MANAGED_EMAIL_DOMAIN_RENEWAL = gql`
  mutation CancelManagedEmailDomainRenewal(
    $input: ManagedEmailDomainActionInput!
  ) {
    cancelManagedEmailDomainRenewal(input: $input) {
      accepted
    }
  }
`;
