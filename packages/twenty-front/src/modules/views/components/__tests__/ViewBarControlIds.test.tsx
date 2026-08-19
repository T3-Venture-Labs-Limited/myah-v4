import { render, screen } from '@testing-library/react';

import {
  ViewBarControlIdsProvider,
  useViewBarControlIds,
} from '@/views/contexts/ViewBarControlIdsContext';

const ViewBarControlIdsOutput = ({ testId }: { testId: string }) => {
  const controlIds = useViewBarControlIds();

  return <output data-testid={testId}>{JSON.stringify(controlIds)}</output>;
};

describe('ViewBarControlIdsContext', () => {
  it('assigns unique native control IDs to simultaneous record indexes', () => {
    render(
      <>
        <ViewBarControlIdsProvider viewBarId="creators-view-left">
          <ViewBarControlIdsOutput testId="left-controls" />
        </ViewBarControlIdsProvider>
        <ViewBarControlIdsProvider viewBarId="creators-view-right">
          <ViewBarControlIdsOutput testId="right-controls" />
        </ViewBarControlIdsProvider>
      </>,
    );

    const leftControlIds = JSON.parse(
      screen.getByTestId('left-controls').textContent ?? '{}',
    );
    const rightControlIds = JSON.parse(
      screen.getByTestId('right-controls').textContent ?? '{}',
    );

    const scopedControlIdKeys = [
      'advancedFilterDropdownId',
      'anyFieldSearchDropdownId',
      'filterDropdownId',
      'hiddenTableColumnDropdownId',
      'objectOptionsDropdownId',
      'recordIndexRemoveSortingModalId',
      'recordTableClickOutsideListenerId',
      'updateViewDropdownId',
      'viewPickerCalendarFieldDropdownId',
      'viewPickerDropdownId',
      'viewPickerKanbanFieldDropdownId',
      'viewPickerViewTypeDropdownId',
      'viewSortDropdownId',
    ] as const;

    for (const controlIdKey of scopedControlIdKeys) {
      expect(leftControlIds[controlIdKey]).not.toBe(
        rightControlIds[controlIdKey],
      );
    }
  });
});
