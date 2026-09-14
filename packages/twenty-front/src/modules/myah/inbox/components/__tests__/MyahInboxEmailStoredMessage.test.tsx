import { render, screen } from '@testing-library/react';
import { MyahInboxEmailStoredMessage } from '@/myah/inbox/components/MyahInboxEmailStoredMessage';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';

jest.mock('twenty-ui/data-display', () => ({
  Avatar: ({
    placeholder,
    placeholderColorSeed,
  }: {
    placeholder: string;
    placeholderColorSeed: string;
  }) => (
    <span data-color-seed={placeholderColorSeed}>
      {placeholder.slice(0, 1)}
    </span>
  ),
}));

const message = {
  id: 'm1',
  messageThreadId: 't1',
  subject: 'Subject',
  text: ' Hello\n\n> quoted text\n<script>alert(1)</script>\n<img src="https://tracker.test/pixel"> ',
  receivedAt: '2026-09-01T00:00:00Z',
  direction: 'INCOMING',
  visibility: 'FULL',
  participants: [{ role: 'FROM', displayName: 'Sender', handle: null }],
  attachmentFileIds: [],
};
describe('MyahInboxEmailStoredMessage', () => {
  it('renders normal text inertly without an original disclosure for root and reply', () => {
    const { container, rerender } = render(
      <MyahInboxEmailStoredMessage message={message} />,
    );

    const expectNormalInertBodyWithoutOriginalDisclosure = () => {
      expect(container.textContent).toContain(message.text);
      expect(container.querySelector('script, img')).toBeNull();
      expect(
        screen.queryByRole('button', { name: /(?:View|Close) original/ }),
      ).toBeNull();
      expect(
        screen.queryByLabelText(/(?:Stored original|Complete stored message)/),
      ).toBeNull();
      expect(screen.queryByText(/Prior ingestion may already/)).toBeNull();
    };

    expectNormalInertBodyWithoutOriginalDisclosure();
    rerender(<MyahInboxEmailStoredMessage message={message} />);
    expectNormalInertBodyWithoutOriginalDisclosure();
  });
  it('renders the authorized FROM avatar, sender, and quiet timestamp for every message', () => {
    const senderMessage = {
      ...message,
      participants: [
        { role: 'TO', displayName: 'Brand', handle: '@brand' },
        { role: 'FROM', displayName: 'Maya Chen', handle: '@maya' },
      ],
    };
    const { container, rerender } = render(
      <MyahInboxEmailStoredMessage message={senderMessage} />,
    );

    const expectSenderHeader = () => {
      expect(
        screen
          .getByRole('img', { name: 'Maya Chen avatar' })
          .querySelector('[data-color-seed="@maya"]'),
      ).not.toBeNull();
      expect(screen.getByText('Maya Chen')).toBeVisible();
      expect(container.querySelector('time')).toHaveAttribute(
        'dateTime',
        '2026-09-01T00:00:00Z',
      );
    };

    expectSenderHeader();
    rerender(<MyahInboxEmailStoredMessage message={senderMessage} />);
    expectSenderHeader();
  });

  it('preserves the actual sender display name without outgoing ownership inference', () => {
    render(
      <MyahInboxEmailStoredMessage
        message={{
          ...message,
          direction: 'OUTGOING',
          participants: [
            {
              role: 'FROM',
              displayName: 'Zach · Sunday Studio',
              handle: '@studio',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Zach · Sunday Studio')).toBeVisible();
    expect(screen.queryByText(/Outgoing/)).toBeNull();
  });

  it('uses FROM handle and Unknown sender fallbacks without outgoing ownership inference', () => {
    const { rerender } = render(
      <MyahInboxEmailStoredMessage
        message={{
          ...message,
          direction: 'OUTGOING',
          participants: [
            { role: 'FROM', displayName: null, handle: '@studio' },
          ],
        }}
      />,
    );
    expect(screen.getByText('@studio')).toBeVisible();
    expect(screen.queryByText(/Outgoing/)).toBeNull();
    expect(
      screen
        .getByRole('img', { name: '@studio avatar' })
        .querySelector('[data-color-seed="@studio"]'),
    ).not.toBeNull();

    rerender(
      <MyahInboxEmailStoredMessage
        message={{ ...message, participants: [] }}
      />,
    );
    expect(screen.getByText('Unknown sender')).toBeVisible();
    expect(
      screen
        .getByRole('img', { name: 'Unknown sender avatar' })
        .querySelector('[data-color-seed="Unknown sender"]'),
    ).not.toBeNull();
  });

  it.each(['METADATA', 'SUBJECT', 'restricted'])(
    'renders %s content as restricted without the readable body',
    (visibility) => {
      render(
        <MyahInboxEmailStoredMessage
          message={{
            ...message,
            visibility: visibility === 'restricted' ? 'FULL' : visibility,
            text:
              visibility === 'restricted'
                ? FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED
                : message.text,
          }}
        />,
      );
      expect(screen.getByText('Message content is restricted.')).toBeVisible();
      expect(screen.queryByText(/quoted text/)).toBeNull();
    },
  );
});
