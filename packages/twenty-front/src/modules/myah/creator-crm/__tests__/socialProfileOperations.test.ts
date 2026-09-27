import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { print } from 'graphql';

import {
  getSocialProfileIdentityInput,
  RESTORE_SOCIAL_PROFILE,
  RETIRE_SOCIAL_PROFILE,
  UPDATE_SOCIAL_PROFILE_IDENTITY,
} from '@/myah/creator-crm/socialProfileOperations';

describe('managed SocialProfile operations', () => {
  it('uses the exact identity operation and only accepts its DTO fields', () => {
    expect(print(UPDATE_SOCIAL_PROFILE_IDENTITY)).toContain(
      'updateSocialProfileIdentity(input: $input)',
    );
    expect(print(UPDATE_SOCIAL_PROFILE_IDENTITY)).not.toContain('__typename');
    expect(
      getSocialProfileIdentityInput({
        handle: '@ada',
        followerCount: 42,
      }),
    ).toEqual({ handle: '@ada', followerCount: 42 });
    expect(
      getSocialProfileIdentityInput({
        handle: '@ada',
        creatorId: 'creator-id',
      }),
    ).toBeNull();
    expect(getSocialProfileIdentityInput({ name: 'derived label' })).toBeNull();
  });

  it('does not normalize DTO responses when the managed mutation uses no-cache', async () => {
    const cache = new InMemoryCache();
    const client = new ApolloClient({
      cache,
      link: new ApolloLink(
        () =>
          new Observable((observer) => {
            observer.next({
              data: {
                updateSocialProfileIdentity: {
                  __typename: 'SocialProfileDTO',
                  id: 'profile-id',
                  creatorId: 'creator-id',
                  name: 'Instagram: @ada',
                  platform: 'INSTAGRAM',
                  handle: '@ada',
                  profileUrl: null,
                  platformAccountId: null,
                  followerCount: null,
                  followerCountObservedAt: null,
                  followerCountSource: null,
                  deletedAt: null,
                },
              },
            });
            observer.complete();
          }),
      ),
    });

    await client.mutate({
      mutation: UPDATE_SOCIAL_PROFILE_IDENTITY,
      variables: { input: { id: 'profile-id', handle: '@ada' } },
      fetchPolicy: 'no-cache',
    });

    expect(cache.extract()).toEqual({});
  });

  it('uses managed lifecycle operation documents with a single id input', () => {
    expect(print(RETIRE_SOCIAL_PROFILE)).toContain(
      'retireSocialProfile(input: $input)',
    );
    expect(print(RESTORE_SOCIAL_PROFILE)).toContain(
      'restoreSocialProfile(input: $input)',
    );
    expect({ input: { id: 'profile-id' } }).toEqual({
      input: { id: 'profile-id' },
    });
  });
});
