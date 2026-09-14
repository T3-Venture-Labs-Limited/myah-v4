import { type Store } from 'jotai/vanilla/store';
import {
  campaignCreationActorKey,
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { tokenPairState } from '@/auth/states/tokenPairState';
import { type CampaignCreationState } from '@/object-record/record-index/types/CampaignCreationAttempt';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const campaignCreationState = createAtomState<CampaignCreationState>({
  key: 'campaignCreationState',
  defaultValue: {
    sessionGeneration: 0,
    boundaryGeneration: 0,
    actorKey: null,
    observedIdentityKey: null,
    nextRunId: 0,
    attempts: {},
    mountedOrigins: {},
  },
});

export const subscribeCampaignCreationSession = (
  store: Store,
): (() => void) => {
  const refresh = () => {
    const state = store.get(campaignCreationState.atom);
    const identity = decodeCampaignCreationIdentity(
      store.get(tokenPairState.atom)?.accessOrWorkspaceAgnosticToken.token,
    );
    const user = store.get(currentUserState.atom);
    const workspace = store.get(currentWorkspaceState.atom);
    const member = store.get(currentWorkspaceMemberState.atom);
    const userWorkspace = store.get(currentUserWorkspaceState.atom);
    const actorKey =
      identity && user?.id === identity.userId
        ? campaignCreationActorKey(identity)
        : null;
    const observedIdentityKey =
      actorKey && identity
        ? JSON.stringify([
            campaignCreationIdentityKey(identity),
            user?.id,
            workspace?.id,
            member?.id,
            member?.userWorkspaceId,
            userWorkspace?.objectsPermissions,
          ])
        : null;
    if (
      state.actorKey === actorKey &&
      state.observedIdentityKey === observedIdentityKey
    )
      return;
    const sessionChanged = state.actorKey !== actorKey;
    store.set(campaignCreationState.atom, {
      ...state,
      actorKey,
      observedIdentityKey,
      sessionGeneration: state.sessionGeneration + (sessionChanged ? 1 : 0),
      boundaryGeneration: state.boundaryGeneration + 1,
      attempts: sessionChanged
        ? {}
        : Object.fromEntries(
            Object.entries(state.attempts).map(([key, attempt]) => [
              key,
              attempt.runId === null
                ? attempt
                : {
                    ...attempt,
                    runId: null,
                    phase:
                      attempt.phase === 'saved'
                        ? ('saved' as const)
                        : ('unconfirmed' as const),
                    uncertain:
                      attempt.phase === 'saved' ? attempt.uncertain : true,
                  },
            ]),
          ),
    });
  };
  const unsubscribers = [
    tokenPairState.atom,
    currentUserState.atom,
    currentWorkspaceState.atom,
    currentWorkspaceMemberState.atom,
    currentUserWorkspaceState.atom,
  ].map((atom) => store.sub(atom, refresh));
  refresh();
  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    const state = store.get(campaignCreationState.atom);
    store.set(campaignCreationState.atom, {
      ...state,
      actorKey: null,
      observedIdentityKey: null,
      attempts: {},
      sessionGeneration: state.sessionGeneration + 1,
      boundaryGeneration: state.boundaryGeneration + 1,
    });
  };
};

export const registerCampaignCreationOrigin = (
  store: Store,
  recordIndexId: string,
): (() => void) => {
  const state = store.get(campaignCreationState.atom);
  store.set(campaignCreationState.atom, {
    ...state,
    mountedOrigins: {
      ...state.mountedOrigins,
      [recordIndexId]: (state.mountedOrigins[recordIndexId] ?? 0) + 1,
    },
  });
  return () => {
    const current = store.get(campaignCreationState.atom);
    const mountedOrigins = { ...current.mountedOrigins };
    const count = (mountedOrigins[recordIndexId] ?? 1) - 1;
    if (count > 0) mountedOrigins[recordIndexId] = count;
    else delete mountedOrigins[recordIndexId];
    store.set(campaignCreationState.atom, { ...current, mountedOrigins });
  };
};
