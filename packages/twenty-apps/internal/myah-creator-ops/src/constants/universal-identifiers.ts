export { CREATOR_FIELD_UNIVERSAL_IDENTIFIERS } from './creator-field-universal-identifiers';

export const APP_DISPLAY_NAME = 'Myah Creator Ops';
export const APP_DESCRIPTION =
  'Creator sourcing, import, campaign, and outreach objects for Myah.';
export const APPLICATION_UNIVERSAL_IDENTIFIER =
  '72f2fd16-880c-4c63-852f-dbf63f51c152';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  '802cf87a-e4c5-559b-89c5-2172e3e5cc2f';
export const CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de';
export const CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER =
  'd51f2758-055b-5367-8250-859cb3f58631';
export const CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER =
  'e004c4b4-b1e1-59d9-b096-9fc57875d47f';
export const CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER =
  '9a09d54a-d464-5692-ac74-70527fb00ddd';
export const CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER =
  'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a';
export const PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER =
  '843aa6c8-36af-5906-8241-4017c4188df7';
export const OFFER_OBJECT_UNIVERSAL_IDENTIFIER =
  'fd8a37b8-72db-5069-902a-a1763ddc63f7';
export const OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER =
  '0446497e-3240-5a78-a02f-e08594e5c2af';
export const OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER =
  'c25bfef3-4636-5864-a777-705238c91326';
export const OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER =
  'b4459926-2c01-560a-8432-fa1974168439';

export const CREATOR_RELATION_FIELD_UNIVERSAL_IDENTIFIERS = {
  listMemberships: '32db62ac-6217-5316-89d9-f9d7290dff70',
  campaignCreators: '3b9494ff-0fe7-5492-8b69-c515f79ea437',
} as const;

export const CREATORS_VIEW_UNIVERSAL_IDENTIFIER =
  'a5abdae3-d86a-51d3-9b04-2dc21c172c3e';
export const CREATOR_LISTS_VIEW_UNIVERSAL_IDENTIFIER =
  '1bc58554-efb5-52e4-8e2a-7f522a1c453c';
export const CAMPAIGNS_VIEW_UNIVERSAL_IDENTIFIER =
  '5865bdbf-be33-5457-9d91-184885276b94';

export const CREATORS_NAV_UNIVERSAL_IDENTIFIER =
  'd06225df-32da-5c5d-b5d1-2b8d48fdca1c';
export const CREATOR_LISTS_NAV_UNIVERSAL_IDENTIFIER =
  'c124f0aa-7836-5242-ac52-e8667e0ed4f7';
export const CAMPAIGNS_NAV_UNIVERSAL_IDENTIFIER =
  'a1556a2b-8c0a-570a-a902-38827cadc867';

export const CREATOR_LIST_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: 'e19694f0-0c78-566e-ab95-63f0488848f3',
  source: '1b27dc7c-0f11-5b2a-b81f-708dc785b6fa',
  description: '1a4485a2-1e44-51af-bfdc-666cdcf17223',
  members: 'ade71f2b-7f9d-5e4d-9d0b-3f20ce4d15df',
} as const;

export const CREATOR_LIST_MEMBER_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '7924764c-9378-5299-8b68-7757e6af35c2',
  creator: 'a8014e8c-e50a-547a-9f01-973d685314ec',
  creatorList: 'c84e31a5-ba66-5773-a2da-2b1c357257c5',
  source: 'cec1e32c-db2c-53fa-b0ad-4bbbce951ae2',
  notes: 'bb1651d8-de78-5a22-8ac3-7c1f4d631819',
} as const;

export const CAMPAIGN_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '63c56aea-35db-5733-9d3a-d062544ac897',
  status: '9d3c6d96-896d-51d1-b6d2-5d6b2e333e87',
  objective: 'e22687bb-2633-573f-bd80-c4b13e80d966',
  targetPlatforms: '877f9622-775c-52c1-9869-4abf14161de0',
  targetDemographics: '3e4bc999-fad4-59c2-9e38-046c33e26f2b',
  icpGoal: '86ac6e3d-ef0e-5ee3-a8b6-e8a22756f81c',
  budgetNotes: '97377e2b-ec51-5fef-891e-b2202cc69512',
  campaignCreators: '894c80f2-a478-5680-8c20-c7a86aa24fde',
  offers: '1d33699f-76f3-5247-98b3-2de588543364',
  outreachSequences: '40b7c827-4699-5f99-bdb8-d8906dd948f5',
} as const;

export const CAMPAIGN_CREATOR_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '31b163a4-99d9-5015-bcee-dc8ae5229ee3',
  creator: '730b323f-fae3-57e2-8e2e-62963106850a',
  campaign: '27ecf86e-08a4-5084-91d7-d305ab3363e1',
  stage: '427aad82-7fe4-516d-99b3-8d00161534f6',
  selectedContactMethod: 'b002caa0-6fb6-54a3-8111-a6dadf09e4ca',
  nextActionAt: '3d5adbfb-9e02-5583-95ea-bfe72e65106f',
  selectionReason: '6f38f371-8915-55be-a96c-a94e4fc293af',
  dealSummary: '12b6b77e-31a8-508f-bf3c-f7b3077dcbd3',
  outcomeSummary: '640d0d05-246d-5005-b592-a28889852fbd',
  outreachActions: 'e9b9d246-f49e-5200-9819-0a4c9cd0d19a',
} as const;

