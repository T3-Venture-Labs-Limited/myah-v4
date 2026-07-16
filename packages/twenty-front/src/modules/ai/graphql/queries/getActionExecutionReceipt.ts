import { gql } from '@apollo/client';

export const GET_ACTION_EXECUTION_RECEIPT = gql`
  query GetActionExecutionReceipt($bindingId: UUID!) {
    getActionExecutionReceipt(bindingId: $bindingId) {
      state
      occurredAt
      outcome
      evidenceLinks {
        objectMetadataId
        recordId
        role
      }
    }
  }
`;
