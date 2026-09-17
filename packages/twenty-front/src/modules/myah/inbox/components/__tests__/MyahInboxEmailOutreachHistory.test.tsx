import { readFileSync } from 'node:fs';
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MyahInboxEmailOutreachHistory } from '@/myah/inbox/components/MyahInboxEmailOutreachHistory';
import { useMyahInboxEmailHistory } from '@/myah/inbox/hooks/useMyahInboxEmailHistory';
let mockClient: ApolloClient;
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
const card = (id: string, campaignLabel: string | null = 'Same campaign') => ({
  threadId: id,
  rootMessageId: `${id}-root`,
  startTimestamp: `2026-09-0${id.slice(1)}T00:00:00Z`,
  subject: `Subject ${id}`,
  campaignLabel,
  historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
});
const message = (id: string, threadId: string, day = 6) => ({
  id,
  messageThreadId: threadId,
  receivedAt: `2026-09-0${day}T00:00:00Z`,
  subject: 'Reply subject',
  text: `Body ${id}`,
  direction: 'INCOMING',
  visibility: 'FULL',
  participants: [],
  attachmentFileIds: [],
});
type Request = {
  name: string;
  variables: Record<string, unknown>;
  resolve: (data: Record<string, unknown>) => void;
  reject: () => void;
};
let requests: Request[];
const take = (name: string) => {
  const index = requests.findIndex((r) => r.name === name);
  if (index < 0) throw Error(`Missing ${name}`);
  return requests.splice(index, 1)[0];
};
const reply = jest.fn();
let internalHistory: ReturnType<typeof useMyahInboxEmailHistory>;
type HarnessProps = {
  contactId?: string;
  workspaceId?: string;
  authorizationKey?: string;
};
const Harness = ({
  contactId = 'contact',
  workspaceId = 'workspace',
  authorizationKey = 'member',
}: HarnessProps) => {
  const history = useMyahInboxEmailHistory(
    workspaceId,
    contactId,
    authorizationKey,
  );
  internalHistory = history;
  return <MyahInboxEmailOutreachHistory history={history} onReply={reply} />;
};
const cardPage = (
  ids: string[],
  snapshot: string,
  olderCursor: string | null = null,
  campaignLabel: string | null = 'Same campaign',
) => ({
  myahInboxContactEmailCards: {
    cards: ids.map((id) => card(id, campaignLabel)),
    snapshot,
    olderCursor,
    latestThreadId: ids.at(-1),
  },
});
const messagesPage = (threadId: string) => ({
  myahInboxContactEmailCardMessages: {
    threadId,
    root: message(`${threadId}-root`, threadId, Number(threadId.slice(1))),
    messages: [
      message(`${threadId}-m8`, threadId, 8),
      message(`${threadId}-m9`, threadId, 9),
    ],
    olderCursor: threadId === 't5' ? 'older-replies' : null,
    newerCursor: null,
  },
});
const olderMessagesPage = (threadId: string) => ({
  myahInboxContactEmailCardMessages: {
    threadId,
    root: message(`${threadId}-root`, threadId, Number(threadId.slice(1))),
    messages: [message(`${threadId}-m6`, threadId, 6)],
    olderCursor: null,
    newerCursor: null,
  },
});
const locationPage = (messageId: string) => {
  const threadId = messageId.slice(0, 2);
  const page = messageId.endsWith('-m6')
    ? olderMessagesPage(threadId)
    : messagesPage(threadId);
  return {
    myahInboxContactEmailMessageLocation: {
      card: card(threadId),
      page: page.myahInboxContactEmailCardMessages,
    },
  };
};
const respond = async (request: Request, data: Record<string, unknown>) =>
  act(async () => request.resolve(data));
