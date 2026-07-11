import { CREATOR_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/creator-field-universal-identifiers';
import { defineApplicationRole } from 'twenty-sdk/define';

import {
  APP_DISPLAY_NAME,
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
  PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const CREATOR_OPS_OBJECTS = [
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_LIST_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_OBJECT_UNIVERSAL_IDENTIFIER,
  CAMPAIGN_CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  PROMOTED_ASSET_OBJECT_UNIVERSAL_IDENTIFIER,
  OFFER_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_SEQUENCE_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_STEP_OBJECT_UNIVERSAL_IDENTIFIER,
  OUTREACH_ACTION_OBJECT_UNIVERSAL_IDENTIFIER,
] as const;

const PROTECTED_CREATOR_FIELDS = [
  'email',
  'phone',
  'instagramUrl',
  'instagramUsername',
  'instagramBio',
  'tiktokUrl',
  'tiktokUsername',
  'tiktokBio',
  'youtubeUrl',
  'youtubeCustomUrl',
  'youtubeTitle',
  'youtubeDescription',
  'twitterUrl',
  'twitterUsername',
  'twitterBio',
  'twitchUrl',
  'twitchUsername',
  'twitchDisplayName',
  'patreonUrl',
] as const;

export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `${APP_DISPLAY_NAME} default function role`,
  canReadAllObjectRecords: false,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  objectPermissions: CREATOR_OPS_OBJECTS.map(
    (objectUniversalIdentifier) => ({
      objectUniversalIdentifier,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    }),
  ),
  fieldPermissions: PROTECTED_CREATOR_FIELDS.map((fieldName) => ({
    objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
    fieldUniversalIdentifier:
      CREATOR_FIELD_UNIVERSAL_IDENTIFIERS[fieldName],
    canReadFieldValue: false,
    canUpdateFieldValue: false,
  })),
});
