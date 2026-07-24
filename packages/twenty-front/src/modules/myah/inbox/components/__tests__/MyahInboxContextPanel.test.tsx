import { act, fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white' },
    border: { color: { light: 'lightgray' } },
    font: {
      color: {
        primary: 'black',
        secondary: 'dimgray',
        danger: 'darkred',
      },
      size: { sm: '13px', xs: '11px' },
      weight: { semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px', 12: '48px' },
  },
}));

const mockUpdateThread = jest.fn();
const mockUseFindOneRecord = jest.fn();
let mockCurrentWorkspaceMember: { id: string } | null = { id: 'member-1' };

jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: () => ({
    updateThread: mockUpdateThread,
  }),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (...args: unknown[]) => mockUseFindOneRecord(...args),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockCurrentWorkspaceMember,
}));

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({
    FormSingleRecordPicker: ({
      label,
      defaultValue,
      onChange,
    }: {
      label: string;
      defaultValue: string | null;
      onChange: (value: string | null) => void;
    }) => (
      <label>
        {label}
        <select
          aria-label={label}
          value={defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">None</option>
          <option value="creator-2">Grace Creator</option>
          <option value="campaign-2">Fall campaign</option>
          <option value="member-1">Zachary</option>
          <option value="member-2">Grace</option>
        </select>
      </label>
    ),
  }),
);

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormDateTimeFieldInput',
  () => ({
    FormDateTimeFieldInput: ({
      label,
      defaultValue,
      onChange,
    }: {
      label: string;
      defaultValue?: string;
      onChange: (value: string | null) => void;
    }) => (
      <label>
        {label}
        <input
          aria-label={label}
          value={defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        />
      </label>
    ),
  }),
);

jest.mock('@/myah/inbox/components/MyahInboxDraftEditor', () => ({
  MyahInboxDraftEditor: ({
    canEdit,
    readOnlyReason,
    appliedProposal,
  }: {
    canEdit: boolean;
    readOnlyReason?: string;
    appliedProposal: { body: { markdown: string } } | null;
  }) => (
    <div>
      Draft is {canEdit ? 'editable' : 'read-only'}
      {readOnlyReason && <span>{readOnlyReason}</span>}
      <output aria-label="Applied proposal">
        {appliedProposal?.body.markdown ?? 'none'}
      </output>
    </div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxProposalPreview', () => ({
  MyahInboxProposalPreview: ({
    onApply,
  }: {
    onApply: (body: { markdown: string; blocknote: null }) => void;
  }) => (
    <button
      onClick={() =>
        onApply({ markdown: 'proposal copied explicitly', blocknote: null })
      }
    >
      Apply proposal test double
    </button>
  ),
}));

jest.mock('@/activities/tasks/components/TasksCard', () => ({
  TasksCard: () => <div>Native Tasks surface</div>,
}));

jest.mock('@/activities/notes/components/NotesCard', () => ({
  NotesCard: () => <div>Native Notes surface</div>,
}));

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  LayoutRenderingProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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

const thread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  subject: 'First conversation',
  lastMessagePreview: 'First preview',
  lastMessageSender: 'Ada',
  state: 'NEEDS_REPLY' as const,
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Ada Creator' },
  campaign: { id: 'campaign-1', name: 'Spring campaign' },
  inboxOwner: { id: 'member-1', name: 'Zachary' },
};

describe('MyahInboxContextPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentWorkspaceMember = { id: 'member-1' };
    mockUseFindOneRecord.mockReturnValue({
      record: {
        id: 'thread-1',
        myahReplyDraftBody: { markdown: 'saved draft', blocknote: null },
        myahReplyDraftRevision: 2,
      },
      loading: false,
    });
  });

  it('saves creator, campaign, owner, state, and snooze triage together', async () => {
    mockUpdateThread.mockResolvedValue({
      ...thread,
      creator: { id: 'creator-2', name: 'Grace Creator' },
      campaign: { id: 'campaign-2', name: 'Fall campaign' },
      state: 'SNOOZED',
      snoozedUntil: '2026-07-25T12:00:00.000Z',
    });

    render(<MyahInboxContextPanel thread={thread} />);

    fireEvent.change(screen.getByLabelText('Creator'), {
      target: { value: 'creator-2' },
    });
    fireEvent.change(screen.getByLabelText('Campaign'), {
      target: { value: 'campaign-2' },
    });
    fireEvent.change(screen.getByLabelText('Owner'), {
      target: { value: 'member-2' },
    });
    fireEvent.change(screen.getByLabelText('Inbox state'), {
      target: { value: 'SNOOZED' },
    });
    fireEvent.change(screen.getByLabelText('Snooze until'), {
      target: { value: '2026-07-25T12:00:00.000Z' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save triage' }));
    });

    expect(mockUpdateThread).toHaveBeenCalledWith({
      threadId: 'thread-1',
      creatorId: 'creator-2',
      campaignId: 'campaign-2',
      inboxOwnerId: 'member-2',
      inboxState: 'SNOOZED',
      snoozedUntil: '2026-07-25T12:00:00.000Z',
    });
    expect(screen.getByText('Triage saved')).toHaveAttribute('role', 'status');
  });

  it('keeps controls available and reports a failed triage save', async () => {
    mockUpdateThread.mockRejectedValue(new Error('network unavailable'));

    render(<MyahInboxContextPanel thread={thread} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save triage' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save triage. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Save triage' })).toBeEnabled();
  });

  it('uses native Tasks and Notes surfaces for the linked record', () => {
    render(<MyahInboxContextPanel thread={thread} />);

    expect(screen.getByText('Native Tasks surface')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByText('Native Notes surface')).toBeVisible();
  });

  it('applies proposal text into the editor without saving or sending', () => {
    render(<MyahInboxContextPanel thread={thread} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Apply proposal test double' }),
    );

    expect(screen.getByLabelText('Applied proposal')).toHaveTextContent(
      'proposal copied explicitly',
    );
    expect(mockUpdateThread).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /send/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      inboxOwner: null,
      reason: 'Assign this conversation to yourself to edit the shared draft.',
    },
    {
      inboxOwner: { id: 'member-2', name: 'Grace' },
      reason: 'Only Grace can edit this shared draft.',
    },
  ])(
    'marks the draft read-only when ownership does not authorize it',
    (ownerCase) => {
      render(
        <MyahInboxContextPanel
          thread={{ ...thread, inboxOwner: ownerCase.inboxOwner }}
        />,
      );

      expect(screen.getByText('Draft is read-only')).toBeVisible();
      expect(screen.getByText(ownerCase.reason)).toBeVisible();
    },
  );
});
