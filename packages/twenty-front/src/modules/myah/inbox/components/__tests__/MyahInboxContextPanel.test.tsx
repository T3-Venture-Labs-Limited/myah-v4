import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { MyahInboxContextPanel } from '@/myah/inbox/components/MyahInboxContextPanel';
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

const linkedCreator = { id: 'creator-1', name: 'Ada Creator' };

describe('MyahInboxContextPanel', () => {
  it('renders the exact shared Creator context tabs without thread authority', () => {
    render(<MyahInboxContextPanel creator={linkedCreator} />);

    expect(
      screen.getByText('native creator creator-1 default-tab-only'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open Creator' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Creator',
      'Timeline',
      'Tasks',
      'Notes',
    ]);
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Creator context');
    expect(
      screen.queryByRole('tab', { name: 'Campaign' }),
    ).not.toBeInTheDocument();
  });

  it('gives the Creator context root the full native drawer height', () => {
    render(<MyahInboxContextPanel creator={linkedCreator} />);

    const root = screen.getByRole('tablist').parentElement;

    expect(root).not.toBeNull();
    expect(root).toHaveStyle({ height: '100%' });
  });

  it('keeps activity in the linked Creator context', () => {
    render(<MyahInboxContextPanel creator={linkedCreator} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(screen.getByText('Creator timeline')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));
    expect(screen.getByText('Creator tasks in side panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByText('Creator notes')).toBeInTheDocument();
  });

  it('keeps unlinked Creator and activity states explicit', () => {
    render(<MyahInboxContextPanel creator={null} />);

    expect(
      screen.getByText(/No Creator linked\. Use the Creator action/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(
      screen.getByText(/Link a Creator to view Creator activity/),
    ).toBeInTheDocument();
  });
});

it('keeps the current tab while same-contact Creator data changes', () => {
  const view = render(<MyahInboxContextPanel creator={linkedCreator} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
  view.rerender(
    <MyahInboxContextPanel
      creator={{ ...linkedCreator, name: 'Updated Creator' }}
    />,
  );

  expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByText('Creator timeline')).toBeVisible();
});
