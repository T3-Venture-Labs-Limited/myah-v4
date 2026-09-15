import { readFileSync } from 'node:fs';

import { fireEvent, render, screen, within } from '@testing-library/react';

import { MyahInboxInstagramTimeline } from '@/myah/inbox/components/MyahInboxInstagramTimeline';
import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'transparent' } },
    border: { color: { medium: 'gray' }, radius: { sm: '2px', lg: '12px' } },
    font: {
      color: { primary: 'black', secondary: 'gray' },
      size: { xs: '12px' },
      weight: { semiBold: 600 },
    },
    tag: { background: { violet: 'lavender' }, text: { violet: 'indigo' } },
    spacing: ['0px', '4px', '8px', '12px', '16px', '20px', '24px'],
  },
}));

const message = (
  overrides: Partial<MyahInstagramConversationMessage> = {},
): MyahInstagramConversationMessage => ({
  id: 'message-id',
  text: 'Hello from Instagram',
  direction: 'INBOUND',
  sentVia: 'UNIPILE',
  provider: 'UNIPILE',
  deliveryState: 'RECEIVED',
  providerCreatedAt: '2026-09-05T12:00:00.000Z',
  createdAt: '2026-09-05T12:00:01.000Z',
  hasAttachments: false,
  attachmentCount: 0,
  ...overrides,
});

