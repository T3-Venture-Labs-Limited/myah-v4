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
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.email,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.email,
      position: 1,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.location,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.location,
      position: 2,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramUsername,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramUsername,
      position: 3,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      position: 4,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokUsername,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokUsername,
      position: 5,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      position: 6,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeTitle,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeTitle,
      position: 7,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      position: 8,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.hasBrandDeals,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.hasBrandDeals,
      position: 9,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.promotesAffiliateLinks,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.promotesAffiliateLinks,
      position: 10,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: CREATORS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.source,
      fieldMetadataUniversalIdentifier: CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
      position: 11,
      isVisible: true,
      size: 160,
    },
  ],
});
