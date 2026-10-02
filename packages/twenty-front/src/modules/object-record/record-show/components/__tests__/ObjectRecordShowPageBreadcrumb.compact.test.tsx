import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ObjectRecordShowPageBreadcrumb } from '@/object-record/record-show/components/ObjectRecordShowPageBreadcrumb';

const mockNavigateToIndexView = jest.fn();
const mockPagination = jest.fn();
const mockUpdate = jest.fn();

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPagePagination',
  () => ({
    useRecordShowPagePagination: (...args: unknown[]) =>
      mockPagination(...args),
  }),
);
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({ loading: false }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-meta' },
  }),
}));
jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => false,
}));
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerActions',
  () => ({
    useRecordShowContainerActions: () => ({
      useUpdateOneObjectRecordMutation: mockUpdate,
    }),
  }),
);
jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPageGroupByBreadcrumbInfo',
  () => ({
    useRecordShowPageGroupByBreadcrumbInfo: () => ({
      viewName: '',
      groupValueLabel: '',
      isGroupByActive: false,
      isGroupValueLoading: false,
    }),
  }),
);
jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: String }),
}));
jest.mock('@/object-metadata/components/ObjectMetadataIcon', () => ({
  ObjectMetadataIcon: () => <span>Campaign icon</span>,
}));
jest.mock(
  '@/object-record/record-title-cell/components/RecordTitleCell',
  () => ({
    RecordTitleCell: () => (
      <button type="button" onClick={() => mockUpdate('renamed')}>
        Rename Campaign
      </button>
    ),
  }),
);

beforeEach(() => {
  jest.clearAllMocks();
  mockPagination.mockReturnValue({
    navigateToIndexView: mockNavigateToIndexView,
    rankInView: 0,
    totalCount: 3,
  });
});

it.each(['outreach', 'operations'])(
  'compact breadcrumb preserves view-aware return and the editable title on %s',
  (section) => {
    render(
      <MemoryRouter
        initialEntries={[`/myah/campaigns/c1?viewId=chosen&section=${section}`]}
      >
        <ObjectRecordShowPageBreadcrumb
          objectNameSingular="campaign"
          objectRecordId="c1"
          objectLabel="Campaigns"
          compactOnMobile
        />
      </MemoryRouter>,
    );
    const back = screen.getByRole('button', { name: 'Back to Campaigns' });
    back.focus();
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(mockPagination).toHaveBeenCalledWith('campaign', 'c1');
    expect(mockNavigateToIndexView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Campaign' }));
    expect(mockUpdate).toHaveBeenCalledWith('renamed');
    expect(screen.queryByText('(1/3)')).not.toBeInTheDocument();
    expect(screen.queryByText('Campaigns')).not.toBeInTheDocument();
  },
);

it('keeps the ordinary record breadcrumb prefix and pagination without opting in', () => {
  render(
    <MemoryRouter>
      <ObjectRecordShowPageBreadcrumb
        objectNameSingular="campaign"
        objectRecordId="c1"
        objectLabel="Campaigns"
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('Campaigns')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Back to Campaigns' }),
  ).not.toBeInTheDocument();
});
