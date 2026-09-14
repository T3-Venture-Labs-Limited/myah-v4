import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

type LinariaTestState = {
  __creatorListWorkspaceInterpolations?: unknown[];
};

const mockStyledInterpolations = ((
  globalThis as typeof globalThis & LinariaTestState
).__creatorListWorkspaceInterpolations ??= []);

jest.mock('@linaria/react', () => {
  const state = globalThis as typeof globalThis & LinariaTestState;
  const interpolations = (state.__creatorListWorkspaceInterpolations ??= []);

  return {
    styled: new Proxy(
      {},
      {
        get:
          (_target, tag) =>
          (
            _strings: TemplateStringsArray,
            ...styleInterpolations: unknown[]
          ) => {
            interpolations.push(...styleInterpolations);

            return ({
              children,
              hasSelection: _hasSelection,
              ...props
            }: {
              children?: ReactNode;
              hasSelection?: boolean;
            }) => mockCreateElement(tag as string, props, children);
          },
      },
    ),
  };
});

import { CreatorListWorkspace } from '@/myah/creator-crm/components/CreatorListWorkspace';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';

const mockRecordIndexContainerGater = jest.fn();
const mockUseIsMobile = jest.fn();

jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

jest.mock(
  '@/object-record/record-index/components/RecordIndexContainerGater',
  () => ({
    RecordIndexContainerGater: ({
      indexIdentifierUrl,
      onOpenRecordFromIndexView,
    }: {
      indexIdentifierUrl?: (recordId: string) => string;
      onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
    }) => {
      mockRecordIndexContainerGater({
        indexIdentifierUrl,
        onOpenRecordFromIndexView,
      });

      return (
        <>
          <div data-testid="row-id-list-a">
            <a
              href={indexIdentifierUrl?.('list-a')}
              onClick={(event) => {
                event.preventDefault();
                onOpenRecordFromIndexView?.({
                  activationElement: event.currentTarget,
                  recordId: 'list-a',
                  source: 'record-chip',
                });
              }}
            >
              List A
            </a>
            <button
              aria-label="Open List A"
              onClick={(event) =>
                onOpenRecordFromIndexView?.({
                  activationElement: event.currentTarget,
                  recordId: 'list-a',
                  source: 'table-identifier-action',
                })
              }
              type="button"
            />
          </div>
          <div data-testid="row-id-list-b">
            <a
              href={indexIdentifierUrl?.('list-b')}
              onClick={(event) => {
                event.preventDefault();
                onOpenRecordFromIndexView?.({
                  activationElement: event.currentTarget,
                  recordId: 'list-b',
                  source: 'record-chip',
                });
              }}
            >
              List B
            </a>
            <button
              aria-label="Open List B"
              onClick={(event) =>
                onOpenRecordFromIndexView?.({
                  activationElement: event.currentTarget,
                  recordId: 'list-b',
                  source: 'table-identifier-action',
                })
              }
              type="button"
            />
          </div>
          <div
            aria-label="Open List A board card"
            data-record-board-card-id="list-a"
            data-testid="record-board-card-list-a"
            onClick={(event) =>
              onOpenRecordFromIndexView?.({
                activationElement: event.currentTarget,
                recordId: 'list-a',
                source: 'record-board-card',
              })
            }
            tabIndex={-1}
          />
        </>
      );
    },
  }),
);

jest.mock(
  '@/myah/creator-crm/components/CreatorListScopedCreatorIndex',
  () => ({
    CreatorListScopedCreatorIndex: ({
      creatorListId,
      onClose,
    }: {
      creatorListId: string;
      onClose: () => void;
    }) => {
      return (
        <section data-testid={`scoped-creator-index-${creatorListId}`}>
          <h2 tabIndex={-1}>{`List: ${creatorListId}`}</h2>
          {mockUseIsMobile() && (
            <button
              data-testid="creator-list-pane-back"
              onClick={onClose}
              type="button"
            >
              Back to Creator Lists
            </button>
          )}
        </section>
      );
    },
  }),
);

const CurrentLocation = () => {
  const location = useLocation();

  return <output data-testid="location">{location.pathname}</output>;
};

const WorkspaceHarness = ({
  initialEntry = '/objects/creator-lists',
}: {
  initialEntry?: string;
}) => (
  <MemoryRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    initialEntries={[initialEntry]}
  >
    <CreatorListWorkspace />
    <CurrentLocation />
  </MemoryRouter>
);

const renderWorkspace = (initialEntry = '/objects/creator-lists') =>
  render(<WorkspaceHarness initialEntry={initialEntry} />);

