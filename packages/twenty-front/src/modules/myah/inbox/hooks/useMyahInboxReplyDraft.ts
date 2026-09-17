import { isDefined } from 'twenty-shared/utils';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { atom, useAtomValue, useStore } from 'jotai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  type MyahInboxDraftAutosaveController,
  type MyahInboxDraftTargetCapture,
} from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { myahInboxDraftAutosaveFamilyState } from '@/myah/inbox/states/myahInboxDraftAutosaveFamilyState';
import {
  myahInboxDraftKeyId,
  type MyahInboxDraftAutosaveThread,
  type MyahInboxDraftAutosaveKey,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  MyahInboxReplyDraftDocument,
  type MyahInboxReplyDraftInput,
} from '~/generated/graphql';

const emptyDraftAtom = atom(null);

// No native identity is guessed from the opaque contact ID. Only a matching,
// authorized server response may create an editor/autosave capability.
export const useMyahInboxReplyDraft = (
  input: MyahInboxReplyDraftInput | null,
  controller: MyahInboxDraftAutosaveController,
  authorizationScope = '',
) => {
  const client = useApolloCoreClient();
  const store = useStore();
  const { reviewContext } = useMyahInboxThreadMutations();
  const [editorOwner] = useState(() => Symbol('Inbox draft editor'));
  const [readEpoch, setReadEpoch] = useState(0);
  const scope = useMemo(
    () => ({ input, client, authorizationScope, readEpoch }),
    [input, client, authorizationScope, readEpoch],
  );
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [state, setState] = useState<{
    scope: typeof scope;
    key: MyahInboxDraftAutosaveKey | null;
    status: 'ready' | 'denied' | 'occupied';
  } | null>(null);
  useEffect(() => {
    if (!input) return;
    const abort = new AbortController();
    let capture: MyahInboxDraftTargetCapture | null = null;
    let ownedKey: MyahInboxDraftAutosaveKey | null = null;
    const isCurrent = () =>
      scopeRef.current === scope &&
      !abort.signal.aborted &&
      store.get(currentWorkspaceState.atom)?.id === input.expectedWorkspaceId;
    const readDraft =
      async (): Promise<MyahInboxDraftAutosaveThread | null> => {
        const response = await client.query({
          query: MyahInboxReplyDraftDocument,
          variables: { input },
          fetchPolicy: 'no-cache',
          errorPolicy: 'none',
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: abort.signal },
          },
        });
        if (!isCurrent()) return null;
        const draft = response.data?.myahInboxReplyDraft;
        const resolved = draft?.resolvedContext;
        if (
          !isDefined(draft) ||
          isDefined(response.error) ||
          !resolved ||
          resolved.kind !== input.replyContext.kind ||
          (resolved.campaignId ?? null) !==
            (input.replyContext.campaignId ?? null) ||
          resolved.target.channel !== input.target.channel ||
          resolved.target.deliveryTargetId !==
            (input.target.threadId ?? input.target.conversationId) ||
          !resolved.target.contactAnchorKind ||
          !resolved.target.contactAnchorId
        )
          throw new Error('Inbox draft context changed');
        return {
          key: {
            workspaceId: input.expectedWorkspaceId,
            contactAnchorKind: resolved.target.contactAnchorKind,
            contactAnchorId: resolved.target.contactAnchorId,
            channel: resolved.target.channel,
            deliveryTargetId: resolved.target.deliveryTargetId,
            contextKind: resolved.kind,
            campaignId: resolved.campaignId ?? null,
          },
          input,
          revision: draft.revision,
          body: draft.body
            ? {
                markdown: draft.body.markdown,
                blocknote: draft.body.blocknote ?? null,
              }
            : null,
          executionState: draft.executionState,
          contextFingerprint: resolved.contextFingerprint ?? null,
        };
      };
    const refreshAfterSave = async (revision: number) => {
      try {
        const thread = await readDraft();
        if (!isCurrent()) return null;
        if (
          !thread ||
          !ownedKey ||
          myahInboxDraftKeyId(thread.key) !== myahInboxDraftKeyId(ownedKey) ||
          thread.revision !== revision
        )
          throw new Error('Inbox draft revision changed');
        return thread;
      } catch {
        if (isCurrent()) setState({ scope, key: null, status: 'denied' });
        return null;
      }
    };
    void readDraft()
      .then((thread) => {
        if (!thread || !isCurrent()) return;
        const key = thread.key;
        if (!controller.claimEditor(key, editorOwner)) {
          setState({ scope, key: null, status: 'occupied' });
          return;
        }
        ownedKey = key;
        capture = controller.beginTargetRead(key, isCurrent, refreshAfterSave);
        const authorized = controller.authorizeTarget(capture, thread);
        setState({
          scope,
          key: authorized ? key : null,
          status: authorized ? 'ready' : 'denied',
        });
      })
      .catch(() => {
        if (isCurrent()) setState({ scope, key: null, status: 'denied' });
      });
    return () => {
      abort.abort();
      if (capture) controller.invalidateTarget(capture);
      if (ownedKey) controller.releaseEditor(ownedKey, editorOwner);
    };
  }, [client, controller, editorOwner, input, scope, store]);
  const current = state?.scope === scope ? state : null;
  const key = current?.key ?? null;
  const entry = useAtomValue(
    key ? myahInboxDraftAutosaveFamilyState.atomFamily(key) : emptyDraftAtom,
  );
  const review = async () => {
    if (!key || !entry?.input || !entry.contextFingerprint) return false;
    const capture = controller.acquire(key, 'reviewing', editorOwner);
    if (!capture) return false;
    try {
      await reviewContext({
        ...entry.input,
        expectedDraftRevision: capture.confirmedRevision,
        expectedContextFingerprint: entry.contextFingerprint,
      });
      if (!controller.isOperationCurrent(capture)) return false;
      // Reauthorize the exact key from a new read, rather than applying mutation bytes.
      setReadEpoch((epoch) => epoch + 1);
      return true;
    } catch {
      return false;
    } finally {
      controller.release(capture);
    }
  };
  return {
    key,
    entry,
    editorOwner,
    review,
    status: current?.status ?? (input ? 'loading' : 'denied'),
    reload: () => setReadEpoch((epoch) => epoch + 1),
  };
};