const resolveCards = async (
  ids = ['t3', 't4', 't5'],
  olderCursor: string | null = 'old',
  campaignLabel: string | null = 'Same campaign',
) => {
  await respond(
    take('MyahInboxContactEmailCards'),
    cardPage(ids, 'snapshot', olderCursor, campaignLabel),
  );
  for (const id of ids) {
    await waitFor(() =>
      expect(
        requests.some((r) => r.name === 'MyahInboxContactEmailCardMessages'),
      ).toBe(true),
    );
    const request = take('MyahInboxContactEmailCardMessages');
    expect(request.variables.threadId).toBe(id);
    await respond(request, messagesPage(id));
  }
};
beforeEach(() => {
  requests = [];
  reply.mockClear();
  mockClient = new ApolloClient({
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
            reject: () => observer.error(Error('Unavailable')),
          });
        }),
    ),
  });
});
afterEach(() => mockClient.stop());
it('renders three distinct ascending native cards with root and real replies; loads only on explicit older action', async () => {
  const { container } = render(<Harness />);
  await resolveCards();
  expect(
    [...container.querySelectorAll('[data-thread-id]')].map((node) =>
      node.getAttribute('data-thread-id'),
    ),
  ).toEqual(['t3', 't4', 't5']);
  expect(screen.getAllByText('Same campaign')).toHaveLength(3);
  expect(screen.queryByText(/History available from/)).toBeNull();
  for (const id of ['t3', 't4', 't5']) {
    const outreachCard = container.querySelector<HTMLElement>(
      `[data-thread-id="${id}"]`,
    )!;
    const subjectHeader = within(outreachCard).getByRole('heading', {
      name: `Subject ${id}`,
    });
    const campaignTag = within(subjectHeader).getByTestId('chip');
    expect(campaignTag).toHaveTextContent('Same campaign');
    expect(campaignTag.querySelector('button, img, svg')).toBeNull();
  }
  expect(container.querySelectorAll('[data-message-id]')).toHaveLength(9);
  expect(requests).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Refresh history' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reply to Subject t3' }));
  expect(reply).toHaveBeenCalledWith('t3');
  fireEvent.click(screen.getByRole('button', { name: 'Load History' }));
  expect(take('MyahInboxContactEmailCards').variables).toMatchObject({
    olderCursor: 'old',
    snapshot: 'snapshot',
  });
});
it('renders five unique cards and no Load History buttons after three contact returns once older history is exhausted', async () => {
  const { container, rerender } = render(<Harness />);
  await resolveCards(['t3', 't4', 't5'], 'old');
  fireEvent.click(screen.getByRole('button', { name: 'Load History' }));
  await resolveCards(['t1', 't2'], null);

  const returnToPrimary = async (number: number) => {
    rerender(<Harness contactId={`other-${number}`} />);
    await resolveCards([`x${number}`], null);
    rerender(<Harness contactId="contact" />);

    await waitFor(() =>
      expect(
        requests.filter(
          (request) => request.name === 'MyahInboxContactEmailCard',
        ),
      ).toHaveLength(5),
    );
    for (const projection of requests.splice(0)) {
      const threadId = projection.variables.threadId as string;
      await respond(projection, {
        myahInboxContactEmailCard: {
          snapshot: `projection-${number}`,
          card: card(threadId),
        },
      });
    }
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.name === 'MyahInboxContactEmailCards',
        ),
      ).toBe(true),
    );
    await respond(
      take('MyahInboxContactEmailCards'),
      cardPage(['t3', 't4', 't5'], 'snapshot', 'old'),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.name === 'MyahInboxContactEmailCards',
        ),
      ).toBe(true),
    );
    await respond(
      take('MyahInboxContactEmailCards'),
      cardPage(['t1', 't2'], 'snapshot', null),
    );
    for (let count = 0; count < 5; count += 1) {
      await waitFor(() =>
        expect(
          requests.some(
            (request) => request.name === 'MyahInboxContactEmailCardMessages',
          ),
        ).toBe(true),
      );
      const replay = take('MyahInboxContactEmailCardMessages');
      await respond(replay, messagesPage(replay.variables.threadId as string));
    }
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.name === 'MyahInboxContactEmailCards',
        ),
      ).toBe(true),
    );
    await respond(
      take('MyahInboxContactEmailCards'),
      cardPage(['t3', 't4', 't5'], `fresh-${number}`, 'fresh-old'),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.name === 'MyahInboxContactEmailCards',
        ),
      ).toBe(true),
    );
    const freshContinuation = take('MyahInboxContactEmailCards');
    expect(freshContinuation.variables).toMatchObject({
      snapshot: `fresh-${number}`,
      olderCursor: 'fresh-old',
    });
    await respond(freshContinuation, cardPage(['t1', 't2'], `fresh-${number}`));
  };

  for (const number of [1, 2, 3]) await returnToPrimary(number);
  expect(
    [...container.querySelectorAll('[data-thread-id]')].map((node) =>
      node.getAttribute('data-thread-id'),
    ),
  ).toEqual(['t1', 't2', 't3', 't4', 't5']);
  expect(
    screen.queryAllByRole('button', { name: 'Load History' }),
  ).toHaveLength(0);
});

