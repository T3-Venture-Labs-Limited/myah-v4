import { gql } from '@apollo/client';

export const RESOLVE_AGENT_CHAT_APPROVAL = gql`
  mutation ResolveAgentChatApproval(
    $threadId: UUID!
    $messageId: UUID!
    $decision: AgentChatApprovalDecisionInput!
    $modelId: String
  ) {
    resolveAgentChatApproval(
      threadId: $threadId
      messageId: $messageId
      decision: $decision
      modelId: $modelId
    ) {
      messageId
      queued
      streamId
    }
  }
`;
