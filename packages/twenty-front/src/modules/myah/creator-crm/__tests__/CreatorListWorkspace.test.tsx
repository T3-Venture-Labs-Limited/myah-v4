import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

type LinariaTestState = {
  __creatorListWorkspaceInterpolations?: unknown[];
};

const mockStyledInterpolations =
  ((globalThis as typeof globalThis & LinariaTestState)
    .__creatorListWorkspaceInterpolations ??= []);

jest.mock('@linaria/react', () => {
  const state = globalThis as typeof globalThis & LinariaTestState;
  const interpolations =
    (state.__creatorListWorkspaceInterpolations ??= []);

  return {
    styled: new Proxy(
      {},
      {
        get: (_target, tag) =>
          (strings: TemplateStringsArray, ...styleInterpolations: unknown[]) => {
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
        <div data-testid="native-creator-list-index">
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
            onClick={() => onOpenRecordFromIndexView?.('list-b')}
            type="button"
          >
            Open List B
          </button>
        </div>
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
      screen.getByText('Viewing Creators for the selected Creator List.'),
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

  it('replaces Lists with the selected full-screen Creator pane on mobile and restores focus on Back', async () => {
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
});
