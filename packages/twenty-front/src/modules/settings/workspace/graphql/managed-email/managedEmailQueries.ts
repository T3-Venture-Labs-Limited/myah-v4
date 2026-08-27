import { gql } from '@apollo/client';

export const GET_MANAGED_EMAIL_OVERVIEW = gql`
  query GetManagedEmailOverview {
    managedEmailOverview {
      acquisitionAvailable
      actionRequiredCount
      domainCount
      mailboxCount
      readyCount
      status
      warmingCount
    }
    managedEmailDomains {
      acquisitionMode
      cancelAtPeriodEnd
      dependentMailboxCount
      domain
      id
      infrastructureState
      paidThrough
      renewalEnabled
      requiredNameservers
      safeFailureCode
    }
    managedEmailMailboxes {
      address
      adminDailyCap
      campaignEligibility
      domain
      domainId
      id
      infrastructureCancelAtPeriodEnd
      infrastructureState
      lastHealthEvaluatedAt
      personaDisplayName
      personaRole
      policySafeDailyCapacity
      safeFailureCode
      servicePaidThrough
      warmupCancelAtPeriodEnd
      warmupPaidThrough
      warmupState
    }
  }
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

export const GET_MANAGED_EMAIL_PREWARMED_BUNDLES = gql`
  query GetManagedEmailPrewarmedBundles {
    managedEmailPrewarmedBundles {
      bundleId
      domain
      exclusiveWorkspaceUse
      mailboxCount
      mailboxes {
        address
        displayName
      }
      observedAt
    }
  }
`;

export const GET_MANAGED_EMAIL_PROPOSAL = gql`
  query GetManagedEmailProposal($input: ManagedEmailProposalInput!) {
    managedEmailProposal(input: $input) {
      disclosures {
        cancellation
        managedServiceOwnership
        prepaidBalance
      }
      domains {
        domain
        mailboxes {
          address
          displayName
          roleTitle
        }
      }
      expiresAt
      id
      mailboxCount
      policyVersion
    }
  }
`;

export const GET_MANAGED_EMAIL_PREWARMED_PROPOSAL = gql`
  query GetManagedEmailPrewarmedProposal(
    $input: ManagedEmailPrewarmedProposalInput!
  ) {
    managedEmailPrewarmedProposal(input: $input) {
      disclosures {
        cancellation
        managedServiceOwnership
        prepaidBalance
      }
      domains {
        domain
        mailboxes {
          address
          displayName
          roleTitle
        }
      }
      expiresAt
      id
      mailboxCount
      policyVersion
    }
  }
`;

export const GET_MANAGED_EMAIL_QUOTE = gql`
  query GetManagedEmailQuote($input: ManagedEmailQuoteInput!) {
    managedEmailQuote(input: $input) {
      currency
      disclosures {
        cancellation
        managedServiceOwnership
        prepaidBalance
      }
      dueTodayCents
      isSandbox
      expiresAt
      id
      lines {
        amountCents
        billingFrequency
        endingBefore
        productKey
        quantity
        startingAt
        unitPriceCents
      }
      quoteFingerprint
      quoteVersion
    }
  }
`;

export const GET_MANAGED_EMAIL_OPERATION = gql`
  query GetManagedEmailOperation($input: ManagedEmailOperationInput!) {
    managedEmailOperation(input: $input) {
      acquisitionMode
      amountCents
      createdAt
      currency
      id
      paymentStatus
      safeFailureCode
      state
      updatedAt
    }
  }
`;
