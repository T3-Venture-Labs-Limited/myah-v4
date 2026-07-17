import { gql } from '@apollo/client';

export const GET_ACTION_APPROVAL_PROPOSAL = gql`
  query GetActionApprovalProposal($bindingId: UUID!) {
    getActionApprovalProposal(bindingId: $bindingId) {
      action
      actionVersion
      body
      recipientLabel
      sendingAccountLabel
      state
      expiresAt
      occurredAt
      evidenceLinks {
        objectMetadataId
        recordId
        role
      }
    }
  }
`;
