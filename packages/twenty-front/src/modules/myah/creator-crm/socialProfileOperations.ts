import { type ApolloClient, gql } from '@apollo/client';

import { getObjectTypename } from '@/object-record/cache/utils/getObjectTypename';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const SOCIAL_PROFILE_FIELDS = `
  id
  creatorId
  name
  platform
  handle
  profileUrl
  platformAccountId
  followerCount
  followerCountObservedAt
  followerCountSource
  deletedAt
`;

export const UPDATE_SOCIAL_PROFILE_IDENTITY = gql`
  mutation UpdateSocialProfileIdentity(
    $input: UpdateSocialProfileIdentityInput!
  ) {
    updateSocialProfileIdentity(input: $input) {
      ${SOCIAL_PROFILE_FIELDS}
    }
  }
`;

export const RETIRE_SOCIAL_PROFILE = gql`
  mutation RetireSocialProfile($input: RetireSocialProfileInput!) {
    retireSocialProfile(input: $input) {
      ${SOCIAL_PROFILE_FIELDS}
    }
  }
`;

export const RESTORE_SOCIAL_PROFILE = gql`
  mutation RestoreSocialProfile($input: RestoreSocialProfileInput!) {
    restoreSocialProfile(input: $input) {
      ${SOCIAL_PROFILE_FIELDS}
    }
  }
`;

export const toCanonicalSocialProfileRecord = <
  T extends ObjectRecord = ObjectRecord,
>(
  record: T,
): T => ({
  ...record,
  __typename: getObjectTypename('socialProfile'),
});

// Social profiles are removed one at a time through the managed mutation;
// the generic deleteMany is rejected for this object (MYAH-458).
export const retireSocialProfiles = async (
  apolloMetadataClient: ApolloClient,
  ids: readonly string[],
): Promise<ObjectRecord[]> => {
  const retired: ObjectRecord[] = [];
  for (const id of ids) {
    const { data } = await apolloMetadataClient.mutate<{
      retireSocialProfile: ObjectRecord;
    }>({
      mutation: RETIRE_SOCIAL_PROFILE,
      fetchPolicy: 'no-cache',
      variables: { input: { id } },
    });
    if (data?.retireSocialProfile)
      retired.push(toCanonicalSocialProfileRecord(data.retireSocialProfile));
  }
  return retired;
};

const socialProfileIdentityFieldNames = new Set([
  'platform',
  'handle',
  'profileUrl',
  'platformAccountId',
  'followerCount',
  'followerCountObservedAt',
  'followerCountSource',
]);

export const getSocialProfileIdentityInput = (
  recordInput: Partial<ObjectRecord>,
): Record<string, unknown> | null => {
  const fields = Object.keys(recordInput);

  if (
    fields.length === 0 ||
    fields.some((fieldName) => !socialProfileIdentityFieldNames.has(fieldName))
  ) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(recordInput).filter(([fieldName]) =>
      socialProfileIdentityFieldNames.has(fieldName),
    ),
  );
};
