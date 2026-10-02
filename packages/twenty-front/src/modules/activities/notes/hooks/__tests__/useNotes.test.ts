import { act, renderHook } from '@testing-library/react';

import { useActivities } from '@/activities/hooks/useActivities';
import { useNotes } from '@/activities/notes/hooks/useNotes';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ActivityTargetableObject } from '@/activities/types/ActivityTargetableEntity';
import { CoreObjectNameSingular } from 'twenty-shared/types';

jest.mock('@/activities/hooks/useActivities', () => ({
  useActivities: jest.fn(),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: jest.fn(() => ({
    objectMetadataItem: { id: 'note-object-metadata-id' },
  })),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(() => ({
    canReadObjectRecords: true,
  })),
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
  hasReadPermission: true,
};

describe('useNotes', () => {
  beforeEach(() => {
    mockUseActivities.mockReturnValue(defaultActivityResult);
    jest.mocked(useObjectPermissionsForObject).mockReturnValue({
      canReadObjectRecords: true,
    } as ReturnType<typeof useObjectPermissionsForObject>);
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
    expect(result.current.hasReadPermission).toBe(true);
  });

  it('propagates denied NoteTarget read separately from an empty result', () => {
    mockUseActivities.mockReturnValue({
      ...defaultActivityResult,
      activities: defaultActivityResult.activities,
      totalCountActivities: 1,
      hasReadPermission: false,
    });

    const { result } = renderHook(() => useNotes(targetableObject));

    expect(result.current.hasReadPermission).toBe(false);
    expect(result.current.notes).toEqual([]);
    expect(result.current.totalCountNotes).toBe(0);
  });

  it('masks cached notes and skips the target query when Note read is revoked but Creator and NoteTarget remain readable', () => {
    const { result, rerender } = renderHook(() => useNotes(targetableObject));

    expect(result.current.notes).toHaveLength(1);
    expect(useObjectMetadataItem).toHaveBeenCalledWith({
      objectNameSingular: CoreObjectNameSingular.Note,
    });
    expect(useObjectPermissionsForObject).toHaveBeenCalledWith(
      'note-object-metadata-id',
    );

    jest.mocked(useObjectPermissionsForObject).mockReturnValue({
      canReadObjectRecords: false,
    } as ReturnType<typeof useObjectPermissionsForObject>);
    rerender();

    expect(result.current.hasReadPermission).toBe(false);
    expect(result.current.notes).toEqual([]);
    expect(result.current.totalCountNotes).toBe(0);
    expect(mockUseActivities).toHaveBeenLastCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });

  it('reports a failed fetch-more despite cached notes and clears the failure after retry succeeds', async () => {
    const fetchMoreActivities = jest
      .fn()
      .mockRejectedValueOnce(new Error('Unable to fetch more notes'))
      .mockResolvedValueOnce([]);
    mockUseActivities.mockReturnValue({
      ...defaultActivityResult,
      fetchMoreActivities,
    });
    const { result, rerender } = renderHook(({ target }) => useNotes(target), {
      initialProps: { target: targetableObject },
    });

    await act(async () => {
      await result.current.fetchMoreNotes();
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.error).toBeDefined();

    rerender({ target: { ...targetableObject, id: 'another-creator' } });
    expect(result.current.error).toBeUndefined();
    rerender({ target: targetableObject });

    await act(async () => {
      await result.current.fetchMoreNotes();
    });
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
      skip: false,
      limit: 10,
    });
  });
});
