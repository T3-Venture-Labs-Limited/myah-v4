import { fireEvent, render, screen } from '@testing-library/react';
import { FieldMetadataType } from 'twenty-shared/types';

import { useRecordShowPageGroupByBreadcrumbInfo } from '@/object-record/record-show/hooks/useRecordShowPageGroupByBreadcrumbInfo';
import { ObjectRecordShowPageBreadcrumb } from '@/object-record/record-show/components/ObjectRecordShowPageBreadcrumb';

const mockNavigateToIndexView = jest.fn();
const nameField = {
  id: 'name-field',
  universalIdentifier: 'name-field',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
  name: 'name',
  label: 'Name',
  type: FieldMetadataType.TEXT,
};

jest.mock('@/localization/hooks/useNumberFormat', () => ({
  useNumberFormat: () => ({ formatNumber: String }),
}));

jest.mock('@/object-metadata/components/ObjectMetadataIcon', () => ({
  ObjectMetadataIcon: () => <span>Campaign icon</span>,
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: { id: 'campaign-id' } }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ restrictedFields: {} }),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: () => ({ loading: false, hasReadPermission: true }),
}));

jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => true,
}));

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerActions',
  () => ({
    useRecordShowContainerActions: () => ({
      useUpdateOneObjectRecordMutation: jest.fn(),
    }),
  }),
);

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPageGroupByBreadcrumbInfo',
  () => ({ useRecordShowPageGroupByBreadcrumbInfo: jest.fn() }),
);

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowPagePagination',
  () => ({
    useRecordShowPagePagination: () => ({
      rankInView: 0,
      totalCount: 1,
      navigateToIndexView: mockNavigateToIndexView,
    }),
  }),
);

jest.mock(
  '@/object-record/record-title-cell/components/RecordTitleCell',
  () => ({
    RecordTitleCell: () => <span>Autumn studio launch</span>,
  }),
);

const renderCampaignBreadcrumb = () =>
  render(
    <ObjectRecordShowPageBreadcrumb
      objectNameSingular="campaign"
      objectRecordId="record-id"
      objectLabel="Campaigns"
      compactOnMobile
      labelIdentifierFieldMetadataItem={nameField}
    />,
  );

describe('Campaign record breadcrumb', () => {
  it('keeps the full grouped pager label available when mobile display is bounded', () => {
    const viewName = 'Long campaign workspace view';
    const groupValueLabel = 'An equally long group name';
    jest.mocked(useRecordShowPageGroupByBreadcrumbInfo).mockReturnValue({
      isGroupByActive: true,
      isGroupValueLoading: false,
      viewName,
      groupValueLabel,
    });

    renderCampaignBreadcrumb();

    expect(
      screen.getByTitle(`(1/1 in ${viewName} → ${groupValueLabel})`),
    ).toHaveTextContent(`(1/1 in ${viewName} → ${groupValueLabel})`);
    expect(screen.getByText('Autumn studio launch')).toBeInTheDocument();
  });

  it('preserves a short pager and keyboard index navigation', () => {
    jest.mocked(useRecordShowPageGroupByBreadcrumbInfo).mockReturnValue({
      isGroupByActive: false,
      isGroupValueLoading: false,
      viewName: undefined,
      groupValueLabel: undefined,
    });

    renderCampaignBreadcrumb();

    expect(screen.getByTitle('(1/1)')).toHaveTextContent('(1/1)');
    const back = screen.getByRole('button', { name: 'Back to Campaigns' });
    fireEvent.keyDown(back, { key: 'Enter' });
    fireEvent.keyDown(back, { key: ' ' });
    expect(mockNavigateToIndexView).toHaveBeenCalledTimes(2);
  });
});
