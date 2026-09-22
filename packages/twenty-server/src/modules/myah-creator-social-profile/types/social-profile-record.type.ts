import { type SocialProfilePlatform } from 'src/modules/myah-creator-social-profile/utils/social-profile-identity.util';

export type SocialProfileRecord = {
  id: string;
  creatorId: string;
  name: string;
  platform: SocialProfilePlatform;
  handle: string | null;
  profileUrl: string | null;
  normalizedLocator: string | null;
  platformAccountId: string | null;
  followerCount: number | null;
  followerCountObservedAt: Date | null;
  followerCountSource: string | null;
  deletedAt: Date | null;
};
