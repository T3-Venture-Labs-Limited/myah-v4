import { gql } from '@apollo/client';

export const SYNC_MYAH_CHECKOUT_SESSION = gql`
  mutation SyncMyahCheckoutSession($sessionId: String!) {
    syncMyahCheckoutSession(sessionId: $sessionId)
  }
`;
