import { gql } from '@apollo/client';

export const RETRY_CHAT_MESSAGE = gql`
  mutation RetryChatMessage(
    $threadId: UUID!
    $browsingContext: JSON
    $modelId: String
  ) {
    retryChatMessage(
      threadId: $threadId
      browsingContext: $browsingContext
      modelId: $modelId
    ) {
      messageId
      queued
      streamId
    }
  }
`;
