import { getDefaultStore } from 'jotai';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { MyahInboxContactTriageActions } from '@/myah/inbox/components/MyahInboxContactTriageActions';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const mockUpdateTriage = jest.fn();

jest.mock('@/myah/inbox/hooks/useMyahInboxContactTriageMutation', () => ({
  useMyahInboxContactTriageMutation: () => ({
    updateTriage: mockUpdateTriage,
  }),
  MyahInboxContactTriageMutationError: class extends Error {
    triage?: unknown;
  },
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [{ nameSingular: 'workspaceMember' }],
  }),
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
          <option value="member-1">Zachary</option>
        </select>
      </label>
    ),
  }),
);

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    label,
    value,
    options,
    onChange,
    disabled,
  }: {
    label: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        disabled={disabled}
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
  '@/object-record/record-field/ui/form-types/components/FormDateTimeFieldInput',
  () => ({
    FormDateTimeFieldInput: ({
      label,
      onChange,
    }: {
      label: string;
      onChange: (value: string | null) => void;
    }) => (
      <label>
        {label}
        <input
          aria-label={label}
          onChange={(event) => onChange(event.target.value || null)}
        />
      </label>
    ),
  }),
);

jest.mock('twenty-ui/input', () => ({
  IconButton: ({
    ariaLabel,
    disabled,
    onClick,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => <button aria-label={ariaLabel} disabled={disabled} onClick={onClick} />,
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    clickableComponent,
    dropdownComponents,
  }: {
    clickableComponent: React.ReactNode;
    dropdownComponents: React.ReactNode;
  }) => (
    <div>
      {clickableComponent}
      {dropdownComponents}
    </div>
  ),
}));

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const contact = (isAvailable = true): MyahInboxContact => ({
  id: 'contact-1',
  identityKind: 'CREATOR',
  displayName: 'Ada',
  instagramUsername: 'ada',
  creator: { id: 'creator-1', name: 'Ada' },
  lastActivityAt: '2026-09-15T10:00:00.000Z',
  latestChannel: 'EMAIL',
  preview: 'Hello',
  sender: 'Ada',
  needsAttention: true,
  triage: {
    isAvailable,
    inboxOwnerId: 'member-1',
    inboxState: 'NEEDS_REPLY',
    snoozedUntil: null,
    revision: 4,
    identityGeneration: '7',
  },
  email: {
    isAvailable: true,
    threadCount: 1,
    threadIds: ['thread-1'],
    latestThreadId: 'thread-1',
    needsAttention: true,
  },
  instagram: {
    isAvailable: true,
    state: 'READY',
    needsAttention: true,
    conversations: [],
  },
});

describe('MyahInboxContactTriageActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTriage.mockResolvedValue({});
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-1',
    } as never);
  });

  it.each(['EMAIL', 'INSTAGRAM'] as const)(
    'renders one shared triage group for %s selections',
    (channel) => {
      render(
        <MyahInboxContactTriageActions
          contact={contact()}
          channel={channel}
          onUpdated={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('group', { name: 'Contact triage' }),
      ).toBeVisible();
      expect(screen.getAllByRole('combobox', { name: 'State' })).toHaveLength(
        1,
      );
    },
  );

  it('sends both optimistic-concurrency tokens and disables controls while pending', async () => {
    let resolveMutation: (value: unknown) => void = () => undefined;
    mockUpdateTriage.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    render(
      <MyahInboxContactTriageActions
        contact={contact()}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
      target: { value: 'CLOSED' },
    });

    await waitFor(() => {
      expect(mockUpdateTriage).toHaveBeenCalledWith({
        expectedWorkspaceId: 'workspace-1',
        contactId: 'contact-1',
        expectedRevision: 4,
        expectedIdentityGeneration: '7',
        inboxState: 'CLOSED',
      });
      expect(screen.getByRole('combobox', { name: 'State' })).toBeDisabled();
    });

    resolveMutation({});
  });

  it('keeps pending state and mutation errors scoped to the initiating contact', async () => {
    let rejectMutation: (reason: unknown) => void = () => undefined;
    mockUpdateTriage.mockReturnValue(
      new Promise((_, reject) => {
        rejectMutation = reject;
      }),
    );
    const { rerender } = render(
      <MyahInboxContactTriageActions
        contact={contact()}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
      target: { value: 'CLOSED' },
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'State' })).toBeDisabled();
    });

    rerender(
      <MyahInboxContactTriageActions
        contact={{ ...contact(), id: 'contact-2', displayName: 'Grace' }}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'State' })).not.toBeDisabled();

    await act(async () => {
      rejectMutation(
        new Error(
          'This contact changed. Review the latest status and try again.',
        ),
      );
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removes an open snooze editor while a triage mutation is pending', async () => {
    let resolveMutation: (value: unknown) => void = () => undefined;
    mockUpdateTriage.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    render(
      <MyahInboxContactTriageActions
        contact={contact()}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Snooze' }), {
      target: { value: new Date(Date.now() + 60_000).toISOString() },
    });

    await waitFor(() => {
      expect(mockUpdateTriage).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('textbox', { name: 'Snooze' }),
      ).not.toBeInTheDocument();
    });

    expect(mockUpdateTriage).toHaveBeenCalledTimes(1);
    resolveMutation({});
  });

  it('shows the exact conflict message without retrying', async () => {
    mockUpdateTriage.mockRejectedValue(
      new Error(
        'This contact changed. Review the latest status and try again.',
      ),
    );
    render(
      <MyahInboxContactTriageActions
        contact={contact()}
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
      target: { value: 'CLOSED' },
    });

    expect(
      await screen.findByText(
        'This contact changed. Review the latest status and try again.',
      ),
    ).toBeVisible();
    expect(mockUpdateTriage).toHaveBeenCalledTimes(1);
  });

  it('uses the generic unavailable message for every unavailable contact', () => {
    render(
      <MyahInboxContactTriageActions
        contact={contact(false)}
        onUpdated={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Triage is unavailable with your current Inbox access.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'Contact triage' }),
    ).not.toBeInTheDocument();
  });

  it('refreshes long snoozes only after their deadline', () => {
    jest.useFakeTimers();
    const onUpdated = jest.fn();
    const longDelay = 2_147_483_647 + 1_000;
    render(
      <MyahInboxContactTriageActions
        contact={{
          ...contact(),
          triage: {
            ...contact().triage,
            inboxState: 'SNOOZED',
            snoozedUntil: new Date(Date.now() + longDelay).toISOString(),
          },
        }}
        onUpdated={onUpdated}
      />,
    );

    jest.advanceTimersByTime(2_147_483_647);
    expect(onUpdated).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('refreshes at a snooze deadline and clears its timer on unmount', () => {
    jest.useFakeTimers();
    const onUpdated = jest.fn();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { unmount } = render(
      <MyahInboxContactTriageActions
        contact={{
          ...contact(),
          triage: {
            ...contact().triage,
            inboxState: 'SNOOZED',
            snoozedUntil: new Date(Date.now() + 1_000).toISOString(),
          },
        }}
        onUpdated={onUpdated}
      />,
    );

    jest.advanceTimersByTime(1_000);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });
});
