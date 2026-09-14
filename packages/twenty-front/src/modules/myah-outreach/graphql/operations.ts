import { gql } from '@apollo/client';

export const FIND_CAMPAIGN_OUTREACH_WORKFLOW = gql`
  query FindCampaignOutreachWorkflow($campaignId: UUID!) {
    findCampaignOutreachWorkflow(campaignId: $campaignId) {
      campaignId
      currentVersionId
      name
      workflowId
    }
  }
`;

export const CREATE_CAMPAIGN_OUTREACH_WORKFLOW = gql`
  mutation CreateCampaignOutreachWorkflow($campaignId: UUID!) {
    createCampaignOutreachWorkflow(campaignId: $campaignId) {
      campaignId
      currentVersionId
      name
      workflowId
    }
  }
`;

const CAMPAIGN_SEQUENCE_SNAPSHOT_FIELDS = gql`
  fragment CampaignSequenceSnapshotFields on CampaignSequenceSnapshot {
    campaignId
    workflowId
    versionId
    sequence
    lifecycleStatus
    versionStatus
    editable
    issues {
      code
      path
      message
      messageId
    }
  }
`;

export const CAMPAIGN_SEQUENCE = gql`
  ${CAMPAIGN_SEQUENCE_SNAPSHOT_FIELDS}
  query CampaignSequence($campaignId: UUID!) {
    campaignSequence(campaignId: $campaignId) {
      __typename
      ... on CampaignSequenceAbsent {
        kind
        campaignId
      }
      ... on CampaignSequenceLegacy {
        kind
        campaignId
        workflowId
      }
      ... on CampaignSequencePresent {
        kind
        snapshot {
          ...CampaignSequenceSnapshotFields
        }
      }
    }
  }
`;

export const SAVE_CAMPAIGN_SEQUENCE = gql`
  ${CAMPAIGN_SEQUENCE_SNAPSHOT_FIELDS}
  mutation SaveCampaignSequence($input: SaveCampaignSequenceInput!) {
    saveCampaignSequence(input: $input) {
      ...CampaignSequenceSnapshotFields
    }
  }
`;

export const PUBLISH_CAMPAIGN_SEQUENCE = gql`
  ${CAMPAIGN_SEQUENCE_SNAPSHOT_FIELDS}
  mutation PublishCampaignSequence($input: PublishCampaignSequenceInput!) {
    publishCampaignSequence(input: $input) {
      ...CampaignSequenceSnapshotFields
    }
  }
`;

export const VALIDATE_CAMPAIGN_SEQUENCE = gql`
  ${CAMPAIGN_SEQUENCE_SNAPSHOT_FIELDS}
  mutation ValidateCampaignSequence(
    $campaignId: UUID!
    $expectedVersionId: UUID!
  ) {
    validateCampaignSequence(
      campaignId: $campaignId
      expectedVersionId: $expectedVersionId
    ) {
      ...CampaignSequenceSnapshotFields
    }
  }
`;

export const REPLACE_LEGACY_CAMPAIGN_SEQUENCE = gql`
  ${CAMPAIGN_SEQUENCE_SNAPSHOT_FIELDS}
  mutation ReplaceLegacyCampaignSequence(
    $input: ReplaceLegacyCampaignSequenceInput!
  ) {
    replaceLegacyCampaignSequence(input: $input) {
      ...CampaignSequenceSnapshotFields
    }
  }
`;
