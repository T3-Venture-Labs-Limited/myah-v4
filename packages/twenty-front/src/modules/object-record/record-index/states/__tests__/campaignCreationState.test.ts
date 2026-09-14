import { createStore } from 'jotai';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import {
  campaignCreationState,
  registerCampaignCreationOrigin,
  subscribeCampaignCreationSession,
} from '@/object-record/record-index/states/campaignCreationState';
import {
  campaignCreationActorKey,
  campaignCreationAttemptKey,
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
  isCampaignCreationDuplicate,
  isCampaignCreationTransportUncertain,
} from '@/apollo/utils/campaignCreationOperation';
import {
  mockCurrentWorkspace,
  mockedUserData,
  mockedWorkspaceMemberData,
} from '~/testing/mock-data/users';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

const identity = {
  workspaceId: 'workspace',
  userId: 'actor',
  userWorkspaceId: 'membership',
  workspaceMemberId: 'member',
  isImpersonating: false,
};
const token = (claims: Record<string, unknown> = {}) =>
  `${btoa('{}')}.${btoa(JSON.stringify({ type: 'ACCESS', ...identity, ...claims }))}.fixture`;
const tokens = (claims: Record<string, unknown> = {}) => ({
  accessOrWorkspaceAgnosticToken: {
    token: token(claims),
    expiresAt: '2099-01-01',
  },
  refreshToken: { token: 'fixture', expiresAt: '2099-01-01' },
});

it('decodes only native ACCESS identities and keys ownership independently of optional member claims', () => {
  expect(decodeCampaignCreationIdentity(token())).toEqual(identity);
  for (const claims of [
    { type: 'WORKSPACE_AGNOSTIC' },
    { userWorkspaceId: '' },
    { workspaceId: '' },
    { isImpersonating: 'true' },
  ]) {
    expect(decodeCampaignCreationIdentity(token(claims))).toBeUndefined();
  }
  expect(decodeCampaignCreationIdentity('invalid')).toBeUndefined();
  const changed = { ...identity, workspaceMemberId: 'new-member' };
  expect(campaignCreationAttemptKey(changed)).toBe(
    campaignCreationAttemptKey(identity),
  );
  expect(campaignCreationActorKey(changed)).toBe(
    campaignCreationActorKey(identity),
  );
  expect(campaignCreationIdentityKey(changed)).not.toBe(
    campaignCreationIdentityKey(identity),
  );
});

it('observes native identity changes synchronously, preserves renewal and latches ABA generations', () => {
  const store = createStore();
  store.set(currentUserState.atom, { ...mockedUserData, id: identity.userId });
  store.set(currentWorkspaceState.atom, {
    ...mockCurrentWorkspace,
    id: identity.workspaceId,
  });
  store.set(currentWorkspaceMemberState.atom, {
    ...mockedWorkspaceMemberData,
    id: identity.workspaceMemberId,
    userWorkspaceId: identity.userWorkspaceId,
  });
  store.set(
    currentUserWorkspaceState.atom,
    mockedUserData.currentUserWorkspace,
  );
  store.set(tokenPairState.atom, tokens());
  const unsubscribe = subscribeCampaignCreationSession(store);
  try {
    const initial = store.get(campaignCreationState.atom);
    store.set(tokenPairState.atom, tokens({ exp: 1234 }));
    expect(store.get(campaignCreationState.atom)).toEqual(initial);
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: 'other',
    });
    const switched = store.get(campaignCreationState.atom);
    expect(switched.boundaryGeneration).toBeGreaterThan(
      initial.boundaryGeneration,
    );
    expect(switched.sessionGeneration).toBe(initial.sessionGeneration);
    store.set(currentWorkspaceState.atom, {
      ...mockCurrentWorkspace,
      id: identity.workspaceId,
    });
    expect(
      store.get(campaignCreationState.atom).boundaryGeneration,
    ).toBeGreaterThan(switched.boundaryGeneration);
    store.set(tokenPairState.atom, null);
    const loggedOut = store.get(campaignCreationState.atom);
    expect(loggedOut.sessionGeneration).toBeGreaterThan(
      initial.sessionGeneration,
    );
    expect(loggedOut.attempts).toEqual({});
    store.set(tokenPairState.atom, tokens());
    expect(
      store.get(campaignCreationState.atom).sessionGeneration,
    ).toBeGreaterThan(loggedOut.sessionGeneration);
  } finally {
    unsubscribe();
  }
  expect(store.get(campaignCreationState.atom).actorKey).toBeNull();
});

it('counts mounted origins independently from transient commands', () => {
  const store = createStore();
  const first = registerCampaignCreationOrigin(store, 'index');
  const second = registerCampaignCreationOrigin(store, 'index');
  expect(store.get(campaignCreationState.atom).mountedOrigins).toEqual({
    index: 2,
  });
  first();
  expect(store.get(campaignCreationState.atom).mountedOrigins).toEqual({
    index: 1,
  });
  second();
  expect(store.get(campaignCreationState.atom).mountedOrigins).toEqual({});
});

it('requires exclusively narrow duplicate errors and actual transport uncertainty shapes', () => {
  const duplicate = {
    message: 'A duplicate entry was detected',
    extensions: { code: 'BAD_USER_INPUT' },
  };
  expect(
    isCampaignCreationDuplicate(
      new CombinedGraphQLErrors({ errors: [duplicate] }),
    ),
  ).toBe(true);
  expect(
    isCampaignCreationDuplicate(
      new CombinedGraphQLErrors({
        errors: [
          duplicate,
          { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
        ],
      }),
    ),
  ).toBe(false);
  expect(
    isCampaignCreationDuplicate(
      new CombinedGraphQLErrors({
        errors: [
          { message: 'Invalid', extensions: { code: 'BAD_USER_INPUT' } },
        ],
      }),
    ),
  ).toBe(false);
  expect(isCampaignCreationTransportUncertain(new TypeError('fetch'))).toBe(
    true,
  );
  expect(isCampaignCreationTransportUncertain(new Error('local'))).toBe(false);
});
