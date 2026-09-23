import { useActivities } from '@/activities/hooks/useActivities';
import { type ActivityTargetableObject } from '@/activities/types/ActivityTargetableEntity';
import { type Task } from '@/activities/types/Task';
import { CoreObjectNameSingular } from 'twenty-shared/types';

type UseTasksProps = {
  targetableObjects: ActivityTargetableObject[];
};

export const useTasks = ({ targetableObjects }: UseTasksProps) => {
  const {
    activities: tasks,
    loading: tasksLoading,
    fetchMoreActivities: fetchMoreTasks,
    hasNextPage,
    totalCountActivities,
    error,
  } = useActivities<Task>({
    objectNameSingular: CoreObjectNameSingular.Task,
    targetableObjects,
    activityTargetsOrderByVariables: [
      { task: { createdAt: 'DescNullsFirst' } },
    ],
    limit: 200,
  });

  return {
    tasks: (tasks ?? []) as Task[],
    tasksLoading,
    fetchMoreTasks,
    hasNextPage,
    totalCountTasks: totalCountActivities,
    error,
  };
};
