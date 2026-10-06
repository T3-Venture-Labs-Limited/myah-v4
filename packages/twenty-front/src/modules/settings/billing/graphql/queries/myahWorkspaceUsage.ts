import { gql } from '@apollo/client';

export const MYAH_WORKSPACE_USAGE = gql`
  query MyahWorkspaceUsage {
    myahWorkspaceUsage {
      state
      percentUsed
      periodStart
      resetAt
      paymentRetrying
      exhausted
      instagramReconnectRequired
    }
  }
`;