it('omits the campaign tag when the card has no linked campaign', async () => {
  const { container } = render(<Harness />);
  await resolveCards(['t5'], null, null);
  const outreachCard = container.querySelector<HTMLElement>(
    '[data-thread-id="t5"]',
  )!;
  expect(within(outreachCard).queryByTestId('chip')).toBeNull();
});

it('lets campaign tags size to their text without overriding the native maximum', () => {
  const source = readFileSync(
    `${__dirname}/../MyahInboxEmailOutreachHistory.tsx`,
    'utf8',
  );
  const chipLayout = source.match(
    /& > \[data-testid='chip'\] \{([^}]+)\}/,
  )?.[1];
  expect(chipLayout).toContain('flex: 0 1 auto;');
  expect(chipLayout).not.toContain('max-width:');
});

it('renders a constrained URL-bearing campaign tag as inert text with its full label available', async () => {
  const { container } = render(<Harness />);
  const campaignLabel =
    'Sunday Studio · https://example.com/september-reset · Creator Outreach';
  await resolveCards(['t5'], null, campaignLabel);
  const outreachCard = container.querySelector<HTMLElement>(
    '[data-thread-id="t5"]',
  )!;
  const subjectHeader = within(outreachCard).getByRole('heading', {
    name: 'Subject t5',
  });
  const campaignTag = within(subjectHeader).getByTestId('chip');
  const campaignText = within(campaignTag).getByTestId(
    'myah-inbox-campaign-label',
  );
  expect(campaignTag).toHaveTextContent(campaignLabel);
  expect(campaignText).toHaveAttribute('title', campaignLabel);
  expect(campaignTag.style.getPropertyValue('--chip-max-width')).toBe('300px');
  expect(
    campaignTag.querySelectorAll(
      'a, button, input, select, textarea, [tabindex], img, svg',
    ),
  ).toHaveLength(0);
});

it('fills a real root-to-tail gap without duplicating or recursively nesting messages', async () => {
  const { container } = render(<Harness />);
  await resolveCards(['t5'], null);
  expect(
    screen.queryByRole('button', { name: /(?:Refresh|Load) History/ }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Load older replies for Subject t5' }),
  );
  const request = take('MyahInboxContactEmailCardMessages');
  expect(request.variables.cursor).toBe('older-replies');
  await respond(request, {
    myahInboxContactEmailCardMessages: {
      threadId: 't5',
      root: message('t5-root', 't5', 5),
      messages: [message('t5-m6', 't5', 6), message('t5-m7', 't5', 7)],
      olderCursor: null,
      newerCursor: 'back',
    },
  });
  expect(
    [...container.querySelectorAll('[data-message-id]')].map((n) =>
      n.getAttribute('data-message-id'),
    ),
  ).toEqual(['t5-root', 't5-m6', 't5-m7', 't5-m8', 't5-m9']);
  expect(
    screen.queryByRole('button', { name: 'Load older replies for Subject t5' }),
  ).toBeNull();
  expect(
    container.querySelector('[data-message-id] [data-message-id]'),
  ).toBeNull();
});
it('keeps readable cards and Reply surfaces with a contextual retry after transient pagination failure', async () => {
  const { container } = render(<Harness />);
  await resolveCards(['t5'], 'old');
  fireEvent.click(screen.getByRole('button', { name: 'Load History' }));
  await act(async () => take('MyahInboxContactEmailCards').reject());
  expect(container.querySelector('[data-thread-id="t5"]')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Reply to Subject t5' }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading older conversations' }),
  );
  const retry = take('MyahInboxContactEmailCards');
  expect(retry.variables).toMatchObject({
    snapshot: 'snapshot',
    olderCursor: 'old',
  });
  await respond(retry, {
    myahInboxContactEmailCards: {
      cards: [card('t4')],
      snapshot: 'snapshot',
      olderCursor: null,
      latestThreadId: 't5',
    },
  });
  expect(container.querySelector('[data-thread-id="t5"]')).toBeVisible();
  expect(container.querySelector('[data-thread-id="t4"]')).toBeVisible();
});