describe('MyahInboxInstagramTimeline', () => {
  it('preserves multiline text and wraps long URLs in directional, contrasting bubbles', () => {
    const text = `Line one\n\nhttps://example.com/${'a'.repeat(300)}`;
    render(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[message({ text })]}
      />,
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' && element.textContent === text,
      ),
    ).toBeVisible();
  });

  it.each(['light', 'dark'])(
    'uses the established accessible violet foreground/background pair in %s',
    (mode) => {
      const css = readFileSync(
        `${__dirname}/../../../../../../../twenty-ui/src/theme-constants/theme-${mode}.css`,
        'utf8',
      );
      const luminance = (token: 'text' | 'background') => {
        const channels = css
          .match(
            new RegExp(
              `--t-tag-${token}-violet: color\\(display-p3 ([^)]+)\\)`,
            ),
          )?.[1]
          .split(' ')
          .map(Number);
        expect(channels).toHaveLength(3);
        return channels!.reduce((sum, channel, index) => {
          const linear =
            channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.22897456, 0.69173852, 0.07928691][index];
        }, 0);
      };
      const foreground = luminance('text');
      const background = luminance('background');
      expect(
        (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps pagination actionable and locks load more while loading', () => {
    const onLoadMore = jest.fn();
    const { rerender } = render(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[message()]}
        hasNextPage
        onLoadMore={onLoadMore}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more Instagram messages' }),
    );
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[message()]}
        hasNextPage
        loadingMore
        onLoadMore={onLoadMore}
      />,
    );
    const loading = screen.getByRole('button', {
      name: 'Loading more Instagram messages',
    });
    expect(loading).toBeDisabled();
    fireEvent.click(loading);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Inbound Instagram message')).toBeVisible();
  });

  it('renders familiar grouped bubbles with exact timestamps and no delivery labels', () => {
    render(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[
          message(),
          message({
            id: 'outbound',
            direction: 'OUTBOUND',
            deliveryState: 'READ',
            providerCreatedAt: '2026-09-05T12:02:00.000Z',
          }),
          message({
            id: 'unknown',
            direction: 'UNKNOWN',
            hasAttachments: true,
            attachmentCount: 2,
            providerCreatedAt: 'not-a-date',
          }),
        ]}
      />,
    );

    expect(
      screen.getByLabelText('Inbound Instagram message'),
    ).toHaveTextContent(
      new Date('2026-09-05T12:00:00.000Z').toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
    expect(
      screen.getByLabelText('Outbound Instagram message'),
    ).not.toHaveTextContent('Read');
    expect(
      screen.getByLabelText('Outbound Instagram message'),
    ).toHaveTextContent(
      new Date('2026-09-05T12:02:00.000Z').toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
    expect(
      screen.getByLabelText(
        new Date('2026-09-05T12:00:00.000Z').toLocaleString(),
      ),
    ).toHaveAttribute('datetime', '2026-09-05T12:00:00.000Z');
    expect(
      screen.getByLabelText('Unknown Instagram message'),
    ).toHaveTextContent('Attachments are not supported (2).');
    expect(
      screen.getByLabelText('Unknown Instagram message'),
    ).toHaveTextContent('Unknown time');
  });

  it('uses direct flex children, correct sender initials, static grouped corners, and accessible exact time metadata', () => {
    render(
      <MyahInboxInstagramTimeline
        channelState="READY"
        inboundSenderName="Ada Lovelace"
        messages={[
          message({ id: 'first', text: 'First' }),
          message({
            id: 'grouped',
            text: 'Grouped',
            providerCreatedAt: '2026-09-05T12:01:00.000Z',
          }),
          message({
            id: 'outbound',
            text: 'Sent',
            direction: 'OUTBOUND',
            providerCreatedAt: '2026-09-05T12:02:00.000Z',
          }),
          message({
            id: 'unknown-time',
            text: 'Unknown time',
            providerCreatedAt: 'not-a-date',
          }),
        ]}
      />,
    );

    expect(screen.getAllByText('AL')).toHaveLength(3);
    expect(
      screen.getByLabelText(
        new Date('2026-09-05T12:00:00.000Z').toLocaleString(),
      ),
    ).toHaveAttribute('datetime', '2026-09-05T12:00:00.000Z');
    expect(screen.getAllByLabelText('Unknown time')[0]).not.toHaveAttribute(
      'datetime',
    );
    expect(
      screen.getAllByLabelText('Inbound Instagram message')[0],
    ).toHaveAttribute('data-instagram-message-id', 'first');

    const source = readFileSync(
      `${__dirname}/../MyahInboxInstagramTimeline.tsx`,
      'utf8',
    );
    expect(source).toContain("import { Fragment } from 'react';");
    expect(source).not.toContain('<div key={message.id}>');
    const messageSource = readFileSync(
      `${__dirname}/../MyahInboxInstagramMessage.tsx`,
      'utf8',
    );
    expect(messageSource).toContain('border-top-left-radius');
    expect(messageSource).toContain('border-top-right-radius');
    expect(messageSource).not.toContain('border-bottom-${');
  });

  it('renders named-recipient UNKNOWN messages neutrally, including grouped messages, without changing directional bubbles', () => {
    render(
      <MyahInboxInstagramTimeline
        channelState="READY"
        inboundSenderName="Ada Lovelace"
        messages={[
          message({ id: 'inbound-first', text: 'Incoming first' }),
          message({ id: 'inbound-grouped', text: 'Incoming grouped' }),
          message({
            id: 'outbound-first',
            direction: 'OUTBOUND',
            text: 'Outgoing first',
          }),
          message({
            id: 'outbound-grouped',
            direction: 'OUTBOUND',
            text: 'Outgoing grouped',
          }),
          message({
            id: 'unknown-first',
            direction: 'UNKNOWN',
            text: '',
            hasAttachments: true,
            attachmentCount: 2,
          }),
          message({
            id: 'unknown-grouped',
            direction: 'UNKNOWN',
            text: 'Unknown grouped',
            providerCreatedAt: null,
          }),
          message({
            id: 'unknown-invalid',
            direction: 'UNKNOWN',
            text: 'Unknown invalid',
            providerCreatedAt: 'invalid',
          }),
        ]}
      />,
    );

    const inbound = screen.getAllByLabelText('Inbound Instagram message');
    const outbound = screen.getAllByLabelText('Outbound Instagram message');
    const unknown = screen.getAllByLabelText('Unknown Instagram message');
    expect(inbound).toHaveLength(2);
    expect(outbound).toHaveLength(2);
    expect(unknown).toHaveLength(3);
    expect(screen.getAllByText('AL')).toHaveLength(2);
    for (const row of inbound) {
      expect(within(row).getByText('AL')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }
    for (const row of [...outbound, ...unknown]) {
      expect(within(row).queryByText('AL')).not.toBeInTheDocument();
      expect(row.querySelector('[aria-hidden="true"]')).toBeNull();
    }
    const bubbleClass = (row: HTMLElement) =>
      row.querySelector('div')?.className;
    expect(bubbleClass(inbound[0])).toBeTruthy();
    expect(bubbleClass(inbound[1])).toBe(bubbleClass(inbound[0]));
    expect(bubbleClass(outbound[1])).toBe(bubbleClass(outbound[0]));
    expect(bubbleClass(outbound[0])).not.toBe(bubbleClass(inbound[0]));
    for (const row of unknown) {
      expect(bubbleClass(row)).toBeTruthy();
      expect(bubbleClass(row)).not.toBe(bubbleClass(inbound[0]));
      expect(bubbleClass(row)).not.toBe(bubbleClass(outbound[0]));
      expect(row).not.toHaveAccessibleName(/Inbound|Outbound/);
    }
    expect(bubbleClass(unknown[1])).toBe(bubbleClass(unknown[0]));
    expect(unknown[0]).toHaveAttribute(
      'data-instagram-message-id',
      'unknown-first',
    );
    expect(unknown[1]).toHaveAttribute(
      'data-instagram-message-id',
      'unknown-grouped',
    );
    expect(unknown[0]).toHaveTextContent('No message text.');
    expect(unknown[0]).toHaveTextContent('Attachments are not supported (2).');
    expect(unknown[0].querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-09-05T12:00:00.000Z',
    );
    expect(unknown[1]).toHaveTextContent('Unknown grouped');
    expect(unknown[1].querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-09-05T12:00:01.000Z',
    );
    expect(
      within(unknown[2]).getByLabelText('Unknown time'),
    ).not.toHaveAttribute('datetime');
  });

  it('marks duplicate conversations and Composio history as read-only', () => {
    const { rerender } = render(
      <MyahInboxInstagramTimeline
        channelState="AMBIGUOUS"
        messages={[message()]}
      />,
    );

    expect(
      screen.getByText('Multiple Instagram conversations found (read-only).'),
    ).toBeVisible();

    rerender(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[]}
        provider="COMPOSIO_HISTORY"
        lifecycle="HISTORICAL"
      />,
    );

    expect(screen.getByText('Read-only Instagram history')).toBeVisible();
  });

  it('shows disconnected and sync error states without provider calls', () => {
    const { rerender } = render(
      <MyahInboxInstagramTimeline channelState="UNAVAILABLE" messages={[]} />,
    );

    expect(screen.getByText('Instagram is disconnected.')).toBeVisible();

    rerender(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[]}
        error="Instagram sync failed"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Instagram sync failed',
    );
  });
});
