import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { GraphQLError } from 'graphql';

import { useMyahInboxEmailHistory } from '@/myah/inbox/hooks/useMyahInboxEmailHistory';
import {
  type MyahInboxEmailCardFieldsFragment,
  type MyahInboxEmailMessagePageFieldsFragment,
  type MyahInboxContactEmailCardsQuery,
} from '~/generated/graphql';

const card = (threadId: string): MyahInboxEmailCardFieldsFragment => ({
  threadId,
  rootMessageId: `${threadId}-root`,
  startTimestamp: '2026-09-01T00:00:00.000001Z',
  subject: `Subject ${threadId}`,
  campaignLabel: 'Campaign',
  historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
});
const cards = (
  ids: string[],
  snapshot = 'snapshot-1',
  olderCursor: string | null = null,
) => ({
  myahInboxContactEmailCards: {
    cards: ids.map(card),
    snapshot,
    olderCursor,
    latestThreadId: ids.at(-1) ?? null,
  },
});

const message = (id: string, threadId = 't9') => ({
  id,
  messageThreadId: threadId,
  subject: 'Subject',
  text: `Body ${id}`,
  receivedAt: '2026-09-01T00:00:00.000001Z',
  direction: 'INCOMING',
  visibility: 'FULL',
  participants: [
    { role: 'from', handle: 'sender@example.test', displayName: 'Sender' },
  ],
  attachmentFileIds: ['attachment'],
});
const page = (
  ids: string[],
  olderCursor: string | null = null,
  newerCursor: string | null = null,
  threadId = 't9',
) => ({
  threadId,
  root: message(`${threadId}-root`, threadId),
  messages: ids.map((id) => message(id, threadId)),
  olderCursor,
  newerCursor,
});

type Request = {
  name: string;
  variables: Record<string, unknown>;
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  partial: (data: Record<string, unknown>) => void;
};
const setup = (strict = false) => {
  const requests: Request[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          requests.push({
            name: operation.operationName ?? '',
            variables: operation.variables,
            resolve: (data) => {
              observer.next({ data });
              observer.complete();
            },
            reject: (error) => observer.error(error),
            partial: (data) => {
              observer.next({ data, errors: [new GraphQLError('Forbidden')] });
              observer.complete();
            },
          });
        }),
    ),
  });
  // Exercise a permissive client without changing the app's global Apollo type declaration.
  Object.assign(client.defaultOptions, { query: { errorPolicy: 'all' } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApolloProvider client={client}>{children}</ApolloProvider>
  );
  const hook = renderHook(
    ({ workspaceId, contactId, authorizationKey }) =>
      useMyahInboxEmailHistory(workspaceId, contactId, authorizationKey),
    {
      wrapper,
      reactStrictMode: strict,
      initialProps: {
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        authorizationKey: 'member-1',
      },
    },
  );
  return { hook, requests, client };
};
const respond = async (request: Request, data: Record<string, unknown>) => {
  await act(async () => request.resolve(data));
};