it('masks failed history and offers explicit retry/rebase without inventing import notices', async () => {
  render(<Harness />);
  await act(async () => take('MyahInboxContactEmailCards').reject());
  expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  expect(screen.getByRole('button', { name: 'Retry history' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Rebase history' })).toBeVisible();
  expect(screen.queryByText(/newly synced|new reply/i)).toBeNull();
});

it('places every independent older-card frontier above its actual oldest retained card after prepend', async () => {
  const { container } = render(<Harness />);
  await resolveCards();
  fireEvent.click(screen.getByRole('button', { name: 'Load History' }));
  await resolveCards(['t1', 't2'], 'still-older');
  const load = screen.getByRole('button', { name: 'Load History' });
  const oldest = container.querySelector('[data-thread-id="t1"]')!;
  expect(
    load.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('reveals explicit location windows while retaining gaps and deduplication', async () => {
  const { container } = render(<Harness />);
  await resolveCards();
  const spies = installRevealSpies();
  try {
    expect(screen.queryByRole('textbox', { name: 'Message ID' })).toBeNull();
    await act(async () => {
      void internalHistory.locateMessage('t1-m7');
    });
    const locate = take('MyahInboxContactEmailMessageLocation');
    expect(locate.variables).toMatchObject({
      messageId: 't1-m7',
      snapshot: 'snapshot',
    });
    await respond(locate, {
      myahInboxContactEmailMessageLocation: {
        card: card('t1'),
        page: {
          threadId: 't1',
          root: message('t1-root', 't1', 1),
          messages: [message('t1-m7', 't1', 7)],
          olderCursor: 'before-target',
          newerCursor: 'after-target',
        },
      },
    });
    const target = container.querySelector<HTMLElement>(
      '[data-message-id="t1-m7"]',
    )!;
    await waitFor(() => expect(target).toHaveFocus());
    expect(screen.getByLabelText('Replies for Subject t1')).not.toHaveAttribute(
      'hidden',
    );
    expect(spies.scroll).toHaveBeenCalledTimes(1);
    expect(spies.focus).toHaveBeenCalledTimes(1);
    expect(
      [...container.querySelectorAll('[data-thread-id]')].map((node) =>
        node.getAttribute('data-thread-id'),
      ),
    ).toEqual(['t1', 't3', 't4', 't5']);
    expect(screen.getByRole('button', { name: 'Load History' })).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Load newer replies for Subject t1' }),
    );
    const newer = take('MyahInboxContactEmailCardMessages');
    expect(newer.variables).toMatchObject({
      threadId: 't1',
      cursor: 'after-target',
      snapshot: 'snapshot',
    });
    await respond(newer, {
      myahInboxContactEmailCardMessages: {
        threadId: 't1',
        root: message('t1-root', 't1', 1),
        messages: [message('t1-m8', 't1', 8)],
        olderCursor: 'back',
        newerCursor: null,
      },
    });
    expect(
      container.querySelectorAll('[data-message-id="t1-root"]'),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', {
        name: 'Load newer replies for Subject t1',
      }),
    ).toBeNull();
    expect(reply).not.toHaveBeenCalled();
    expect(spies.scroll).toHaveBeenCalledTimes(1);
    expect(spies.focus).toHaveBeenCalledTimes(1);
  } finally {
    spies.restore();
  }
});

it('renders icon-only reply actions with accessible labels, focus, and tooltips', async () => {
  const { container } = render(<Harness />);
  await resolveCards(['t5'], null);
  const card = container.querySelector<HTMLElement>('[data-thread-id="t5"]')!;
  const actions = within(card).getByRole('group', {
    name: 'Reply actions for Subject t5',
  });
  const toggle = within(actions).getByRole('button', {
    name: 'Hide replies for Subject t5',
  });
  const replyAction = within(actions).getByRole('button', {
    name: 'Reply to Subject t5',
  });
  const replies = screen.getByLabelText('Replies for Subject t5');

  expect(actions).toContainElement(toggle);
  expect(actions).toContainElement(replyAction);
  expect(
    actions.compareDocumentPosition(replies) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(toggle).not.toHaveTextContent(/(?:Show|Hide) replies/);
  expect(replyAction).not.toHaveTextContent('Reply');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');

  fireEvent.focus(toggle);
  await waitFor(() => expect(screen.getByText('Hide replies')).toBeVisible());
  fireEvent.blur(toggle);
  fireEvent.focus(replyAction);
  await waitFor(() => expect(screen.getByText('Reply')).toBeVisible());

  fireEvent.click(replyAction);
  expect(reply).toHaveBeenCalledWith('t5');

  fireEvent.click(toggle);
  expect(
    screen.getByRole('button', { name: 'Show replies for Subject t5' }),
  ).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(
    screen.getByRole('button', { name: 'Show replies for Subject t5' }),
  );
  expect(
    screen.getByRole('button', { name: 'Hide replies for Subject t5' }),
  ).toHaveAttribute('aria-expanded', 'true');
});

it('starts a different contact at newest history rather than retaining another contact reading anchor', async () => {
  const geometry = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.messageId ? 100 : 0;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 100,
        bottom: top + 20,
        width: 100,
        height: 20,
        toJSON: () => ({}),
      };
    });
  try {
    const view = render(<Harness />);
    const area = screen.getByRole('region', { name: 'Email outreach history' });
    Object.defineProperty(area, 'scrollHeight', {
      configurable: true,
      value: 600,
    });
    await resolveCards();
    expect(area.scrollTop).toBe(600);
    fireEvent.scroll(area);
    view.rerender(<Harness contactId="another-contact" />);
    area.scrollTop = 0;
    await resolveCards(['t1', 't2'], null);
    expect(area.scrollTop).toBe(600);
  } finally {
    geometry.mockRestore();
  }
});

const resolveRefresh = async ({
  replayOlderT5 = false,
}: { replayOlderT5?: boolean } = {}) => {
  for (const threadId of ['t3', 't4', 't5']) {
    const projection = take('MyahInboxContactEmailCard');
    expect(projection.variables.threadId).toBe(threadId);
    await respond(projection, {
      myahInboxContactEmailCard: {
        snapshot: 'snapshot',
        card: card(threadId),
      },
    });
  }
  await waitFor(() =>
    expect(
      requests.some((request) => request.name === 'MyahInboxContactEmailCards'),
    ).toBe(true),
  );
  const retained = take('MyahInboxContactEmailCards');
  expect(retained.variables).toMatchObject({ snapshot: 'snapshot' });
  await respond(retained, cardPage(['t3', 't4', 't5'], 'snapshot', 'old'));
  const replays = [
    { threadId: 't3', cursor: undefined, page: messagesPage('t3') },
    { threadId: 't4', cursor: undefined, page: messagesPage('t4') },
    { threadId: 't5', cursor: undefined, page: messagesPage('t5') },
    ...(replayOlderT5
      ? [
          {
            threadId: 't5',
            cursor: 'older-replies',
            page: olderMessagesPage('t5'),
          },
        ]
      : []),
  ];
  for (const { threadId, cursor, page } of replays) {
    await waitFor(() =>
      expect(
        requests.some(
          (request) => request.name === 'MyahInboxContactEmailCardMessages',
        ),
      ).toBe(true),
    );
    const replay = take('MyahInboxContactEmailCardMessages');
    expect(replay.variables).toMatchObject({ threadId, snapshot: 'snapshot' });
    expect(replay.variables.cursor).toBe(cursor);
    await respond(replay, page);
  }
  await waitFor(() =>
    expect(
      requests.some((request) => request.name === 'MyahInboxContactEmailCards'),
    ).toBe(true),
  );
  const fresh = take('MyahInboxContactEmailCards');
  expect(fresh.variables.snapshot).toBeUndefined();
  await respond(fresh, cardPage(['t3', 't4', 't5', 't6'], 'fresh-snapshot'));
  await waitFor(() =>
    expect(
      requests.some(
        (request) =>
          request.name === 'MyahInboxContactEmailCardMessages' &&
          request.variables.threadId === 't6' &&
          request.variables.snapshot === 'fresh-snapshot',
      ),
    ).toBe(true),
  );
  await respond(take('MyahInboxContactEmailCardMessages'), messagesPage('t6'));
};

const resolveRebase = async () => {
  const fresh = take('MyahInboxContactEmailCards');
  expect(fresh.variables.snapshot).toBeUndefined();
  await respond(fresh, cardPage(['t3', 't4', 't5', 't6'], 'rebase-snapshot'));
  for (const threadId of ['t3', 't4', 't5', 't6']) {
    const projection = take('MyahInboxContactEmailCard');
    expect(projection.variables.threadId).toBe(threadId);
    await respond(projection, {
      myahInboxContactEmailCard: {
        snapshot: 'rebase-snapshot',
        card: card(threadId),
      },
    });
  }
  for (const messageId of ['t3-m8', 't4-m8', 't5-m8', 't5-m6', 't6-m8']) {
    const location = take('MyahInboxContactEmailMessageLocation');
    expect(location.variables).toMatchObject({
      messageId,
      snapshot: 'rebase-snapshot',
    });
    await respond(location, locationPage(messageId));
  }
};

const installRevealSpies = () => {
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  const originalFocus = HTMLElement.prototype.focus;
  const scroll = jest.fn(function (this: HTMLElement) {
    expect(this.closest('[hidden]')).toBeNull();
    expect(this.closest('[aria-label^="Replies for"]')).not.toHaveAttribute(
      'hidden',
    );
  });
  const focus = jest
    .spyOn(HTMLElement.prototype, 'focus')
    .mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      expect(this.closest('[hidden]')).toBeNull();
      expect(this.closest('[aria-label^="Replies for"]')).not.toHaveAttribute(
        'hidden',
      );
      return originalFocus.call(this, options);
    });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  });
  return {
    scroll,
    focus,
    restore: () => {
      focus.mockRestore();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScroll,
      });
    },
  };
};

