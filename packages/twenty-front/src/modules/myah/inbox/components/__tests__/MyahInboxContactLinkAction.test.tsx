import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as ReactType from 'react';

import { MyahInboxContactLinkAction } from '@/myah/inbox/components/MyahInboxContactLinkAction';

const mockLinkCreator = jest.fn();
const mockUseMyahInboxContactCreatorLink = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();

jest.mock('@/myah/inbox/hooks/useMyahInboxContactCreatorLink', () => ({
  useMyahInboxContactCreatorLink: (
    onLinked?: (resultingContactId: string) => void | Promise<void>,
  ) => {
    mockUseMyahInboxContactCreatorLink(onLinked);

    return {
      linkCreator: mockLinkCreator,
      linking: false,
      error: null,
      result: null,
    };
  },
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [{ nameSingular: 'creator' }],
  }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('uuid', () => ({ v4: () => 'new-creator-id' }));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker',
  () => ({
    FormSingleRecordPicker: ({
      label,
      defaultValue,
      onChange,
      onCreate,
      disabled,
    }: {
      label: string;
      defaultValue: string | null;
      onChange: (value: string | null) => void;
      onCreate?: (searchInput?: string) => void;
      disabled?: boolean;
    }) => (
      <label>
        {label}
        <select
          aria-label={label}
          disabled={disabled}
          value={defaultValue ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">No Creator selected</option>
          <option value="creator-1">Ada Creator</option>
        </select>
        {onCreate ? (
          <button type="button" onClick={() => onCreate('New creator')}>
            Create Creator
          </button>
        ) : null}
      </label>
    ),
  }),
);

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => {
  const React = jest.requireActual('react') as typeof ReactType;

  return {
    Dropdown: ({
      clickableComponent,
      clickableComponentAriaLabel,
      dropdownComponents,
      dropdownRole,
      isClickableComponentKeyboardAccessible,
      onClickableComponentRef,
      onClose,
    }: {
      clickableComponent: React.ReactNode;
      clickableComponentAriaLabel: string;
      dropdownComponents: React.ReactNode;
      dropdownRole?: ReactType.AriaRole;
      isClickableComponentKeyboardAccessible?: boolean;
      onClickableComponentRef?: (element: HTMLDivElement | null) => void;
      onClose?: () => void;
    }) => {
      const [isOpen, setIsOpen] = React.useState(false);
      const toggle = () => setIsOpen((current) => !current);

      return (
        <div role={dropdownRole}>
          <div
            ref={onClickableComponentRef}
            aria-label={clickableComponentAriaLabel}
            onClick={toggle}
            onKeyDown={(event) => {
              if (
                isClickableComponentKeyboardAccessible &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                toggle();
              }
            }}
            role="button"
            tabIndex={isClickableComponentKeyboardAccessible ? 0 : undefined}
          >
            {clickableComponent}
          </div>
          {isOpen && dropdownComponents}
          {onClose ? (
            <button
              onClick={() => {
                setIsOpen(false);
                onClose();
              }}
            >
              Close Creator selector
            </button>
          ) : null}
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

jest.mock('twenty-ui/input', () => ({
  IconButton: ({
    ariaLabel,
    disabled,
    tabIndex,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    tabIndex?: number;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} tabIndex={tabIndex} />
  ),
}));

jest.mock('twenty-ui/icon', () => ({
  IconUserPlus: () => null,
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    font: { color: { secondary: 'gray' }, size: { xs: '11px' } },
    spacing: { 3: '12px' },
  },
}));

describe('MyahInboxContactLinkAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLinkCreator.mockResolvedValue('linked-contact-1');
  });

  it('links only the explicitly selected Creator and delegates the resulting contact id', async () => {
    const onLinked = jest.fn();

    render(
      <MyahInboxContactLinkAction contactId="contact-1" onLinked={onLinked} />,
    );

    expect(mockUseMyahInboxContactCreatorLink).toHaveBeenCalledWith(onLinked);

    fireEvent.click(screen.getByRole('button', { name: 'Creator selector' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Creator' }), {
      target: { value: 'creator-1' },
    });

    await waitFor(() =>
      expect(mockLinkCreator).toHaveBeenCalledWith({
        contactId: 'contact-1',
        creatorId: 'creator-1',
      }),
    );
  });

  it('opens the native create flow without auto-linking and leaves the picker available', () => {
    render(
      <MyahInboxContactLinkAction contactId="contact-1" onLinked={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Creator selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Creator' }));

    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: 'new-creator-id',
      objectNameSingular: 'creator',
      isNewRecord: true,
      resetNavigationStack: true,
    });
    expect(mockLinkCreator).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Creator' })).toBeVisible();
  });

  it('ignores an empty selection and restores focus when the picker closes', () => {
    render(
      <MyahInboxContactLinkAction contactId="contact-1" onLinked={jest.fn()} />,
    );

    const trigger = screen.getByRole('button', { name: 'Creator selector' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const picker = screen.getByRole('combobox', { name: 'Creator' });
    picker.focus();
    fireEvent.change(picker, { target: { value: '' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Creator selector' }),
    );

    expect(mockLinkCreator).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('reports a failed explicit link', async () => {
    const onError = jest.fn();
    mockLinkCreator.mockRejectedValue(new Error('Creator is unavailable'));

    render(
      <MyahInboxContactLinkAction
        contactId="contact-1"
        onLinked={jest.fn()}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Creator selector' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Creator' }), {
      target: { value: 'creator-1' },
    });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Creator is unavailable'),
    );
  });
});
