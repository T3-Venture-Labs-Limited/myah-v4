import {
  draftInputFixture,
  draftKeyFixture,
} from '@/myah/inbox/hooks/__tests__/fixtures/myahInboxDraftAutosaveTestFixture';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ComponentType } from 'react';

import { MyahInboxProposalPreview } from '@/myah/inbox/components/MyahInboxProposalPreview';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { sm: '4px' },
    },
    font: {
      color: {
        primary: 'black',
        secondary: 'dimgray',
        danger: 'darkred',
      },
      family: 'sans-serif',
      size: { sm: '13px', xs: '11px' },
      weight: { semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px', 8: '32px' },
  },
}));

const mockGenerateProposal = jest.fn();
const mockApplyProposal = jest.fn().mockResolvedValue(true);
const mockDraftKey = draftKeyFixture('workspace-1', 'thread-1');
const mockContextFingerprint = 'fingerprint-1';
const mockCapture = {
  key: mockDraftKey,
  token: Symbol('generate'),
  contextFingerprint: mockContextFingerprint,
};
const mockController = {
  flush: jest.fn().mockResolvedValue({}),
  acquire: () => mockCapture,
  getEntry: () => ({ input: draftInputFixture(mockDraftKey) }),
  applyProposalIfCurrent: mockApplyProposal,
  release: jest.fn(),
};
jest.mock('@/myah/inbox/hooks/useMyahInboxDraftAutosaveController', () => ({
  useMyahInboxDraftAutosaveControllerContext: () => mockController,
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: () => ({
    generateProposal: mockGenerateProposal,
  }),
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
    Icon,
    ariaLabel,
    'aria-disabled': ariaDisabled,
    'aria-describedby': ariaDescribedBy,
  }: {
    title: string;
    onClick?: () => void;
    disabled?: boolean;
    Icon?: ComponentType;
    ariaLabel?: string;
    'aria-disabled'?: boolean;
    'aria-describedby'?: string;
  }) => (
    <button
      aria-disabled={ariaDisabled}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {Icon && (
        <span data-testid="generate-reply-spinner">
          <Icon />
        </span>
      )}
      {title}
    </button>
  ),
}));

describe('MyahInboxProposalPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes a generated reply directly into the shared draft', async () => {
    const proposal = {
      body: { markdown: 'Thanks for the update.', blocknote: null },
      contextFingerprint: mockContextFingerprint,
    };
    mockGenerateProposal.mockResolvedValue(proposal);

    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled={false}
      />,
    );

    expect(
      screen.queryByLabelText('Proposal instructions'),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' }));
    });

    expect(mockGenerateProposal).toHaveBeenCalledWith({
      ...draftInputFixture(mockDraftKey),
      expectedContextFingerprint: mockContextFingerprint,
      operatorInstructions: 'Draft a concise reply to this conversation.',
    });
    expect(mockApplyProposal).toHaveBeenCalledWith(mockCapture, proposal.body);
    expect(screen.queryByText('Generated reply')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reply preview')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply to draft' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /send/i }),
    ).not.toBeInTheDocument();
  });

  it('refreshes an untouched incoming-stale proposal once through the guarded path', async () => {
    const proposal = {
      body: { markdown: 'Refreshed reply.', blocknote: null },
      contextFingerprint: mockContextFingerprint,
    };
    mockGenerateProposal.mockResolvedValue(proposal);
    const { rerender } = render(
      <MyahInboxProposalPreview
        draftKey={mockDraftKey}
        disabled={false}
        incomingUpdate="auto"
      />,
    );
    await act(async () => {});
    rerender(
      <MyahInboxProposalPreview
        draftKey={mockDraftKey}
        disabled={false}
        incomingUpdate="auto"
      />,
    );
    await act(async () => {});
    expect(mockGenerateProposal).toHaveBeenCalledTimes(1);
    expect(mockApplyProposal).toHaveBeenCalledWith(mockCapture, proposal.body);
  });

  it('offers an explicit Update draft for edited or legacy drafts that still requires review', async () => {
    const proposal = {
      body: { markdown: 'Updated reply.', blocknote: null },
      contextFingerprint: mockContextFingerprint,
    };
    mockGenerateProposal.mockResolvedValue(proposal);
    render(
      <MyahInboxProposalPreview
        draftKey={mockDraftKey}
        disabled={false}
        incomingUpdate="explicit"
      />,
    );
    await act(async () => {});
    expect(mockGenerateProposal).not.toHaveBeenCalled();
    expect(
      screen.getByText('New creator message since this draft was written.'),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update draft' }));
    });
    expect(mockApplyProposal).toHaveBeenCalledWith(mockCapture, proposal.body, {
      requireReview: true,
    });
  });

  it('uses conservative wording for a legacy draft without a known baseline', async () => {
    render(
      <MyahInboxProposalPreview
        draftKey={mockDraftKey}
        disabled={false}
        incomingUpdate="explicit"
        incomingState="UNKNOWN"
      />,
    );
    await act(async () => {});
    expect(
      screen.getByText('This draft may not reflect the latest messages.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('New creator message since this draft was written.'),
    ).not.toBeInTheDocument();
  });

  it('renders Generate Reply as the only normal draft action', () => {
    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled={false}
        renderGenerateAction={(generateAction) => (
          <div aria-label="Draft actions">{generateAction}</div>
        )}
      />,
    );

    expect(screen.getByLabelText('Draft actions')).toContainElement(
      screen.getByRole('button', { name: 'Generate reply' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Save draft' }),
    ).not.toBeInTheDocument();
  });

  it('shows a spinner inside Generate Reply without a separate status line', () => {
    mockGenerateProposal.mockReturnValue(Promise.race([]));

    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate reply' }));

    expect(
      screen.getByRole('button', { name: 'Generating reply' }),
    ).toBeDisabled();
    expect(screen.getByTestId('generate-reply-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Generating reply')).not.toBeInTheDocument();
  });

  it('shows a retryable proposal error', async () => {
    mockGenerateProposal.mockRejectedValue(new Error('model unavailable'));

    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled={false}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generate reply' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not generate a reply. Try again.',
    );
  });

  it('does not call Task 5 while the draft is read-only', () => {
    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Generate reply' }),
    ).toBeDisabled();
    expect(mockGenerateProposal).not.toHaveBeenCalled();
  });

  it('explains why generation requires an exact readable Campaign', () => {
    const generateUnavailableReason =
      'Link an exact readable Campaign to generate a reply or open AI guidance.';
    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled={false}
        generateUnavailableReason={generateUnavailableReason}
      />,
    );

    const generate = screen.getByRole('button', { name: 'Generate reply' });
    expect(generate).not.toBeDisabled();
    expect(generate).toHaveAttribute('aria-disabled', 'true');
    expect(generate).toHaveAccessibleDescription(generateUnavailableReason);
    generate.focus();
    expect(generate).toHaveFocus();
    fireEvent.click(generate);
    expect(mockGenerateProposal).not.toHaveBeenCalled();
  });

  it('ignores a second activation while generation is pending', async () => {
    mockGenerateProposal.mockReturnValue(Promise.race([]));
    render(
      <MyahInboxProposalPreview
        draftKey={draftKeyFixture('workspace-1', 'thread-1')}
        disabled={false}
      />,
    );

    const generate = screen.getByRole('button', { name: 'Generate reply' });
    await act(async () => {
      fireEvent.click(generate);
      fireEvent.click(generate);
    });

    expect(mockGenerateProposal).toHaveBeenCalledTimes(1);
  });
});