it('defaults latest-only, keeps roots/Reply controls, and never claims a loaded count', async () => {
  const { container } = render(<Harness />);
  await resolveCards();
  for (const id of ['t3', 't4', 't5'])
    expect(
      container.querySelector(`[data-message-id="${id}-root"]`),
    ).not.toBeNull();
  expect(
    screen.getByRole('button', { name: 'Show replies for Subject t3' }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(
    screen.getByRole('button', { name: 'Show replies for Subject t4' }),
  ).toHaveAttribute('aria-expanded', 'false');
  expect(
    screen.getByRole('button', { name: 'Hide replies for Subject t5' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByLabelText('Replies for Subject t3')).toHaveAttribute(
    'hidden',
  );
  expect(screen.getByLabelText('Replies for Subject t4')).toHaveAttribute(
    'hidden',
  );
  expect(screen.getByLabelText('Replies for Subject t5')).not.toHaveAttribute(
    'hidden',
  );
  expect(container.querySelectorAll('[data-message-id]')).toHaveLength(9);
  for (const id of ['t3', 't4', 't5'])
    expect(
      screen.getByRole('button', { name: `Reply to Subject ${id}` }),
    ).toBeVisible();
  expect(screen.queryByText(/\d+ replies/i)).toBeNull();
});

it('routes a card reply independently from reply expansion', async () => {
  render(<Harness />);
  await resolveCards();

  fireEvent.click(screen.getByRole('button', { name: 'Reply to Subject t3' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Show replies for Subject t3' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide replies for Subject t3' }),
  );

  expect(reply).toHaveBeenCalledWith('t3');
  expect(requests).toEqual([]);
});

it('keeps manual choices through the actual refresh sequence and defaults again per scope', async () => {
  const view = render(<Harness />);
  await resolveCards();
  fireEvent.click(
    screen.getByRole('button', { name: 'Show replies for Subject t3' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide replies for Subject t5' }),
  );
  expect(requests).toEqual([]);
  act(() => void internalHistory.refresh());
  await resolveRefresh();
  await waitFor(() => expect(requests).toEqual([]));
  expect(
    screen.getByRole('button', { name: 'Hide replies for Subject t3' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Show replies for Subject t5' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Show replies for Subject t6' }),
  ).toBeVisible();

  for (const props of [
    { authorizationKey: 'member-2' },
    { workspaceId: 'workspace-2' },
    { contactId: 'contact-2' },
  ]) {
    view.rerender(
      <Harness
        authorizationKey={props.authorizationKey}
        contactId={props.contactId}
        workspaceId={props.workspaceId}
      />,
    );
    await resolveCards(['t3', 't4', 't5'], null);
    expect(
      screen.getByRole('button', { name: 'Hide replies for Subject t5' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Show replies for Subject t3' }),
    ).toBeVisible();
  }
});

it('reveals an explicit location before its only scroll and focus', async () => {
  const { container } = render(<Harness />);
  await resolveCards();
  const spies = installRevealSpies();
  try {
    act(() => void internalHistory.locateMessage('t1-m7'));
    const locate = take('MyahInboxContactEmailMessageLocation');
    await respond(locate, {
      myahInboxContactEmailMessageLocation: {
        card: card('t1'),
        page: {
          threadId: 't1',
          root: message('t1-root', 't1', 1),
          messages: [message('t1-m7', 't1', 7)],
          olderCursor: null,
          newerCursor: null,
        },
      },
    });
    const target = container.querySelector<HTMLElement>(
      '[data-message-id="t1-m7"]',
    )!;
    await waitFor(() => expect(target).toHaveFocus());
    expect(screen.getByLabelText('Replies for Subject t1')).not.toHaveAttribute(
      'hidden',
    );
    expect(spies.scroll).toHaveBeenCalledTimes(1);
    expect(spies.focus).toHaveBeenCalledTimes(1);
  } finally {
    spies.restore();
  }
});

it('does not scroll or focus for passive reads, pagination, refresh, rebase, or recovery', async () => {
  render(<Harness />);
  await resolveCards();
  const spies = installRevealSpies();
  try {
    const area = screen.getByRole('region', { name: 'Email outreach history' });
    fireEvent.scroll(area);
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older replies for Subject t5' }),
    );
    await respond(
      take('MyahInboxContactEmailCardMessages'),
      olderMessagesPage('t5'),
    );
    act(() => void internalHistory.refresh());
    await resolveRefresh({ replayOlderT5: true });
    act(() => void internalHistory.rebase());
    await resolveRebase();
    await waitFor(() => expect(requests).toEqual([]));
    expect(spies.scroll).not.toHaveBeenCalled();
    expect(spies.focus).not.toHaveBeenCalled();
  } finally {
    spies.restore();
  }
});

it('moves focus from a hidden descendant to that card toggle synchronously', async () => {
  const { container } = render(<Harness />);
  await resolveCards(['t5'], null);
  const replyMessage = container.querySelector<HTMLElement>(
    '[data-message-id="t5-m8"]',
  )!;
  replyMessage.focus();
  expect(replyMessage).toHaveFocus();
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide replies for Subject t5' }),
  );
  expect(
    screen.getByRole('button', { name: 'Show replies for Subject t5' }),
  ).toHaveFocus();
});

it('never restores a reading anchor from a mounted hidden reply', async () => {
  const geometry = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  let hiddenReads = 0;
  geometry.mockImplementation(function (this: HTMLElement) {
    if (this.closest('[hidden]')) hiddenReads += 1;
    const isHistory =
      this.getAttribute('aria-label') === 'Email outreach history';
    const isTarget = this.dataset.messageId === 't5-m8';
    const top = isHistory ? 0 : isTarget ? 10 : -100;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 100,
      bottom: top + 10,
      width: 100,
      height: 10,
      toJSON: () => ({}),
    };
  });
  try {
    render(<Harness />);
    await resolveCards(['t5'], null);
    const area = screen.getByRole('region', { name: 'Email outreach history' });
    const setReadingAnchor = jest.spyOn(internalHistory, 'setReadingAnchor');
    area.scrollTop = 321;
    fireEvent.scroll(area);
    await waitFor(() =>
      expect(setReadingAnchor).toHaveBeenCalledWith(
        expect.any(String),
        't5-m8',
      ),
    );
    hiddenReads = 0;
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide replies for Subject t5' }),
    );
    expect(area.scrollTop).toBe(321);
    expect(hiddenReads).toBe(0);
  } finally {
    geometry.mockRestore();
  }
});
