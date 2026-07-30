import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useIsInSidePanelOrThrow } from '@/ui/layout/side-panel/contexts/SidePanelContext';

function MockTasksCardWithSidePanelContext() {
  const { isInSidePanel } = useIsInSidePanelOrThrow();

  return (
    <div>{`Creator tasks in ${isInSidePanel ? 'side panel' : 'page'}`}</div>
  );
}

jest.mock(
  '@/side-panel/pages/record-page/components/SidePanelRecordPage',
  () => ({
    SidePanelRecordPageContent: ({
      objectNameSingular,
      objectRecordId,
      renderMode,
    }: {
      objectNameSingular: string;
      objectRecordId: string;
      renderMode: string;
    }) => (
      <div>{`native ${objectNameSingular} ${objectRecordId} ${renderMode}`}</div>
    ),
  }),
);

jest.mock('@/activities/timeline-activities/components/TimelineCard', () => ({
  TimelineCard: () => <div>Creator timeline</div>,
}));

jest.mock('@/activities/tasks/components/TasksCard', () => ({
  TasksCard: MockTasksCardWithSidePanelContext,
}));

jest.mock('@/activities/notes/components/NotesCard', () => ({
  NotesCard: () => <div>Creator notes</div>,
}));

jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  LayoutRenderingProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('@linaria/react', () => {
  const styled = new Proxy(
    {},
    {
      get: () => (strings: TemplateStringsArray) => {
        const height = strings.join('').match(/height:\s*([^;]+)/)?.[1];

        return ({
          children,
          isActive: _isActive,
          ...props
        }: {
          children?: ReactNode;
          isActive?: boolean;
        }) =>
          createElement(
            'div',
            { ...props, style: height ? { height } : undefined },
            children,
          );
      },
    },
  );

  return { styled, __esModule: true };
});

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: 'transparent' },
    border: { color: { light: 'gray' } },
    font: {
      color: { primary: 'black', tertiary: 'gray' },
      size: { sm: '13px' },
      weight: { semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

const linkedThread: MyahInboxThread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-29T12:00:00.000Z',
  subject: 'Spring launch partnership',
  lastMessagePreview: 'I would love to hear more.',
  lastMessageSender: 'Ada Creator',
  state: 'NEEDS_REPLY',
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Ada Creator' },
  campaign: { id: 'campaign-1', name: 'Spring launch' },
  inboxOwner: null,
};

describe('MyahInboxContextPanel', () => {
  it('renders linked Creator and Campaign native overviews without record actions', () => {
    render(<MyahInboxContextPanel thread={linkedThread} />);

    expect(
      screen.getByText('native creator creator-1 default-tab-only'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open Creator' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Campaign' }));

    expect(
      screen.getByText('native campaign campaign-1 default-tab-only'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open Campaign' }),
    ).not.toBeInTheDocument();
  });

  it('gives the Inbox context root the full native drawer height', () => {
    render(<MyahInboxContextPanel thread={linkedThread} />);

    const root = screen.getByRole('tablist').parentElement;

    expect(root).not.toBeNull();
    expect(root).toHaveStyle({ height: '100%' });
  });

  it('keeps activity in the linked Creator context', () => {
    render(<MyahInboxContextPanel thread={linkedThread} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText('Creator timeline')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));
    expect(screen.getByText('Creator tasks in side panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByText('Creator notes')).toBeInTheDocument();
  });

  it('keeps unlinked Creator, Campaign, and activity states explicit', () => {
    render(
      <MyahInboxContextPanel
        thread={{ ...linkedThread, creator: null, campaign: null }}
      />,
    );

    expect(
      screen.getByText(/No Creator linked\. Use the Creator action/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Campaign' }));
    expect(
      screen.getByText(/No Campaign linked\. Use the Campaign action/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(
      screen.getByText(/Link a Creator to view Creator activity/),
    ).toBeInTheDocument();
  });
});
