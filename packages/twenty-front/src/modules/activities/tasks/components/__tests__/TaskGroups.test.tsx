import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { TaskGroups } from '@/activities/tasks/components/TaskGroups';

const mockUseTasks = jest.fn();
const mockUseOpenCreateActivityDrawer = jest.fn();

jest.mock('@/activities/tasks/hooks/useTasks', () => ({
  useTasks: (...args: unknown[]) => mockUseTasks(...args),
}));

jest.mock('@/activities/hooks/useOpenCreateActivityDrawer', () => ({
  useOpenCreateActivityDrawer: () => mockUseOpenCreateActivityDrawer,
}));

jest.mock('@/activities/components/SkeletonLoader', () => ({
  SkeletonLoader: () => <div>Loading tasks</div>,
}));

jest.mock('@/activities/components/CustomResolverFetchMoreLoader', () => ({
  CustomResolverFetchMoreLoader: ({
    onLastRowVisible,
  }: {
    onLastRowVisible: () => void;
  }) => <button onClick={onLastRowVisible}>Load next page</button>,
}));

jest.mock('@/activities/tasks/components/TaskList', () => ({
  TaskList: ({
    title,
    tasks,
  }: {
    title: string;
    tasks: { title: string }[];
  }) => (
    <div>
      {title}: {tasks.map((task) => task.title).join(', ')}
    </div>
  ),
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

const creator = { id: 'creator-1', targetObjectNameSingular: 'creator' };
const person = { id: 'person-1', targetObjectNameSingular: 'person' };
const linkedTasks = [
  { id: 'new', title: 'Newer task', status: 'TODO' },
  { id: 'old', title: 'Older task', status: 'TODO' },
];

describe('TaskGroups', () => {
  beforeEach(() => {
    mockUseTasks.mockReturnValue({
      tasks: [],
      tasksLoading: false,
      error: undefined,
      hasNextPage: false,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('shows loading before an initial Creator read completes', () => {
    mockUseTasks.mockReturnValue({ tasks: [], tasksLoading: true });
    render(<TaskGroups targetableObject={creator} />);
    expect(screen.getByText('Loading tasks')).toBeVisible();
    expect(screen.queryByText('Mission accomplished!')).not.toBeInTheDocument();
  });

  it('shows linked tasks in order within their status group on an ordinary record', () => {
    mockUseTasks.mockReturnValue({ tasks: linkedTasks, tasksLoading: false });
    render(<TaskGroups targetableObject={person} />);
    expect(mockUseTasks).toHaveBeenCalledWith({ targetableObjects: [person] });
    expect(screen.getByText('TODO: Newer task, Older task')).toBeVisible();
  });

  it('shows the successful empty state only for a genuine empty read', () => {
    render(<TaskGroups targetableObject={creator} />);
    expect(screen.getByText('Mission accomplished!')).toBeVisible();
  });

  it('shows an error instead of empty success when the initial read fails', () => {
    mockUseTasks.mockReturnValue({
      tasks: [],
      tasksLoading: false,
      error: new Error('read failed'),
    });
    render(<TaskGroups targetableObject={creator} />);
    expect(screen.getByText("Tasks couldn't be loaded")).toBeVisible();
    expect(screen.queryByText('Mission accomplished!')).not.toBeInTheDocument();
  });

  it('keeps already visible tasks when a later read fails', () => {
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      error: new Error('refresh failed'),
    });
    render(<TaskGroups targetableObject={creator} />);
    expect(screen.getByText('TODO: Newer task, Older task')).toBeVisible();
    expect(screen.queryByText('Mission accomplished!')).not.toBeInTheDocument();
  });

  it('observes a successor page only when one exists, without hiding current tasks', async () => {
    const fetchMoreTasks = jest.fn().mockResolvedValue([linkedTasks[1]]);
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      hasNextPage: true,
      fetchMoreTasks,
    });
    const { rerender } = render(<TaskGroups targetableObject={creator} />);
    fireEvent.click(screen.getByText('Load next page'));
    await waitFor(() => expect(fetchMoreTasks).toHaveBeenCalledTimes(1));
    expect(screen.getByText('TODO: Newer task, Older task')).toBeVisible();
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      hasNextPage: false,
      fetchMoreTasks,
    });
    rerender(<TaskGroups targetableObject={creator} />);
    expect(screen.queryByText('Load next page')).not.toBeInTheDocument();
  });

  it('pauses auto-loading after failure and offers explicit retry for the current record', async () => {
    const fetchMoreTasks = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([linkedTasks[1]]);
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      hasNextPage: true,
      fetchMoreTasks,
    });
    const { rerender } = render(<TaskGroups targetableObject={creator} />);
    fireEvent.click(screen.getByText('Load next page'));
    await screen.findByText('Retry loading tasks');
    expect(screen.queryByText('Load next page')).not.toBeInTheDocument();
    expect(screen.getByText('TODO: Newer task, Older task')).toBeVisible();
    fireEvent.click(screen.getByText('Retry loading tasks'));
    await waitFor(() => expect(fetchMoreTasks).toHaveBeenCalledTimes(2));
    rerender(<TaskGroups targetableObject={person} />);
    expect(screen.queryByText('Retry loading tasks')).not.toBeInTheDocument();
    expect(screen.getByText('Load next page')).toBeVisible();
  });

  it('keeps the next page reachable after a valid empty page with a successor', async () => {
    const fetchMoreTasks = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([linkedTasks[1]]);
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      hasNextPage: true,
      fetchMoreTasks,
    });
    render(<TaskGroups targetableObject={creator} />);
    fireEvent.click(screen.getByText('Load next page'));
    await screen.findByText('Load more tasks');
    expect(screen.queryByText('Load next page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Load more tasks'));
    await waitFor(() => expect(fetchMoreTasks).toHaveBeenCalledTimes(2));
    expect(screen.getByText('TODO: Newer task, Older task')).toBeVisible();
  });

  it('keeps continuation reachable when the first page has no readable tasks', async () => {
    const fetchMoreTasks = jest.fn().mockResolvedValue([]);
    mockUseTasks.mockReturnValue({
      tasks: [],
      tasksLoading: false,
      hasNextPage: true,
      fetchMoreTasks,
    });
    render(<TaskGroups targetableObject={creator} />);
    expect(screen.queryByText('Mission accomplished!')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Load next page'));
    await screen.findByText('Load more tasks');
    expect(fetchMoreTasks).toHaveBeenCalledTimes(1);
  });

  it('preserves the current record retry when an older record fetch finishes', async () => {
    let resolveCreator!: (tasks: unknown[] | undefined) => void;
    let resolvePerson!: (tasks: unknown[] | undefined) => void;
    const fetchMoreTasks = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCreator = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePerson = resolve;
          }),
      );
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      hasNextPage: true,
      fetchMoreTasks,
    });
    const { rerender } = render(<TaskGroups targetableObject={creator} />);
    fireEvent.click(screen.getByText('Load next page'));
    rerender(<TaskGroups targetableObject={person} />);
    fireEvent.click(screen.getByText('Load next page'));
    await act(async () => resolvePerson(undefined));
    expect(screen.getByText('Retry loading tasks')).toBeVisible();
    await act(async () => resolveCreator([linkedTasks[1]]));
    expect(screen.getByText('Retry loading tasks')).toBeVisible();
  });

  it('does not start concurrent continuation reads', async () => {
    let resolveFetch!: (tasks: unknown[]) => void;
    const fetchMoreTasks = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    mockUseTasks.mockReturnValue({
      tasks: linkedTasks,
      tasksLoading: false,
      hasNextPage: true,
      fetchMoreTasks,
    });
    render(<TaskGroups targetableObject={creator} />);
    fireEvent.click(screen.getByText('Load next page'));
    fireEvent.click(screen.getByText('Load next page'));
    expect(fetchMoreTasks).toHaveBeenCalledTimes(1);
    resolveFetch([linkedTasks[1]]);
    await waitFor(() =>
      expect(screen.getByText('Load next page')).toBeVisible(),
    );
  });
});
