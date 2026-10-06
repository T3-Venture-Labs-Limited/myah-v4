import { fireEvent, render, screen } from '@testing-library/react';
import { TimelineCard } from '@/activities/timeline-activities/components/TimelineCard';
import { useTimelineActivities } from '@/activities/timeline-activities/hooks/useTimelineActivities';
import { useCreatorTimelineMessages } from '@/activities/timeline-activities/hooks/useCreatorTimelineMessages';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';

jest.mock(
  '@/activities/timeline-activities/hooks/useTimelineActivities',
  () => ({ useTimelineActivities: jest.fn() }),
);
jest.mock(
  '@/activities/timeline-activities/hooks/useCreatorTimelineMessages',
  () => ({ useCreatorTimelineMessages: jest.fn() }),
);
jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: jest.fn(),
}));
jest.mock('@/ui/layout/contexts/useTargetRecord', () => ({
  useTargetRecord: () => ({
    id: 'creator',
    targetObjectNameSingular: 'creator',
  }),
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({ isInSidePanel: false }),
}));
jest.mock('@/activities/timeline-activities/components/EventList', () => ({
  EventList: ({ events }: { events: { id: string }[] }) => (
    <div data-testid="events">{events.map(({ id }) => id).join(',')}</div>
  ),
}));
jest.mock('@/activities/components/CustomResolverFetchMoreLoader', () => ({
  CustomResolverFetchMoreLoader: ({
    onLastRowVisible,
  }: {
    onLastRowVisible: () => void;
  }) => <button onClick={onLastRowVisible}>Load more</button>,
}));

const event = (id: string, minute: number) => ({
  id,
  happensAt: `2026-10-05T12:0${minute}:00Z`,
});
const stream = () => ({
  activities: [] as ReturnType<typeof event>[],
  hasNextPage: false,
  loading: false,
  loadingMore: false,
  error: undefined as Error | undefined,
  fetchMore: jest.fn().mockResolvedValue(undefined),
  retry: jest.fn(),
});
let email: ReturnType<typeof stream>;
let instagram: ReturnType<typeof stream>;
beforeEach(() => {
  email = { ...stream(), activities: [event('email', 3)] };
  instagram = { ...stream(), activities: [event('instagram', 4)] };
  jest.mocked(useTimelineActivities).mockReturnValue({
    timelineActivities: [event('campaign', 1)],
    hasNextPage: false,
    firstQueryLoading: false,
    loadingMore: false,
    fetchMoreRecords: jest.fn(),
  } as never);
  jest
    .mocked(useCreatorTimelineMessages)
    .mockImplementation(
      (id, channel) =>
        (id ? (channel === 'EMAIL' ? email : instagram) : stream()) as never,
    );
  jest.mocked(useFindOneRecord).mockReturnValue({
    record: { id: 'creator' },
    hasReadPermission: true,
    loading: false,
    refetch: jest.fn().mockResolvedValue(undefined),
  } as never);
});

it('interleaves both channels and campaign activity newest first', () => {
  render(<TimelineCard />);
  expect(screen.getByTestId('events')).toHaveTextContent(
    'instagram,email,campaign',
  );
});

it('waits for a fresh readable Creator before reading its messages', () => {
  jest
    .mocked(useFindOneRecord)
    .mockReturnValue({ record: undefined, loading: false } as never);
  render(<TimelineCard />);
  expect(useCreatorTimelineMessages).toHaveBeenCalledWith(undefined, 'EMAIL');
  expect(screen.getByTestId('events')).toHaveTextContent('campaign');
});

it('does not reuse a cached Creator after its permission is revoked', () => {
  jest.mocked(useFindOneRecord).mockReturnValue({
    record: { id: 'creator' },
    hasReadPermission: false,
    loading: false,
  } as never);
  render(<TimelineCard />);
  expect(useCreatorTimelineMessages).toHaveBeenCalledWith(undefined, 'EMAIL');
  expect(screen.getByTestId('events')).toHaveTextContent('campaign');
});

it('does not show old events ahead of a source with unread newer history', () => {
  instagram.hasNextPage = true;
  render(<TimelineCard />);
  expect(screen.getByTestId('events')).toHaveTextContent(/^instagram$/);
  fireEvent.click(screen.getByText('Load more'));
  expect(instagram.fetchMore).toHaveBeenCalledTimes(1);
  expect(email.fetchMore).not.toHaveBeenCalled();
});

it('can advance past a page with no visible messages', () => {
  instagram.activities = [];
  instagram.hasNextPage = true;
  render(<TimelineCard />);
  expect(screen.getByTestId('events')).toBeEmptyDOMElement();
  fireEvent.click(screen.getByText('Load more'));
  expect(instagram.fetchMore).toHaveBeenCalledTimes(1);
});

it('offers retry instead of claiming unavailable history is empty', () => {
  email.activities = [];
  email.error = new Error('network failed');
  render(<TimelineCard />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Could not load all message activity',
  );
  fireEvent.click(screen.getByText('Try again'));
  expect(email.retry).toHaveBeenCalledTimes(1);
});
