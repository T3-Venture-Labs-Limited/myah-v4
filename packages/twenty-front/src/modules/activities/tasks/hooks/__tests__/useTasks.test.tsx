import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import { useActivities } from '@/activities/hooks/useActivities';
import { useTasks } from '@/activities/tasks/hooks/useTasks';
import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';

const tasks = [
  {
    id: '1',
    status: 'DONE',
  },
  {
    id: '2',
    status: 'DONE',
  },
  {
    id: '3',
    status: 'DONE',
  },
  {
    id: '4',
  },
  {
    id: '5',
    dueAt: '2024-03-15T07:33:14.212Z',
  },
  {
    id: '6',
    dueAt: '2024-03-15T07:33:14.212Z',
  },
];

const fetchMoreActivities = jest.fn();
const error = new Error('Task targets could not be loaded');
const useActivitiesMock = jest.fn(() => ({
  activities: tasks,
  loading: false,
  fetchMoreActivities,
  hasNextPage: true,
  totalCountActivities: 201,
  error,
}));

jest.mock('@/activities/hooks/useActivities', () => ({
  useActivities: jest.fn(),
}));

(useActivities as jest.Mock).mockImplementation(useActivitiesMock);

const Wrapper = ({ children }: { children: ReactNode }) => (
  <ObjectFilterDropdownComponentInstanceContext.Provider
    value={{ instanceId: 'entity-tasks-filter-instance' }}
  >
    {children}
  </ObjectFilterDropdownComponentInstanceContext.Provider>
);

describe('useTasks', () => {
  it('orders targets by task creation and retains the selected record scope', () => {
    const targetableObjects = [
      { id: 'creator-1', targetObjectNameSingular: 'creator' },
    ];

    renderHook(() => useTasks({ targetableObjects }), { wrapper: Wrapper });

    expect(useActivitiesMock).toHaveBeenCalledWith({
      objectNameSingular: 'task',
      targetableObjects,
      activityTargetsOrderByVariables: [
        { task: { createdAt: 'DescNullsFirst' } },
      ],
      limit: 200,
    });
  });

  it('exposes the list, read error and existing pagination controls', () => {
    const { result } = renderHook(() => useTasks({ targetableObjects: [] }), {
      wrapper: Wrapper,
    });

    expect(result.current).toEqual({
      tasks,
      tasksLoading: false,
      fetchMoreTasks: fetchMoreActivities,
      hasNextPage: true,
      totalCountTasks: 201,
      error,
    });
  });
});
