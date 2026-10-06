import { styled } from '@linaria/react';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MyahInboxContactConversation } from '@/myah/inbox/components/MyahInboxContactConversation';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';
import { MyahInboxEmailHistoryStore } from '@/myah/inbox/utils/myahInboxEmailHistoryStore';

import { mockedApolloClient } from '~/testing/mockedApolloClient';

// MYAH-478 regression: the keyboard-scrollable Email pane must show the Myah
// brand focus ring inside its own bounds instead of the browser default ring.
// Real (trusted) mouse and keyboard input is required because the browser's
// :focus-visible heuristic ignores synthetic events, so the play function uses
// Vitest browser-mode input and only runs under the Storybook Vitest runner.

const contact: MyahInboxContact = {
  id: 'myah-478-contact',
  identityKind: 'CREATOR',
  displayName: 'Ada Okafor',
  instagramDisplayHandle: null,
  creator: { id: 'myah-478-creator', name: 'Ada Okafor' },
  lastActivityAt: '2026-10-05T10:00:00.000Z',
  latestChannel: 'EMAIL',
  initialSelection: {
    channel: 'EMAIL',
    emailThreadId: null,
    instagramConversationId: null,
  },
  preview: null,
  sender: null,
  needsAttention: false,
  triage: {
    isAvailable: false,
    inboxOwnerId: null,
    inboxState: null,
    snoozedUntil: null,
    revision: null,
    identityGeneration: null,
  },
  email: {
    isAvailable: true,
    threadCount: 0,
    threadIds: [],
    latestThreadId: null,
    needsAttention: false,
  },
  instagram: {
    isAvailable: false,
    state: 'UNAVAILABLE',
    needsAttention: false,
    conversations: [],
  },
};

const noop = () => undefined;
const asyncNoop = async () => undefined;

// An unstarted history store: its idle snapshot renders an empty Email pane
// without network requests.
const historyStore = new MyahInboxEmailHistoryStore(
  mockedApolloClient,
  'myah-478-workspace',
  contact.id,
  'myah-478-authorization',
);
const emailHistory = {
  ...historyStore.getSnapshot(),
  loadOlderCards: historyStore.loadOlderCards,
  openCard: historyStore.openCard,
  openDetachedCard: historyStore.openDetachedCard,
  locateMessage: historyStore.locateMessage,
  loadMessages: historyStore.loadMessages,
  retryIncremental: historyStore.retryIncremental,
  refresh: historyStore.refresh,
  ambientRefresh: historyStore.ambientRefresh,
  rebase: historyStore.rebase,
  setReadingAnchor: historyStore.setReadingAnchor,
  purge: historyStore.purge,
};

const StyledFrame = styled.div`
  display: grid;
  grid-template-columns: 160px 640px;
  height: 480px;
`;

const StyledOutside = styled.div`
  padding: 8px;
`;

const StyledPanel = styled.div`
  display: flex;
  min-height: 0;
`;

const StyledTokenProbe = styled.span`
  color: var(--t-brand-focus-ring);
  position: absolute;
  visibility: hidden;
`;

const MyahInboxContactConversationFocusHarness = ({
  colorScheme,
}: {
  colorScheme: 'light' | 'dark';
}) => (
  <ThemeProvider colorScheme={colorScheme} applyToRoot={false}>
    <StyledFrame>
      <StyledOutside>
        <button type="button">Outside control</button>
        <StyledTokenProbe data-testid="brand-focus-ring-probe" />
      </StyledOutside>
      <StyledPanel>
        <MyahInboxContactConversation
          workspaceId="myah-478-workspace"
          contact={contact}
          selectionChannel="EMAIL"
          selectedEmailThreadId={null}
          email={emailHistory}
          latestThreadId={null}
          onSwitchToLatest={noop}
          selectedThread={{
            thread: null,
            loading: false,
            error: null,
            refresh: async () => null,
          }}
          onSelectChannel={noop}
          onReplyToCard={noop}
          onContactLinked={asyncNoop}
          onActivity={asyncNoop}
          renderEmailReplyWorkspace={() => <p>Reply composer stub</p>}
          onThreadUpdated={noop}
          onUpdateFailed={noop}
        />
      </StyledPanel>
    </StyledFrame>
  </ThemeProvider>
);

const meta: Meta<typeof MyahInboxContactConversationFocusHarness> = {
  title: 'Modules/Myah/Inbox/Conversation focus indicator',
  component: MyahInboxContactConversationFocusHarness,
  args: { colorScheme: 'light' },
};

export default meta;

type Story = StoryObj<typeof MyahInboxContactConversationFocusHarness>;

const playKeyboardFocusIndicator: Story['play'] = async ({
  canvasElement,
  args,
}) => {
  if (!('__vitest_browser__' in globalThis)) {
    // Manual Storybook has no trusted input; inspect the story by hand there.
    return;
  }
  const { userEvent } = await import('vitest/browser');
  const canvas = within(canvasElement);
  const pane = await canvas.findByRole('region', {
    name: 'Selected contact conversation',
  });
  const brandFocusRingColor = getComputedStyle(
    canvas.getByTestId('brand-focus-ring-probe'),
  ).color;
  expect(brandFocusRingColor).toBe(
    args.colorScheme === 'dark' ? 'rgb(255, 131, 179)' : 'rgb(201, 39, 105)',
  );

  // A mouse click on non-interactive pane content focuses the pane without a
  // keyboard focus indicator.
  await userEvent.click(canvas.getByRole('heading', { name: 'Ada Okafor' }));
  await waitFor(() => expect(pane).toHaveFocus());
  expect(pane.matches(':focus-visible')).toBe(false);
  expect(getComputedStyle(pane).outlineStyle).toBe('none');

  // Any ordinary keypress makes the browser treat the focus as keyboard focus.
  await userEvent.keyboard('{Shift}');
  await waitFor(() => expect(pane.matches(':focus-visible')).toBe(true));
  const focused = getComputedStyle(pane);
  expect(focused.outlineStyle).toBe('solid');
  expect(focused.outlineColor).toBe(brandFocusRingColor);
  expect(parseFloat(focused.outlineWidth)).toBeGreaterThan(0);
  // The whole indicator must sit inside the pane so nothing paints over the
  // page header, contact list or card edge.
  expect(
    parseFloat(focused.outlineWidth) + parseFloat(focused.outlineOffset),
  ).toBeLessThanOrEqual(0);

  // Moving focus away removes the indicator.
  await userEvent.click(
    canvas.getByRole('button', { name: 'Outside control' }),
  );
  await waitFor(() => expect(pane).not.toHaveFocus());
  expect(getComputedStyle(pane).outlineStyle).toBe('none');
};

export const LightTheme: Story = {
  args: { colorScheme: 'light' },
  play: playKeyboardFocusIndicator,
};

export const DarkTheme: Story = {
  args: { colorScheme: 'dark' },
  play: playKeyboardFocusIndicator,
};