describe('useMyahInboxEmailHistory', () => {
  it('keeps replay frontiers navigable and re-locates replies displaced by a moving tail', async () => {
    const { hook, requests } = setup();
    const ids = (first: number, last: number) =>
      Array.from(
        { length: last - first + 1 },
        (_, index) => `m${first + index}`,
      );
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.openCard(
        hook.result.current.segments[0].id,
        't9',
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailCardMessages: page(ids(81, 100), 'before-81'),
    });
    const windowId = hook.result.current.windows[0].id;
    act(() => {
      hook.result.current.setReadingAnchor(windowId, 'm85');
      void hook.result.current.loadMessages(windowId, 'older');
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailCardMessages: page(
        ids(61, 80),
        'before-61',
        'after-80',
      ),
    });
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    await respond(requests[3], {
      myahInboxContactEmailCard: { snapshot: 'current', card: card('t9') },
    });
    await waitFor(() => expect(requests).toHaveLength(5));
    await respond(requests[4], cards(['t9']));
    await waitFor(() => expect(requests).toHaveLength(6));
    expect(requests[5].variables).toMatchObject({ snapshot: 'snapshot-1' });
    expect(requests[5].variables.cursor).toBeUndefined();
    await respond(requests[5], {
      myahInboxContactEmailCardMessages: page(ids(91, 110), 'before-91'),
    });
    await waitFor(() => expect(requests).toHaveLength(7));
    expect(requests[6].variables.cursor).toBe('before-81');
    await respond(requests[6], {
      myahInboxContactEmailCardMessages: page(
        ids(61, 80),
        'before-61',
        'after-80',
      ),
    });
    await waitFor(() => expect(requests).toHaveLength(8));
    expect(requests[7].variables).toMatchObject({
      snapshot: 'snapshot-1',
      messageId: 'm85',
    });
    // Neither stale bodies nor an unrenderable reading anchor are published in flight.
    expect(hook.result.current.windows).toEqual([]);
    await respond(requests[7], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm85',
        card: card('t9'),
        page: page(ids(66, 85), 'before-66', 'after-85'),
      },
    });
    await waitFor(() => expect(requests).toHaveLength(9));
    expect(requests[8].variables.messageId).toBe('m90');
    await respond(requests[8], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm90',
        card: card('t9'),
        page: page(ids(71, 90), 'before-71', 'after-90'),
      },
    });
    await waitFor(() => expect(requests).toHaveLength(10));
    await respond(requests[9], cards(['t9'], 'snapshot-2'));
    expect(hook.result.current.status).toBe('ready');
    const windows = hook.result.current.windows;
    expect(windows).toHaveLength(4);
    expect(windows.find(({ id }) => id === windowId)).toMatchObject({
      anchorMessageId: 'm85',
      pages: [
        {
          messages: expect.arrayContaining([
            expect.objectContaining({ id: 'm85' }),
          ]),
        },
      ],
    });
    const displayed = new Set(
      windows.flatMap((window) =>
        window.pages.flatMap((page) =>
          page.messages.map((message) => message.id),
        ),
      ),
    );
    for (const id of ids(61, 110)) expect(displayed.has(id)).toBe(true);
    const older = windows.find((window) => window.olderCursor === 'before-61')!;
    const tail = windows.find((window) => window.olderCursor === 'before-91')!;
    expect(older.newerCursor).toBe('after-80');
    expect(tail.newerCursor).toBeNull();
    act(() => {
      void hook.result.current.loadMessages(older.id, 'newer');
    });
    await waitFor(() => expect(requests).toHaveLength(11));
    expect(requests[10].variables).toMatchObject({
      cursor: 'after-80',
      snapshot: 'snapshot-1',
    });
    await respond(requests[10], {
      myahInboxContactEmailCardMessages: page(
        ids(81, 100),
        'before-81',
        'after-100',
      ),
    });
    act(() => {
      void hook.result.current.loadMessages(tail.id, 'older');
    });
    await waitFor(() => expect(requests).toHaveLength(12));
    expect(requests[11].variables).toMatchObject({
      cursor: 'before-91',
      snapshot: 'snapshot-1',
    });
    await respond(requests[11], {
      myahInboxContactEmailCardMessages: page(
        ids(71, 90),
        'before-71',
        'after-90',
      ),
    });
    expect(
      hook.result.current.windows.find(({ id }) => id === older.id),
    ).toMatchObject({
      olderCursor: 'before-61',
      newerCursor: 'after-100',
      pages: [{}, {}],
    });
    expect(
      hook.result.current.windows.find(({ id }) => id === tail.id),
    ).toMatchObject({
      olderCursor: 'before-71',
      newerCursor: null,
      pages: [{}, {}],
    });
  });

  it('re-locates a displayed former root outside restored reply pages on rebase', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.openCard(
        hook.result.current.segments[0].id,
        't9',
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailCardMessages: page(['m100'], 'before-100'),
    });
    const windowId = hook.result.current.windows[0].id;
    // The old root was displayed, but was never selected as the reading anchor.
    const nextCard = { ...card('t9'), rootMessageId: 'earlier-root' };
    const nextPage = (
      ids: string[],
      older: string | null,
      newer: string | null,
    ) => ({
      ...page(ids, older, newer),
      root: message('earlier-root'),
    });
    act(() => {
      void hook.result.current.rebase();
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailCards: {
        ...cards(['t9'], 'snapshot-2').myahInboxContactEmailCards,
        cards: [nextCard],
      },
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    await respond(requests[3], {
      myahInboxContactEmailCard: { snapshot: 'snapshot-2', card: nextCard },
    });
    await waitFor(() => expect(requests).toHaveLength(5));
    expect(requests[4].variables.messageId).toBe('m100');
    await respond(requests[4], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm100',
        card: nextCard,
        page: nextPage(['m100'], 'before-100', null),
      },
    });
    await waitFor(() => expect(requests).toHaveLength(6));
    expect(requests[5].variables).toMatchObject({
      messageId: 't9-root',
      snapshot: 'snapshot-2',
    });
    expect(hook.result.current.windows).toEqual([]);
    await respond(requests[5], {
      myahInboxContactEmailMessageLocation: {
        messageId: 't9-root',
        card: nextCard,
        page: nextPage(['t9-root'], null, 'after-old-root'),
      },
    });
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.windows).toHaveLength(2);
    expect(hook.result.current.windows[0].id).toBe(windowId);
    expect(hook.result.current.windows[1]).toMatchObject({
      newerCursor: 'after-old-root',
      pages: [{ root: { id: 'earlier-root' }, messages: [{ id: 't9-root' }] }],
    });
    expect(hook.result.current.missingMessageIds).toEqual([]);
  });

  it('keeps reading-anchor changes made while an older message request is in flight', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.openCard(
        hook.result.current.segments[0].id,
        't9',
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailCardMessages: page(['m80', 'm81'], 'before-80'),
    });
    const windowId = hook.result.current.windows[0].id;
    act(() => {
      void hook.result.current.loadMessages(windowId, 'older');
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    act(() => hook.result.current.setReadingAnchor(windowId, 'm81'));
    await respond(requests[2], {
      myahInboxContactEmailCardMessages: page(['m60'], 'before-60', 'after-60'),
    });
    expect(hook.result.current.windows[0].anchorMessageId).toBe('m81');
    expect(hook.result.current.windows[0].pages).toHaveLength(2);
    expect(hook.result.current.windows[0].olderCursor).toBe('before-60');
  });

  it('preserves explicit rebased history gaps across a contact round trip', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.rebase();
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], cards(['t14'], 'snapshot-2'));
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailCard: { snapshot: 'snapshot-2', card: card('t9') },
    });
    hook.rerender({
      workspaceId: 'workspace-1',
      contactId: 'contact-2',
      authorizationKey: 'member-1',
    });
    await respond(requests[3], cards(['other']));
    hook.rerender({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      authorizationKey: 'member-1',
    });
    await waitFor(() => expect(requests).toHaveLength(6));
    for (const request of requests.slice(4, 6))
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'snapshot-3',
          card: card(request.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(7));
    await respond(requests[6], cards(['t14'], 'snapshot-2'));
    await waitFor(() => expect(requests).toHaveLength(8));
    await respond(requests[7], cards(['t14'], 'snapshot-3'));
    expect(hook.result.current.detachedCards[0].card.threadId).toBe('t9');
    expect(hook.result.current.historyRebased).toBe(true);
  });

  it('replays every loaded card frontier and serializes duplicate pagination clicks', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9'], 'snapshot-1', 'older-9'));
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], cards(['t6'], 'snapshot-1', 'older-6'));
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    for (const request of requests.slice(2, 4))
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'current',
          card: {
            ...card(request.variables.threadId as string),
            campaignLabel: null,
          },
        },
      });
    await waitFor(() => expect(requests).toHaveLength(5));
    expect(requests[4].variables.olderCursor).toBeUndefined();
    await respond(requests[4], cards(['t9'], 'snapshot-1', 'older-9'));
    await waitFor(() => expect(requests).toHaveLength(6));
    expect(requests[5].variables).toMatchObject({
      snapshot: 'snapshot-1',
      olderCursor: 'older-9',
    });
    await respond(requests[5], cards(['t6'], 'snapshot-1', 'older-6'));
    await waitFor(() => expect(requests).toHaveLength(7));
    await respond(requests[6], cards(['t14'], 'snapshot-2', 'older-14'));
    expect(hook.result.current.segments[1].pages[1].cards[0]).toEqual({
      ...card('t6'),
      campaignLabel: null,
    });
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(8));
    expect(requests[7].variables).toMatchObject({
      snapshot: 'snapshot-1',
      olderCursor: 'older-6',
    });
    await respond(requests[7], cards(['t3'], 'snapshot-1'));
    expect(hook.result.current.segments[1].pages).toHaveLength(3);
  });

  it('ignores superseded refresh completion without losing the recovery plan', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[1], {
      myahInboxContactEmailCard: { snapshot: 'stale', card: card('t9') },
    });
    expect(hook.result.current.segments).toEqual([]);
    expect(requests).toHaveLength(3);
    await respond(requests[2], {
      myahInboxContactEmailCard: {
        snapshot: 'current',
        card: { ...card('t9'), subject: null },
      },
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    await respond(requests[3], cards(['t9']));
    await waitFor(() => expect(requests).toHaveLength(5));
    await respond(requests[4], cards(['t14'], 'snapshot-2'));
    expect(
      hook.result.current.segments[1].pages[0].cards[0].subject,
    ).toBeNull();
    expect(hook.result.current.loading).toBe(false);
  });

  it('rejects partial GraphQL projections even when the shared client accepts partial data', async () => {
    const { hook, requests, client } = setup();
    await act(async () => requests[0].partial(cards(['restricted'])));
    expect(hook.result.current.status).toBe('needs-rebase');
    expect(hook.result.current.segments).toEqual([]);
    expect(client.cache.extract()).toEqual({});
  });

  it('retains a newer gap when the located first page disappears during replay', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.locateMessage('m80');
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm80',
        card: card('t9'),
        page: page(['m80'], 'before-80', 'after-80'),
      },
    });
    const windowId = hook.result.current.windows[0].id;
    act(() => {
      void hook.result.current.loadMessages(windowId, 'older');
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailCardMessages: page(['m60'], 'before-60', 'after-60'),
    });
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    await respond(requests[3], {
      myahInboxContactEmailCard: { snapshot: 'current', card: card('t9') },
    });
    await waitFor(() => expect(requests).toHaveLength(5));
    await respond(requests[4], cards(['t9']));
    await waitFor(() => expect(requests).toHaveLength(6));
    await respond(requests[5], { myahInboxContactEmailMessageLocation: null });
    await waitFor(() => expect(requests).toHaveLength(7));
    expect(requests[6].variables).toMatchObject({
      snapshot: 'snapshot-1',
      cursor: 'before-80',
    });
    await respond(requests[6], {
      myahInboxContactEmailCardMessages: page(['m60'], 'before-60', 'after-60'),
    });
    await waitFor(() => expect(requests).toHaveLength(8));
    await respond(requests[7], cards(['t9'], 'snapshot-2'));
    expect(hook.result.current.windows[0]).toMatchObject({
      olderCursor: 'before-60',
      newerCursor: 'after-60',
      anchorMessageId: null,
      requests: [{ cursor: 'before-80', direction: 'older' }],
    });
    expect(hook.result.current.missingMessageIds).toEqual(['m80']);
  });

  it('reports a no-longer-locatable anchor and retains newly authorized cards returned by replay', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.locateMessage('m80');
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm80',
        card: card('t9'),
        page: page(['m80']),
      },
    });
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailCard: { snapshot: 'current', card: card('t9') },
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    await respond(requests[3], cards(['t8', 't9']));
    await waitFor(() => expect(requests).toHaveLength(5));
    await respond(requests[4], { myahInboxContactEmailMessageLocation: null });
    await waitFor(() => expect(requests).toHaveLength(6));
    // Losing the located reply does not discard the displayed, still-readable root.
    expect(requests[5].variables.messageId).toBe('t9-root');
    await respond(requests[5], {
      myahInboxContactEmailMessageLocation: {
        messageId: 't9-root',
        card: card('t9'),
        page: page([]),
      },
    });
    await waitFor(() => expect(requests).toHaveLength(7));
    await respond(requests[6], cards(['t8', 't9']));
    expect(hook.result.current.windows).toHaveLength(1);
    expect(hook.result.current.windows[0]).toMatchObject({
      anchorMessageId: 't9-root',
      pages: [{ root: { id: 't9-root' }, messages: [] }],
    });
    expect(hook.result.current.missingMessageIds).toEqual(['m80']);
    expect(hook.result.current.segments[0].pages[0].cards).toEqual([
      card('t8'),
      card('t9'),
    ]);
  });

  it('can open a retained detached card after rebase and purges it on null revalidation', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.rebase();
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], cards(['t14'], 'snapshot-2'));
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailCard: { snapshot: 'snapshot-2', card: card('t9') },
    });
    act(() => {
      void hook.result.current.openDetachedCard('t9');
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    expect(requests[3].variables).toMatchObject({
      threadId: 't9',
      snapshot: 'snapshot-2',
    });
    await respond(requests[3], {
      myahInboxContactEmailCardMessages: page(['m80']),
    });
    expect(hook.result.current.windows[0].threadId).toBe('t9');
    act(() => {
      void hook.result.current.refresh();
    });
    expect(hook.result.current.detachedCards).toEqual([]);
    await waitFor(() => expect(requests).toHaveLength(6));
    for (const request of requests.slice(4, 6))
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'snapshot-3',
          card: request.variables.threadId === 't9' ? null : card('t14'),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(7));
    await respond(requests[6], cards(['t14'], 'snapshot-2'));
    await waitFor(() => expect(requests).toHaveLength(8));
    await respond(requests[7], cards(['t14'], 'snapshot-3'));
    expect(hook.result.current.detachedCards).toEqual([]);
    expect(hook.result.current.windows).toEqual([]);
  });

  it('revalidates saved contact windows on return without retaining their displayed bodies', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9']));
    act(() => {
      void hook.result.current.locateMessage('m80');
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm80',
        card: card('t9'),
        page: page(['m80']),
      },
    });
    const windowId = hook.result.current.windows[0].id;
    hook.rerender({
      workspaceId: 'workspace-1',
      contactId: 'contact-2',
      authorizationKey: 'member-1',
    });
    expect(hook.result.current.windows).toEqual([]);
    await respond(requests[2], cards(['other'], 'other-snapshot'));
    hook.rerender({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      authorizationKey: 'member-1',
    });
    expect(hook.result.current.windows).toEqual([]);
    await waitFor(() => expect(requests).toHaveLength(4));
    expect(requests[3].name).toBe('MyahInboxContactEmailCard');
    await respond(requests[3], {
      myahInboxContactEmailCard: { snapshot: 'snapshot-2', card: card('t9') },
    });
    await waitFor(() => expect(requests).toHaveLength(5));
    await respond(requests[4], cards(['t9']));
    await waitFor(() => expect(requests).toHaveLength(6));
    expect(requests[5].variables.messageId).toBe('m80');
    await respond(requests[5], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm80',
        card: card('t9'),
        page: { ...page(['m80']), root: { ...message('t9-root'), text: null } },
      },
    });
    await waitFor(() => expect(requests).toHaveLength(7));
    await respond(requests[6], cards(['t9'], 'snapshot-2'));
    expect(hook.result.current.windows[0]).toMatchObject({
      id: windowId,
      anchorMessageId: 'm80',
    });
    expect(hook.result.current.windows[0].pages[0].root.text).toBeNull();
  });

  it('retains a fresh frontier when the same head has an older backfilled root', async () => {
    const { hook, requests } = setup();
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-1', 'older-1'),
    );
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(['t0'], 'snapshot-1'));

    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    for (const request of requests.splice(0))
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'snapshot-2',
          card: card(request.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-1', 'older-1'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(['t0'], 'snapshot-1'));
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-2', 'fresh-older'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].variables).toMatchObject({
      snapshot: 'snapshot-2',
      olderCursor: 'fresh-older',
    });
    await respond(requests.shift()!, cards(['late-root'], 'snapshot-2'));

    const fresh = hook.result.current.segments.find(
      (segment) => segment.snapshot === 'snapshot-2',
    );
    expect(fresh).toMatchObject({ olderCursor: null });
    expect(
      fresh?.pages.flatMap((page) => page.cards.map((card) => card.threadId)),
    ).toEqual(['t2', 't1', 'late-root']);
  });

  it('stops fresh reconciliation at the prior loaded-page budget', async () => {
    const { hook, requests } = setup();
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-1', 'older-1'),
    );

    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    for (const request of requests.splice(0))
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'snapshot-2',
          card: card(request.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-1', 'older-1'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-2', 'fresh-older'),
    );

    expect(hook.result.current.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          snapshot: 'snapshot-2',
          olderCursor: 'fresh-older',
          pages: [expect.any(Object)],
        }),
      ]),
    );
    expect(requests).toHaveLength(0);
  });

  it('replaces, rather than accumulates, unclicked refresh frontiers', async () => {
    const { hook, requests } = setup();
    await respond(
      requests.shift()!,
      cards(['t2', 't1'], 'snapshot-1', 'older-1'),
    );

    const refresh = async (snapshot: string) => {
      act(() => {
        void hook.result.current.refresh();
      });
      await waitFor(() => expect(requests).toHaveLength(2));
      for (const request of requests.splice(0))
        await respond(request, {
          myahInboxContactEmailCard: {
            snapshot,
            card: card(request.variables.threadId as string),
          },
        });
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0].variables).toMatchObject({ snapshot: 'snapshot-1' });
      await respond(
        requests.shift()!,
        cards(['t2', 't1'], 'snapshot-1', 'older-1'),
      );
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0].variables.snapshot).toBeUndefined();
      await respond(requests.shift()!, cards(['t2', 't1'], snapshot, 'older'));
    };

    await refresh('snapshot-2');
    await refresh('snapshot-3');
    await refresh('snapshot-4');

    expect(hook.result.current.cardPageBudget).toBe(1);
    expect(hook.result.current.segments).toEqual([
      expect.objectContaining({ origin: 'refresh', snapshot: 'snapshot-4' }),
      expect.objectContaining({ origin: 'retained', snapshot: 'snapshot-1' }),
    ]);
    expect(
      hook.result.current.segments.flatMap((segment) => segment.requests),
    ).toEqual([undefined, undefined]);
    expect(requests).toEqual([]);
  });

  it('keeps a partially loaded two-page budget bounded through three contact returns', async () => {
    const { hook, requests } = setup();
    const retainedHead = ['t9', 't8', 't7'];
    const retainedOlder = ['t6', 't5', 't4'];
    const retainedSnapshot = 'retained-snapshot';
    await respond(
      requests.shift()!,
      cards(retainedHead, retainedSnapshot, 'retained-older'),
    );
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedOlder, retainedSnapshot, 'retained-tail'),
    );
    expect(hook.result.current.cardPageBudget).toBe(2);

    for (const visit of [1, 2, 3]) {
      hook.rerender({
        workspaceId: 'workspace-1',
        contactId: `contact-b-${visit}`,
        authorizationKey: 'member-1',
      });
      await waitFor(() => expect(requests).toHaveLength(1));
      await respond(requests.shift()!, cards([`b${visit}`], `b-${visit}`));
      hook.rerender({
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        authorizationKey: 'member-1',
      });

      await waitFor(() =>
        expect(
          requests.filter(
            (request) => request.name === 'MyahInboxContactEmailCard',
          ),
        ).toHaveLength(6),
      );
      for (const projection of requests.splice(0))
        await respond(projection, {
          myahInboxContactEmailCard: {
            snapshot: `projection-${visit}`,
            card: card(projection.variables.threadId as string),
          },
        });

      await waitFor(() => expect(requests).toHaveLength(1));
      const retainedReplayHead = requests.shift()!;
      expect(retainedReplayHead.variables).toMatchObject({
        snapshot: retainedSnapshot,
      });
      expect(retainedReplayHead.variables.olderCursor).toBeUndefined();
      await respond(
        retainedReplayHead,
        cards(retainedHead, retainedSnapshot, 'retained-older'),
      );
      await waitFor(() => expect(requests).toHaveLength(1));
      const retainedReplayOlder = requests.shift()!;
      expect(retainedReplayOlder.variables).toMatchObject({
        snapshot: retainedSnapshot,
        olderCursor: 'retained-older',
      });
      await respond(
        retainedReplayOlder,
        cards(retainedOlder, retainedSnapshot, 'retained-tail'),
      );

      await waitFor(() => expect(requests).toHaveLength(1));
      const freshHead = requests.shift()!;
      expect(freshHead.variables.snapshot).toBeUndefined();
      await respond(
        freshHead,
        cards(retainedHead, `fresh-${visit}`, `fresh-older-${visit}`),
      );
      await waitFor(() => expect(requests).toHaveLength(1));
      const freshContinuation = requests.shift()!;
      expect(freshContinuation.variables).toMatchObject({
        snapshot: `fresh-${visit}`,
        olderCursor: `fresh-older-${visit}`,
      });
      await respond(
        freshContinuation,
        cards(retainedOlder, `fresh-${visit}`, `fresh-tail-${visit}`),
      );

      expect(requests).toEqual([]);
      expect(hook.result.current.cardPageBudget).toBe(2);
      expect(
        hook.result.current.segments.filter(
          (segment) => segment.origin === 'refresh',
        ),
      ).toEqual([
        expect.objectContaining({
          snapshot: `fresh-${visit}`,
          olderCursor: `fresh-tail-${visit}`,
          pages: [expect.any(Object), expect.any(Object)],
        }),
      ]);
      expect(
        hook.result.current.segments
          .flatMap((segment) => segment.pages)
          .flatMap((page) => page.cards)
          .map((current) => current.threadId),
      ).toEqual(expect.arrayContaining([...retainedHead, ...retainedOlder]));
      expect(
        hook.result.current.segments
          .flatMap((segment) => segment.pages)
          .flatMap((page) => page.cards)
          .some((current) => current.threadId.startsWith('unknown')),
      ).toBe(false);
      expect(
        hook.result.current.segments.find(
          (segment) => segment.origin === 'retained',
        )?.olderCursor,
      ).toBe('retained-tail');
    }
  });

  it('ignores a late fresh continuation after contact suspension without changing the saved budget', async () => {
    const { hook, requests } = setup();
    const retainedHead = ['t9', 't8', 't7'];
    const retainedOlder = ['t6', 't5', 't4'];
    const retainedSnapshot = 'retained-snapshot';
    await respond(
      requests.shift()!,
      cards(retainedHead, retainedSnapshot, 'retained-older'),
    );
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedOlder, retainedSnapshot, 'retained-tail'),
    );
    expect(hook.result.current.cardPageBudget).toBe(2);

    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() =>
      expect(
        requests.filter(
          (request) => request.name === 'MyahInboxContactEmailCard',
        ),
      ).toHaveLength(6),
    );
    for (const projection of requests.splice(0))
      await respond(projection, {
        myahInboxContactEmailCard: {
          snapshot: 'projection-before-suspend',
          card: card(projection.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedHead, retainedSnapshot, 'retained-older'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedOlder, retainedSnapshot, 'retained-tail'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedHead, 'fresh-before-suspend', 'fresh-before-tail'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    const lateContinuation = requests.shift()!;
    expect(lateContinuation).toMatchObject({
      name: 'MyahInboxContactEmailCards',
      variables: {
        snapshot: 'fresh-before-suspend',
        olderCursor: 'fresh-before-tail',
      },
    });

    hook.rerender({
      workspaceId: 'workspace-1',
      contactId: 'contact-b',
      authorizationKey: 'member-1',
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(['b1'], 'b-snapshot'));
    await respond(
      lateContinuation,
      cards(['late-stale-card'], 'fresh-before-suspend'),
    );
    expect(hook.result.current.cardPageBudget).toBe(1);
    expect(
      hook.result.current.segments.flatMap((segment) =>
        segment.pages.flatMap((page) =>
          page.cards.map((current) => current.threadId),
        ),
      ),
    ).toEqual(['b1']);

    hook.rerender({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      authorizationKey: 'member-1',
    });
    await waitFor(() =>
      expect(
        requests.filter(
          (request) => request.name === 'MyahInboxContactEmailCard',
        ),
      ).toHaveLength(6),
    );
    for (const projection of requests.splice(0))
      await respond(projection, {
        myahInboxContactEmailCard: {
          snapshot: 'projection-after-suspend',
          card: card(projection.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedHead, retainedSnapshot, 'retained-older'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedOlder, retainedSnapshot, 'retained-tail'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(retainedHead, 'fresh-after-suspend', 'fresh-after-tail'),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    const recoveryContinuation = requests.shift()!;
    expect(recoveryContinuation.variables).toMatchObject({
      snapshot: 'fresh-after-suspend',
      olderCursor: 'fresh-after-tail',
    });
    await respond(
      recoveryContinuation,
      cards(retainedOlder, 'fresh-after-suspend'),
    );

    expect(hook.result.current.cardPageBudget).toBe(2);
    expect(
      hook.result.current.segments.flatMap((segment) =>
        segment.pages.flatMap((page) =>
          page.cards.map((current) => current.threadId),
        ),
      ),
    ).not.toContain('late-stale-card');
    expect(
      hook.result.current.segments.some(
        (segment) => segment.snapshot === 'fresh-before-suspend',
      ),
    ).toBe(false);
  });

  it('does not recreate exhausted history frontiers after repeated contact returns', async () => {
    const { hook, requests } = setup();
    // The production card page is bounded: three initial roots, then two.
    const newest = ['t3', 't4', 't5'];
    const oldest = ['t1', 't2'];
    await respond(requests.shift()!, cards(newest, 'snapshot-1', 'older-3'));
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(oldest, 'snapshot-1'));

    const returnToContact = async (
      snapshot: string,
      otherContactId: string,
    ) => {
      hook.rerender({
        workspaceId: 'workspace-1',
        contactId: otherContactId,
        authorizationKey: 'member-1',
      });
      await waitFor(() => expect(requests).toHaveLength(1));
      await respond(requests.shift()!, cards(['other'], 'other-snapshot'));
      hook.rerender({
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        authorizationKey: 'member-1',
      });
      await waitFor(() =>
        expect(
          requests.filter(
            (request) => request.name === 'MyahInboxContactEmailCard',
          ),
        ).toHaveLength(5),
      );
      const projections = requests
        .splice(0)
        .filter((request) => request.name === 'MyahInboxContactEmailCard');
      for (const request of projections) {
        await respond(request, {
          myahInboxContactEmailCard: {
            snapshot,
            card: card(request.variables.threadId as string),
          },
        });
      }
      for (;;) {
        await waitFor(() => expect(requests).toHaveLength(1));
        const request = requests.shift()!;
        if (!request.variables.snapshot) {
          await respond(request, cards(newest, snapshot, 'fresh-older'));
          continue;
        }
        if (request.variables.snapshot === snapshot) {
          await respond(request, cards(oldest, snapshot));
          break;
        }
        await respond(
          request,
          request.variables.olderCursor
            ? cards(oldest, 'snapshot-1')
            : cards(newest, 'snapshot-1', 'older-3'),
        );
      }
    };

    const expectExhaustedHistoryWithoutDuplicates = () => {
      expect(
        hook.result.current.segments.filter((segment) => segment.olderCursor),
      ).toHaveLength(0);
      expect(
        hook.result.current.segments.flatMap((segment) =>
          segment.pages.flatMap((page) =>
            page.cards.map((card) => card.threadId),
          ),
        ),
      ).toEqual([...newest, ...oldest]);
    };

    await returnToContact('snapshot-2', 'contact-2');
    expectExhaustedHistoryWithoutDuplicates();

    await returnToContact('snapshot-3', 'contact-3');
    expectExhaustedHistoryWithoutDuplicates();

    await returnToContact('snapshot-4', 'contact-4');
    expectExhaustedHistoryWithoutDuplicates();
    expect(hook.result.current.cardPageBudget).toBe(2);
    expect(
      hook.result.current.segments.every(
        (segment) => segment.origin === 'retained',
      ),
    ).toBe(true);
  });

  it('starts successfully after StrictMode effect cleanup', async () => {
    const { hook, requests } = setup(true);
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests.at(-1)!, cards(['t9']));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.segments[0].pages[0].cards[0].threadId).toBe(
      't9',
    );
  });

  it.each(['contact', 'workspace', 'authorization'])(
    'masks %s changes immediately and ignores old completions and callbacks',
    async (scope) => {
      const { hook, requests } = setup();
      const oldRefresh = hook.result.current.refresh;
      hook.rerender({
        workspaceId: scope === 'workspace' ? 'workspace-2' : 'workspace-1',
        contactId: scope === 'contact' ? 'contact-2' : 'contact-1',
        authorizationKey: scope === 'authorization' ? 'member-2' : 'member-1',
      });
      expect(hook.result.current.segments).toEqual([]);
      await respond(requests[1], cards(['current']));
      await respond(requests[0], cards(['stale']));
      await act(async () => oldRefresh());
      expect(requests).toHaveLength(2);
      expect(hook.result.current.segments[0].pages[0].cards[0].threadId).toBe(
        'current',
      );
    },
  );
  it('rebases without dropping previously displayed cards/messages or the reading anchor', async () => {
    const { hook, requests } = setup();
    await respond(
      requests[0],
      cards(['t7', 't8', 't9'], 'snapshot-1', 'older-7'),
    );
    act(() => {
      void hook.result.current.openCard(
        hook.result.current.segments[0].id,
        't9',
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailCardMessages: page(['m60', 'm80'], 'before-60'),
    });
    const windowId = hook.result.current.windows[0].id;
    act(() => hook.result.current.setReadingAnchor(windowId, 'm80'));
    act(() => {
      void hook.result.current.rebase();
    });
    expect(hook.result.current.windows).toEqual([]);
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(
      requests[2],
      cards(['t12', 't13', 't14'], 'snapshot-2', 'older-12'),
    );
    await waitFor(() => expect(requests).toHaveLength(6));
    for (const request of requests.slice(3, 6))
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'snapshot-2',
          card: card(request.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(7));
    expect(requests[6].variables).toMatchObject({
      snapshot: 'snapshot-2',
      messageId: 'm80',
    });
    await respond(requests[6], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm80',
        card: card('t9'),
        page: page(['m80', 'm81'], 'before-80', 'after-81'),
      },
    });
    await waitFor(() => expect(requests).toHaveLength(8));
    expect(requests[7].variables.messageId).toBe('m60');
    await respond(requests[7], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm60',
        card: card('t9'),
        page: page(['m59', 'm60'], 'before-59', 'after-60'),
      },
    });
    expect(hook.result.current.segments).toHaveLength(1);
    expect(
      hook.result.current.detachedCards.map(
        ({ card }: { card: MyahInboxEmailCardFieldsFragment }) => card.threadId,
      ),
    ).toEqual(['t7', 't8', 't9']);
    expect(hook.result.current.windows[0]).toMatchObject({
      id: windowId,
      anchorMessageId: 'm80',
      snapshot: 'snapshot-2',
    });
    expect(
      hook.result.current.windows[1].pages[0].messages.map(
        ({ id }: MyahInboxEmailMessagePageFieldsFragment['root']) => id,
      ),
    ).toEqual(['m59', 'm60']);
    expect(hook.result.current.historyRebased).toBe(true);
    expect(requests).toHaveLength(8);
  });

  it('purges on permission/read failure and cannot resurrect stale pagination after refresh', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9'], 'snapshot-1', 'older-9'));
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => {
      void hook.result.current.refresh();
    });
    expect(hook.result.current.segments).toEqual([]);
    await waitFor(() => expect(requests).toHaveLength(3));
    await act(async () => requests[2].reject(new Error('Forbidden')));
    expect(hook.result.current.status).toBe('needs-rebase');
    await respond(requests[1], cards(['secret'], 'snapshot-1'));
    expect(hook.result.current.segments).toEqual([]);
    expect(hook.result.current.windows).toEqual([]);
    act(() => hook.result.current.purge());
    expect(hook.result.current.detachedCards).toEqual([]);
    expect(hook.result.current.error).toBeUndefined();
  });
  it('masks during refresh, replaces all projections, and keeps old frontiers separate from fresh discovery', async () => {
    const { hook, requests } = setup();
    await respond(
      requests[0],
      cards(['t7', 't8', 't9'], 'snapshot-1', 'older-7'),
    );
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.openCard(segmentId, 't9');
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await respond(requests[1], {
      myahInboxContactEmailCardMessages: page(['m80'], 'before-80'),
    });
    act(() => {
      void hook.result.current.refresh();
    });
    expect(hook.result.current.segments).toEqual([]);
    expect(hook.result.current.windows).toEqual([]);
    await waitFor(() => expect(requests).toHaveLength(5));
    expect(
      requests
        .slice(2)
        .map((request) => request.variables.threadId)
        .sort(),
    ).toEqual(['t7', 't8', 't9']);
    for (const request of requests.slice(2, 5)) {
      const threadId = request.variables.threadId as string;
      await respond(request, {
        myahInboxContactEmailCard: {
          snapshot: 'current-projection',
          card:
            threadId === 't8'
              ? null
              : { ...card(threadId), subject: null, campaignLabel: null },
        },
      });
    }
    await waitFor(() => expect(requests).toHaveLength(6));
    expect(requests[5].variables.snapshot).toBe('snapshot-1');
    await respond(
      requests[5],
      cards(['t7', 't8', 't9'], 'snapshot-1', 'older-7'),
    );
    await waitFor(() => expect(requests).toHaveLength(7));
    const redacted = {
      ...message('m80'),
      text: null,
      subject: null,
      participants: [],
      attachmentFileIds: [],
      visibility: 'METADATA',
    };
    await respond(requests[6], {
      myahInboxContactEmailCardMessages: {
        ...page([]),
        root: { ...redacted, id: 't9-root' },
        messages: [redacted],
        olderCursor: 'before-80',
      },
    });
    await waitFor(() => expect(requests).toHaveLength(8));
    await respond(
      requests[7],
      cards(['t12', 't13', 't14'], 'snapshot-2', 'older-12'),
    );
    const state = hook.result.current;
    expect(state.segments).toHaveLength(2);
    expect(state.segments[1]).toMatchObject({
      id: segmentId,
      snapshot: 'snapshot-1',
      olderCursor: 'older-7',
    });
    expect(state.segments[1].pages[0].cards).toEqual([
      { ...card('t7'), subject: null, campaignLabel: null },
      { ...card('t9'), subject: null, campaignLabel: null },
    ]);
    expect(state.windows[0].pages[0].messages).toEqual([redacted]);
    expect(state.windows[0].pages[0].root.text).toBeNull();
    expect(state.windows[0].card.campaignLabel).toBeNull();
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(9));
    expect(requests[8].variables).toMatchObject({
      snapshot: 'snapshot-1',
      olderCursor: 'older-7',
    });
    await respond(
      requests[8],
      cards(['t4', 't5', 't6'], 'snapshot-1', 'older-4'),
    );
    expect(hook.result.current.segments[1].pages[1].cards[0].threadId).toBe(
      't4',
    );
  });

  it('keeps exact located windows separate and paginates only their original snapshot', async () => {
    const { hook, requests } = setup();
    await respond(
      requests[0],
      cards(['t7', 't8', 't9'], 'snapshot-1', 'older-7'),
    );
    act(() => {
      void hook.result.current.openCard(
        hook.result.current.segments[0].id,
        't9',
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({
      name: 'MyahInboxContactEmailCardMessages',
      variables: {
        threadId: 't9',
        snapshot: 'snapshot-1',
        expectedWorkspaceId: 'workspace-1',
        contactId: 'contact-1',
      },
    });
    await respond(requests[1], {
      myahInboxContactEmailCardMessages: page(['m80', 'm81'], 'before-80'),
    });
    const windowId = hook.result.current.windows[0].id;
    act(() => {
      void hook.result.current.locateMessage('m40');
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    await respond(requests[2], {
      myahInboxContactEmailMessageLocation: {
        messageId: 'm40',
        card: card('t9'),
        page: page(['m40', 'm41'], 'before-40', 'after-41'),
      },
    });
    expect(hook.result.current.windows).toHaveLength(2);
    expect(hook.result.current.windows[1].anchorMessageId).toBe('m40');
    act(() => {
      void hook.result.current.loadMessages(windowId, 'older');
    });
    await waitFor(() => expect(requests).toHaveLength(4));
    expect(requests[3].variables).toMatchObject({
      snapshot: 'snapshot-1',
      cursor: 'before-80',
    });
    await respond(requests[3], {
      myahInboxContactEmailCardMessages: page(
        ['m60', 'm61'],
        'before-60',
        'after-61',
      ),
    });
    expect(
      hook.result.current.windows[0].pages.flatMap(
        (value: MyahInboxEmailMessagePageFieldsFragment) =>
          value.messages.map(
            ({ id }: MyahInboxEmailMessagePageFieldsFragment['root']) => id,
          ),
      ),
    ).toEqual(['m80', 'm81', 'm60', 'm61']);
    expect(hook.result.current.windows[1].pages[0].messages[0].id).toBe('m40');
    expect(requests).toHaveLength(4);
  });
  it('fails closed for an incremental GraphQL rejection', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9'], 'snapshot-1', 'older-9'));
    act(() => {
      void hook.result.current.loadOlderCards(
        hook.result.current.segments[0].id,
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1].partial(cards(['restricted'])));
    expect(hook.result.current.status).toBe('needs-rebase');
    expect(hook.result.current.segments).toEqual([]);
    expect(hook.result.current.retryIncremental()).toBeUndefined();
  });

  it('retains cards after a transient older-card failure and retries its exact frontier', async () => {
    const { hook, requests } = setup();
    await respond(requests[0], cards(['t9'], 'snapshot-1', 'older-9'));
    const segmentId = hook.result.current.segments[0].id;
    act(() => {
      void hook.result.current.loadOlderCards(segmentId);
      void hook.result.current.loadOlderCards(segmentId);
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    await act(async () => requests[1].reject(new Error('Network unavailable')));
    expect(hook.result.current.status).toBe('ready');
    expect(hook.result.current.cardPageBudget).toBe(1);
    expect(hook.result.current.segments[0].pages[0].cards).toEqual([
      card('t9'),
    ]);
    expect(hook.result.current.error?.message).toBe('Network unavailable');
    act(() => {
      void hook.result.current.retryIncremental();
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].variables).toMatchObject({
      snapshot: 'snapshot-1',
      olderCursor: 'older-9',
    });
    await respond(requests[2], cards(['t8'], 'snapshot-1'));
    expect(hook.result.current.segments[0].pages).toHaveLength(2);
    expect(hook.result.current.segments[0].origin).toBe('retained');
    expect(hook.result.current.cardPageBudget).toBe(2);
    await act(async () => {
      await hook.result.current.loadOlderCards(segmentId);
    });
    expect(hook.result.current.cardPageBudget).toBe(2);
  });

  it.each(['older', 'newer'] as const)(
    'retains a transient %s message frontier and retries it without a jump',
    async (direction) => {
      const { hook, requests } = setup();
      await respond(requests[0], cards(['t9'], 'snapshot-1'));
      act(() => {
        void hook.result.current.openCard(
          hook.result.current.segments[0].id,
          't9',
        );
      });
      await waitFor(() => expect(requests).toHaveLength(2));
      await respond(requests[1], {
        myahInboxContactEmailCardMessages: page(
          ['m80'],
          'before-80',
          'after-80',
        ),
      });
      const windowId = hook.result.current.windows[0].id;
      act(() => {
        void hook.result.current.loadMessages(windowId, direction);
      });
      await waitFor(() => expect(requests).toHaveLength(3));
      await act(async () =>
        requests[2].reject(new Error('Network unavailable')),
      );
      expect(hook.result.current.status).toBe('ready');
      expect(hook.result.current.windows[0]).toMatchObject({
        id: windowId,
        olderCursor: 'before-80',
        newerCursor: 'after-80',
        pages: [{ messages: [expect.objectContaining({ id: 'm80' })] }],
      });
      act(() => {
        void hook.result.current.retryIncremental();
      });
      await waitFor(() => expect(requests).toHaveLength(4));
      expect(requests[3].variables).toMatchObject({
        snapshot: 'snapshot-1',
        cursor: direction === 'older' ? 'before-80' : 'after-80',
      });
      await respond(requests[3], {
        myahInboxContactEmailCardMessages: page(
          [direction === 'older' ? 'm60' : 'm100'],
          direction === 'older' ? 'before-60' : 'before-80',
          direction === 'older' ? 'after-60' : null,
        ),
      });
      expect(hook.result.current.windows[0].pages).toHaveLength(2);
      expect(
        hook.result.current.windows[0].pages.flatMap((current) =>
          current.messages.map((message) => message.id),
        ),
      ).toEqual(
        expect.arrayContaining(['m80', direction === 'older' ? 'm60' : 'm100']),
      );
    },
  );

  it('retains refresh-discovered cards displaced from the next prefix with their revalidated projection and reading anchor', async () => {
    const { hook, requests } = setup();
    await respond(requests.shift()!, cards(['t1'], 'snapshot-1'));

    const refreshWithDisplacedCard = async (
      snapshot: string,
      freshCards: string[],
    ) => {
      act(() => {
        void hook.result.current.refresh();
      });
      while (
        requests.some((request) => request.name === 'MyahInboxContactEmailCard')
      ) {
        const projection = requests.find(
          (request) => request.name === 'MyahInboxContactEmailCard',
        )!;
        requests.splice(requests.indexOf(projection), 1);
        await respond(projection, {
          myahInboxContactEmailCard: {
            snapshot: `projection-${snapshot}`,
            card: card(projection.variables.threadId as string),
          },
        });
      }
      await waitFor(() => expect(requests).toHaveLength(1));
      const retained = requests.shift()!;
      expect(retained.variables).toMatchObject({ snapshot: 'snapshot-1' });
      await respond(retained, cards(['t1'], 'snapshot-1'));
      await waitFor(() => expect(requests).toHaveLength(1));
      let next = requests.shift()!;
      while (next.name === 'MyahInboxContactEmailCardMessages') {
        expect(next.variables).toMatchObject({
          threadId: 't2',
          snapshot: 'snapshot-2',
        });
        await respond(next, {
          myahInboxContactEmailCardMessages: page(['m80'], null, null, 't2'),
        });
        await waitFor(() => expect(requests).toHaveLength(1));
        next = requests.shift()!;
      }
      expect(next.variables.snapshot).toBeUndefined();
      await respond(next, cards(freshCards, snapshot));
    };

    await refreshWithDisplacedCard('snapshot-2', ['t2']);
    const freshSegment = hook.result.current.segments.find(
      (segment) => segment.origin === 'refresh',
    )!;
    act(() => {
      void hook.result.current.openCard(freshSegment.id, 't2');
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, {
      myahInboxContactEmailCardMessages: page(['m80'], null, null, 't2'),
    });
    const windowId = hook.result.current.windows[0].id;
    act(() => hook.result.current.setReadingAnchor(windowId, 'm80'));

    await refreshWithDisplacedCard('snapshot-3', ['t1']);
    expect(hook.result.current.detachedCards).toEqual([
      expect.objectContaining({
        snapshot: 'projection-snapshot-3',
        card: expect.objectContaining({ threadId: 't2' }),
      }),
    ]);
    expect(hook.result.current.windows[0]).toMatchObject({
      id: windowId,
      anchorMessageId: 'm80',
      snapshot: 'snapshot-2',
    });

    await refreshWithDisplacedCard('snapshot-4', ['t1']);
    expect(hook.result.current.detachedCards[0]).toMatchObject({
      snapshot: 'projection-snapshot-4',
      card: expect.objectContaining({ threadId: 't2' }),
    });
    expect(hook.result.current.windows[0]).toMatchObject({
      id: windowId,
      anchorMessageId: 'm80',
      snapshot: 'snapshot-2',
    });
  });

  it('promotes a clicked refresh cursor once and replays its exact snapshot frontier', async () => {
    const { hook, requests } = setup();
    await respond(requests.shift()!, cards(['t1'], 'snapshot-1'));
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, {
      myahInboxContactEmailCard: { snapshot: 'projection', card: card('t1') },
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(['t1'], 'snapshot-1'));
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(
      requests.shift()!,
      cards(['t2'], 'snapshot-2', 'fresh-older'),
    );
    const freshSegment = hook.result.current.segments.find(
      (segment) => segment.origin === 'refresh',
    )!;
    act(() => {
      void hook.result.current.loadOlderCards(freshSegment.id);
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].variables).toMatchObject({
      snapshot: 'snapshot-2',
      olderCursor: 'fresh-older',
    });
    await respond(requests.shift()!, cards(['t3'], 'snapshot-2'));
    expect(hook.result.current.cardPageBudget).toBe(2);

    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(3));
    for (const projection of requests.splice(0))
      await respond(projection, {
        myahInboxContactEmailCard: {
          snapshot: 'projection-2',
          card: card(projection.variables.threadId as string),
        },
      });
    await waitFor(() => expect(requests).toHaveLength(1));
    const replayHead = requests.shift()!;
    expect(replayHead.variables).toMatchObject({ snapshot: 'snapshot-2' });
    expect(replayHead.variables.olderCursor).toBeUndefined();
    await respond(replayHead, cards(['t2'], 'snapshot-2', 'fresh-older'));
    await waitFor(() => expect(requests).toHaveLength(1));
    const replayOlder = requests.shift()!;
    expect(replayOlder.variables).toMatchObject({
      snapshot: 'snapshot-2',
      olderCursor: 'fresh-older',
    });
    await respond(replayOlder, cards(['t3'], 'snapshot-2'));
    await waitFor(() => expect(requests).toHaveLength(1));
    const initialReplay = requests.shift()!;
    expect(initialReplay.variables).toMatchObject({ snapshot: 'snapshot-1' });
    await respond(initialReplay, cards(['t1'], 'snapshot-1'));
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(['t1'], 'snapshot-3'));
    expect(hook.result.current.cardPageBudget).toBe(2);
    expect(
      hook.result.current.segments.filter(
        (segment) => segment.snapshot === 'snapshot-2',
      )[0],
    ).toMatchObject({
      origin: 'retained',
      requests: [undefined, 'fresh-older'],
    });
  });

  it('treats a thread with a different root provenance as novel during fresh reconciliation', async () => {
    const { hook, requests } = setup();
    await respond(requests.shift()!, cards(['t1'], 'snapshot-1'));
    act(() => {
      void hook.result.current.refresh();
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, {
      myahInboxContactEmailCard: { snapshot: 'projection', card: card('t1') },
    });
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, cards(['t1'], 'snapshot-1'));
    await waitFor(() => expect(requests).toHaveLength(1));
    await respond(requests.shift()!, {
      myahInboxContactEmailCards: {
        ...cards(['t1'], 'snapshot-2').myahInboxContactEmailCards,
        cards: [
          {
            ...card('t1'),
            rootMessageId: 't1-restarted-root',
            startTimestamp: '2026-10-01T00:00:00.000001Z',
          },
        ],
      },
    });
    expect(
      hook.result.current.segments.find(
        (segment) => segment.origin === 'refresh',
      )?.pages[0].cards,
    ).toEqual([
      expect.objectContaining({
        threadId: 't1',
        rootMessageId: 't1-restarted-root',
      }),
    ]);
  });

  it('publishes only the bounded card page and loads an older frontier only on demand', async () => {
    const { hook, requests, client } = setup();
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      name: 'MyahInboxContactEmailCards',
      variables: {
        expectedWorkspaceId: 'workspace-1',
        contactId: 'contact-1',
      },
    });
    await respond(
      requests[0],
      cards(['t7', 't8', 't9'], 'snapshot-1', 'older-7'),
    );
    expect(
      hook.result.current.segments[0].pages[0].cards.map(
        ({ threadId }: MyahInboxEmailCardFieldsFragment) => threadId,
      ),
    ).toEqual(['t7', 't8', 't9']);
    expect(requests).toHaveLength(1);
    act(() => {
      void hook.result.current.loadOlderCards(
        hook.result.current.segments[0].id,
      );
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].variables).toMatchObject({
      snapshot: 'snapshot-1',
      olderCursor: 'older-7',
    });
    await respond(
      requests[1],
      cards(['t4', 't5', 't6'], 'snapshot-1', 'older-4'),
    );
    expect(
      hook.result.current.segments[0].pages.flatMap(
        (page: MyahInboxContactEmailCardsQuery['myahInboxContactEmailCards']) =>
          page.cards.map(
            ({ threadId }: MyahInboxEmailCardFieldsFragment) => threadId,
          ),
      ),
    ).toEqual(['t7', 't8', 't9', 't4', 't5', 't6']);
    expect(client.cache.extract()).toEqual({});
  });
});
