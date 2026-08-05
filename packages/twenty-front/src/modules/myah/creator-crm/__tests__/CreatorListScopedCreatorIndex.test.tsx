import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';

import { CreatorListScopedCreatorIndex } from '@/myah/creator-crm/components/CreatorListScopedCreatorIndex';
import { useCreatorListBulkActionsContext } from '@/myah/creator-crm/contexts/CreatorListBulkActionsContext';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { PageFocusId } from '@/types/PageFocusId';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useViewOrDefaultView } from '@/views/hooks/useViewOrDefaultView';
import { FieldMetadataType, ViewType } from 'twenty-shared/types';

const mockResetFocusStackToRecordIndex = jest.fn();
const mockApplyCreatorBulkRelationship = jest.fn();
const mockNavigate = jest.fn();
const mockUseAtomStateValue = useAtomStateValue as jest.Mock;

const ScopedBulkActionsContextValue = () => {
  const creatorListContext = useCreatorListBulkActionsContext();

  return (
    <output data-testid="scoped-bulk-actions-context">
      {creatorListContext?.target.id}
    </output>
  );
};

const mockRecordIndexSurface = jest.fn(
  ({
    contextStoreInstanceId,
    headerActionButton,
    indexIdentifierUrl,
    initialQueryOnlyRecordFilters,
    onViewChange,
    viewId,
  }: {
    contextStoreInstanceId: string;
    headerActionButton?: ReactNode;
    headerTitle?: string;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onRecordCreated?: (record: { id: string }) => Promise<void>;
    onViewChange?: (viewId: string) => void;
    onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
    viewId: string;
  }) => (
    <div
      data-context-store-id={contextStoreInstanceId}
      data-testid="record-index-surface"
    >
      {headerActionButton}
      {`Rows for ${initialQueryOnlyRecordFilters[0]?.value} in ${viewId}`}
      <output data-testid="creator-show-url">
        {indexIdentifierUrl('creator-1')}
      </output>
      <button onClick={() => onViewChange?.('creator-secondary-view')}>
        Switch Creator view
      </button>
      <ScopedBulkActionsContextValue />
    </div>
  ),
);

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        id: 'creator-object',
        nameSingular: 'creator',
        fields: [
          {
            id: 'creator-list-memberships',
            name: 'listMemberships',
            relation: {
              targetObjectMetadata: { id: 'creator-list-member-object' },
            },
          },
        ],
      },
      { id: 'creator-list-object', nameSingular: 'creatorList', fields: [] },
      {
        id: 'creator-list-member-object',
        nameSingular: 'creatorListMember',
        fields: [
          {
            id: 'creator-list-member-creator-list',
            name: 'creatorList',
            type: FieldMetadataType.RELATION,
          },
        ],
      },
    ],
  }),
}));

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: jest.fn(),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: jest.fn(),
}));

jest.mock('@/object-record/record-index/components/RecordIndexSurface', () => ({
  RecordIndexSurface: (props: {
    contextStoreInstanceId: string;
    headerActionButton?: ReactNode;
    headerTitle?: string;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onRecordCreated?: (record: { id: string }) => Promise<void>;
    onViewChange?: (viewId: string) => void;
    onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
    viewId: string;
  }) => mockRecordIndexSurface(props),
}));
jest.mock('@/myah/creator-crm/hooks/useApplyCreatorBulkRelationship', () => ({
  useApplyCreatorBulkRelationship: () => ({
    applyCreatorBulkRelationship: mockApplyCreatorBulkRelationship,
  }),
}));
jest.mock(
  '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex',
  () => ({
    useResetFocusStackToRecordIndex: () => ({
      resetFocusStackToRecordIndex: mockResetFocusStackToRecordIndex,
    }),
  }),
);
jest.mock('@/ui/utilities/responsive/hooks/useIsMobile', () => ({
  useIsMobile: jest.fn(),
}));

