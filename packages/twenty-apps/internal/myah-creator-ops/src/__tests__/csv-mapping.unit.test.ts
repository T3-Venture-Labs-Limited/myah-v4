import { describe, expect, it } from 'vitest';

import creatorObjectResult from 'src/objects/creator.object';

const unwrapValidationResult = <T>(result: {
  success: boolean;
  config: T;
  errors: string[];
}): T => {
  if (result.success === false) {
    throw new Error(result.errors.join(', '));
  }

  return result.config;
};

const creatorObject = unwrapValidationResult(creatorObjectResult);

const influencerClubHeaders = [
  'email',
  'first_name',
  'location',
  'language',
  'contact_phone_number',
  'has_link_in_bio',
  'has_brand_deals',
  'promotes_affiliate_links',
  'has_merch',
  'links_in_bio',
  'external_urls',
  'instagram_link',
  'instagram_username',
  'instagram_biography',
  'instagram_follower_count',
  'instagram_engagement_percent',
  'instagram_most_recent_post_date',
  'instagram_media_count',
  'instagram_avg_likes',
  'instagram_avg_comments',
  'instagram_reels_reels_percent',
  'instagram_reels_avg_view_count',
  'instagram_posting_frequency_recent_months',
  'instagram_income_min',
  'instagram_income_max',
  'tiktok_link',
  'tiktok_username',
  'tiktok_biography',
  'tiktok_follower_count',
  'tiktok_most_recent_post_date',
  'tiktok_engagement_percent',
  'tiktok_video_count',
  'tiktok_play_count_median',
  'tiktok_avg_likes',
  'tiktok_comment_count_avg',
  'tiktok_download_count_avg',
  'tiktok_posting_frequency_recent_months',
  'youtube_link',
  'youtube_custom_url',
  'youtube_title',
  'youtube_description',
  'youtube_topic_details',
  'youtube_subscriber_count',
  'youtube_last_upload_date',
  'youtube_shorts_percentage',
  'youtube_video_count',
  'youtube_engagement_percent',
  'youtube_avg_views_long',
  'youtube_avg_views_shorts',
  'youtube_posting_frequency_recent_months',
  'youtube_income_min',
  'youtube_income_max',
  'twitter_link',
  'twitter_username',
  'twitter_biography',
  'twitter_follower_count',
  'twitter_engagement_percent',
  'twitch_link',
  'twitch_username',
  'twitch_displayName',
  'twitch_total_followers',
  'patreon_link',
  'hashtags_used',
];

const influencerClubHeaderToCreatorFieldName: Record<string, string> = {
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
  instagram_posting_frequency_recent_months: 'instagramPostingFrequencyRecentMonths',
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
  youtube_posting_frequency_recent_months: 'youtubePostingFrequencyRecentMonths',
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
};

describe('Influencer Club CSV mapping', () => {
  it('should have Creator fields for every useful import header', () => {
    for (const header of influencerClubHeaders) {
      const creatorFieldName = influencerClubHeaderToCreatorFieldName[header];

      expect(creatorFieldName).toBeDefined();
      expect(
        creatorObject.fields.some((field) => field.name === creatorFieldName),
      ).toBe(true);
    }
  });
});
