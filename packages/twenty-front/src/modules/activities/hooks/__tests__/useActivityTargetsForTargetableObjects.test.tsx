import { renderHook } from '@testing-library/react';

import { useActivityTargetsForTargetableObjects } from '@/activities/hooks/useActivityTargetsForTargetableObjects';
import { CoreObjectNameSingular } from 'twenty-shared/types';

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));
jest.mock(
  '@/activities/graphql/operation-signatures/factories/findActivityTargetsOperationSignatureFactory',
  () => ({
    findActivityTargetsOperationSignatureFactory: () => ({
      objectNameSingular: 'noteTarget',
      fields: { id: true },
    }),
  }),
);
jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));

it('propagates denied NoteTarget read instead of treating a skipped query as empty', () => {
  const { useFindManyRecords } = jest.requireMock(
    '@/object-record/hooks/useFindManyRecords',
  );
  useFindManyRecords.mockReturnValue({
    records: [],
    loading: false,
    totalCount: undefined,
    hasReadPermission: false,
    error: undefined,
  });

  const { result } = renderHook(() =>
    useActivityTargetsForTargetableObjects({
      objectNameSingular: CoreObjectNameSingular.Note,
      targetableObjects: [
        { id: 'creator-id', targetObjectNameSingular: 'creator' },
      ],
      activityTargetsOrderByVariables: [{}],
      limit: 10,
    }),
  );

  expect(useFindManyRecords).toHaveBeenCalledWith(
    expect.objectContaining({ objectNameSingular: 'noteTarget' }),
  );
  expect(result.current.hasReadPermission).toBe(false);
  expect(result.current.activityTargets).toEqual([]);
});
