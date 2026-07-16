import { gql } from '@apollo/client';

export const GET_ACTION_APPROVAL_PROPOSAL = gql`
  query GetActionApprovalProposal($bindingId: UUID!) {
    getActionApprovalProposal(bindingId: $bindingId) {
      action
      state
      occurredAt
      evidenceLinks {
        objectMetadataId
        recordId
        role
      }
    }
  }
`;
