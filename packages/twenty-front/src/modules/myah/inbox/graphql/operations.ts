import { gql } from '@apollo/client';

export const GET_MYAH_INBOX_THREADS = gql`
  query MyahInboxThreads(
    $first: Int
    $after: String
    $owner: String
    $campaignId: String
    $states: [MyahInboxState!]
    $snoozeStatus: MyahInboxSnoozeStatus
    $search: String
    $threadId: String
  ) {
    myahInboxThreads(
      first: $first
      after: $after
      owner: $owner
      campaignId: $campaignId
      states: $states
      snoozeStatus: $snoozeStatus
      search: $search
      threadId: $threadId
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
      body {
        markdown
        blocknote
      }
    }
  }
`;

export const GET_MYAH_INBOX_REPLY_SEND_READINESS = gql`
  query MyahInboxReplySendReadiness($threadId: UUID!) {
    myahInboxReplySendReadiness(threadId: $threadId) {
      status
      reason
    }
  }
`;

export const SEND_MYAH_INBOX_REPLY = gql`
  mutation SendMyahInboxReply($input: SendMyahInboxReplyInput!) {
    sendMyahInboxReply(input: $input) {
      outcome
      receiptId
      revision
      body {
        markdown
        blocknote
      }
    }
  }
`;

export const GET_MYAH_INBOX_REPLY_SEND_STATUS = gql`
  query MyahInboxReplySendStatus($input: MyahInboxReplySendStatusInput!) {
    myahInboxReplySendStatus(input: $input) {
      outcome
      receiptId
      revision
      body {
        markdown
        blocknote
      }
    }
  }
`;

const MYAH_INBOX_CONTACT_FIELDS = gql`
  fragment MyahInboxContactFields on MyahInboxContactSummary {
    id
    identityKind
    displayName
    instagramUsername
    lastActivityAt
    latestChannel
    preview
    sender
    needsAttention
    creator {
      id
      name
    }
    email {
      isAvailable
      threadCount
      threadIds
      latestThreadId
      needsAttention
    }
    instagram {
      isAvailable
      state
      needsAttention
      conversations {
        id
        providerConversationId
        provider
        lifecycle
        recipientUsername
        recipientDisplayName
        lastActivityAt
        latestDirection
      }
    }
  }
`;

export const GET_MYAH_INBOX_CONTACTS = gql`
  ${MYAH_INBOX_CONTACT_FIELDS}
  query MyahInboxContacts(
    $first: Int
    $after: String
    $contactId: String
    $owner: String
    $campaignId: String
    $states: [MyahInboxState!]
    $snoozeStatus: MyahInboxSnoozeStatus
    $search: String
  ) {
    myahInboxContacts(
      first: $first
      after: $after
      contactId: $contactId
      owner: $owner
      campaignId: $campaignId
      states: $states
      snoozeStatus: $snoozeStatus
      search: $search
    ) {
      edges {
        cursor
        node {
          ...MyahInboxContactFields
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_MYAH_INBOX_CONTACT = gql`
  ${MYAH_INBOX_CONTACT_FIELDS}
  query MyahInboxContact($contactId: String!) {
    myahInboxContact(contactId: $contactId) {
      ...MyahInboxContactFields
    }
  }
`;

export const GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGES = gql`
  query MyahInboxContactEmailMessages(
    $contactId: String!
    $first: Int
    $after: String
  ) {
    myahInboxContactEmailMessages(
      contactId: $contactId
      first: $first
      after: $after
    ) {
      edges {
        cursor
        node {
          id
          messageThreadId
          subject
          text
          receivedAt
          direction
          visibility
          participants {
            role
            handle
            displayName
          }
          attachmentFileIds
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const LINK_MYAH_INBOX_CONTACT_CREATOR = gql`
  mutation LinkMyahInboxContactCreator(
    $input: LinkMyahInboxContactCreatorInput!
  ) {
    linkMyahInboxContactCreator(input: $input)
  }
`;

export const GET_INSTAGRAM_MESSAGE_DRAFT = gql`
  query InstagramMessageDraft($input: GetInstagramMessageDraftInput!) {
    instagramMessageDraft(input: $input) {
      status
      draftId
      revision
      body
      executionLocked
    }
  }
`;

export const SAVE_INSTAGRAM_MESSAGE_DRAFT = gql`
  mutation SaveInstagramMessageDraft($input: SaveInstagramMessageDraftInput!) {
    saveInstagramMessageDraft(input: $input) {
      status
      draftId
      revision
      body
    }
  }
`;

export const SEND_INSTAGRAM_MESSAGE = gql`
  mutation SendInstagramMessage($input: SendInstagramMessageInput!) {
    sendInstagramMessage(input: $input) {
      status
      receiptId
      code
      nextEligibleAt
    }
  }
`;

export const GET_INSTAGRAM_MESSAGE_SEND_STATUS = gql`
  query InstagramMessageSendStatus($input: InstagramMessageSendStatusInput!) {
    instagramMessageSendStatus(input: $input) {
      receiptId
      state
      providerCode
      outcome
    }
  }
`;
