import { ViewType, defineView } from 'twenty-sdk/define';

import {
  CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CREATOR_RECORD_PAGE_FIELDS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Creator Record Fields',
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.FIELDS_WIDGET,
  fields: [
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.name,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      position: 0,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.creatorStatus,
      position: 1,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.owner,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.owner,
      position: 2,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.email,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.email,
      position: 3,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.phone,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.phone,
      position: 4,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.profileType,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.profileType,
      position: 5,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.categories,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.categories,
      position: 6,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.niches,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.niches,
      position: 7,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.location,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.location,
      position: 8,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.language,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.language,
      position: 9,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.source,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
      position: 10,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.sourceUrl,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.sourceUrl,
      position: 11,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.notes,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.notes,
      position: 12,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramUsername,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramUsername,
      position: 13,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      position: 14,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokUsername,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokUsername,
      position: 15,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      position: 16,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeTitle,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeTitle,
      position: 17,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      position: 18,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.patreonUrl,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.patreonUrl,
      position: 19,
      isVisible: true,
    },
    {
      universalIdentifier:
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeUrl,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeUrl,
      position: 20,
      isVisible: true,
    },
  ],
});
