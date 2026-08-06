import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

type LinariaTestState = {
  __creatorListWorkspaceInterpolations?: unknown[];
  __creatorListWorkspaceRules?: string[];
};

const mockStyledInterpolations = ((
  globalThis as typeof globalThis & LinariaTestState
).__creatorListWorkspaceInterpolations ??= []);
const mockStyledRules = ((
  globalThis as typeof globalThis & LinariaTestState
).__creatorListWorkspaceRules ??= []);

jest.mock('@linaria/react', () => {
  const state = globalThis as typeof globalThis & LinariaTestState;
  const interpolations = (state.__creatorListWorkspaceInterpolations ??= []);
  const rules = (state.__creatorListWorkspaceRules ??= []);

  return {
    styled: new Proxy(
      {},
      {
        get:
          (_target, tag) =>
          (
            strings: TemplateStringsArray,
            ...styleInterpolations: unknown[]
          ) => {
            interpolations.push(...styleInterpolations);
            rules.push(strings.join(''));

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
const mockScopedCreatorIndex = jest.fn();
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
      mockScopedCreatorIndex({ creatorListId, onClose });

      return (
        <section data-testid={`scoped-creator-index-${creatorListId}`}>
          <h2 tabIndex={-1}>{`List: ${creatorListId}`}</h2>
          <button
            data-testid="creator-list-pane-back"
            onClick={onClose}
            type="button"
          >
            Back to Creator Lists
          </button>
        </section>
      );
    },
  }),
);

const CurrentLocation = () => {
  const location = useLocation();

  return <output data-testid="location">{location.pathname}</output>;
};

const renderWorkspace = (initialEntry = '/objects/creator-lists') =>
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={[initialEntry]}
    >
      <CreatorListWorkspace />
      <CurrentLocation />
    </MemoryRouter>,
  );

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

    expect(mockScopedCreatorIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ creatorListId: 'list-a' }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );

    await user.click(screen.getByRole('button', { name: 'Open List B' }));

    expect(mockScopedCreatorIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ creatorListId: 'list-b' }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );

    await user.click(listA);
    listA.focus();
    await user.keyboard('{Enter}');

    expect(mockScopedCreatorIndex).toHaveBeenLastCalledWith(
      expect.objectContaining({ creatorListId: 'list-a' }),
    );
  });

  it('opens the selected Creator List pane from the Creator Lists return route without a page-level status', () => {
    renderWorkspace('/objects/creator-lists?creatorListId=list-a');

    expect(screen.getByTestId('scoped-creator-index-list-a')).toBeVisible();
    expect(
      screen.queryByText(/Viewing Creators for Creator List/),
    ).not.toBeInTheDocument();
  });

  it('uses exact equal desktop panes, replaces stale selections, and closes without navigation', async () => {
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

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByTestId('creator-list-workspace')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );
  });

  it('restores desktop focus only after Close', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const arrow = screen.getByRole('button', { name: 'Open List A' });
    fireEvent.click(arrow);

    expect(arrow).not.toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

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

  it('uses a column-flex pane to stack the scoped header above the native table', () => {
    renderWorkspace();

    expect(mockStyledRules).toEqual(
      expect.arrayContaining([
        expect.stringContaining('flex-direction: column;'),
      ]),
    );
  });

  it('wraps the active mobile pane in the full-height workspace layout', () => {
    mockUseIsMobile.mockReturnValue(true);
    renderWorkspace();

    expect(screen.getByTestId('creator-list-mobile-pane')).toHaveClass(
      'creator-list-mobile-pane',
    );
    expect(mockStyledRules).toContain(
      '\n  display: flex;\n  flex: 1;\n  min-height: 0;\n  min-width: 0;\n',
    );
  });
});