describe('CreatorListWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it('uses the same page-local selection for name, arrow, and keyboard activation without navigation', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const listA = screen.getByRole('link', { name: 'List A' });
    await user.click(listA);

    expect(screen.getByTestId('scoped-creator-index-list-a')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );

    listA.focus();
    await user.keyboard('{Enter}');

    expect(
      screen.queryByTestId('scoped-creator-index-list-a'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open List A' }));

    expect(screen.getByTestId('scoped-creator-index-list-a')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open List A' }));

    expect(
      screen.queryByTestId('scoped-creator-index-list-a'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );
  });

  it('opens the selected Creator List pane from the Creator Lists return route without a page-level status', () => {
    renderWorkspace('/objects/creator-lists?creatorListId=list-a');

    expect(screen.getByTestId('scoped-creator-index-list-a')).toBeVisible();
    expect(
      screen.queryByText(/Viewing Creators for Creator List/),
    ).not.toBeInTheDocument();
  });

  it('uses exact equal desktop panes and replaces stale selections', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const gridTemplateColumns = mockStyledInterpolations.find(
      (
        interpolation,
      ): interpolation is (props: { hasSelection: boolean }) => string =>
        typeof interpolation === 'function' &&
        interpolation({ hasSelection: true }) ===
          'minmax(0, 1fr) minmax(0, 1fr)',
    );

    expect(gridTemplateColumns?.({ hasSelection: false })).toBe(
      'minmax(0, 1fr)',
    );
    expect(gridTemplateColumns?.({ hasSelection: true })).toBe(
      'minmax(0, 1fr) minmax(0, 1fr)',
    );

    expect(screen.getByTestId('creator-list-workspace')).toBeVisible();

    await user.click(screen.getByRole('link', { name: 'List A' }));
    await user.click(screen.getByRole('button', { name: 'Open List B' }));

    expect(
      screen.queryByTestId('scoped-creator-index-list-a'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('scoped-creator-index-list-b')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );
  });

  it('restores desktop focus after the selected arrow closes its pane', () => {
    renderWorkspace();

    const arrow = screen.getByRole('button', { name: 'Open List A' });
    fireEvent.click(arrow);

    expect(arrow).not.toHaveFocus();

    fireEvent.click(arrow);

    expect(
      screen.queryByTestId('scoped-creator-index-list-a'),
    ).not.toBeInTheDocument();
    expect(arrow).toHaveFocus();
  });

  it('replaces Lists with the selected full-screen Creator pane on mobile and restores name-link focus on Back', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkspace();

    const listA = screen.getByRole('link', { name: 'List A' });
    await user.click(listA);

    expect(screen.queryByTestId('creator-list-index')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Back to Creator Lists' }),
      ).toHaveFocus(),
    );

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByTestId('creator-list-index')).toBeVisible();
    expect(screen.getByRole('link', { name: 'List A' })).toHaveFocus();
  });

  it('restores List-row focus when a focused mobile Back action disappears at the desktop breakpoint', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();
    const { rerender } = renderWorkspace();

    await user.click(screen.getByRole('link', { name: 'List A' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Back to Creator Lists' }),
      ).toHaveFocus(),
    );

    mockUseIsMobile.mockReturnValue(false);
    rerender(<WorkspaceHarness />);

    expect(screen.getByRole('link', { name: 'List A' })).toHaveFocus();
    expect(screen.getByTestId('scoped-creator-index-list-a')).toBeVisible();
  });

  it('focuses the scoped pane after a route-initialized mobile selection crosses to desktop', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const { rerender } = renderWorkspace(
      '/objects/creator-lists?creatorListId=list-a',
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Back to Creator Lists' }),
      ).toHaveFocus(),
    );

    mockUseIsMobile.mockReturnValue(false);
    rerender(
      <WorkspaceHarness initialEntry="/objects/creator-lists?creatorListId=list-a" />,
    );

    expect(
      screen.getByTestId('scoped-creator-index-list-a').parentElement,
    ).toHaveFocus();
  });

  it('restores identifier-arrow focus after activation without DOM focus movement', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkspace();

    const arrow = screen.getByRole('button', { name: 'Open List A' });
    fireEvent.click(arrow);
    expect(document.activeElement).not.toBe(arrow);

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByRole('button', { name: 'Open List A' })).toHaveFocus();
  });

  it('restores board-card focus after activation without DOM focus movement', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkspace();

    const boardCard = screen.getByTestId('record-board-card-list-a');
    fireEvent.click(boardCard);
    expect(document.activeElement).not.toBe(boardCard);

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByTestId('record-board-card-list-a')).toHaveFocus();
  });
});
