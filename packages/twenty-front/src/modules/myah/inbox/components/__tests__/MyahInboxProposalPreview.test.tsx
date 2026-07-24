import { act, fireEvent, render, screen } from '@testing-library/react';

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
  }: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

describe('MyahInboxProposalPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a generated proposal separate until Apply is explicitly clicked', async () => {
    const onApply = jest.fn();
    const proposal = {
      subject: 'Re: Spring campaign',
      body: { markdown: 'Thanks for the update.', blocknote: null },
    };
    mockGenerateProposal.mockResolvedValue(proposal);

    render(
      <MyahInboxProposalPreview
        threadId="thread-1"
        disabled={false}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByLabelText('Proposal instructions'), {
      target: { value: 'Keep it concise' },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Generate proposal' }),
      );
    });

    expect(mockGenerateProposal).toHaveBeenCalledWith({
      threadId: 'thread-1',
      operatorInstructions: 'Keep it concise',
    });
    expect(screen.getByText('Re: Spring campaign')).toBeVisible();
    expect(screen.getByLabelText('Proposal preview')).toHaveTextContent(
      'Thanks for the update.',
    );
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply to draft' }));
    expect(onApply).toHaveBeenCalledWith(proposal.body);
    expect(
      screen.queryByRole('button', { name: /send/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable proposal error without clearing instructions', async () => {
    mockGenerateProposal.mockRejectedValue(new Error('model unavailable'));

    render(
      <MyahInboxProposalPreview
        threadId="thread-1"
        disabled={false}
        onApply={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Proposal instructions'), {
      target: { value: 'Mention the deadline' },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Generate proposal' }),
      );
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not generate a proposal. Try again.',
    );
    expect(screen.getByLabelText('Proposal instructions')).toHaveValue(
      'Mention the deadline',
    );
  });

  it('does not call Task 5 while the draft is read-only', () => {
    render(
      <MyahInboxProposalPreview
        threadId="thread-1"
        disabled
        onApply={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Proposal instructions')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Generate proposal' }),
    ).toBeDisabled();
    expect(mockGenerateProposal).not.toHaveBeenCalled();
  });
});
