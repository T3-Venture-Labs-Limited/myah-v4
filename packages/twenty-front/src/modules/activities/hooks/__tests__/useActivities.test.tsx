import { renderHook } from '@testing-library/react';
import { useActivities } from '@/activities/hooks/useActivities';
import { type Task } from '@/activities/types/Task';
import { CoreObjectNameSingular } from 'twenty-shared/types';

jest.mock('@/activities/hooks/useActivityTargetsForTargetableObjects', () => ({
  useActivityTargetsForTargetableObjects: jest.fn(),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));

const mockActivityTarget = {
  __typename: 'TaskTarget',
  updatedAt: '2021-08-03T19:20:06.000Z',
  createdAt: '2021-08-03T19:20:06.000Z',
  personId: '1',
  companyId: '1',
  id: '123',
};

const mockActivity = {
  __typename: 'Task',
  updatedAt: '2021-08-03T19:20:06.000Z',
  createdAt: '2021-08-03T19:20:06.000Z',
  status: 'DONE',
  title: 'title',
  dueAt: '2021-08-03T19:20:06.000Z',
  assigneeId: '1',
  id: '234',
  bodyV2: {
    blocknote: 'My Body',
    markdown: 'My Body',
  },
  assignee: null,
  taskTargets: [],
} satisfies Task;

describe('useActivities', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches activities', async () => {
    const useActivityTargetsForTargetableObjectsMock = jest.requireMock(
      '@/activities/hooks/useActivityTargetsForTargetableObjects',
    );
    useActivityTargetsForTargetableObjectsMock.useActivityTargetsForTargetableObjects.mockReturnValue(
      {
        activityTargets: [{ ...mockActivityTarget, task: mockActivity }],
        loadingActivityTargets: false,
      },
    );

    const { result } = renderHook(() => {
      const activities = useActivities({
        objectNameSingular: CoreObjectNameSingular.Task,
        targetableObjects: [{ targetObjectNameSingular: 'company', id: '123' }],
        skip: false,
        limit: 10,
        activityTargetsOrderByVariables: [{}],
      });
      return activities;
    });

    expect(result.current.activities).toEqual([mockActivity]);
  });

  it('does not silently swallow a failed fetch-more', async () => {
    const { useActivityTargetsForTargetableObjects } = jest.requireMock(
      '@/activities/hooks/useActivityTargetsForTargetableObjects',
    );
    const failure = new Error('Notes page unavailable');
    useActivityTargetsForTargetableObjects.mockReturnValue({
      activityTargets: [],
      fetchMoreActivityTargets: jest.fn().mockResolvedValue({ error: failure }),
    });

    const { result } = renderHook(() =>
      useActivities({
        objectNameSingular: CoreObjectNameSingular.Note,
        targetableObjects: [{ targetObjectNameSingular: 'creator', id: '123' }],
        limit: 10,
        activityTargetsOrderByVariables: [{}],
      }),
    );

    await expect(result.current.fetchMoreActivities()).rejects.toBe(failure);
  });

  it('propagates denied target read instead of reporting successful empty', () => {
    const { useActivityTargetsForTargetableObjects } = jest.requireMock(
      '@/activities/hooks/useActivityTargetsForTargetableObjects',
    );
    useActivityTargetsForTargetableObjects.mockReturnValue({
      activityTargets: [],
      loadingActivityTargets: false,
      totalCountActivityTargets: 0,
      hasReadPermission: false,
    });

    const { result } = renderHook(() =>
      useActivities({
        objectNameSingular: CoreObjectNameSingular.Note,
        targetableObjects: [{ targetObjectNameSingular: 'creator', id: '123' }],
        limit: 10,
        activityTargetsOrderByVariables: [{}],
      }),
    );

    expect(result.current.hasReadPermission).toBe(false);
    expect(result.current.activities).toEqual([]);
  });
});
