import { gql } from '@apollo/client';

export const GET_MYAH_REPLY_AGENT_REVIEW = gql`
  query MyahReplyAgentReview($input: MyahReplyAgentReviewInput!) {
    myahReplyAgentReview(input: $input) {
      needReviewCount
      nodes {
        campaignCreatorId
        creatorId
        nextAction
        reason
        channel
        conversationRecordId
        inboxContactId
        outreach {
          state
          sentSteps
          totalSteps
          nextEligibleAt
          reason
        }
      }
    }
  }
`;

export const REGENERATE_MYAH_REPLY_AGENT_DRAFT = gql`
  mutation RegenerateMyahReplyAgentDraft(
    $input: RegenerateMyahReplyAgentDraftInput!
  ) {
    regenerateMyahReplyAgentDraft(input: $input) {
      campaignCreatorId
      nextAction
      reason
    }
  }
`;

export const GET_MYAH_REPLY_AGENT_DRAFT_LABEL = gql`
  query MyahReplyAgentDraftLabel($input: MyahReplyAgentDraftLabelInput!) {
    myahReplyAgentDraftLabel(input: $input) {
      kind
      reason
      campaignName
    }
  }
`;

export type MyahReplyAgentReviewNode = {
  campaignCreatorId: string;
  creatorId: string;
  outreach?: {
    state: string;
    sentSteps: number;
    totalSteps: number;
    nextEligibleAt: string | null;
    reason: string | null;
  } | null;
  nextAction:
    | 'REVIEW_DRAFT'
    | 'NEEDS_YOU'
    | 'SENT_AUTOMATICALLY'
    | 'SEND_UNKNOWN'
    | 'SKIPPED'
    | 'NOT_CONTACTABLE'
    | null;
  reason: string | null;
  channel: 'EMAIL' | 'INSTAGRAM' | null;
  conversationRecordId: string | null;
  inboxContactId: string | null;
};

export type MyahReplyAgentReviewData = {
  myahReplyAgentReview: {
    needReviewCount: number;
    nodes: MyahReplyAgentReviewNode[];
  };
};
