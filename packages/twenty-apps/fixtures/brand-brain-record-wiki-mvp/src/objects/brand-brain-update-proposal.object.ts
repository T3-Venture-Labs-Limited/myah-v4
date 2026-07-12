import { FieldType, defineObject } from 'twenty-sdk/define';

export const BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER =
  'facac4a1-0a2f-469f-9f1f-81ef01f06578';
export const BRAND_BRAIN_UPDATE_PROPOSAL_TITLE_FIELD_UNIVERSAL_IDENTIFIER =
  'e4418f8c-6f74-4d03-8c61-93c17848c2dc';
export const BRAND_BRAIN_UPDATE_PROPOSAL_TYPE_FIELD_UNIVERSAL_IDENTIFIER =
  '5601c017-6a85-4211-b2b2-9fda0bf9f0c6';
export const BRAND_BRAIN_UPDATE_PROPOSAL_STATUS_FIELD_UNIVERSAL_IDENTIFIER =
  '5d00b029-7a0d-4320-acf4-036a634a44ab';
export const BRAND_BRAIN_UPDATE_PROPOSAL_REASON_FIELD_UNIVERSAL_IDENTIFIER =
  '6a5f0131-32c8-41a2-968c-1dd429071f18';
export const BRAND_BRAIN_UPDATE_PROPOSAL_PATCH_FIELD_UNIVERSAL_IDENTIFIER =
  'cf1caf3f-e423-43e6-bd47-62a27bb513e2';
export const BRAND_BRAIN_UPDATE_PROPOSAL_SOURCE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER =
  '31fe27f7-a5cb-4590-95a0-f9247f490bb2';

export default defineObject({
  universalIdentifier: BRAND_BRAIN_UPDATE_PROPOSAL_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'brandBrainUpdateProposal',
  namePlural: 'brandBrainUpdateProposals',
  labelSingular: 'Brand Brain Update Proposal',
  labelPlural: 'Brand Brain Update Proposals',
  description:
    'Dormant migration-safe proposal object retained for existing test workspaces; routine Brand Brain writes are direct agent updates.',
  icon: 'IconFilePencil',
  isSearchable: false,
  labelIdentifierFieldMetadataUniversalIdentifier:
    BRAND_BRAIN_UPDATE_PROPOSAL_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_TITLE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'title',
      label: 'Title',
      icon: 'IconHeading',
      defaultValue: "''",
    },
    {
      universalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_TYPE_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'proposalType',
      label: 'Proposal Type',
      icon: 'IconEdit',
      defaultValue: "'UPDATE_PAGE'",
      options: [
        {
          id: 'dd5522a7-f3d6-4ce3-a1ea-336f4f0b772f',
          value: 'CREATE_PAGE',
          label: 'Create page',
          position: 0,
          color: 'green',
        },
        {
          id: '4e61f20b-6643-4307-913c-06696947aef8',
          value: 'UPDATE_PAGE',
          label: 'Update page',
          position: 1,
          color: 'blue',
        },
        {
          id: 'b5ab743d-6337-4c51-a7dc-56c28341e697',
          value: 'APPEND_LOG',
          label: 'Append log',
          position: 2,
          color: 'orange',
        },
        {
          id: '08137fbf-127b-472c-b3ea-2255f86a7db5',
          value: 'UPDATE_INDEX',
          label: 'Update index',
          position: 3,
          color: 'sky',
        },
        {
          id: '51b3a48a-c9ed-4420-80d5-990ee5d0d4c9',
          value: 'ADD_LINK',
          label: 'Add link',
          position: 4,
          color: 'purple',
        },
        {
          id: '7d4f06a5-8623-46a2-8780-7ab9cd337919',
          value: 'ARCHIVE_PAGE',
          label: 'Archive page',
          position: 5,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_STATUS_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconProgressCheck',
      defaultValue: "'PENDING'",
      options: [
        {
          id: '064cf1aa-f26e-4397-8fd8-15d24b8c0122',
          value: 'PENDING',
          label: 'Pending',
          position: 0,
          color: 'orange',
        },
        {
          id: '69fdb8eb-6fc3-46fc-a554-edeb13fff56b',
          value: 'APPROVED',
          label: 'Approved',
          position: 1,
          color: 'green',
        },
        {
          id: 'c8de23d7-3b9e-4c63-9c7b-37b901eb5773',
          value: 'REJECTED',
          label: 'Rejected',
          position: 2,
          color: 'red',
        },
        {
          id: 'ea5d03c1-d933-468a-8bc8-e3e5fc33cf23',
          value: 'APPLIED',
          label: 'Applied',
          position: 3,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_REASON_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'reason',
      label: 'Reason',
      icon: 'IconMessage2Question',
      isNullable: true,
    },
    {
      universalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_PATCH_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'proposedPatch',
      label: 'Proposed Patch',
      icon: 'IconDiff',
      isNullable: true,
    },
    {
      universalIdentifier:
        BRAND_BRAIN_UPDATE_PROPOSAL_SOURCE_SUMMARY_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'sourceSummary',
      label: 'Source Summary',
      icon: 'IconSourceCode',
      isNullable: true,
    },
  ],
});
