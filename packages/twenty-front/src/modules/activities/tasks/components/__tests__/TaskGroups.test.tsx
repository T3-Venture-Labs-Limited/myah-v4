import { render, screen } from '@testing-library/react';

import { TaskGroups } from '@/activities/tasks/components/TaskGroups';

const mockUseTasks = jest.fn();
const mockUseOpenCreateActivityDrawer = jest.fn();

jest.mock('@/activities/tasks/hooks/useTasks', () => ({
  useTasks: (...args: unknown[]) => mockUseTasks(...args),
}));

jest.mock('@/activities/hooks/useOpenCreateActivityDrawer', () => ({
  useOpenCreateActivityDrawer: () => mockUseOpenCreateActivityDrawer,
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'message-thread-object-metadata-id' },
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canUpdateObjectRecords: false,
  }),
}));

describe('TaskGroups', () => {
  beforeEach(() => {
    mockUseTasks.mockReturnValue({
      tasks: [],
      tasksLoading: false,
    });
  });

  it('renders without a tab-list instance', () => {
    render(
      <TaskGroups
        targetableObject={{
          id: 'message-thread-1',
          targetObjectNameSingular: 'messageThread',
        }}
      />,
    );

    expect(screen.getByText('Mission accomplished!')).toBeVisible();
  });
});
