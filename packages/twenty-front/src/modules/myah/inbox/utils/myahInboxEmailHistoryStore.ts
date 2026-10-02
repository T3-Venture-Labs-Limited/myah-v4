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

type CardRef = Pick<MyahInboxEmailCardFieldsFragment, 'threadId' | 'anchorKey'>;
const groupId = ({ threadId, anchorKey }: CardRef) =>
  `${threadId}\u0000${anchorKey}`;
const refsFor = (cards: CardRef[]): CardRef[] => [
  ...new Map(cards.map((card) => [groupId(card), card])).values(),
];
const isStaleHistorySnapshot = (error: unknown) =>
  CombinedGraphQLErrors.is(error) &&
  error.errors.length === 1 &&
  error.errors[0].message === 'Inbox history changed; reload history';

type ReplayPlan = {
  historyRebased: boolean;
  groups: CardRef[];
  detachedGroups: CardRef[];
  cardPageBudget: number;
  segments: (Pick<
    MyahInboxEmailCardSegment,
    'id' | 'origin' | 'snapshot' | 'requests'
  > & { cards: CardRef[] })[];
  windows: (Pick<
    MyahInboxEmailMessageWindow,
    'id' | 'snapshot' | 'threadId' | 'requests' | 'anchorMessageId'
  > & { anchorKey: string; rootMessageId: string; messageIds: string[] })[];
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
    anchorKey?: string,
  ) {
    const data = await this.query<
      MyahInboxContactEmailCardMessagesQuery,
      MyahInboxContactEmailCardMessagesQueryVariables
    >(
      GET_MYAH_INBOX_CONTACT_EMAIL_CARD_MESSAGES,
      {
        ...this.scope(),
        threadId,
        snapshot,
        anchorKey,
        ...(cursor ? { cursor } : {}),
      },
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
  private async queryCard(
    signal: AbortSignal,
    { threadId, anchorKey }: CardRef,
  ) {
    try {
      const data = await this.query<
        MyahInboxContactEmailCardQuery,
        MyahInboxContactEmailCardQueryVariables
      >(
        GET_MYAH_INBOX_CONTACT_EMAIL_CARD,
        { ...this.scope(), threadId, anchorKey },
        signal,
      );
      return data.myahInboxContactEmailCard;
    } catch (error) {
      // A retained key may disappear after THREAD→EXACT promotion or revocation.
      // Replay can relocate only the messages it had already loaded.
      if (
        CombinedGraphQLErrors.is(error) &&
        error.errors.length === 1 &&
        error.errors[0].message === 'Inbox card is not readable'
      )
        return { snapshot: '', card: null };
      throw error;
    }
  }
  // A promoted THREAD key no longer has a card projection. Recover only IDs
  // the reader had loaded, under the new snapshot and current permissions.
  private async relocateWindows(
    signal: AbortSignal,
    windows: ReplayPlan['windows'],
    snapshot: string,
    restored: MyahInboxEmailMessageWindow[],
    missingMessageIds: string[],
  ) {
    for (const window of windows) {
      const covered = new Set<string>();
      let first = true;
      for (const messageId of [
        ...(window.anchorMessageId ? [window.anchorMessageId] : []),
        ...window.messageIds,
      ]) {
        if (covered.has(messageId)) continue;
        const location = await this.queryLocation(signal, messageId, snapshot);
        if (!location || location.card.threadId !== window.threadId) {
          missingMessageIds.push(messageId);
          continue;
        }
        const next = this.window(location.card, snapshot, location.page, {
          messageId,
        });
        if (first) {
          next.id = window.id;
          first = false;
        }
        restored.push(next);
        for (const message of [location.page.root, ...location.page.messages])
          covered.add(message.id as string);
      }
    }
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
    quiet = false,
    onComplete?: () => void,
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
    if (!quiet)
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
        onComplete?.();
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
  openCard = (segmentId: string, threadId: string, anchorKey?: string) =>
    this.run(async (signal) => {
      const segment = this.state.segments.find(({ id }) => id === segmentId);
      const card = segment?.pages
        .flatMap((page) => page.cards)
        .find(
          (card) =>
            card.threadId === threadId &&
            (!anchorKey || card.anchorKey === anchorKey),
        );
      if (
        !segment ||
        !card ||
        this.state.windows.some(
          (window) =>
            window.threadId === threadId &&
            window.card.anchorKey === card.anchorKey &&
            window.snapshot === segment.snapshot &&
            !window.requests[0].messageId,
        )
      )
        return this.state;
      const page = await this.queryMessages(
        signal,
        threadId,
        segment.snapshot,
        undefined,
        card.anchorKey,
      );
      return {
        ...this.state,
        windows: [
          ...this.state.windows,
          this.window(card, segment.snapshot, page, {}),
        ],
      };
    });
  openDetachedCard = (threadId: string, anchorKey?: string) =>
    this.run(async (signal) => {
      const projection = this.state.detachedCards.find(
        ({ card }) =>
          card.threadId === threadId &&
          (!anchorKey || card.anchorKey === anchorKey),
      );
      if (
        !projection ||
        this.state.windows.some(
          (window) =>
            window.threadId === threadId &&
            window.card.anchorKey === projection.card.anchorKey &&
            window.snapshot === projection.snapshot &&
            !window.requests[0].messageId,
        )
      )
        return this.state;
      const page = await this.queryMessages(
        signal,
        threadId,
        projection.snapshot,
        undefined,
        projection.card.anchorKey,
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
          window.card.anchorKey,
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
    const refreshCards = this.state.segments
      .filter((segment) => segment.origin === 'refresh')
      .flatMap((segment) => segment.pages.flatMap((page) => page.cards));
    const segmentCards = this.state.segments.flatMap((segment) =>
      segment.pages.flatMap((page) => page.cards),
    );
    const windowCards = this.state.windows.map(({ card }) => card);
    const detachedCards = this.state.detachedCards.map(({ card }) => card);
    const knownThreads = new Set(
      [...segmentCards, ...windowCards, ...detachedCards].map(
        (card) => card.threadId,
      ),
    );
    return {
      historyRebased: this.state.historyRebased,
      cardPageBudget: this.state.cardPageBudget,
      // Discovery pages have no user-owned cursor to replay, but their cards
      // remain recoverable through current projections.
      detachedGroups: refsFor([...detachedCards, ...refreshCards]),
      groups: refsFor([
        ...segmentCards,
        ...windowCards,
        ...detachedCards,
        ...this.state.segments.flatMap((segment) =>
          segment.pages.flatMap((page) =>
            page.latestThreadId && !knownThreads.has(page.latestThreadId)
              ? [
                  {
                    threadId: page.latestThreadId,
                    anchorKey: `legacy:${page.latestThreadId}`,
                  },
                ]
              : [],
          ),
        ),
      ]),
      segments: this.state.segments
        .filter((segment) => segment.origin === 'retained')
        .map(({ id, origin, snapshot, requests, pages }) => ({
          id,
          origin,
          snapshot,
          requests,
          cards: refsFor(pages.flatMap((page) => page.cards)),
        })),
      windows: this.state.windows.map(
        ({
          id,
          snapshot,
          threadId,
          card,
          requests,
          anchorMessageId,
          pages,
        }) => ({
          id,
          snapshot,
          threadId,
          anchorKey: card.anchorKey,
          rootMessageId: card.rootMessageId,
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
  refresh = () => this.rebuild(false);
  // Background arrival: re-authorize every retained card/window against current
  // permissions without masking rendered history. Only failure masks (fail closed).
  ambientRefresh = async (): Promise<boolean> => {
    if (this.operation || this.state.status !== 'ready') return false;
    let completed = false;
    await this.rebuild(true, () => {
      completed = true;
    });
    return completed;
  };
  private rebuild(ambient: boolean, onComplete?: () => void) {
    const plan = this.recovery ?? this.plan();
    if (ambient)
      return this.run(
        (signal) => this.replay(signal, plan),
        true,
        undefined,
        true,
        onComplete,
      );
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
    return this.run((signal) => this.replay(signal, plan), true);
  }
  // ponytail: each ambient tick replays every retained page/window; bounded by
  // what the user loaded. Add server-side retained-set checks if this grows.
  private replay = async (
    signal: AbortSignal,
    plan: ReplayPlan,
  ): Promise<MyahInboxEmailHistoryState> => {
    const projections = new Map(
      await Promise.all(
        plan.groups.map(
          async (ref) =>
            [groupId(ref), await this.queryCard(signal, ref)] as const,
        ),
      ),
    );
    const segments: MyahInboxEmailCardSegment[] = [];
    const droppedGroups: CardRef[] = [];
    for (const segment of plan.segments) {
      const pages: CardPage[] = [];
      let stale = false;
      for (const cursor of segment.requests) {
        let page: CardPage;
        try {
          page = await this.queryCards(signal, segment.snapshot, cursor);
        } catch (error) {
          // A changed card membership invalidates the retained snapshot.
          // Rediscover under a fresh one rather than masking unrelated cards.
          if (isStaleHistorySnapshot(error)) {
            stale = true;
            break;
          }
          throw error;
        }
        pages.push({
          ...page,
          cards: page.cards.flatMap((card) => {
            if (!projections.has(groupId(card))) return [card];
            const projection = projections.get(groupId(card))?.card;
            return projection ? [projection] : [];
          }),
          latestThreadId:
            page.latestThreadId &&
            plan.groups.some((ref) => ref.threadId === page.latestThreadId) &&
            !plan.groups.some(
              (ref) =>
                ref.threadId === page.latestThreadId &&
                projections.get(groupId(ref))?.card != null,
            )
              ? null
              : page.latestThreadId,
        });
      }
      if (stale) droppedGroups.push(...segment.cards);
      else
        segments.push({
          id: segment.id,
          origin: segment.origin,
          snapshot: segment.snapshot,
          requests: segment.requests,
          pages,
          olderCursor: pages.at(-1)?.olderCursor ?? null,
        });
    }
    const rootChanged = plan.windows.some((window) => {
      const card = projections.get(groupId(window))?.card;
      return card && card.rootMessageId !== window.rootMessageId;
    });
    const recoveryFresh = rootChanged ? await this.queryCards(signal) : null;
    const windows: MyahInboxEmailMessageWindow[] = [];
    const missingMessageIds: string[] = [];
    const staleWindows: ReplayPlan['windows'] = [];
    for (const window of plan.windows) {
      const card = projections.get(groupId(window))?.card;
      if (!card) continue;
      const changed = card.rootMessageId !== window.rootMessageId;
      const snapshot = changed ? recoveryFresh!.snapshot : window.snapshot;
      const restored: MyahInboxEmailMessageWindow[] = [];
      const covered = new Set<string>();
      const retain = (
        page: MyahInboxEmailMessagePageFieldsFragment,
        request: MessageRequest,
      ) => {
        restored.push(this.window(card, snapshot, page, request));
        for (const message of [page.root, ...page.messages])
          covered.add(message.id as string);
      };
      const missingBefore = missingMessageIds.length;
      try {
        if (changed) {
          const page = await this.queryMessages(
            signal,
            window.threadId,
            snapshot,
            undefined,
            window.anchorKey,
          );
          retain(page, {});
        }
        for (const request of changed ? [] : window.requests) {
          const page = request.messageId
            ? (await this.queryLocation(signal, request.messageId, snapshot))
                ?.page
            : await this.queryMessages(
                signal,
                window.threadId,
                snapshot,
                request.cursor,
                window.anchorKey,
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
            snapshot,
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
      } catch (error) {
        // Another group's promotion can invalidate this unchanged window's
        // old global fingerprint. Discard its partial pages and relocate only
        // previously loaded IDs against a fresh authorized snapshot.
        if (!changed && isStaleHistorySnapshot(error)) {
          missingMessageIds.length = missingBefore;
          staleWindows.push(window);
          continue;
        }
        throw error;
      }
    }
    const fresh = recoveryFresh ?? (await this.queryCards(signal));
    await this.relocateWindows(
      signal,
      [
        ...plan.windows.filter(
          (window) => !projections.get(groupId(window))?.card,
        ),
        ...staleWindows,
      ],
      fresh.snapshot,
      windows,
      missingMessageIds,
    );
    const freshCards = new Map(
      fresh.cards.map((card) => [groupId(card), card]),
    );
    for (const segment of segments)
      for (const page of segment.pages)
        page.cards = page.cards.map(
          (card) => freshCards.get(groupId(card)) ?? card,
        );
    const cardIdentity = groupId;
    const knownCards = new Set([
      ...segments.flatMap((segment) =>
        segment.pages.flatMap((page) => page.cards.map(cardIdentity)),
      ),
      ...plan.detachedGroups.flatMap((ref) => {
        const projection = projections.get(groupId(ref))?.card;
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
      plan.groups.length === 0 &&
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
    const listedGroups = new Set(
      segments.flatMap((segment) =>
        segment.pages.flatMap((page) => page.cards.map(groupId)),
      ),
    );
    const detachedCards = refsFor([
      ...plan.detachedGroups,
      // The fresh page may stop before user-loaded older cards. Keep only
      // still-readable projections from a dropped retained segment.
      ...droppedGroups.filter((ref) => !listedGroups.has(groupId(ref))),
    ]).flatMap((ref) => {
      const projection = projections.get(groupId(ref));
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
          plan.groups.map(
            async (ref) =>
              [groupId(ref), await this.queryCard(signal, ref)] as const,
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
        if (!projections.get(groupId(window))?.card) continue;
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
          const projection = projections.get(groupId(window))!;
          const page = await this.queryMessages(
            signal,
            window.threadId,
            fresh.snapshot,
            undefined,
            window.anchorKey,
          );
          windows.push({
            ...this.window(projection.card!, fresh.snapshot, page, {}),
            id: window.id,
          });
        }
      }
      await this.relocateWindows(
        signal,
        plan.windows.filter(
          (window) => !projections.get(groupId(window))?.card,
        ),
        fresh.snapshot,
        windows,
        missingMessageIds,
      );
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
