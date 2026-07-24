import { ViewType, defineView } from 'twenty-sdk/define';

import {
  CREATOR_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
  CREATOR_METRICS_VIEW_UNIVERSAL_IDENTIFIER,
  CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: CREATOR_METRICS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Creator metrics',
  icon: 'IconChartBar',
  objectUniversalIdentifier: CREATOR_OBJECT_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  position: 2,
  fields: [
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.name,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.name,
      position: 0,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramFollowerCount,
      position: 1,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.instagramEngagementPercent,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.instagramEngagementPercent,
      position: 2,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokFollowerCount,
      position: 3,
      isVisible: true,
      size: 170,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokEngagementPercent,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokEngagementPercent,
      position: 4,
      isVisible: true,
      size: 190,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.tiktokPlayCountMedian,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.tiktokPlayCountMedian,
      position: 5,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeSubscriberCount,
      position: 6,
      isVisible: true,
      size: 190,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeEngagementPercent,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeEngagementPercent,
      position: 7,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.youtubeAvgViewsLong,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.youtubeAvgViewsLong,
      position: 8,
      isVisible: true,
      size: 190,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.hasBrandDeals,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.hasBrandDeals,
      position: 9,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.promotesAffiliateLinks,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.promotesAffiliateLinks,
      position: 10,
      isVisible: true,
      size: 190,
    },
    {
      universalIdentifier:
        CREATOR_METRICS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.source,
      fieldMetadataUniversalIdentifier:
        CREATOR_FIELD_UNIVERSAL_IDENTIFIERS.source,
      position: 11,
      isVisible: true,
      size: 160,
    },
  ],
});
