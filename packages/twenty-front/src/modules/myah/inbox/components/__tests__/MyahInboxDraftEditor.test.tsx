import { act, fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxDraftEditor } from '@/myah/inbox/components/MyahInboxDraftEditor';

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
        tertiary: 'gray',
        danger: 'darkred',
      },
      size: { sm: '13px', xs: '11px' },
      weight: { semiBold: 600 },
    },
    spacing: { 2: '8px', 3: '12px' },
  },
}));

const mockSaveDraft = jest.fn();

jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: () => ({
    saveDraft: mockSaveDraft,
  }),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput',
  () => ({
    FormAdvancedTextFieldInput: ({
      label,
      defaultValue,
      onChange,
      readonly,
    }: {
      label?: string;
      defaultValue: string;
      onChange: (value: string) => void;
      readonly?: boolean;
    }) => (
      <label>
        {label}
        <textarea
          aria-label={label}
          value={defaultValue}
          disabled={readonly}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    ),
  }),
);

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

const defaultProps = {
  threadId: 'thread-1',
  initialBody: { markdown: 'saved draft', blocknote: null },
  initialRevision: 2,
  canEdit: true,
  readOnlyReason: undefined,
  appliedProposal: null,
};

describe('MyahInboxDraftEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves with the last confirmed revision and announces success', async () => {
    mockSaveDraft.mockResolvedValue({
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'operator draft', blocknote: null },
    });

    render(<MyahInboxDraftEditor {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Shared reply draft'), {
      target: { value: 'operator draft' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });

    expect(mockSaveDraft).toHaveBeenCalledWith({
      threadId: 'thread-1',
      expectedRevision: 2,
      body: { markdown: 'operator draft', blocknote: null },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Draft saved at revision 3',
    );
  });

  it('retains unsaved local text on conflict and shows the current server body and revision', async () => {
    mockSaveDraft.mockResolvedValue({
      status: 'CONFLICT',
      revision: 4,
      body: { markdown: 'newer server draft', blocknote: null },
    });

    render(<MyahInboxDraftEditor {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Shared reply draft'), {
      target: { value: 'my unsaved local draft' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });

    expect(screen.getByLabelText('Shared reply draft')).toHaveValue(
      'my unsaved local draft',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Draft conflict at revision 4',
    );
    expect(screen.getByLabelText('Current saved draft')).toHaveTextContent(
      'newer server draft',
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reload and discard local changes',
      }),
    );

    expect(screen.getByLabelText('Shared reply draft')).toHaveValue(
      'newer server draft',
    );
    expect(
      screen.queryByText('Draft conflict at revision 4'),
    ).not.toBeInTheDocument();
  });

  it('keeps local text after a failed save and exposes a retryable error', async () => {
    mockSaveDraft.mockRejectedValue(new Error('network unavailable'));

    render(<MyahInboxDraftEditor {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Shared reply draft'), {
      target: { value: 'keep this text' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the draft. Your changes are still here.',
    );
    expect(screen.getByLabelText('Shared reply draft')).toHaveValue(
      'keep this text',
    );
  });

  it.each([
    'Assign this conversation to yourself to edit the shared draft.',
    'Only Grace can edit this shared draft.',
  ])('disables editing and saving when %s', (readOnlyReason) => {
    render(
      <MyahInboxDraftEditor
        {...defaultProps}
        canEdit={false}
        readOnlyReason={readOnlyReason}
      />,
    );

    expect(screen.getByLabelText('Shared reply draft')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByText(readOnlyReason)).toBeVisible();
  });

  it('copies an applied proposal into the editor without saving it', () => {
    const { rerender } = render(<MyahInboxDraftEditor {...defaultProps} />);

    rerender(
      <MyahInboxDraftEditor
        {...defaultProps}
        appliedProposal={{
          applicationId: 1,
          body: { markdown: 'proposed reply', blocknote: null },
        }}
      />,
    );

    expect(screen.getByLabelText('Shared reply draft')).toHaveValue(
      'proposed reply',
    );
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });
});
