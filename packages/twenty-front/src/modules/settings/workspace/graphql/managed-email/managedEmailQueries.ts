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
    managedEmailMailboxes {
      address
      campaignEligibility
      domain
      id
      personaDisplayName
      warmupState
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
