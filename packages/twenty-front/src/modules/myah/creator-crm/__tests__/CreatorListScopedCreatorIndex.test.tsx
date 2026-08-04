import { fireEvent, render, screen } from '@testing-library/react';

import { CreatorListScopedCreatorIndex } from '@/myah/creator-crm/components/CreatorListScopedCreatorIndex';
import { useCreatorListBulkActionsContext } from '@/myah/creator-crm/contexts/CreatorListBulkActionsContext';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useViewOrDefaultView } from '@/views/hooks/useViewOrDefaultView';
import { FieldMetadataType } from 'twenty-shared/types';
import { PageFocusId } from '@/types/PageFocusId';

const mockResetFocusStackToRecordIndex = jest.fn();

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
    indexIdentifierUrl,
    initialQueryOnlyRecordFilters,
    onViewChange,
    viewId,
  }: {
    contextStoreInstanceId: string;
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onViewChange?: (viewId: string) => void;
    viewId: string;
  }) => (
    <div
      data-context-store-id={contextStoreInstanceId}
      data-testid="record-index-surface"
    >
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
    indexIdentifierUrl: (recordId: string) => string;
    initialQueryOnlyRecordFilters: Array<{ value: string }>;
    onViewChange?: (viewId: string) => void;
    viewId: string;
  }) => mockRecordIndexSurface(props),
}));
jest.mock(
  '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex',
  () => ({
    useResetFocusStackToRecordIndex: () => ({
      resetFocusStackToRecordIndex: mockResetFocusStackToRecordIndex,
    }),
  }),
);

jest.mock('@/views/hooks/useViewOrDefaultView', () => ({
  useViewOrDefaultView: jest.fn(),
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
    listResponses.clear();

    (useFindOneRecord as jest.Mock).mockImplementation(
      ({ objectRecordId }: { objectRecordId: string }) =>
        listResponses.get(objectRecordId) ?? { loading: true },
    );
    (useViewOrDefaultView as jest.Mock).mockReturnValue({
      view: { id: 'creator-default-view' },
    });

    (useObjectPermissionsForObject as jest.Mock).mockReturnValue({
      canReadObjectRecords: true,
    });
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

    expect(screen.getByRole('heading', { name: 'List: List A' })).toBeVisible();
    expect(screen.getByTestId('record-index-surface')).toHaveAttribute(
      'data-context-store-id',
      'creator-list-pane-list-a',
    );
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).toMatchObject({
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
    expect(mockRecordIndexSurface.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'creatorListContext',
    );
    expect(screen.getByTestId('scoped-bulk-actions-context')).toHaveTextContent(
      'list-a',
    );
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

  it.each([
    ['loading', 'Loading Creator List…'],
    ['error', 'Unable to load Creator List.'],
    ['forbidden', 'You do not have permission to view Creators.'],
  ])('keeps Back available while the scoped pane is %s', (state, message) => {
    const onClose = jest.fn();

    if (state === 'error') {
      listResponses.set('list-a', {
        error: new Error('List request failed'),
        loading: false,
      });
    }

    if (state === 'forbidden') {
      (useObjectPermissionsForObject as jest.Mock).mockReturnValueOnce({
        canReadObjectRecords: false,
      });
    }

    render(
      <CreatorListScopedCreatorIndex
        creatorListId="list-a"
        onClose={onClose}
      />,
    );

    expect(screen.getByText(message)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Creator Lists' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
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

    expect(screen.getByRole('heading', { name: 'List: List B' })).toBeVisible();
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

    expect(screen.getByRole('heading', { name: 'List: List B' })).toBeVisible();
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
