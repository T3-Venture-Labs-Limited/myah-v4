import { gql } from '@apollo/client';

export const UPDATE_CONNECTED_ACCOUNT_SENDING_POLICY = gql`
  mutation UpdateConnectedAccountSendingPolicy(
    $input: UpdateConnectedAccountSendingPolicyInput!
  ) {
    updateConnectedAccountSendingPolicy(input: $input) {
      id
      dailySendLimit
      minimumSendIntervalMs
    }
  }
`;
