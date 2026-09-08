import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { type CampaignSequenceMessage } from 'twenty-shared/workflow';

import { CampaignSequenceMessageEditor } from '@/myah-outreach/components/CampaignSequenceMessageEditor';

const mockUploadWorkflowFile = jest.fn();

jest.mock('@/advanced-text-editor/hooks/useUploadWorkflowFile', () => ({
  useUploadWorkflowFile: () => ({ uploadWorkflowFile: mockUploadWorkflowFile }),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormTextFieldInput',
  () => ({
    FormTextFieldInput: ({
      defaultValue,
      error,
      label,
      onChange,
      readonly,
    }: {
      defaultValue: string;
      error?: string;
      label: string;
      onChange: (value: string) => void;
      readonly?: boolean;
    }) => (
      <label>
        {label}
        <input
          aria-label={label}
          disabled={readonly}
          onChange={(event) => onChange(event.target.value)}
          value={defaultValue}
        />
        {error ? <span>{error}</span> : null}
      </label>
    ),
  }),
);

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput',
  () => ({
    FormAdvancedTextFieldInput: ({
      defaultValue,
      error,
      label,
      onChange,
      readonly,
    }: {
      defaultValue: string;
      error?: string;
      label: string;
      onChange: (value: string) => void;
      readonly?: boolean;
    }) => (
      <label>
        {label}
        <textarea
          aria-label={label}
          disabled={readonly}
          onChange={(event) => onChange(event.target.value)}
          value={defaultValue}
        />
        {error ? <span>{error}</span> : null}
      </label>
    ),
  }),
);

const email = (
  overrides: Partial<
    Extract<CampaignSequenceMessage, { channel: 'EMAIL' }>
  > = {},
) => ({
  id: 'a0000000-0000-4000-8000-000000000001',
  channel: 'EMAIL' as const,
  subject: 'Original',
  body: '{"type":"doc","content":[]}',
  files: [],
  replyToThread: false,
  ...overrides,
});

const Harness = ({
  initialMessage = email(),
  messageIndex = 0,
}: {
  initialMessage?: CampaignSequenceMessage;
  messageIndex?: number;
}) => {
  const [message, setMessage] = useState(initialMessage);

  return (
    <CampaignSequenceMessageEditor
      editable
      issues={[]}
      message={message}
      messageIndex={messageIndex}
      onAttachmentsAdded={(messageId, attachments) =>
        setMessage((currentMessage) =>
          currentMessage.id === messageId && currentMessage.channel === 'EMAIL'
            ? {
                ...currentMessage,
                files: [...currentMessage.files, ...attachments],
              }
            : currentMessage,
        )
      }
      onChange={setMessage}
      reloadGeneration={0}
    />
  );
};

describe('CampaignSequenceMessageEditor', () => {
  beforeEach(() => mockUploadWorkflowFile.mockReset());

  it('explains Campaign authority and prevents a first email from enabling reply intent', () => {
    render(<Harness />);

    expect(
      screen.getByText(/sender and recipients are controlled by the Campaign/i),
    ).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'To' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'In-Reply-To' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Insert Creator variable' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/canonical Campaign preview integration/i),
    ).toBeVisible();
  });

  it('retains an invalid existing reply intent after reorder and offers correction', () => {
    render(<Harness initialMessage={email({ replyToThread: true })} />);

    expect(
      screen.getByRole('checkbox', { name: 'Reply to earlier email' }),
    ).toBeChecked();
    expect(
      screen.getByText(
        'Move this email after an earlier email or turn off reply.',
      ),
    ).toBeVisible();
  });

  it('updates subject, body, and authenticated attachment metadata independently', async () => {
    const uploaded = {
      id: 'f0000000-0000-4000-8000-000000000001',
      name: 'brief.pdf',
      size: 12,
      type: 'application/pdf',
      createdAt: '2026-08-13T00:00:00.000Z',
    };
    mockUploadWorkflowFile.mockResolvedValue(uploaded);
    render(<Harness />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), {
      target: { value: 'Summer launch' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Body' }), {
      target: { value: '{"type":"doc","content":[{"type":"paragraph"}]}' },
    });
    fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: {
        files: [new File(['brief'], 'brief.pdf', { type: 'application/pdf' })],
      },
    });

    expect(await screen.findByText('brief.pdf')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      'Summer launch',
    );
    expect(screen.getByRole('textbox', { name: 'Body' })).toHaveValue(
      '{"type":"doc","content":[{"type":"paragraph"}]}',
    );
    expect(mockUploadWorkflowFile).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove attachment brief.pdf' }),
    );
    expect(screen.queryByText('brief.pdf')).not.toBeInTheDocument();
  });

  it('shows actionable email draft validation beside the restricted fields', () => {
    const message = email({ subject: '', body: '' });
    render(
      <CampaignSequenceMessageEditor
        editable
        issues={[
          {
            code: 'CONTENT_REQUIRED',
            path: 'messages.0.subject',
            message: 'Add an email subject',
            messageId: message.id,
          },
          {
            code: 'CONTENT_REQUIRED',
            path: 'messages.0.body',
            message: 'Add email body content',
            messageId: message.id,
          },
        ]}
        message={message}
        messageIndex={0}
        onAttachmentsAdded={jest.fn()}
        onChange={jest.fn()}
        reloadGeneration={0}
      />,
    );

    expect(screen.getByText('Add an email subject')).toBeVisible();
    expect(screen.getByText('Add email body content')).toBeVisible();
  });

  it('rejects non-object upload results instead of persisting variable strings', async () => {
    mockUploadWorkflowFile.mockResolvedValue('{{arbitrary.files}}');
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Choose attachments'), {
      target: {
        files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })],
      },
    });

    await screen.findByRole('button', { name: 'Add attachments' });
    expect(screen.queryByText('bad.txt')).not.toBeInTheDocument();
  });

  it('authors Instagram as text-only without a guessed counter', () => {
    render(
      <Harness
        initialMessage={{
          id: 'b0000000-0000-4000-8000-000000000002',
          channel: 'INSTAGRAM',
          text: 'Hello 👋',
        }}
      />,
    );

    expect(screen.getByText('Instagram delivery unavailable')).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Instagram message' }),
    ).toHaveValue('Hello 👋');
    expect(screen.queryByText(/characters remaining/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument();
  });
});
