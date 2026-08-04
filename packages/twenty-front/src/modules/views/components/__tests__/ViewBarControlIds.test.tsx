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

    expect(leftControlIds.viewPickerDropdownId).not.toBe(
      rightControlIds.viewPickerDropdownId,
    );
    expect(leftControlIds.viewSortDropdownId).not.toBe(
      rightControlIds.viewSortDropdownId,
    );
    expect(leftControlIds.filterDropdownId).not.toBe(
      rightControlIds.filterDropdownId,
    );
    expect(leftControlIds.advancedFilterDropdownId).not.toBe(
      rightControlIds.advancedFilterDropdownId,
    );
  });
});
