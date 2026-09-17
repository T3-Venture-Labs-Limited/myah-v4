import { useMemo, useRef, useState } from 'react';
import { type MyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxDraftAutosaveKey } from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { type ReplyContextInput } from '~/generated/graphql';

export const useMyahInboxReplyContextSelection = (
  scope: string,
  defaultContext: ReplyContextInput | null,
  outgoingKey: MyahInboxDraftAutosaveKey | null,
  controller: MyahInboxDraftAutosaveController,
) => {
  const scopeToken = useMemo(() => ({ scope }), [scope]);
  const [selection, setSelection] = useState<{
    scope: typeof scopeToken;
    context: ReplyContextInput;
  } | null>(null);
  // The pending transition owns a single commit; navigation invalidates it at render.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(scopeToken);
  scopeRef.current = scopeToken;
  // oxlint-disable-next-line twenty/no-state-useref
  const pendingRef = useRef<symbol | null>(null);
  const select = async (context: ReplyContextInput) => {
    if (pendingRef.current) return false;
    const token = Symbol('reply context selection');
    pendingRef.current = token;
    try {
      if (outgoingKey && !(await controller.flushKeys([outgoingKey])))
        return false;
      if (scopeRef.current !== scopeToken || pendingRef.current !== token)
        return false;
      setSelection({ scope: scopeToken, context });
      return true;
    } catch {
      return false;
    } finally {
      if (pendingRef.current === token) pendingRef.current = null;
    }
  };
  return {
    replyContext:
      selection?.scope === scopeToken ? selection.context : defaultContext,
    select,
  };
};
