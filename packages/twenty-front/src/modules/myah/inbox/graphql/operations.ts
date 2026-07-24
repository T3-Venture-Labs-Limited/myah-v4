import { gql } from '@apollo/client';

export const GET_MYAH_INBOX_THREADS = gql`
  query MyahInboxThreads(
    $first: Int
    $after: String
    $queue: MyahInboxQueue
    $owner: String
    $campaignId: String
    $states: [MyahInboxState!]
    $search: String
  ) {
    myahInboxThreads(
      first: $first
      after: $after
      queue: $queue
      owner: $owner
      campaignId: $campaignId
      states: $states
      search: $search
    ) {
      edges {
        cursor
        node {
          id
          lastActivityAt
          subject
          lastMessagePreview
          lastMessageSender
          state
          snoozedUntil
          creator {
            id
            name
          }
          campaign {
            id
            name
          }
          inboxOwner {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const UPDATE_MYAH_INBOX_THREAD = gql`
  mutation UpdateMyahInboxThread($input: UpdateMyahInboxThreadInput!) {
    updateMyahInboxThread(input: $input) {
      id
      lastActivityAt
      subject
      lastMessagePreview
      lastMessageSender
      state
      snoozedUntil
      creator {
        id
        name
      }
      campaign {
        id
        name
      }
      inboxOwner {
        id
        name
      }
    }
  }
`;

export const SAVE_MYAH_INBOX_DRAFT = gql`
  mutation SaveMyahInboxDraft($input: SaveMyahInboxDraftInput!) {
    saveMyahInboxDraft(input: $input) {
      status
      revision
      body {
        markdown
        blocknote
      }
    }
  }
`;

export const GENERATE_MYAH_INBOX_REPLY_PROPOSAL = gql`
  mutation GenerateMyahInboxReplyProposal(
    $input: GenerateMyahInboxReplyProposalInput!
  ) {
    generateMyahInboxReplyProposal(input: $input) {
      subject
      body {
        markdown
        blocknote
      }
    }
  }
`;
