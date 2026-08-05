import { render, screen } from '@testing-library/react';

import { ViewPickerDropdown } from '@/views/view-picker/components/ViewPickerDropdown';
import { type ViewType } from '@/views/types/ViewType';

const mockViewPickerListContent = jest.fn(
  ({ forcedViewType }: { forcedViewType?: ViewType }) => (
    <div data-testid="view-picker-list-content">
      {forcedViewType ?? 'undefined'}
    </div>
  ),
);

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({ recordIndexId: 'creator-index' }),
}));

jest.mock('@/ui/layout/dropdown/components/Dropdown', () => ({
  Dropdown: ({
    dropdownComponents,
  }: {
    dropdownComponents: React.ReactNode;
  }) => <>{dropdownComponents}</>,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({ useAtomComponentStateValue: () => undefined }),
);

jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: (value: number) => String(value) }),
}));

jest.mock(
  '@/ui/layout/dropdown/components/StyledDropdownButtonContainer',
  () => ({
    StyledDropdownButtonContainer: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,
  }),
);

jest.mock('@/views/contexts/ViewBarControlIdsContext', () => ({
  useViewBarControlIds: () => ({ viewPickerDropdownId: 'creator-picker' }),
}));

jest.mock('@/views/hooks/internal/useGetRecordIndexTotalCount', () => ({
  useGetRecordIndexTotalCount: () => ({ totalCount: undefined }),
}));

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({ currentView: undefined }),
}));

jest.mock('@/views/view-picker/components/ViewPickerContentCreateMode', () => ({
  ViewPickerContentCreateMode: () => null,
}));

jest.mock('@/views/view-picker/components/ViewPickerContentEditMode', () => ({
  ViewPickerContentEditMode: () => null,
}));

jest.mock('@/views/view-picker/components/ViewPickerContentEffect', () => ({
  ViewPickerContentEffect: () => null,
}));

jest.mock('@/views/view-picker/components/ViewPickerListContent', () => ({
  ViewPickerListContent: (props: { forcedViewType?: ViewType }) =>
    mockViewPickerListContent(props),
}));

jest.mock('@/views/view-picker/hooks/useUpdateViewFromCurrentState', () => ({
  useUpdateViewFromCurrentState: () => ({
    updateViewFromCurrentState: jest.fn(),
  }),
}));

jest.mock('@/views/view-picker/hooks/useViewPickerMode', () => ({
  useViewPickerMode: () => ({
    viewPickerMode: 'list',
    setViewPickerMode: jest.fn(),
  }),
}));

jest.mock('twenty-ui/icon', () => ({
  IconChevronDown: () => null,
  IconList: () => null,
  useIcons: () => ({ getIcon: () => undefined }),
}));

jest.mock('twenty-ui/surfaces', () => ({
  OverflowingTextWithTooltip: ({ text }: { text: string }) => <>{text}</>,
}));

jest.mock('twenty-ui/theme-constants', () => {
  const { createContext } = jest.requireActual('react');

  return {
    MOBILE_VIEWPORT: 768,
    ThemeContext: createContext({
      theme: { icon: { size: { md: 16, sm: 12 } } },
    }),
    themeCssVariables: {
      grayScale: { gray8: 'black' },
      spacing: { 1: '4px' },
    },
  };
});

describe('ViewPickerDropdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the forced view type to the selectable view list', () => {
    render(<ViewPickerDropdown forcedViewType={'TABLE' as ViewType} />);

    expect(screen.getByTestId('view-picker-list-content')).toHaveTextContent(
      'TABLE',
    );
  });
});
