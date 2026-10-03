import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MyahCampaignCreatorAgentDraft } from '@/myah/agent/components/MyahCampaignCreatorAgentDraft';

const mockUseQuery = jest.fn();
const mockRegenerate = jest.fn();
const mockSend = jest.fn();
const mockOpenInbox = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => [mockRegenerate, { loading: false, error: undefined }],
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: 'workspace-1' }),
}));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({}),
}));
jest.mock('@/myah/inbox/hooks/useOpenMyahInboxConversation', () => ({
  useOpenMyahInboxConversation: () => ({
    openMyahInboxConversation: mockOpenInbox,
  }),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxInstagramDraft', () => ({
  useMyahInboxInstagramDraft: () => ({
    draftId: 'draft-1',
    body: 'Yay, so glad! We ship to Canada.',
    revision: 2,
    executionLocked: false,
    error: null,
    setBody: jest.fn(),
    resetAfterSend: jest.fn(),
  }),
}));
jest.mock('@/myah/inbox/hooks/useMyahInboxInstagramSend', () => ({
  useMyahInboxInstagramSend: () => ({
    send: mockSend,
    sending: false,
    lockedUnknown: false,
    isBlocked: false,
  }),
}));

const review = (nextAction: string, reason: string | null = null) => ({
  data: {
    myahReplyAgentReview: {
      needReviewCount: 1,
      nodes: [
        {
          campaignCreatorId: 'membership-1',
          creatorId: 'creator-1',
          nextAction,
          reason,
          channel: 'INSTAGRAM',
          conversationRecordId: 'conversation-1',
          inboxContactId: 'contact-1',
        },
      ],
    },
  },
  refetch: mockRefetch,
});

const renderCard = () =>
  render(
    <MyahCampaignCreatorAgentDraft
      campaignId="campaign-1"
      membershipId="membership-1"
      returnTarget={{} as never}
    />,
  );

beforeEach(() => jest.clearAllMocks());

it('sends the agent draft on Instagram and refreshes the review', async () => {
  mockUseQuery.mockReturnValue(review('REVIEW_DRAFT'));
  mockSend.mockResolvedValue({ status: 'PROVIDER_ACCEPTED' });
  renderCard();

  expect(screen.getByText('Proposed reply')).toBeVisible();
  expect(screen.getByText('Drafted by agent')).toBeVisible();
  expect(screen.getByLabelText('Proposed reply')).toHaveValue(
    'Yay, so glad! We ship to Canada.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  expect(mockSend).toHaveBeenCalledWith('Yay, so glad! We ship to Canada.');
});

it('shows a hand-off reason, regenerates and opens the Instagram conversation in Inbox', async () => {
  mockUseQuery.mockReturnValue(review('NEEDS_YOU', 'Asks for a paid rate'));
  mockRegenerate.mockResolvedValue({});
  renderCard();

  expect(screen.getByText('Needs you')).toBeVisible();
  expect(screen.getByText(/Asks for a paid rate/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  await waitFor(() =>
    expect(mockRegenerate).toHaveBeenCalledWith({
      variables: { input: { campaignCreatorId: 'membership-1' } },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open in Inbox' }));
  expect(mockOpenInbox).toHaveBeenCalledWith(
    expect.objectContaining({
      contactId: 'contact-1',
      threadId: 'conversation-1',
      channel: 'INSTAGRAM',
    }),
  );
});

it('shows nothing when the agent left nothing to review', () => {
  mockUseQuery.mockReturnValue(review('SENT_AUTOMATICALLY'));
  const { container } = renderCard();
  expect(container).toBeEmptyDOMElement();
});
