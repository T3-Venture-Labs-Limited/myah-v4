import { renderHook } from '@testing-library/react';

import { useGetShouldResetTableVirtualizationForUpdateInputs } from '@/object-record/record-table/virtualization/hooks/useGetShouldResetTableVirtualizationForUpdateInputs';
import { FieldMetadataType } from 'twenty-shared/types';

jest.mock('@/object-metadata/hooks/useActiveFieldMetadataItems', () => ({
  useActiveFieldMetadataItems: () => ({
    activeFieldMetadataItems: [
      {
        id: 'list-memberships-field',
        name: 'listMemberships',
        type: FieldMetadataType.RELATION,
      },
    ],
  }),
}));

jest.mock(
  '@/object-record/record-filter/hooks/useEffectiveRecordFilters',
  () => ({
    useEffectiveRecordFilters: () => [
      {
        id: 'creator-list-filter',
        fieldMetadataId: 'list-memberships-field',
      },
    ],
  }),
);

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({ objectMetadataItem: {} }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => [],
  }),
);

describe('useGetShouldResetTableVirtualizationForUpdateInputs', () => {
  it('resets when a query-only relation filter field changes', () => {
    const { result } = renderHook(() =>
      useGetShouldResetTableVirtualizationForUpdateInputs(),
    );

    expect(
      result.current.getShouldResetTableVirtualizationForUpdateInputs([
        {
          recordId: 'creator-1',
          updatedFields: [{ listMemberships: null }],
        },
      ]),
    ).toBe(true);
  });
});
