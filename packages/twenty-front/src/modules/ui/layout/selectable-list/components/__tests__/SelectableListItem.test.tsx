import { fireEvent, render, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { SelectableList } from '@/ui/layout/selectable-list/components/SelectableList';
import { SelectableListItem } from '@/ui/layout/selectable-list/components/SelectableListItem';
import { isSelectedItemIdComponentFamilyState } from '@/ui/layout/selectable-list/states/isSelectedItemIdComponentFamilyState';

const selectableListInstanceId = 'test-selectable-list';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

describe('SelectableListItem', () => {
  const scrollIntoViewMock = jest.fn();

  beforeEach(() => {
    scrollIntoViewMock.mockClear();

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  afterAll(() => {
    if (typeof originalScrollIntoView === 'function') {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });

      return;
    }

    delete (
      HTMLElement.prototype as {
        scrollIntoView?: HTMLElement['scrollIntoView'];
      }
    ).scrollIntoView;
  });

  it('scrolls the selected item into view even when the scroll wrapper is at the top', async () => {
    const store = createStore();

    store.set(
      isSelectedItemIdComponentFamilyState.atomFamily({
        instanceId: selectableListInstanceId,
        familyKey: 'second-item',
      }),
      true,
    );

    render(
      <JotaiProvider store={store}>
        <div id="scroll-wrapper-test">
          <SelectableList
            selectableListInstanceId={selectableListInstanceId}
            selectableItemIdArray={['first-item', 'second-item']}
            focusId="test-focus-id"
          >
            <SelectableListItem itemId="first-item">
              First item
            </SelectableListItem>
            <SelectableListItem itemId="second-item">
              Second item
            </SelectableListItem>
          </SelectableList>
        </div>
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'nearest',
      });
    });
  });

  it('supports opt-in listbox option semantics, roving focus, keyboard handling, and item refs', () => {
    const store = createStore();
    const onKeyDown = jest.fn();
    const itemRef = jest.fn();

    store.set(
      isSelectedItemIdComponentFamilyState.atomFamily({
        instanceId: selectableListInstanceId,
        familyKey: 'second-item',
      }),
      true,
    );

    const { getByRole } = render(
      <JotaiProvider store={store}>
        <SelectableList
          selectableListInstanceId={selectableListInstanceId}
          selectableItemIdArray={['first-item', 'second-item']}
          focusId="test-focus-id"
        >
          <SelectableListItem
            itemId="first-item"
            role="option"
            ariaLabel="First result, Campaign"
            isRoving
          >
            First result
          </SelectableListItem>
          <SelectableListItem
            itemId="second-item"
            role="option"
            ariaLabel="Second result, Campaign"
            isRoving
            onKeyDown={onKeyDown}
            itemRef={itemRef}
          >
            Second result
          </SelectableListItem>
        </SelectableList>
      </JotaiProvider>,
    );

    const selectedOption = getByRole('option', {
      name: 'Second result, Campaign',
    });
    const unselectedOption = getByRole('option', {
      name: 'First result, Campaign',
    });

    expect(selectedOption).toHaveAttribute('aria-selected', 'true');
    expect(selectedOption).toHaveAttribute('tabindex', '0');
    expect(unselectedOption).toHaveAttribute('aria-selected', 'false');
    expect(unselectedOption).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(selectedOption, { key: 'ArrowDown' });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(itemRef).toHaveBeenCalledWith(selectedOption);
  });
});
