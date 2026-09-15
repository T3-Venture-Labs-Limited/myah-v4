import {
  type ApolloClient,
  type DocumentNode,
  type OperationVariables,
} from '@apollo/client';
import {
  CombinedGraphQLErrors,
  CombinedProtocolErrors,
  LinkError,
  ServerError,
  ServerParseError,
} from '@apollo/client/errors';

import {
  GET_MYAH_INBOX_CONTACT_EMAIL_CARDS,
  GET_MYAH_INBOX_CONTACT_EMAIL_CARD,
  GET_MYAH_INBOX_CONTACT_EMAIL_CARD_MESSAGES,
  GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGE_LOCATION,
} from '@/myah/inbox/graphql/operations';
import {
  type MyahInboxContactEmailCardsQuery,
  type MyahInboxContactEmailCardsQueryVariables,
  type MyahInboxContactEmailCardMessagesQuery,
  type MyahInboxContactEmailCardMessagesQueryVariables,
  type MyahInboxContactEmailMessageLocationQuery,
  type MyahInboxContactEmailMessageLocationQueryVariables,
  type MyahInboxEmailCardFieldsFragment,
  type MyahInboxEmailMessagePageFieldsFragment,
  type MyahInboxContactEmailCardQuery,
  type MyahInboxContactEmailCardQueryVariables,
} from '~/generated/graphql';

type CardPage = MyahInboxContactEmailCardsQuery['myahInboxContactEmailCards'];
export type MyahInboxEmailCardSegment = {
  id: string;
  // Retained frontiers were explicitly paginated by the user. Refresh
  // frontiers are replaceable discovery work and are never replayed.
  origin: 'retained' | 'refresh';
  snapshot: string;
  pages: CardPage[];
  requests: (string | undefined)[];
  olderCursor: string | null;
};
type MessageRequest = (
  | { cursor?: string; messageId?: never }
  | { messageId: string; cursor?: never }
) & { direction?: 'older' | 'newer' };
export type MyahInboxEmailMessageWindow = {
  id: string;
  snapshot: string;
  threadId: string;
  card: MyahInboxEmailCardFieldsFragment;
  pages: MyahInboxEmailMessagePageFieldsFragment[];
  requests: MessageRequest[];
  olderCursor: string | null;
  newerCursor: string | null;
  anchorMessageId: string | null;
};
type IncrementalFailure =
  | { kind: 'older-cards'; segmentId: string }
  | { kind: 'messages'; windowId: string; direction: 'older' | 'newer' };

export type MyahInboxEmailHistoryState = {
  segments: MyahInboxEmailCardSegment[];
  windows: MyahInboxEmailMessageWindow[];
  locationMissing: boolean;
  detachedCards: { snapshot: string; card: MyahInboxEmailCardFieldsFragment }[];
  historyRebased: boolean;
  // One initial page plus each successfully committed explicit card page.
  cardPageBudget: number;
  missingMessageIds: string[];
  status: 'idle' | 'ready' | 'masked' | 'needs-rebase';
  loading: boolean;
  error: Error | undefined;
  incrementalFailure: IncrementalFailure | undefined;
};

type ReplayPlan = {
  historyRebased: boolean;
  threadIds: string[];
  detachedThreadIds: string[];
  cardPageBudget: number;
  segments: Pick<
    MyahInboxEmailCardSegment,
    'id' | 'origin' | 'snapshot' | 'requests'
  >[];
  windows: (Pick<
    MyahInboxEmailMessageWindow,
    'id' | 'snapshot' | 'threadId' | 'requests' | 'anchorMessageId'
  > & { messageIds: string[] })[];
};

// Local, cacheless history. Cursors are replayed verbatim, never decoded or moved
// between snapshots. Each segment has its own explicit older frontier.
export class MyahInboxEmailHistoryStore {
  private state: MyahInboxEmailHistoryState = {
    segments: [],
    windows: [],
    locationMissing: false,
    detachedCards: [],
    historyRebased: false,
    cardPageBudget: 1,
    missingMessageIds: [],
    status: 'idle',
    loading: false,
    error: undefined,
    incrementalFailure: undefined,
  };
  private listeners = new Set<() => void>();
  private operation: AbortController | null = null;
  private nextId = 0;
  private recovery: ReplayPlan | null = null;
  private active = true;

