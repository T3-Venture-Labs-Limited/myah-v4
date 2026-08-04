import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

type LinariaTestState = {
  __creatorListWorkspaceInterpolations?: unknown[];
  __creatorListWorkspaceRules?: string[];
};

const mockStyledInterpolations =
  ((globalThis as typeof globalThis & LinariaTestState)
    .__creatorListWorkspaceInterpolations ??= []);
const mockStyledRules =
  ((globalThis as typeof globalThis & LinariaTestState)
    .__creatorListWorkspaceRules ??= []);

jest.mock('@linaria/react', () => {
  const state = globalThis as typeof globalThis & LinariaTestState;
  const interpolations =
    (state.__creatorListWorkspaceInterpolations ??= []);
  const rules = (state.__creatorListWorkspaceRules ??= []);

  return {
    styled: new Proxy(
      {},
      {
        get: (_target, tag) =>
          (strings: TemplateStringsArray, ...styleInterpolations: unknown[]) => {
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
      onOpenRecordFromIndexView?: (recordId: string) => void;
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
                onOpenRecordFromIndexView?.('list-a');
              }}
            >
              List A
            </a>
            <button
              aria-label="Open List A"
              onClick={() => onOpenRecordFromIndexView?.('list-a')}
              type="button"
            />
          </div>
          <div data-testid="row-id-list-b">
            <a
              href={indexIdentifierUrl?.('list-b')}
              onClick={(event) => {
                event.preventDefault();
                onOpenRecordFromIndexView?.('list-b');
              }}
            >
              List B
            </a>
            <button
              aria-label="Open List B"
              onClick={() => onOpenRecordFromIndexView?.('list-b')}
              type="button"
            />
          </div>
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
          <button onClick={onClose} type="button">
            Back to Creator Lists
          </button>
        </section>
      );
    },
  }),
);

const mockUseFindOneRecord = jest.fn();

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (args: unknown) => mockUseFindOneRecord(args),
}));

const CurrentLocation = () => {
  const location = useLocation();

  return <output data-testid="location">{location.pathname}</output>;
};

const renderWorkspace = () =>
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={['/objects/creator-lists']}
    >
      <CreatorListWorkspace />
      <CurrentLocation />
    </MemoryRouter>,
  );

describe('CreatorListWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFindOneRecord.mockImplementation(
      ({ objectRecordId }: { objectRecordId: string }) => ({
        error: undefined,
        loading: false,
        record: {
          id: objectRecordId,
          name: objectRecordId === 'list-a' ? 'List A' : 'List B',
        },
      }),
    );
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

  it('uses exact equal desktop panes, replaces stale selections, and closes without navigation', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const gridTemplateColumns = mockStyledInterpolations.find(
      (interpolation): interpolation is ((props: {
        hasSelection: boolean;
      }) => string) =>
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

    expect(
      screen.getByText('Viewing Creators for Creator List List A.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open List B' }));

    expect(screen.queryByTestId('scoped-creator-index-list-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('scoped-creator-index-list-b')).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByTestId('creator-list-workspace')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/objects/creator-lists',
    );
  });

  it('replaces Lists with the selected full-screen Creator pane on mobile and restores name-link focus on Back', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkspace();

    const listA = screen.getByRole('link', { name: 'List A' });
    await user.click(listA);

    expect(screen.queryByTestId('creator-list-index')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'List: list-a' })).toHaveFocus(),
    );

    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByTestId('creator-list-index')).toBeVisible();
    expect(screen.getByRole('link', { name: 'List A' })).toHaveFocus();
  });

  it('restores identifier-arrow focus on mobile Back after the List index remounts', async () => {
    mockUseIsMobile.mockReturnValue(true);
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Open List A' }));
    await user.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(screen.getByRole('button', { name: 'Open List A' })).toHaveFocus();
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

  it('announces each selected List with its resolved label', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('link', { name: 'List A' }));
    expect(
      screen.getByText('Viewing Creators for Creator List List A.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open List B' }));
    expect(
      screen.getByText('Viewing Creators for Creator List List B.'),
    ).toBeVisible();
  });

  it('announces List loading and errors with the selected identity', async () => {
    mockUseFindOneRecord.mockImplementation(
      ({ objectRecordId }: { objectRecordId: string }) => ({
        error:
          objectRecordId === 'list-b'
            ? new Error('Unable to load List B')
            : undefined,
        loading: objectRecordId === 'list-a',
        record: undefined,
      }),
    );
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole('link', { name: 'List A' }));
    expect(screen.getByText('Loading Creator List list-a.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Open List B' }));
    expect(screen.getByText('Unable to load Creator List list-b.')).toBeVisible();
  });
});