export const PROMOTED_ASSET_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '3891a76c-3119-52cc-84cd-abce75920db7',
  assetType: '3c7bb78a-3a42-590a-aca9-f4d966fd691f',
  url: 'f90326b9-e045-578b-8d76-c513bb3c1890',
  description: '38cf3b6d-bce8-5eca-9db0-232ebe8ea702',
  offers: '809800a3-fa41-591e-8d4e-7e9fd0daf322',
} as const;

export const OFFER_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: 'b7706308-8a6a-5613-ac37-d5e8ce848be2',
  campaign: 'f8ea43b0-33f8-5071-9e6d-5b787fb4e043',
  promotedAsset: '00c95791-84b2-50cc-89aa-68faf18011eb',
  termsSummary: '0923fd4e-7f50-587b-af7f-f2cebf5293ec',
  commissionRate: '45e45dbb-b54a-57bf-a901-215aa193b42c',
  fixedFee: 'ee119d6e-9d38-5ab8-9382-70498edc9688',
  cpaAmount: '05ca2ea3-5833-5192-a2f2-9dc7b53ca89f',
  giftedProductNotes: '5fcb14fe-bed2-513d-9cd8-7c6ecb15bf0b',
  usageRightsNotes: '8044d22e-fba7-5af4-9b9f-28ccc0779801',
} as const;

export const OUTREACH_SEQUENCE_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '3f5fd643-d5ba-5db2-8cad-528b51189994',
  campaign: '75b56b0d-b69d-50fd-8f36-bfd3fa8d9237',
  status: '4298980f-fa5b-5e2a-8f80-1790cc7ec1da',
  description: '3278eed0-5897-54e0-a58d-fc237d64f4ea',
  steps: '79efc6cb-48f5-5569-9759-255825e287e0',
} as const;

export const OUTREACH_STEP_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: 'f9a7ec56-5aa0-5341-830a-5ab108c6b73c',
  outreachSequence: '9fd2575c-ca82-59bb-8f10-4907b104e6cb',
  stepPosition: 'a9469f6f-7cb8-5ed9-b171-15d65d7a47ea',
  trigger: 'b5fe44f8-8d01-573f-a3bb-920399c8f9bb',
  channel: '8bef3b6c-0347-5389-98d2-263ab99f2377',
  delayDays: '7b114005-6089-5a22-b172-f74bc93ef9b9',
  templateSummary: '766d505d-d6ac-54d2-940d-201a47e29c3a',
  actions: 'd68a67a8-b5b3-5dd0-a1a5-82ed7561eb4e',
} as const;

export const OUTREACH_ACTION_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: 'e3165e19-e1b8-51d2-9451-5caa4c398bd6',
  campaignCreator: '64617f40-1f95-54cf-be64-ff57c72df280',
  outreachStep: '09c835f8-9137-5b97-bc2c-a76139fd270c',
  channel: 'f1c1b41f-a1be-548b-a7b2-9d4c8863f74b',
  status: 'f41a5820-bb50-537d-ae28-e2824cd7aa36',
  scheduledAt: 'd11e908c-0cad-54c2-8326-56187dd177f5',
  completedAt: '04638c8a-b191-5030-ad00-810bbca02bbe',
  resultSummary: 'a461116c-dab8-525c-bdd9-4708dcebf433',
} as const;

export const CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '1ee6e143-3bf6-58cc-b55c-e7bd8b9cb4d0',
  email: 'd779e826-cf8c-5e36-9685-0f9a6989142d',
  location: '566647f6-312a-5357-adb9-a98c084989b3',
  instagramUsername: '77c1fa17-1566-59d6-9a1f-6597537c72c0',
  instagramFollowerCount: '2856cfb7-33c3-5441-a871-85c09cd34688',
  tiktokUsername: 'b9998544-50cc-50a0-af98-598c3922ab11',
  tiktokFollowerCount: '0025c07e-7109-5f5f-b9ef-694abb133ec8',
  youtubeTitle: '7c46192c-272b-504b-aa1d-1048151b9943',
  youtubeSubscriberCount: 'eeebe69a-8c33-55ad-8375-ae0f7c68f9c5',
  hasBrandDeals: 'd5777661-6233-54e2-b073-6328a904d139',
  promotesAffiliateLinks: '72826aa0-29d6-5363-83d9-353819828b71',
  source: 'c2581172-2575-532c-8975-a79e55188fab',
} as const;

export const CAMPAIGNS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: 'ead80d6b-300a-5edc-b03e-7cce7f3fecc4',
  status: '8ce2c107-f484-5525-8f45-b7f4c9d32683',
  objective: '4d438e45-9995-5b0f-b9eb-ed916870f280',
  targetPlatforms: '66f84b3e-c870-5180-b345-490897ce4cd2',
  icpGoal: 'dacf7682-7297-5319-b86d-6cb137f9ddb2',
} as const;

export const CREATOR_LISTS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS = {
  name: '8b68fcb0-490d-5414-9b67-abf9e858908b',
  source: 'ce532f04-7846-52b2-9d6b-cd9305f767e2',
  description: 'a9084da4-53a4-5af9-b078-480a6878d74c',
} as const;
