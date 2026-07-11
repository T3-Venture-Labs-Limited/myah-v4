import { CREATOR_FIELD_UNIVERSAL_IDENTIFIERS } from 'src/constants/creator-field-universal-identifiers';
import { defineApplicationRole } from 'twenty-sdk/define';

import {
  APP_DISPLAY_NAME,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';
export default defineApplicationRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `${APP_DISPLAY_NAME} default function role`,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  fieldPermissions: [
    ...[
      'email',
      'phone',
      'instagramUrl',
      'instagramUsername',
      'tiktokUrl',
      'tiktokUsername',
      'youtubeCustomUrl',
      'twitterUrl',
      'twitterUsername',
      'twitchUrl',
      'twitchUsername',
      'patreonUrl',
    ].map((fieldName) => ({
      objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS[
          fieldName as keyof typeof CREATOR_FIELD_UNIVERSAL_IDENTIFIERS
        ],
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    })),
  ],
});
