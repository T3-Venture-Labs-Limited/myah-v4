import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactType from 'react';

import { MyahInboxThreadActions } from '@/myah/inbox/components/MyahInboxThreadActions';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    font: { color: { secondary: 'gray' }, size: { xs: '11px' } },
    spacing: { 1: '4px', 2: '8px' },
  },
}));

const mockUpdateThread = jest.fn();
const mockOpenMyahInboxContextInSidePanel = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('uuid', () => ({ v4: () => 'new-creator-id' }));

jest.mock('@/myah/inbox/hooks/useOpenMyahInboxContextInSidePanel', () => ({
  useOpenMyahInboxContextInSidePanel: () => ({
    openMyahInboxContextInSidePanel: mockOpenMyahInboxContextInSidePanel,
  }),
}));

const mockAppTooltip = jest.fn((_props: unknown) => null);

jest.mock('@/myah/inbox/hooks/useMyahInboxThreadMutations', () => ({
  useMyahInboxThreadMutations: () => ({ updateThread: mockUpdateThread }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      { nameSingular: 'creator' },
      { nameSingular: 'campaign' },
      { nameSingular: 'workspaceMember' },
    ],
  }),
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({
    FormSingleRecordPicker: ({
      label,
      defaultValue,
      onChange,
      onCreate,
    }: {
      label: string;
      defaultValue: string | null;
      onChange: (value: string | null) => void;
      onCreate?: (searchInput?: string) => void;
    }) => (
      <label>
        {label}
        <select
          aria-label={label}
          value={defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">None</option>
          <option value="creator-1">Ada Creator</option>
          <option value="campaign-1">Spring campaign</option>
          <option value="member-1">Zachary</option>
        </select>
        {onCreate ? (
          <button type="button" onClick={() => onCreate('Ada')}>
            {`Create ${label}`}
          </button>
        ) : null}
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
  '@/object-record/record-field/ui/form-types/components/FormDateTimeFieldInput',
  () => {
    const React = jest.requireActual('react') as typeof ReactType;

    const FormDateTimeFieldInput = ({
      label,
      defaultValue,
      onChange,
    }: {
      label: string;
      defaultValue?: string;
      onChange: (value: string | null) => void;
    }) => {
      const [value, setValue] = React.useState(defaultValue ?? '');

      return (
        <label>
          {label}
          <input
            aria-label={label}
            value={value}
            onChange={(event) => {
              const nextValue = event.target.value;
              setValue(nextValue);
              onChange(nextValue || null);
            }}
          />
        </label>
      );
    };

    return { FormDateTimeFieldInput };
  },
);

jest.mock('twenty-ui/input', () => ({
  Button: ({ title }: { title: string }) => <button>{title}</button>,
  IconButton: ({
    ariaLabel,
    dataTestId,
    onClick,
  }: {
    ariaLabel: string;
    dataTestId?: string;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} data-testid={dataTestId} onClick={onClick} />
  ),
}));

jest.mock('twenty-ui/surfaces', () => ({
  AppTooltip: (props: unknown) => {
    mockAppTooltip(props);
    return null;
  },
  TooltipDelay: { shortDelay: 0 },
  TooltipPosition: { Top: 'top' },
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => {
  const React = jest.requireActual('react') as typeof ReactType;

  return {
    Dropdown: ({
      clickableComponent,
      dropdownComponents,
    }: {
      clickableComponent: React.ReactNode;
      dropdownComponents: React.ReactNode;
    }) => {
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <div>
          <div onClick={() => setIsOpen((current) => !current)}>
            {clickableComponent}
          </div>
          {isOpen && dropdownComponents}
        </div>
      );
    },
  };
});

jest.mock('@/ui/layout/dropdown/components/DropdownContent', () => ({
  DropdownContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const unlinkedThread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  subject: 'First conversation',
  lastMessagePreview: 'First preview',
  lastMessageSender: 'Ada',
  state: 'NEEDS_REPLY' as const,
  snoozedUntil: null,
  creator: null,
  campaign: null,
  inboxOwner: null,
};

describe('MyahInboxThreadActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateThread.mockResolvedValue({});
  });

  it('uses labelled compact action controls instead of visible header forms', () => {
    render(
      <MyahInboxThreadActions
        thread={unlinkedThread}
        onThreadUpdated={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Creator' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Campaign' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Owner' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'State' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Snooze' })).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    expect(
      screen.queryByRole('option', { name: 'Snoozed' }),
    ).not.toBeInTheDocument();
  });

  it('opens the native Inbox context side panel', () => {
    render(
      <MyahInboxThreadActions
        thread={unlinkedThread}
        onThreadUpdated={jest.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Conversation details' }),
    );

    expect(mockOpenMyahInboxContextInSidePanel).toHaveBeenCalledWith({
      thread: unlinkedThread,
    });
    expect(mockAppTooltip).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorSelect: "[data-testid='myah-inbox-thread-details-action']",
        content: 'Open Inbox context',
      }),
    );
    expect(mockAppTooltip).toHaveBeenCalledTimes(6);
  });

  it('keeps Creator available for an unlinked thread and writes only the selected creator', async () => {
    render(
      <MyahInboxThreadActions
        thread={unlinkedThread}
        onThreadUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Creator' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Creator' }), {
      target: { value: 'creator-1' },
    });

    await waitFor(() =>
      expect(mockUpdateThread).toHaveBeenCalledWith({
        threadId: 'thread-1',
        creatorId: 'creator-1',
      }),
    );
  });

  it('opens a native unsaved Creator form from the Creator picker without linking the thread', () => {
    render(
      <MyahInboxThreadActions
        thread={unlinkedThread}
        onThreadUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Creator' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Creator' }));

    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: 'new-creator-id',
      objectNameSingular: 'creator',
      isNewRecord: true,
      resetNavigationStack: true,
    });
    expect(mockUpdateThread).not.toHaveBeenCalled();
  });

  it('writes partial relation/state mutations and an atomic snooze transition', async () => {
    const thread = {
      ...unlinkedThread,
      creator: { id: 'creator-1', name: 'Ada Creator' },
      campaign: { id: 'campaign-1', name: 'Spring campaign' },
      inboxOwner: { id: 'member-1', name: 'Zachary' },
    };
    render(
      <MyahInboxThreadActions thread={thread} onThreadUpdated={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Campaign' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Campaign' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Owner' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Owner' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'State' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
      target: { value: 'CLOSED' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Snooze' }), {
      target: { value: '2099-01-01T12:00:00.000Z' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Snooze' }), {
      target: { value: '' },
    });

    await waitFor(() => {
      expect(mockUpdateThread).toHaveBeenNthCalledWith(1, {
        threadId: 'thread-1',
        campaignId: null,
      });
      expect(mockUpdateThread).toHaveBeenNthCalledWith(2, {
        threadId: 'thread-1',
        inboxOwnerId: null,
      });
      expect(mockUpdateThread).toHaveBeenNthCalledWith(3, {
        threadId: 'thread-1',
        inboxState: 'CLOSED',
      });
      expect(mockUpdateThread).toHaveBeenNthCalledWith(4, {
        threadId: 'thread-1',
        inboxState: 'SNOOZED',
        snoozedUntil: '2099-01-01T12:00:00.000Z',
      });
      expect(mockUpdateThread).toHaveBeenNthCalledWith(5, {
        threadId: 'thread-1',
        inboxState: 'NEEDS_REPLY',
        snoozedUntil: null,
      });
    });
  });

  it('rejects a snooze timestamp that is not in the future', () => {
    const onUpdateFailed = jest.fn();
    render(
      <MyahInboxThreadActions
        thread={unlinkedThread}
        onThreadUpdated={jest.fn()}
        onUpdateFailed={onUpdateFailed}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Snooze' }), {
      target: { value: '2000-01-01T00:00:00.000Z' },
    });

    expect(mockUpdateThread).not.toHaveBeenCalled();
    expect(onUpdateFailed).toHaveBeenCalledWith('Choose a future snooze time.');
  });
});
