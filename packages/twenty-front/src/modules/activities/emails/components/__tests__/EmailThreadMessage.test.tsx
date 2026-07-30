import { render, screen } from '@testing-library/react';

import { EmailThreadMessage } from '@/activities/emails/components/EmailThreadMessage';
import { type EmailThreadMessageWithSender } from '@/activities/emails/types/EmailThreadMessageWithSender';

jest.mock('@/activities/components/ParticipantChip', () => ({
  ParticipantChip: () => <span>Participant</span>,
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ localeCatalog: undefined }),
}));

jest.mock('twenty-ui/surfaces', () => ({
  AppTooltip: () => null,
  TooltipPosition: { Top: 'top' },
}));

jest.mock('~/utils/date-utils', () => ({
  beautifyPastDateRelativeToNow: () => 'now',
  formatToHumanReadableDate: () => 'July 28, 2026',
}));

describe('EmailThreadMessage', () => {
  it('renders a native message with no participants', () => {
    const message = {
      id: 'message-without-participants',
      text: 'Imported message body',
      receivedAt: '2026-07-28T12:00:00.000Z',
      isDraft: false,
      messageParticipants: [],
      sender: null,
    } as unknown as EmailThreadMessageWithSender;

    render(<EmailThreadMessage message={message} onDraftClick={jest.fn()} />);

    expect(screen.getByText('Unknown sender')).toBeVisible();
    expect(screen.getByText('Imported message body')).toBeVisible();
  });
});
