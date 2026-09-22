import { renderHook } from '@testing-library/react';

import { useActivities } from '@/activities/hooks/useActivities';
import { useNotes } from '@/activities/notes/hooks/useNotes';
import { type ActivityTargetableObject } from '@/activities/types/ActivityTargetableEntity';
import { CoreObjectNameSingular } from 'twenty-shared/types';

jest.mock('@/activities/hooks/useActivities', () => ({
  useActivities: jest.fn(),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomState', () => ({
  useAtomState: jest.fn(() => [{}, jest.fn()]),
}));

const mockUseActivities = jest.mocked(useActivities);

const targetableObject: ActivityTargetableObject = {
  id: 'target-id',
  targetObjectNameSingular: 'creator',
};

const defaultActivityResult = {
  activities: [
    {
      id: 'note-id',
      title: 'Example Note',
      createdAt: '2026-09-22T00:00:00.000Z',
      updatedAt: '2026-09-22T00:00:00.000Z',
      __typename: 'Note' as const,
    },
  ],
  loading: false,
  totalCountActivities: 1,
  fetchMoreActivities: jest.fn(),
  hasNextPage: false,
  error: undefined,
};

describe('useNotes', () => {
  beforeEach(() => {
    mockUseActivities.mockReturnValue(defaultActivityResult);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns linked notes', () => {
    const { result } = renderHook(() => useNotes(targetableObject));

    expect(result.current.notes).toEqual(defaultActivityResult.activities);
    expect(result.current.loading).toBe(false);
    expect(result.current.totalCountNotes).toBe(1);
  });

  it('returns a successful empty result', () => {
    mockUseActivities.mockReturnValue({
      ...defaultActivityResult,
      activities: [],
      totalCountActivities: 0,
    });

    const { result } = renderHook(() => useNotes(targetableObject));

    expect(result.current.notes).toEqual([]);
    expect(result.current.error).toBeUndefined();
  });

  it('returns the query error', () => {
    const error = new Error('Unable to load notes');

    mockUseActivities.mockReturnValue({
      ...defaultActivityResult,
      activities: [],
      totalCountActivities: 0,
      error,
    });

    const { result } = renderHook(() => useNotes(targetableObject));

    expect(result.current.error).toBe(error);
  });

  it('orders note targets by related note creation time', () => {
    renderHook(() => useNotes(targetableObject));

    expect(mockUseActivities).toHaveBeenCalledWith({
      objectNameSingular: CoreObjectNameSingular.Note,
      activityTargetsOrderByVariables: [
        {
          note: {
            createdAt: 'DescNullsFirst',
          },
        },
      ],
      targetableObjects: [targetableObject],
      limit: 10,
    });
  });
});
