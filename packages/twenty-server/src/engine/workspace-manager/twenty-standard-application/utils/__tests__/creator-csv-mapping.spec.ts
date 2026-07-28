import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined } from 'twenty-shared/utils';

import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const result = computeTwentyStandardApplicationAllFlatEntityMaps({
  now: '2026-07-14T00:00:00.000Z',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
});
const creatorFieldNames = new Set(
  Object.values(
    result.allFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
  )
    .filter(isDefined)
    .filter(
      (field) =>
        field.objectMetadataUniversalIdentifier ===
        MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    )
    .map((field) => field.name),
);

const influencerClubHeaderToCreatorFieldName = {
  email: 'email',
  first_name: 'name',
  location: 'location',
  language: 'language',
  contact_phone_number: 'phone',
  has_link_in_bio: 'hasLinkInBio',
  has_brand_deals: 'hasBrandDeals',
  promotes_affiliate_links: 'promotesAffiliateLinks',
  has_merch: 'hasMerch',
  links_in_bio: 'linksInBio',
  external_urls: 'externalUrls',
  instagram_link: 'instagramUrl',
  instagram_username: 'instagramUsername',
  instagram_biography: 'instagramBio',
  instagram_follower_count: 'instagramFollowerCount',
  instagram_engagement_percent: 'instagramEngagementPercent',
  instagram_most_recent_post_date: 'instagramMostRecentPostDate',
  instagram_media_count: 'instagramMediaCount',
  instagram_avg_likes: 'instagramAvgLikes',
  instagram_avg_comments: 'instagramAvgComments',
  instagram_reels_reels_percent: 'instagramReelsPercent',
  instagram_reels_avg_view_count: 'instagramReelsAvgViewCount',
  instagram_posting_frequency_recent_months:
    'instagramPostingFrequencyRecentMonths',
  instagram_income_min: 'instagramEstimatedIncomeMin',
  instagram_income_max: 'instagramEstimatedIncomeMax',
  tiktok_link: 'tiktokUrl',
  tiktok_username: 'tiktokUsername',
  tiktok_biography: 'tiktokBio',
  tiktok_follower_count: 'tiktokFollowerCount',
  tiktok_most_recent_post_date: 'tiktokMostRecentPostDate',
  tiktok_engagement_percent: 'tiktokEngagementPercent',
  tiktok_video_count: 'tiktokVideoCount',
  tiktok_play_count_median: 'tiktokPlayCountMedian',
  tiktok_avg_likes: 'tiktokAvgLikes',
  tiktok_comment_count_avg: 'tiktokAvgComments',
  tiktok_download_count_avg: 'tiktokAvgDownloads',
  tiktok_posting_frequency_recent_months: 'tiktokPostingFrequencyRecentMonths',
  youtube_link: 'youtubeUrl',
  youtube_custom_url: 'youtubeCustomUrl',
  youtube_title: 'youtubeTitle',
  youtube_description: 'youtubeDescription',
  youtube_topic_details: 'youtubeTopicDetails',
  youtube_subscriber_count: 'youtubeSubscriberCount',
  youtube_last_upload_date: 'youtubeLastUploadDate',
  youtube_shorts_percentage: 'youtubeShortsPercentage',
  youtube_video_count: 'youtubeVideoCount',
  youtube_engagement_percent: 'youtubeEngagementPercent',
  youtube_avg_views_long: 'youtubeAvgViewsLong',
  youtube_avg_views_shorts: 'youtubeAvgViewsShorts',
  youtube_posting_frequency_recent_months:
    'youtubePostingFrequencyRecentMonths',
  youtube_income_min: 'youtubeEstimatedIncomeMin',
  youtube_income_max: 'youtubeEstimatedIncomeMax',
  twitter_link: 'twitterUrl',
  twitter_username: 'twitterUsername',
  twitter_biography: 'twitterBio',
  twitter_follower_count: 'twitterFollowerCount',
  twitter_engagement_percent: 'twitterEngagementPercent',
  twitch_link: 'twitchUrl',
  twitch_username: 'twitchUsername',
  twitch_displayName: 'twitchDisplayName',
  twitch_total_followers: 'twitchTotalFollowers',
  patreon_link: 'patreonUrl',
  hashtags_used: 'hashtagsUsed',
} as const;

describe('Influencer Club CSV standard metadata', () => {
  it('provides a Creator field for every supported import header', () => {
    for (const creatorFieldName of Object.values(
      influencerClubHeaderToCreatorFieldName,
    )) {
      expect(creatorFieldNames).toContain(creatorFieldName);
    }
  });
});
