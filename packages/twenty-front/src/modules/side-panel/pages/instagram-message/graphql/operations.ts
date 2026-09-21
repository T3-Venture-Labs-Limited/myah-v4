import { gql } from '@apollo/client';

export const INSTAGRAM_MESSAGE_COMPOSER_ACCOUNT = gql`
  query InstagramMessageComposerAccount {
    instagramMessageComposerAccount {
      status
      code
      sender {
        accountRecordId
        label
      }
    }
  }
`;

export const PREPARE_INSTAGRAM_MESSAGE_COMPOSER = gql`
  mutation PrepareInstagramMessageComposer(
    $input: PrepareInstagramMessageComposerInputDto!
  ) {
    prepareInstagramMessageComposer(input: $input) {
      status
      code
      normalizedHandle
      creatorRecordId
      sender {
        accountRecordId
        label
      }
      actionKind
      preparationFingerprint
    }
  }
`;

export const SEND_INSTAGRAM_MESSAGE_COMPOSER = gql`
  mutation SendInstagramMessageComposer(
    $input: SendInstagramMessageComposerInputDto!
  ) {
    sendInstagramMessageComposer(input: $input) {
      status
      receiptId
      code
      nextEligibleAt
    }
  }
`;

export const GET_INSTAGRAM_MESSAGE_COMPOSER_ATTEMPT = gql`
  query InstagramMessageComposerAttempt($draftId: UUID!) {
    instagramMessageComposerAttempt(draftId: $draftId) {
      draftId
      approvalBindingId
      receiptId
      state
    }
  }
`;
