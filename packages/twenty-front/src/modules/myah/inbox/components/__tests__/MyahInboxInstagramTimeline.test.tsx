import { render, screen } from '@testing-library/react';

import { MyahInboxInstagramTimeline } from '@/myah/inbox/components/MyahInboxInstagramTimeline';
import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'transparent' } },
    border: { color: { medium: 'gray' }, radius: { sm: '2px' } },
    font: { color: { secondary: 'gray' }, size: { xs: '12px' } },
    spacing: ['0px', '4px', '8px', '12px'],
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
  it('renders inbound, outbound, and unknown messages with delivery and attachment state', () => {
    render(
      <MyahInboxInstagramTimeline
        channelState="READY"
        messages={[
          message(),
          message({
            id: 'outbound',
            direction: 'OUTBOUND',
            deliveryState: 'READ',
          }),
          message({
            id: 'unknown',
            direction: 'UNKNOWN',
            hasAttachments: true,
            attachmentCount: 2,
          }),
        ]}
      />,
    );

    expect(
      screen.getByLabelText('Inbound Instagram message'),
    ).toHaveTextContent('Received');
    expect(
      screen.getByLabelText('Outbound Instagram message'),
    ).toHaveTextContent('Read');
    expect(
      screen.getByLabelText('Unknown Instagram message'),
    ).toHaveTextContent('Attachments are not supported (2).');
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