jest.mock('@/views/hooks/useViewOrDefaultView', () => ({
  useViewOrDefaultView: jest.fn(),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: jest.fn(),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const listResponses = new Map<
  string,
  {
    error?: Error;
    loading: boolean;
    record?: { id: string; name: string };
    refetch?: jest.Mock;
  }
>();

const resolveCreatorList = (id: string, name: string) => {
  listResponses.set(id, { loading: false, record: { id, name } });
};

describe('CreatorListScopedCreatorIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    listResponses.clear();

    (useFindOneRecord as jest.Mock).mockImplementation(
      ({ objectRecordId }: { objectRecordId: string }) =>
        listResponses.get(objectRecordId) ?? { loading: true },
    );
    (useViewOrDefaultView as jest.Mock).mockReturnValue({
      view: { id: 'creator-default-view' },
    });
    mockUseAtomStateValue.mockReturnValue([
      {
        id: 'creator-table-view',
        objectMetadataId: 'creator-object',
        type: ViewType.TABLE,
      },
    ]);

    (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
      canReadObjectRecords: true,
    });
    (useIsMobile as jest.Mock).mockReturnValue(true);
  });

  it('withholds the native Creator surface until List scope and default view resolve', () => {
    listResponses.set('list-a', { loading: true });
    const { rerender } = render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Loading Creator List…')).toBeVisible();
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();

    resolveCreatorList('list-a', 'List A');
    (useViewOrDefaultView as jest.Mock).mockReturnValue({ view: undefined });
    mockUseAtomStateValue.mockReturnValue([]);

    rerender(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText('Loading Creator view…')).toBeVisible();
    expect(
      screen.queryByTestId('record-index-surface'),
    ).not.toBeInTheDocument();

    (useViewOrDefaultView as jest.Mock).mockReturnValue({
      view: { id: 'creator-default-view' },
    });
    rerender(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'List: List A' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('record-index-surface')).toHaveAttribute(
      'data-context-store-id',
      'creator-list-pane-list-a',
    );
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      headerTitle: 'List A',
      initialQueryOnlyRecordFilters: [
        {
          fieldMetadataId: 'creator-list-memberships',
          relationTargetFieldMetadataId: 'creator-list-member-creator-list',
          value: 'list-a',
        },
      ],
      objectNameSingular: 'creator',
      viewId: 'creator-default-view',
    });
    expect(
      mockRecordIndexSurface.mock.calls.at(-1)?.[0].headerActionButton,
    ).toBeDefined();
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'creatorListContext',
    );
    expect(screen.getByTestId('scoped-bulk-actions-context')).toHaveTextContent(
      'list-a',
    );
  });

  it('uses the first Creator table view when no index view exists', () => {
    resolveCreatorList('list-a', 'List A');
    (useViewOrDefaultView as jest.Mock).mockReturnValue({ view: undefined });

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      contextStoreInstanceId: 'creator-list-pane-list-a',
      viewId: 'creator-table-view',
    });
  });
  it('changes only the scoped Creator view when its native picker selects a view', () => {
    resolveCreatorList('list-a', 'List A');

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch Creator view' }),
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      contextStoreInstanceId: 'creator-list-pane-list-a',
      viewId: 'creator-secondary-view',
    });
    expect(screen.getByTestId('creator-show-url')).toHaveTextContent(
      'viewId=creator-secondary-view',
    );
    expect(screen.getByTestId('creator-show-url')).toHaveTextContent(
      'creatorListId=list-a',
    );
  });

  it('keeps mobile Creator record opens within the selected List route', () => {
    resolveCreatorList('list-a', 'List A');

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    mockRecordIndexSurface.mock.calls.at(-1)?.[0].onOpenRecordFromIndexView?.({
      recordId: 'creator-1',
      source: 'table-identifier-action',
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      '/object/creator/creator-1?creatorListId=list-a&viewId=creator-default-view',
    );
  });

  it('adds a newly created Creator to the selected List once', async () => {
    resolveCreatorList('list-a', 'List A');
    mockApplyCreatorBulkRelationship.mockResolvedValue(undefined);

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    const onRecordCreated =
      mockRecordIndexSurface.mock.calls.at(-1)?.[0].onRecordCreated;

    await act(async () => {
      await onRecordCreated?.({ id: 'creator-1' });
      await onRecordCreated?.({ id: 'creator-1' });
    });

    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledTimes(1);
    expect(mockApplyCreatorBulkRelationship).toHaveBeenCalledWith({
      target: { id: 'list-a', kind: 'creator-list', label: 'List A' },
      creatorIdsToAdd: ['creator-1'],
    });
  });

  it('retries a failed scoped Creator List lookup', () => {
    const refetch = jest.fn();
    listResponses.set('list-a', {
      error: new Error('List request failed'),
      loading: false,
      refetch,
    });

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('resets the focus stack to the main index before closing the scoped pane', () => {
    resolveCreatorList('list-a', 'List A');
    const onClose = jest.fn();

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={onClose}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );

    expect(mockResetFocusStackToRecordIndex).toHaveBeenCalledWith(
      PageFocusId.RecordIndex,
    );
    expect(
      mockResetFocusStackToRecordIndex.mock.invocationCallOrder[0],
    ).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it('omits the native header action on desktop', () => {
    resolveCreatorList('list-a', 'List A');
    (useIsMobile as jest.Mock).mockReturnValue(false);

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={jest.fn()}
      />,
    );

    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      headerTitle: 'List A',
    });
    expect(
      mockRecordIndexSurface.mock.calls.at(-1)?.[0].headerActionButton,
    ).toBeUndefined();
    expect(
      screen.queryByRole('button', { name: 'Back to Creator Lists' }),
    ).not.toBeInTheDocument();
    expect(
      mockRecordIndexSurface.mock.calls.at(-1)?.[0].onOpenRecordFromIndexView,
    ).toBeUndefined();
  });

  it('keeps List B visible when deferred List A resolves after selection changes', () => {
    listResponses.set('list-a', { loading: true });
    listResponses.set('list-b', { loading: true });
    const onCloseA = jest.fn();
    const onCloseB = jest.fn();
    const { rerender } = render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={onCloseA}
      />,
    );

    rerender(
      <CreatorListScopedCreatorIndex
        creatorListId="list-b"
        onClose={onCloseB}
      />,
    );
    resolveCreatorList('list-b', 'List B');
    rerender(
      <CreatorListScopedCreatorIndex
        creatorListId="list-b"
        onClose={onCloseB}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'List: List B' }),
    ).not.toBeInTheDocument();
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
      headerTitle: 'List B',
    });
    expect(screen.getByTestId('record-index-surface')).toHaveTextContent(
      'Rows for list-b',
    );

    listResponses.set('list-a', {
      error: new Error('List A request failed after unmount'),
      loading: false,
    });
    rerender(
      <CreatorListScopedCreatorIndex
        creatorListId="list-b"
        onClose={onCloseB}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'List: List B' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('record-index-surface')).toHaveTextContent(
      'Rows for list-b',
    );
    expect(
      screen.queryByText('Unable to load Creator List.'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );
    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();
  });
});