  constructor(
    private client: ApolloClient,
    private workspaceId: string | null,
    private contactId: string | null,
    private authorizationKey: string | null,
  ) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: MyahInboxEmailHistoryState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private scope() {
    return {
      expectedWorkspaceId: this.workspaceId!,
      contactId: this.contactId!,
    };
  }
  private async query<Data, Variables extends OperationVariables>(
    query: DocumentNode,
    variables: Variables,
    signal: AbortSignal,
  ): Promise<Data> {
    signal.throwIfAborted();
    const result = await this.client.query<Data, Variables>({
      query,
      variables,
      fetchPolicy: 'no-cache',
      errorPolicy: 'none',
      context: { queryDeduplication: false, fetchOptions: { signal } },
    });
    signal.throwIfAborted();
    if (!result.data) throw new Error('Could not load Inbox history.');
    return result.data as Data;
  }
  private async queryCards(
    signal: AbortSignal,
    snapshot?: string,
    olderCursor?: string,
  ) {
    const data = await this.query<
      MyahInboxContactEmailCardsQuery,
      MyahInboxContactEmailCardsQueryVariables
    >(
      GET_MYAH_INBOX_CONTACT_EMAIL_CARDS,
      {
        ...this.scope(),
        ...(snapshot ? { snapshot } : {}),
        ...(olderCursor ? { olderCursor } : {}),
      },
      signal,
    );
    return data.myahInboxContactEmailCards;
  }
  private async queryMessages(
    signal: AbortSignal,
    threadId: string,
    snapshot: string,
    cursor?: string,
  ) {
    const data = await this.query<
      MyahInboxContactEmailCardMessagesQuery,
      MyahInboxContactEmailCardMessagesQueryVariables
    >(
      GET_MYAH_INBOX_CONTACT_EMAIL_CARD_MESSAGES,
      { ...this.scope(), threadId, snapshot, ...(cursor ? { cursor } : {}) },
      signal,
    );
    return data.myahInboxContactEmailCardMessages;
  }
  private async queryLocation(
    signal: AbortSignal,
    messageId: string,
    snapshot: string,
  ) {
    const data = await this.query<
      MyahInboxContactEmailMessageLocationQuery,
      MyahInboxContactEmailMessageLocationQueryVariables
    >(
      GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGE_LOCATION,
      { ...this.scope(), messageId, snapshot },
      signal,
    );
    return data.myahInboxContactEmailMessageLocation;
  }
  private async queryCard(signal: AbortSignal, threadId: string) {
    const data = await this.query<
      MyahInboxContactEmailCardQuery,
      MyahInboxContactEmailCardQueryVariables
    >(GET_MYAH_INBOX_CONTACT_EMAIL_CARD, { ...this.scope(), threadId }, signal);
    return data.myahInboxContactEmailCard;
  }
  private window(
    card: MyahInboxEmailCardFieldsFragment,
    snapshot: string,
    page: MyahInboxEmailMessagePageFieldsFragment,
    request: MessageRequest,
  ): MyahInboxEmailMessageWindow {
    return {
      id: `window-${++this.nextId}`,
      snapshot,
      threadId: card.threadId,
      card,
      pages: [page],
      requests: [request],
      olderCursor: page.olderCursor ?? null,
      newerCursor: page.newerCursor ?? null,
      anchorMessageId: request.messageId ?? null,
    };
  }
  private async run(
    work: (signal: AbortSignal) => Promise<MyahInboxEmailHistoryState>,
    recover = false,
    incrementalFailure?: IncrementalFailure,
  ) {
    if (
      !this.active ||
      (!recover &&
        (this.state.status === 'masked' ||
          this.state.status === 'needs-rebase')) ||
      this.operation ||
      !this.workspaceId ||
      !this.contactId ||
      !this.authorizationKey
    )
      return;
    const operation = new AbortController();
    this.operation = operation;
    this.publish({
      ...this.state,
      loading: true,
      error: undefined,
      incrementalFailure: undefined,
    });
    try {
      const state = await work(operation.signal);
      if (this.operation === operation) {
        if (recover) this.recovery = null;
        this.publish({
          ...state,
          status: 'ready',
          loading: false,
          incrementalFailure: undefined,
        });
      }
    } catch (error) {
      if (this.operation === operation) {
        const operationError =
          error instanceof Error
            ? error
            : new Error('Could not load Inbox history.');
        if (
          incrementalFailure &&
          this.state.status === 'ready' &&
          LinkError.is(error) &&
          !CombinedGraphQLErrors.is(error) &&
          !CombinedProtocolErrors.is(error) &&
          !ServerError.is(error) &&
          !ServerParseError.is(error)
        ) {
          this.publish({
            ...this.state,
            loading: false,
            error: operationError,
            incrementalFailure,
          });
          return;
        }
        this.recovery ??= this.plan();
        this.publish({
          ...this.state,
          segments: [],
          windows: [],
          detachedCards: [],
          status: 'needs-rebase',
          loading: false,
          error: operationError,
          incrementalFailure: undefined,
        });
      }
    } finally {
      if (this.operation === operation) this.operation = null;
    }
  }
  start = () => {
    this.active = true;
    if (this.recovery) return this.refresh();
    return this.run(async (signal) => {
      const page = await this.queryCards(signal);
      return {
        ...this.state,
        segments: [
          {
            id: `segment-${++this.nextId}`,
            origin: 'retained',
            snapshot: page.snapshot,
            pages: [page],
            requests: [undefined],
            olderCursor: page.olderCursor ?? null,
          },
        ],
      };
    });
  };
  loadOlderCards = (segmentId: string) =>
    this.run(
      async (signal) => {
        const segment = this.state.segments.find(({ id }) => id === segmentId);
        if (!segment?.olderCursor) return this.state;
        const page = await this.queryCards(
          signal,
          segment.snapshot,
          segment.olderCursor,
        );
        return {
          ...this.state,
          cardPageBudget: this.state.cardPageBudget + 1,
          segments: this.state.segments.map((current) =>
            current !== segment
              ? current
              : {
                  ...segment,
                  // A click makes the entire discovery prefix user-owned.
                  origin: 'retained',
                  pages: [...segment.pages, page],
                  requests: [
                    ...segment.requests,
                    segment.olderCursor ?? undefined,
                  ],
                  olderCursor: page.olderCursor ?? null,
                },
          ),
        };
      },
      false,
      { kind: 'older-cards', segmentId },
    );
  openCard = (segmentId: string, threadId: string) =>
    this.run(async (signal) => {
      const segment = this.state.segments.find(({ id }) => id === segmentId);
      const card = segment?.pages
        .flatMap((page) => page.cards)
        .find((card) => card.threadId === threadId);
      if (
        !segment ||
        !card ||
        this.state.windows.some(
          (window) =>
            window.threadId === threadId &&
            window.snapshot === segment.snapshot &&
            !window.requests[0].messageId,
        )
      )
        return this.state;
      const page = await this.queryMessages(signal, threadId, segment.snapshot);
      return {
        ...this.state,
        windows: [
          ...this.state.windows,
          this.window(card, segment.snapshot, page, {}),
        ],
      };
    });
  openDetachedCard = (threadId: string) =>
    this.run(async (signal) => {
      const projection = this.state.detachedCards.find(
        ({ card }) => card.threadId === threadId,
      );
      if (
        !projection ||
        this.state.windows.some(
          (window) =>
            window.threadId === threadId &&
            window.snapshot === projection.snapshot &&
            !window.requests[0].messageId,
        )
      )
        return this.state;
      const page = await this.queryMessages(
        signal,
        threadId,
        projection.snapshot,
      );
      return {
        ...this.state,
        windows: [
          ...this.state.windows,
          this.window(projection.card, projection.snapshot, page, {}),
        ],
      };
    });
  locateMessage = (messageId: string) =>
    this.run(async (signal) => {
      const snapshot = this.state.segments[0]?.snapshot;
      if (!snapshot) return this.state;
      const location = await this.queryLocation(signal, messageId, snapshot);
      return {
        ...this.state,
        locationMissing: !location,
        windows: location
          ? [
              ...this.state.windows,
              this.window(location.card, snapshot, location.page, {
                messageId,
              }),
            ]
          : this.state.windows,
      };
    });
  loadMessages = (windowId: string, direction: 'older' | 'newer') =>
    this.run(
      async (signal) => {
        const window = this.state.windows.find(({ id }) => id === windowId);
        const cursor =
          direction === 'older' ? window?.olderCursor : window?.newerCursor;
        if (!window || !cursor) return this.state;
        const page = await this.queryMessages(
          signal,
          window.threadId,
          window.snapshot,
          cursor,
        );
        return {
          ...this.state,
          windows: this.state.windows.map((current) =>
            current.id !== window.id
              ? current
              : {
                  ...current,
                  pages: [...current.pages, page],
                  requests: [...current.requests, { cursor, direction }],
                  ...(direction === 'older'
                    ? { olderCursor: page.olderCursor ?? null }
                    : { newerCursor: page.newerCursor ?? null }),
                },
          ),
        };
      },
      false,
      { kind: 'messages', windowId, direction },
    );
  retryIncremental = () => {
    const failure = this.state.incrementalFailure;
    if (!failure) return;
    return failure.kind === 'older-cards'
      ? this.loadOlderCards(failure.segmentId)
      : this.loadMessages(failure.windowId, failure.direction);
  };
  private plan(): ReplayPlan {
    const refreshThreadIds = this.state.segments
      .filter((segment) => segment.origin === 'refresh')
      .flatMap((segment) =>
        segment.pages.flatMap((page) =>
          page.cards.map((card) => card.threadId as string),
        ),
      );
    return {
      historyRebased: this.state.historyRebased,
      cardPageBudget: this.state.cardPageBudget,
      // Discovery pages have no user-owned cursor to replay, but their cards
      // remain recoverable through current projections.
      detachedThreadIds: [
        ...new Set([
          ...this.state.detachedCards.map(
            ({ card }) => card.threadId as string,
          ),
          ...refreshThreadIds,
        ]),
      ],
      threadIds: [
        ...new Set<string>([
          ...this.state.segments.flatMap((segment) =>
            segment.pages.flatMap((page) => [
              ...page.cards.map((card) => card.threadId as string),
              ...(page.latestThreadId ? [page.latestThreadId as string] : []),
            ]),
          ),
          ...this.state.windows.map((window) => window.threadId),
          ...this.state.detachedCards.map(
            ({ card }) => card.threadId as string,
          ),
        ]),
      ],
      segments: this.state.segments
        .filter((segment) => segment.origin === 'retained')
        .map(({ id, origin, snapshot, requests }) => ({
          id,
          origin,
          snapshot,
          requests,
        })),
      windows: this.state.windows.map(
        ({ id, snapshot, threadId, requests, anchorMessageId, pages }) => ({
          id,
          snapshot,
          threadId,
          requests,
          anchorMessageId,
          messageIds: [
            ...new Set<string>(
              pages.flatMap((page) =>
                [...page.messages, page.root].map(
                  (message) => message.id as string,
                ),
              ),
            ),
          ],
        }),
      ),
    };
  }
  refresh = () => {
    const plan = this.recovery ?? this.plan();
    this.cancel();
    this.recovery = plan;
    this.publish({
      ...this.state,
      segments: [],
      windows: [],
      detachedCards: [],
      status: 'masked',
      error: undefined,
      incrementalFailure: undefined,
    });
    return this.run(async (signal) => {
      const projections = new Map(
        await Promise.all(
          plan.threadIds.map(
            async (threadId) =>
              [threadId, await this.queryCard(signal, threadId)] as const,
          ),
        ),
      );
      const segments: MyahInboxEmailCardSegment[] = [];
      for (const segment of plan.segments) {
        const pages: CardPage[] = [];
        for (const cursor of segment.requests) {
          const page = await this.queryCards(signal, segment.snapshot, cursor);
          pages.push({
            ...page,
            cards: page.cards.flatMap((card) => {
              if (!projections.has(card.threadId)) return [card];
              const projection = projections.get(card.threadId)?.card;
              return projection ? [projection] : [];
            }),
            latestThreadId:
              !projections.has(page.latestThreadId) ||
              projections.get(page.latestThreadId)?.card
                ? page.latestThreadId
                : null,
          });
        }
        segments.push({
          ...segment,
          pages,
          olderCursor: pages.at(-1)?.olderCursor ?? null,
        });
      }
      const windows: MyahInboxEmailMessageWindow[] = [];
      const missingMessageIds: string[] = [];
      for (const window of plan.windows) {
        const card = projections.get(window.threadId)?.card;
        if (!card) continue;
        const restored: MyahInboxEmailMessageWindow[] = [];
        const covered = new Set<string>();
        const retain = (
          page: MyahInboxEmailMessagePageFieldsFragment,
          request: MessageRequest,
        ) => {
          restored.push(this.window(card, window.snapshot, page, request));
          for (const message of [page.root, ...page.messages])
            covered.add(message.id as string);
        };
        for (const request of window.requests) {
          const page = request.messageId
            ? (
                await this.queryLocation(
                  signal,
                  request.messageId,
                  window.snapshot,
                )
              )?.page
            : await this.queryMessages(
                signal,
                window.threadId,
                window.snapshot,
                request.cursor,
              );
          if (!page) {
            if (request.messageId) missingMessageIds.push(request.messageId);
            continue;
          }
          // Snapshots freeze card starts, not replies. Replayed pages may no
          // longer touch, so each keeps both navigable frontiers independently.
          retain(page, request);
        }
        // Restore only displaced displayed IDs, anchor first. Location pages
        // end at their target, so visit the remaining IDs newest-first.
        for (const messageId of [
          ...(window.anchorMessageId ? [window.anchorMessageId] : []),
          ...[...window.messageIds].reverse(),
        ]) {
          if (covered.has(messageId) || missingMessageIds.includes(messageId))
            continue;
          const location = await this.queryLocation(
            signal,
            messageId,
            window.snapshot,
          );
          if (!location) {
            missingMessageIds.push(messageId);
            continue;
          }
          retain(location.page, { messageId });
        }
        const anchored = restored.find((next) =>
          next.pages.some((page) =>
            [page.root, ...page.messages].some(
              (message) => message.id === window.anchorMessageId,
            ),
          ),
        );
        const primary = anchored ?? restored.at(0);
        if (primary) {
          primary.id = window.id;
          if (anchored) primary.anchorMessageId = window.anchorMessageId;
        }
        windows.push(...restored);
      }
      const fresh = await this.queryCards(signal);
      const cardIdentity = (card: MyahInboxEmailCardFieldsFragment) =>
        `${card.threadId}\u0000${card.rootMessageId}\u0000${card.startTimestamp}`;
      const knownCards = new Set([
        ...segments.flatMap((segment) =>
          segment.pages.flatMap((page) => page.cards.map(cardIdentity)),
        ),
        ...plan.detachedThreadIds.flatMap((threadId) => {
          const projection = projections.get(threadId)?.card;
          return projection ? [cardIdentity(projection)] : [];
        }),
      ]);
      // Fresh snapshots may order a backfilled root behind an unchanged head.
      // Bound only automatic work by explicit pagination, never by prior
      // refresh requests. A non-null fresh cursor is always an honest frontier.
      const freshPages = [fresh];
      const freshRequests: (string | undefined)[] = [undefined];
      let page = fresh;
      let hasNovelCard = false;
      while (true) {
        hasNovelCard ||= page.cards.some(
          (card) => !knownCards.has(cardIdentity(card)),
        );
        if (hasNovelCard || !page.olderCursor) break;
        if (freshPages.length >= Math.max(1, plan.cardPageBudget)) break;
        freshRequests.push(page.olderCursor);
        page = await this.queryCards(signal, fresh.snapshot, page.olderCursor);
        freshPages.push(page);
      }
      const emptyRecovery =
        plan.segments.length === 0 &&
        plan.threadIds.length === 0 &&
        plan.windows.length === 0;
      // An exhausted, entirely known discovery prefix needs no frontier. The
      // empty StrictMode recovery is an initial retained baseline instead.
      if (emptyRecovery || hasNovelCard || page.olderCursor) {
        segments.unshift({
          id: `segment-${++this.nextId}`,
          origin: emptyRecovery ? 'retained' : 'refresh',
          snapshot: fresh.snapshot,
          pages: freshPages,
          requests: freshRequests,
          olderCursor: page.olderCursor ?? null,
        });
      }
      const detachedCards = plan.detachedThreadIds.flatMap((threadId) => {
        const projection = projections.get(threadId);
        return projection?.card
          ? [{ snapshot: projection.snapshot, card: projection.card }]
          : [];
      });
      return {
        ...this.state,
        segments,
        windows,
        detachedCards,
        missingMessageIds,
        historyRebased: plan.historyRebased,
        cardPageBudget: plan.cardPageBudget,
      };
    }, true);
  };
  setReadingAnchor = (windowId: string, messageId: string) => {
    this.publish({
      ...this.state,
      windows: this.state.windows.map((window) =>
        window.id === windowId &&
        window.pages.some((page) =>
          [page.root, ...page.messages].some(
            (message) => message.id === messageId,
          ),
        )
          ? { ...window, anchorMessageId: messageId }
          : window,
      ),
    });
  };
  rebase = () => {
    const plan = this.recovery ?? this.plan();
    this.cancel();
    this.recovery = plan;
    this.publish({
      ...this.state,
      segments: [],
      windows: [],
      detachedCards: [],
      status: 'masked',
      error: undefined,
      incrementalFailure: undefined,
    });
    return this.run(async (signal) => {
      const fresh = await this.queryCards(signal);
      const projections = new Map(
        await Promise.all(
          plan.threadIds.map(
            async (threadId) =>
              [threadId, await this.queryCard(signal, threadId)] as const,
          ),
        ),
      );
      const detachedCards = [...projections.values()].flatMap((projection) =>
        projection.card
          ? [{ snapshot: projection.snapshot, card: projection.card }]
          : [],
      );
      const windows: MyahInboxEmailMessageWindow[] = [];
      const missingMessageIds: string[] = [];
      for (const window of plan.windows) {
        if (!projections.get(window.threadId)?.card) continue;
        const covered = new Set<string>();
        let restored = false;
        // Re-locate only previously displayed IDs, never crawl intervening history.
        // Non-overlapping locations remain independent windows with explicit gaps.
        for (const messageId of [
          ...(window.anchorMessageId ? [window.anchorMessageId] : []),
          ...window.messageIds,
        ]) {
          if (covered.has(messageId)) continue;
          const location = await this.queryLocation(
            signal,
            messageId,
            fresh.snapshot,
          );
          if (!location) {
            missingMessageIds.push(messageId);
            continue;
          }
          const next = this.window(
            location.card,
            fresh.snapshot,
            location.page,
            { messageId },
          );
          if (!restored) {
            next.id = window.id;
            restored = true;
          }
          windows.push(next);
          for (const message of [location.page.root, ...location.page.messages])
            covered.add(message.id as string);
        }
        if (!restored && !window.messageIds.length && !window.anchorMessageId) {
          const projection = projections.get(window.threadId)!;
          const page = await this.queryMessages(
            signal,
            window.threadId,
            fresh.snapshot,
          );
          windows.push({
            ...this.window(projection.card!, fresh.snapshot, page, {}),
            id: window.id,
          });
        }
      }
      return {
        ...this.state,
        detachedCards,
        windows,
        missingMessageIds,
        historyRebased: true,
        cardPageBudget: plan.cardPageBudget,
        segments: [
          {
            id: `segment-${++this.nextId}`,
            origin: 'retained',
            snapshot: fresh.snapshot,
            pages: [fresh],
            requests: [undefined],
            olderCursor: fresh.olderCursor ?? null,
          },
        ],
      };
    }, true);
  };
  purge = () => {
    this.cancel();
    this.recovery = null;
    this.publish({
      ...this.state,
      segments: [],
      windows: [],
      detachedCards: [],
      missingMessageIds: [],
      locationMissing: false,
      historyRebased: false,
      cardPageBudget: 1,
      status: 'masked',
      loading: false,
      error: undefined,
      incrementalFailure: undefined,
    });
  };
  suspend = () => {
    const plan = this.recovery ?? this.plan();
    this.purge();
    this.recovery = plan;
    this.active = false;
  };
  private cancel() {
    this.operation?.abort();
    this.operation = null;
  }
}
