import { render, screen } from '@testing-library/react';

import { ObjectOptionsDropdownContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownContent';

const mockUseObjectOptionsDropdown = jest.fn();

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({ useObjectOptionsDropdown: () => mockUseObjectOptionsDropdown() }),
);

jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownMenuContent',
  () => ({
    ObjectOptionsDropdownMenuContent: () => <div>Safe object options</div>,
  }),
);

jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownCalendarFieldsContent',
  () => ({
    ObjectOptionsDropdownCalendarFieldsContent: () => (
      <div>Calendar date field editor</div>
    ),
  }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownCalendarViewContent',
  () => ({
    ObjectOptionsDropdownCalendarViewContent: () => (
      <div>Calendar view editor</div>
    ),
  }),
);

jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownAddRecordGroupContent',
  () => ({ ObjectOptionsDropdownAddRecordGroupContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownFieldsContent',
  () => ({ ObjectOptionsDropdownFieldsContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownHiddenFieldsContent',
  () => ({ ObjectOptionsDropdownHiddenFieldsContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownHiddenRecordGroupsContent',
  () => ({ ObjectOptionsDropdownHiddenRecordGroupsContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownLayoutContent',
  () => ({ ObjectOptionsDropdownLayoutContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownLayoutOpenInContent',
  () => ({ ObjectOptionsDropdownLayoutOpenInContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownRecordGroupFieldsContent',
  () => ({ ObjectOptionsDropdownRecordGroupFieldsContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownRecordGroupsContent',
  () => ({ ObjectOptionsDropdownRecordGroupsContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownRecordGroupSortContent',
  () => ({ ObjectOptionsDropdownRecordGroupSortContent: () => null }),
);
jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownVisibilityContent',
  () => ({ ObjectOptionsDropdownVisibilityContent: () => null }),
);

describe('ObjectOptionsDropdownContent', () => {
  it.each(['calendarFields', 'calendarView'])(
    'keeps Calendar controls unavailable in a table-locked pane (%s)',
    (currentContentId) => {
      mockUseObjectOptionsDropdown.mockReturnValue({
        currentContentId,
        isLayoutLocked: true,
      });

      render(<ObjectOptionsDropdownContent />);

      expect(screen.getByText('Safe object options')).toBeVisible();
      expect(
        screen.queryByText('Calendar date field editor'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Calendar view editor'),
      ).not.toBeInTheDocument();
    },
  );
});
