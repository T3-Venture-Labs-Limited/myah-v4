import { ViewType, defineView } from 'twenty-sdk/define';

import {
  CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATORS_VIEW_UNIVERSAL_IDENTIFIER,
  CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CREATORS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Creators',
  icon: 'IconUserStar',
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  position: 0,
  fields: [
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.name,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.email,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.email,
      position: 1,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.gender,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.gender,
      position: 2,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.location,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.location,
      position: 3,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.phone,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.phone,
      position: 4,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokLink,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokLink,
      position: 5,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier:
        CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramLink,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramLink,
      position: 6,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier:
        CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeLink,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeLink,
      position: 7,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier:
        CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.twitterLink,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.twitterLink,
      position: 8,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier:
        CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
      position: 9,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.source,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
      position: 10,
      isVisible: true,
      size: 160,
    },
  ],
});
