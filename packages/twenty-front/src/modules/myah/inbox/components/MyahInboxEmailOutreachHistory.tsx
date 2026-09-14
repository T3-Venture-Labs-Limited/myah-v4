import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { styled } from '@linaria/react';
import {
  IconArrowBackUp,
  IconChevronDown,
  IconChevronUp,
} from 'twenty-ui/icon';
import { Chip, ChipVariant } from 'twenty-ui/data-display';
import { Button } from 'twenty-ui/input';
import { AppTooltip, TooltipDelay, TooltipPosition } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { MyahInboxEmailStoredMessage } from '@/myah/inbox/components/MyahInboxEmailStoredMessage';
import { getMyahInboxSafeEmailSubject } from '@/myah/inbox/components/MyahInboxEmailSubjectSeparator';
import { type useMyahInboxEmailHistory } from '@/myah/inbox/hooks/useMyahInboxEmailHistory';
import {
  type MyahInboxEmailCardFieldsFragment,
  type MyahInboxEmailStoredMessageFieldsFragment,
} from '~/generated/graphql';

const StyledHistory = styled.section`
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-anchor: none;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[2]};
  scrollbar-gutter: stable;
`;
const StyledCard = styled.article`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  margin-block: ${themeCssVariables.spacing[3]};
  min-width: 0;
  overflow-wrap: anywhere;
`;
const StyledSubjectHeader = styled.h3`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  margin: ${themeCssVariables.spacing[2]};
  min-width: 0;
  & > span {
    flex: 1 1 240px;
    max-width: 100%;
    min-width: 0;
  }
  & > [data-testid='chip'] {
    flex: 0 1 auto;
    margin-inline-start: auto;
    min-width: 0;
  }
`;
const StyledCampaignChip = styled(Chip)`
  font-weight: ${themeCssVariables.font.weight.regular};
`;
const StyledCampaignLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const StyledReplies = styled.div`
  border-left: 1px solid ${themeCssVariables.border.color.light};
  margin-left: 32px;
  min-width: 0;
  & > [data-reply-message] + [data-reply-message] {
    margin-top: ${themeCssVariables.spacing[2]};
  }
  @media (max-width: 600px) {
    margin-left: 16px;
  }
`;
const StyledControls = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;
const StyledHistoryPagination = styled(StyledControls)`
  justify-content: center;
`;
const StyledReplyActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]};
`;
type History = ReturnType<typeof useMyahInboxEmailHistory>;
type ReplyExpansionState = {
  scope: History['openCard'];
  initialized: boolean;
  expandedThreadIds: Set<string>;
};
type PendingReveal = { threadId: string; messageId: string };
type LocationRefs = {
  scope: History['openCard'];
  priorKeys: Set<string>;
  handledKeys: Set<string>;
  priorStatus: History['status'];
  recoveryObserved: boolean;
  pending: PendingReveal | null;
};
export const getMyahInboxOutreachCards = (
  history: Pick<History, 'segments' | 'windows' | 'detachedCards'>,
) => {
  const cards = new Map<string, MyahInboxEmailCardFieldsFragment>();
  for (const card of [
    ...history.segments.flatMap((segment) =>
      segment.pages.flatMap((page) => page.cards),
    ),
    ...history.detachedCards.map(({ card }) => card),
    ...history.windows.map((window) => window.card),
  ]) {
    if (!cards.has(card.threadId)) cards.set(card.threadId, card);
  }
  return [...cards.values()].sort(
    (a, b) =>
      a.startTimestamp.localeCompare(b.startTimestamp) ||
      String(a.rootMessageId).localeCompare(String(b.rootMessageId)) ||
      String(a.threadId).localeCompare(String(b.threadId)),
  );
};
const compareMessages = (
  a: MyahInboxEmailStoredMessageFieldsFragment,
  b: MyahInboxEmailStoredMessageFieldsFragment,
) =>
  a.receivedAt.localeCompare(b.receivedAt) ||
  String(a.id).localeCompare(String(b.id));
export type MyahInboxEmailOutreachHistoryProps = {
  history: History;
  onReply: (threadId: string) => void;
  inlineThreadId: string | null;
  inlineEditor: ReactNode;
};
export const MyahInboxEmailOutreachHistory = ({
  history,
  onReply,
  inlineThreadId,
  inlineEditor,
}: MyahInboxEmailOutreachHistoryProps) => {
  const cards = getMyahInboxOutreachCards(history);
  const [replyExpansion, setReplyExpansion] = useState<ReplyExpansionState>(
    () => ({
      scope: history.openCard,
      initialized: false,
      expandedThreadIds: new Set(),
    }),
  );
  const effectiveExpansion =
    replyExpansion.scope === history.openCard
      ? replyExpansion
      : {
          scope: history.openCard,
          initialized: false,
          expandedThreadIds: new Set<string>(),
        };
  // oxlint-disable-next-line twenty/no-state-useref
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());
  // oxlint-disable-next-line twenty/no-state-useref
  const regionRefs = useRef(new Map<string, HTMLDivElement>());
  // oxlint-disable-next-line twenty/no-state-useref
  const locationRefs = useRef<LocationRefs>({
    scope: history.openCard,
    priorKeys: new Set(),
    handledKeys: new Set(),
    priorStatus: history.status,
    recoveryObserved: false,
    pending: null,
  });
  if (locationRefs.current.scope !== history.openCard) {
    locationRefs.current = {
      scope: history.openCard,
      priorKeys: new Set(),
      handledKeys: new Set(),
      priorStatus: history.status,
      recoveryObserved: false,
      pending: null,
    };
  }
  useLayoutEffect(() => {
    if (replyExpansion.scope !== history.openCard)
      setReplyExpansion({
        scope: history.openCard,
        initialized: false,
        expandedThreadIds: new Set(),
      });
  }, [history.openCard, replyExpansion.scope]);
  useLayoutEffect(() => {
    if (effectiveExpansion.initialized || !cards.length) return;
    const latestThreadId = cards.at(-1)!.threadId;
    setReplyExpansion((current) =>
      current.scope !== history.openCard || current.initialized
        ? current
        : {
            ...current,
            initialized: true,
            expandedThreadIds: new Set([latestThreadId]),
          },
    );
  }, [cards, effectiveExpansion.initialized, history.openCard]);
  const isExpanded = (threadId: string) =>
    effectiveExpansion.expandedThreadIds.has(threadId);
  const toggleReplies = (threadId: string) => {
    const region = regionRefs.current.get(threadId);
    if (region?.contains(document.activeElement))
      toggleRefs.current.get(threadId)?.focus();
    setReplyExpansion((current) => {
      const base =
        current.scope === history.openCard
          ? current
          : {
              scope: history.openCard,
              initialized: false,
              expandedThreadIds: new Set<string>(),
            };
      const expandedThreadIds = new Set(base.expandedThreadIds);
      if (expandedThreadIds.has(threadId)) expandedThreadIds.delete(threadId);
      else expandedThreadIds.add(threadId);
      return { ...base, expandedThreadIds };
    });
  };
  const scroll = useRef<HTMLElement>(null);
  // DOM reading position survives the store's deliberate masking during refresh.
  // oxlint-disable-next-line twenty/no-state-useref
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const initialized = useRef(false);
  // Each history store is contact/workspace/authorization scoped. DOM offsets
  // from another store must not suppress the new contact's initial bottom view.
  // oxlint-disable-next-line twenty/no-state-useref
  const readingScope = useRef(history.openCard);
  if (readingScope.current !== history.openCard) {
    readingScope.current = history.openCard;
    anchor.current = null;
    initialized.current = false;
  }
  const nodes = () =>
    [
      ...(scroll.current?.querySelectorAll<HTMLElement>('[data-message-id]') ??
        []),
    ].filter((node) => !node.closest('[hidden]'));
  const captureAnchor = () => {
    const area = scroll.current;
    if (!area) return;
    const top = area.getBoundingClientRect().top;
    const node = nodes().find(
      (node) => node.getBoundingClientRect().bottom > top,
    );
    if (!node) return;
    const id = node.dataset.messageId!;
    anchor.current = { id, offset: node.getBoundingClientRect().top - top };
    for (const window of history.windows) {
      if (
        window.anchorMessageId !== id &&
        window.pages.some((page) =>
          [page.root, ...page.messages].some((message) => message.id === id),
        )
      )
        history.setReadingAnchor(window.id, id);
    }
  };
  // The store serializes transport. Schedule one bounded root/tail read per card,
  // never follow older cursors automatically.
  useEffect(() => {
    if (history.loading || history.status !== 'ready') return;
    const unopened = cards.find(
      (card) =>
        !history.windows.some((window) => window.threadId === card.threadId),
    );
    if (!unopened) return;
    const segment = history.segments.find((segment) =>
      segment.pages.some((page) =>
        page.cards.some((card) => card.threadId === unopened.threadId),
      ),
    );
    if (segment) void history.openCard(segment.id, unopened.threadId);
    else void history.openDetachedCard(unopened.threadId);
  }, [cards, history]);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const refs = locationRefs.current;
    if (history.status === 'masked' || history.status === 'needs-rebase') {
      refs.recoveryObserved = true;
      refs.priorStatus = history.status;
      return;
    }
    if (history.status !== 'ready') return;
    const locations = history.windows.flatMap((window) =>
      window.requests.flatMap((request) =>
        request.messageId
          ? [
              {
                key: `${window.id}:${request.messageId}`,
                threadId: window.threadId,
                messageId: request.messageId,
              },
            ]
          : [],
      ),
    );
    if (refs.recoveryObserved) {
      for (const { key } of locations) refs.handledKeys.add(key);
      refs.recoveryObserved = false;
    } else if (refs.priorStatus === 'ready') {
      const explicit = locations.find(
        ({ key }) => !refs.priorKeys.has(key) && !refs.handledKeys.has(key),
      );
      if (explicit) {
        refs.handledKeys.add(explicit.key);
        refs.pending = {
          threadId: explicit.threadId,
          messageId: explicit.messageId,
        };
        setReplyExpansion((current) => {
          if (
            current.scope !== history.openCard ||
            current.expandedThreadIds.has(explicit.threadId)
          )
            return current;
          return {
            ...current,
            expandedThreadIds: new Set([
              ...current.expandedThreadIds,
              explicit.threadId,
            ]),
          };
        });
      }
    }
    refs.priorKeys = new Set(locations.map(({ key }) => key));
    refs.priorStatus = 'ready';
  });
  useLayoutEffect(() => {
    const area = scroll.current;
    if (!area || history.status !== 'ready') return;
    if (anchor.current) {
      const node = nodes().find(
        (node) => node.dataset.messageId === anchor.current?.id,
      );
      if (node)
        area.scrollTop +=
          node.getBoundingClientRect().top -
          area.getBoundingClientRect().top -
          anchor.current.offset;
    } else if (
      !initialized.current &&
      cards.length &&
      cards.every((card) =>
        history.windows.some((window) => window.threadId === card.threadId),
      )
    ) {
      area.scrollTop = area.scrollHeight;
      initialized.current = true;
    }
    const pending = locationRefs.current.pending;
    if (pending) {
      const region = regionRefs.current.get(pending.threadId);
      const target = scroll.current?.querySelector<HTMLElement>(
        `[data-message-id="${pending.messageId}"]`,
      );
      if (
        region &&
        region.hidden === false &&
        target?.isConnected &&
        !target.closest('[hidden]')
      ) {
        target.scrollIntoView({ block: 'nearest' });
        target.focus({ preventScroll: true });
        locationRefs.current.pending = null;
      }
    }
  });
  const run = (action: () => Promise<void> | undefined) => {
    captureAnchor();
    void action();
  };
  const retryLabel =
    history.incrementalFailure?.kind === 'older-cards'
      ? 'Retry loading older conversations'
      : history.incrementalFailure
        ? `Retry loading ${history.incrementalFailure.direction} replies`
        : null;
  return (
    <StyledHistory
      ref={scroll}
      aria-label="Email outreach history"
      onScroll={captureAnchor}
    >
      {history.error && (
        <div role="alert">
          {history.error.message}
          <StyledControls>
            {retryLabel ? (
              <Button
                title={retryLabel}
                onClick={() => run(history.retryIncremental)}
              />
            ) : (
              <>
                <Button
                  title="Retry history"
                  onClick={() => run(history.refresh)}
                />
                <Button
                  title="Rebase history"
                  onClick={() => run(history.rebase)}
                />
              </>
            )}
          </StyledControls>
        </div>
      )}
      {history.historyRebased && (
        <p role="status">History rebased to currently available messages.</p>
      )}
      {(history.locationMissing || history.missingMessageIds.length > 0) && (
        <p role="status">
          Requested message is no longer available in this contact's readable
          history.
        </p>
      )}
      {history.loading && <p role="status">Loading email history</p>}
      {history.status === 'ready' && !cards.length && (
        <p>No email conversations available.</p>
      )}
      {cards.map((card) => {
        const subject = getMyahInboxSafeEmailSubject(card.subject ?? null);
        const windows = history.windows.filter(
          (window) => window.threadId === card.threadId,
        );
        const root = windows
          .flatMap((window) => window.pages.map((page) => page.root))
          .find((root) => root.id === card.rootMessageId);
        const messages = [
          ...new Map(
            windows
              .flatMap((window) =>
                window.pages.flatMap((page) => page.messages),
              )
              .filter((message) => message.id !== card.rootMessageId)
              .map((message) => [message.id, message]),
          ).values(),
        ].sort(compareMessages);
        const ranges = windows.map((window) => ({
          window,
          messages: [
            ...new Map(
              window.pages
                .flatMap((page) => page.messages)
                .map((message) => [message.id, message]),
            ).values(),
          ].sort(compareMessages),
        }));
        const gaps = ranges.flatMap((range) =>
          (['older', 'newer'] as const).flatMap((direction) => {
            if (
              !(direction === 'older'
                ? range.window.olderCursor
                : range.window.newerCursor)
            )
              return [];
            const boundary =
              direction === 'older'
                ? range.messages.at(0)
                : range.messages.at(-1);
            const covered =
              boundary &&
              ranges.some(
                (other) =>
                  other !== range &&
                  other.messages.some(
                    (message) => message.id === boundary.id,
                  ) &&
                  (direction === 'older'
                    ? compareMessages(other.messages[0], boundary) < 0 ||
                      !other.window.olderCursor
                    : compareMessages(other.messages.at(-1)!, boundary) > 0 ||
                      !other.window.newerCursor),
              );
            return covered
              ? []
              : [{ windowId: range.window.id, direction, boundary }];
          }),
        );
        const gapControl = (gap: (typeof gaps)[number]) => (
          <StyledControls key={`${gap.windowId}-${gap.direction}`}>
            <span>Messages not loaded</span>
            <Button
              title={`Load ${gap.direction} replies`}
              ariaLabel={`Load ${gap.direction} replies for ${subject}`}
              variant="secondary"
              size="small"
              disabled={history.loading}
              onClick={() =>
                run(() => history.loadMessages(gap.windowId, gap.direction))
              }
            />
          </StyledControls>
        );
        const expanded = isExpanded(card.threadId);
        const repliesId = `replies-${card.threadId}`;
        return (
          <div key={card.threadId}>
            {history.segments
              .filter(
                (segment) =>
                  Boolean(segment.olderCursor) &&
                  segment.pages.at(-1)?.cards.at(0)?.threadId === card.threadId,
              )
              .map((segment) => (
                <StyledHistoryPagination key={segment.id}>
                  <Button
                    title="Load History"
                    variant="secondary"
                    size="small"
                    disabled={history.loading}
                    onClick={() =>
                      run(() => history.loadOlderCards(segment.id))
                    }
                  />
                </StyledHistoryPagination>
              ))}
            <StyledCard
              data-thread-id={card.threadId}
              aria-label={`Outreach: ${subject}`}
            >
              <StyledSubjectHeader aria-label={subject}>
                <span>{subject}</span>
                {card.campaignLabel && (
                  <StyledCampaignChip
                    clickable={false}
                    isLabelHidden
                    label={card.campaignLabel}
                    maxWidth={300}
                    variant={ChipVariant.Static}
                    leftComponent={
                      <StyledCampaignLabel
                        data-testid="myah-inbox-campaign-label"
                        title={card.campaignLabel}
                      >
                        {card.campaignLabel}
                      </StyledCampaignLabel>
                    }
                  />
                )}
              </StyledSubjectHeader>
              {root && (
                <MyahInboxEmailStoredMessage key={root.id} message={root} />
              )}
              <StyledReplyActions
                aria-label={`Reply actions for ${subject}`}
                role="group"
              >
                <Button
                  ref={(element) => {
                    if (element) toggleRefs.current.set(card.threadId, element);
                    else toggleRefs.current.delete(card.threadId);
                  }}
                  Icon={expanded ? IconChevronUp : IconChevronDown}
                  ariaLabel={`${expanded ? 'Hide' : 'Show'} replies for ${subject}`}
                  aria-expanded={expanded}
                  aria-controls={repliesId}
                  dataTestId={`myah-inbox-replies-toggle-${card.threadId}`}
                  variant="tertiary"
                  size="small"
                  onClick={() => toggleReplies(card.threadId)}
                />
                <div data-reply-thread-id={card.threadId}>
                  <Button
                    Icon={IconArrowBackUp}
                    ariaLabel={`Reply to ${subject}`}
                    dataTestId={`myah-inbox-reply-${card.threadId}`}
                    variant="tertiary"
                    size="small"
                    onClick={() => onReply(card.threadId)}
                  />
                </div>
              </StyledReplyActions>
              <AppTooltip
                anchorSelect={`[data-testid='myah-inbox-replies-toggle-${card.threadId}']`}
                content={expanded ? 'Hide replies' : 'Show replies'}
                delay={TooltipDelay.shortDelay}
                place={TooltipPosition.Top}
              />
              <AppTooltip
                anchorSelect={`[data-testid='myah-inbox-reply-${card.threadId}']`}
                content="Reply"
                delay={TooltipDelay.shortDelay}
                place={TooltipPosition.Top}
              />
              <StyledReplies
                ref={(element) => {
                  if (element) regionRefs.current.set(card.threadId, element);
                  else regionRefs.current.delete(card.threadId);
                }}
                id={repliesId}
                aria-label={`Replies for ${subject}`}
                hidden={!expanded}
              >
                {gaps.filter((gap) => !gap.boundary).map(gapControl)}
                {messages.map((message) => (
                  <div key={message.id} data-reply-message>
                    {gaps
                      .filter(
                        (gap) =>
                          gap.direction === 'older' &&
                          gap.boundary?.id === message.id,
                      )
                      .map(gapControl)}
                    <MyahInboxEmailStoredMessage message={message} />
                    {gaps
                      .filter(
                        (gap) =>
                          gap.direction === 'newer' &&
                          gap.boundary?.id === message.id,
                      )
                      .map(gapControl)}
                  </div>
                ))}
              </StyledReplies>
              {inlineThreadId === card.threadId && inlineEditor}
            </StyledCard>
          </div>
        );
      })}
    </StyledHistory>
  );
};
