import { isDefined } from 'twenty-shared/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  MyahInboxReplyContextOptionsDocument,
  ReplyContextKind,
  type MyahInboxReplyContextOptionsInput,
  type MyahInboxReplyContextOptionsQuery,
  type ReplyContextInput,
} from '~/generated/graphql';

type ContextPage =
  MyahInboxReplyContextOptionsQuery['myahInboxReplyContextOptions'];
export type MyahInboxReplyContextOption = {
  value: string;
  label: string;
  replyContext: ReplyContextInput;
};

export const useMyahInboxReplyContextOptions = (
  input: MyahInboxReplyContextOptionsInput | null,
) => {
  const client = useApolloCoreClient();
  const scope = useMemo(() => ({ input, client }), [input, client]);
  // Render-time identity rejects results before effect cleanup runs.
  // oxlint-disable-next-line twenty/no-state-useref
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [state, setState] = useState<{
    scope: typeof scope;
    options: MyahInboxReplyContextOption[];
    defaultContext: ContextPage['defaultContext'];
    error: Error | null;
  } | null>(null);
  useEffect(() => {
    if (!input) return;
    const abort = new AbortController();
    const isCurrent = () => scopeRef.current === scope && !abort.signal.aborted;
    const load = async () => {
      const options = new Map<string, MyahInboxReplyContextOption>();
      const cursors = new Set<string>();
      let after = input.after;
      let firstPage: ContextPage | null = null;
      while (isCurrent()) {
        const response = await client.query({
          query: MyahInboxReplyContextOptionsDocument,
          variables: { input: { ...input, ...(after ? { after } : {}) } },
          fetchPolicy: 'no-cache',
          errorPolicy: 'none',
          context: {
            queryDeduplication: false,
            fetchOptions: { signal: abort.signal },
          },
        });
        if (!isCurrent()) return;
        const page = response.data?.myahInboxReplyContextOptions;
        if (!isDefined(page) || isDefined(response.error))
          throw new Error('Reply contexts unavailable');
        firstPage ??= page;
        for (const { node } of page.edges) {
          const value = `CAMPAIGN:${node.id}`;
          options.set(value, {
            value,
            label: node.name,
            replyContext: {
              kind: ReplyContextKind.CAMPAIGN,
              campaignId: node.id,
            },
          });
        }
        if (!page.pageInfo.hasNextPage) {
          if (firstPage.generalAvailable)
            options.set('GENERAL', {
              value: 'GENERAL',
              label: 'General',
              replyContext: { kind: ReplyContextKind.GENERAL },
            });
          setState({
            scope,
            options: [...options.values()],
            defaultContext: firstPage.defaultContext,
            error: null,
          });
          return;
        }
        after = page.pageInfo.endCursor;
        if (!after || cursors.has(after))
          throw new Error('Invalid reply context pagination');
        cursors.add(after);
      }
    };
    void load().catch(() => {
      if (isCurrent())
        setState({
          scope,
          options: [],
          defaultContext: null,
          error: new Error('Reply contexts unavailable'),
        });
    });
    return () => abort.abort();
  }, [client, input, scope]);
  const current = state?.scope === scope ? state : null;
  return {
    options: current?.options ?? [],
    defaultContext: current?.defaultContext ?? null,
    error: current?.error ?? null,
    loading: Boolean(input && !current),
  };
};
