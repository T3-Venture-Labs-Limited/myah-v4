import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactType from 'react';

import { TabListDropdown } from '@/ui/layout/tab-list/components/TabListDropdown';

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => {
  const React = jest.requireActual('react') as typeof ReactType;

  return {
    Dropdown: ({
      clickableComponent,
      dropdownAriaLabel,
      dropdownComponents,
      dropdownId,
      onOpen,
      renderClickableComponentAsChild,
    }: {
      clickableComponent: ReactType.ReactNode;
      dropdownAriaLabel?: string;
      dropdownComponents: ReactType.ReactNode;
      dropdownId: string;
      onOpen?: () => void;
      renderClickableComponentAsChild?: boolean;
    }) => {
      const [isOpen, setIsOpen] = React.useState(false);

      React.useEffect(() => {
        if (isOpen) {
          onOpen?.();
        }
      }, [isOpen, onOpen]);

      const triggerProps = {
        'aria-controls': `${dropdownId}-options`,
        'aria-expanded': isOpen,
        'aria-haspopup': 'listbox' as const,
        onClick: () => setIsOpen((current) => !current),
      };

      const trigger =
        renderClickableComponentAsChild &&
        React.isValidElement<ReactType.ComponentPropsWithoutRef<'button'>>(
          clickableComponent,
        ) ? (
          React.cloneElement(clickableComponent, triggerProps)
        ) : (
          <div
            aria-controls={triggerProps['aria-controls']}
            aria-expanded={triggerProps['aria-expanded']}
            aria-haspopup={triggerProps['aria-haspopup']}
            onClick={triggerProps.onClick}
            role="button"
            tabIndex={0}
          >
            {clickableComponent}
          </div>
        );

      return (
        <>
          {trigger}
          {isOpen && (
            <div
              aria-label={dropdownAriaLabel}
              id={`${dropdownId}-options`}
              role="listbox"
            >
              {dropdownComponents}
            </div>
          )}
        </>
      );
    },
  };
});

const hiddenTabs = [
  { id: 'notes', title: 'Notes' },
  { id: 'agent', title: 'Agent', disabled: true },
  { id: 'operations', title: 'Operations' },
];

const renderDropdown = ({ activeTabId = 'operations' } = {}) => {
  const onClose = jest.fn();
  const onTabSelect = jest.fn();

  const view = render(
    <TabListDropdown
      activeTabId={activeTabId}
      dropdownId="campaign-tabs"
      hiddenTabs={hiddenTabs}
      onClose={onClose}
      onTabSelect={onTabSelect}
      overflow={{ hiddenTabsCount: hiddenTabs.length, isActiveTabHidden: true }}
    />,
  );

  return { ...view, onClose, onTabSelect };
};

const openDropdown = async () => {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: '+3 More' });

  await user.click(trigger);
  await waitFor(() =>
    expect(document.activeElement).toHaveAttribute('role', 'option'),
  );

  return { trigger, user };
};

describe('TabListDropdown', () => {
  it('uses one controlled button and exposes named selectable options', async () => {
    renderDropdown();

    expect(screen.getAllByRole('button', { name: '+3 More' })).toHaveLength(1);

    const { trigger } = await openDropdown();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', 'campaign-tabs-options');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(screen.getByRole('listbox', { name: 'More' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Notes' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('option', { name: 'Agent' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Operations' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Operations' })).toHaveFocus();
  });

  it('moves focus with arrow, Home, and End keys while skipping disabled tabs', async () => {
    renderDropdown({ activeTabId: 'notes' });
    const { user } = await openDropdown();
    const notes = screen.getByRole('option', { name: 'Notes' });
    const operations = screen.getByRole('option', { name: 'Operations' });

    expect(notes).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(operations).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(notes).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(operations).toHaveFocus();

    await user.keyboard('{Home}');
    expect(notes).toHaveFocus();

    await user.keyboard('{End}');
    expect(operations).toHaveFocus();
  });

  it.each(['{Enter}', ' '])(
    'selects the focused tab with %s and restores trigger focus',
    async (key) => {
      const { onClose, onTabSelect } = renderDropdown({ activeTabId: 'notes' });
      const { trigger, user } = await openDropdown();

      await user.keyboard('{End}');
      await user.keyboard(key);

      expect(onTabSelect).toHaveBeenCalledWith('operations');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(trigger).toHaveFocus();
    },
  );

  it.each(['{Enter}', ' '])(
    'does not activate a disabled option with %s',
    async (key) => {
      const { onClose, onTabSelect } = renderDropdown({ activeTabId: 'notes' });
      const { user } = await openDropdown();
      const disabledOption = screen.getByRole('option', { name: 'Agent' });

      await user.click(disabledOption);
      await user.keyboard(key);

      expect(onTabSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(disabledOption).toHaveFocus();
    },
  );

  it('closes with Escape and restores trigger focus without changing tabs', async () => {
    const { onClose, onTabSelect } = renderDropdown({ activeTabId: 'notes' });
    const { trigger, user } = await openDropdown();

    await user.keyboard('{Escape}');

    expect(onTabSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });
});
