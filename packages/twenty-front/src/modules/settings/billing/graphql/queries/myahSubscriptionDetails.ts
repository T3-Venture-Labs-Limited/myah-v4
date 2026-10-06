import { gql } from '@apollo/client';

export const MYAH_SUBSCRIPTION_DETAILS = gql`
  query MyahSubscriptionDetails {
    myahSubscriptionDetails {
      amountCents
      cancelAtPeriodEnd
      currentPeriodEnd
    }
  }
`;
