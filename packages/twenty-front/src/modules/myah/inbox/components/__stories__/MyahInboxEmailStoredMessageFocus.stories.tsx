import { styled } from '@linaria/react';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { MyahInboxEmailStoredMessage } from '@/myah/inbox/components/MyahInboxEmailStoredMessage';

const StyledFrame = styled.div`
  max-width: 640px;
  padding: 16px;
`;

const StyledTokenProbe = styled.span`
  color: var(--t-brand-focus-ring);
  position: absolute;
  visibility: hidden;
`;

const message = {
  id: 'root-message',
  messageThreadId: 'focus-thread',
  subject: 'Focus regression',
  text: 'Root message body',
  receivedAt: '2026-10-05T10:00:00.000Z',
  direction: 'INCOMING',
  visibility: 'FULL',
  participants: [{ role: 'FROM', displayName: 'Ada Okafor', handle: null }],
  attachmentFileIds: [],
};

const MyahInboxEmailStoredMessageFocusHarness = ({
  colorScheme,
}: {
  colorScheme: 'light' | 'dark';
}) => (
  <ThemeProvider colorScheme={colorScheme} applyToRoot={false}>
    <StyledFrame>
      <button type="button">Outside control</button>
      <StyledTokenProbe data-testid="brand-focus-ring-probe" />
      <MyahInboxEmailStoredMessage message={message} />
      <MyahInboxEmailStoredMessage
        message={{
          ...message,
          id: 'reply-message',
          text: 'Reply message body',
        }}
      />
    </StyledFrame>
  </ThemeProvider>
);

const meta: Meta<typeof MyahInboxEmailStoredMessageFocusHarness> = {
  title: 'Modules/Myah/Inbox/Email message focus indicator',
  component: MyahInboxEmailStoredMessageFocusHarness,
  args: { colorScheme: 'light' },
};

export default meta;

type Story = StoryObj<typeof MyahInboxEmailStoredMessageFocusHarness>;

const playMessageFocusIndicator: Story['play'] = async ({
  canvasElement,
  args,
}) => {
  if (!('__vitest_browser__' in globalThis)) {
    return;
  }
  // Trusted browser input reproduces :focus-visible after clicking a card.
  const { userEvent } = await import('vitest/browser');
  const canvas = within(canvasElement);
  const messages = canvas.getAllByRole('article', { name: 'Email message' });
  const outside = canvas.getByRole('button', { name: 'Outside control' });
  const brandFocusRingColor = getComputedStyle(
    canvas.getByTestId('brand-focus-ring-probe'),
  ).color;
  expect(brandFocusRingColor).toBe(
    args.colorScheme === 'dark' ? 'rgb(255, 131, 179)' : 'rgb(201, 39, 105)',
  );

  for (const card of messages) {
    expect(card).toHaveAttribute('tabindex', '-1');
    await userEvent.click(outside);
    await userEvent.click(card);
    await waitFor(() => expect(card).toHaveFocus());
    expect(card.matches(':focus-visible')).toBe(false);
    expect(getComputedStyle(card).outlineStyle).toBe('none');

    await userEvent.keyboard('{Shift}');
    await waitFor(() => expect(card.matches(':focus-visible')).toBe(true));
    const focused = getComputedStyle(card);
    expect(focused.outlineStyle).toBe('solid');
    expect(focused.outlineColor).toBe(brandFocusRingColor);
    expect(focused.outlineWidth).toBe('2px');
    expect(focused.outlineOffset).toBe('-2px');

    // Message-location navigation also focuses these tabIndex=-1 cards.
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(card).not.toHaveFocus());
    expect(getComputedStyle(card).outlineStyle).toBe('none');
    card.focus({ preventScroll: true });
    await waitFor(() => expect(card).toHaveFocus());
    expect(getComputedStyle(card).outlineStyle).toBe('solid');
    expect(getComputedStyle(card).outlineOffset).toBe('-2px');

    await userEvent.click(outside);
    await waitFor(() => expect(card).not.toHaveFocus());
    expect(getComputedStyle(card).outlineStyle).toBe('none');
  }
};

export const LightTheme: Story = {
  args: { colorScheme: 'light' },
  play: playMessageFocusIndicator,
};

export const DarkTheme: Story = {
  args: { colorScheme: 'dark' },
  play: playMessageFocusIndicator,
};
