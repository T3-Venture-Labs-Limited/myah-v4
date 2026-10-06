import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';

import { MyahCampaignCreatorAgentDraft } from '@/myah/agent/components/MyahCampaignCreatorAgentDraft';

const mockUseQuery = jest.fn();
const mockRegenerate = jest.fn();
const mockSend = jest.fn();
const mockOpenInbox = jest.fn();
const mockRefetch = jest.fn();
const mockNavigateBilling = jest.fn();
let mockCanManageBilling = true;
let mockSubscription = {
  isEnabled: false,
  hasAccess: true,
  usage: { exhausted: false },
};
jest.mock('@/settings/billing/hooks/useMyahWorkspaceUsage', () => ({
  useMyahWorkspaceUsage: () => mockSubscription,
}));
jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockCanManageBilling,
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateBilling,
}));

jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => [mockRegenerate, { loading: false, error: undefined }],
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: { key: string }) =>
    state.key === 'currentWorkspaceState'
      ? { id: 'workspace-1' }
      : mockSubscription.isEnabled,
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
    {
      wrapper: ({ children }) => (
        <I18nProvider i18n={i18n}>{children}</I18nProvider>
      ),
    },
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSubscription = {
    isEnabled: false,
    hasAccess: true,
    usage: { exhausted: false },
  };
  mockCanManageBilling = true;
});

it('blocks regeneration at the AI limit but preserves editing and manual sending', async () => {
  mockSubscription = {
    isEnabled: true,
    hasAccess: true,
    usage: { exhausted: true },
  };
  mockUseQuery.mockReturnValue(
    review(
      'NEEDS_YOU',
      "This month's AI usage is used up. It resets on 2026-11-05. Regenerate after it resets, or reply yourself.",
    ),
  );
  mockSend.mockResolvedValue({ status: 'PROVIDER_ACCEPTED' });
  renderCard();
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
  expect(screen.getByLabelText('Proposed reply')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'View billing' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(mockSend).toHaveBeenCalled());
  expect(mockRegenerate).not.toHaveBeenCalled();
});

it('restores Regenerate after reset without automatically making a draft', async () => {
  mockSubscription = {
    isEnabled: true,
    hasAccess: true,
    usage: { exhausted: true },
  };
  mockUseQuery.mockReturnValue(
    review(
      'NEEDS_YOU',
      "This month's AI usage is used up. It resets on 2026-11-05.",
    ),
  );
  mockRegenerate.mockResolvedValue({});
  const view = renderCard();
  mockSubscription.usage.exhausted = false;
  view.rerender(
    <MyahCampaignCreatorAgentDraft
      campaignId="campaign-1"
      membershipId="membership-1"
      returnTarget={{} as never}
    />,
  );
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  expect(mockRegenerate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  await waitFor(() => expect(mockRegenerate).toHaveBeenCalledTimes(1));
});

it('does not show a Billing control to an ordinary member', () => {
  mockSubscription = {
    isEnabled: true,
    hasAccess: true,
    usage: { exhausted: true },
  };
  mockCanManageBilling = false;
  mockUseQuery.mockReturnValue(
    review(
      'NEEDS_YOU',
      "This month's AI usage is used up. It resets when the renewal payment goes through.",
    ),
  );
  renderCard();
  expect(
    screen.getByText(/when the renewal payment goes through/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'View billing' }),
  ).not.toBeInTheDocument();
});

it('keeps the subscription-ended reason and blocks regeneration without access', () => {
  mockSubscription = {
    isEnabled: true,
    hasAccess: false,
    usage: { exhausted: false },
  };
  mockUseQuery.mockReturnValue(
    review(
      'NEEDS_YOU',
      'The workspace subscription has ended. Ask an admin to resubscribe, then Regenerate, or reply yourself.',
    ),
  );
  renderCard();
  expect(screen.getByText(/subscription has ended/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
});

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
