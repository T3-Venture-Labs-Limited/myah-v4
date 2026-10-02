import { act, render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import qs from 'qs';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import {
  ConnectedCreatorRecordIndexReferenceGate,
  CreatorRecordIndexReferenceGate,
} from '@/views/components/CreatorRecordIndexReferenceGate';
import { type View } from '@/views/types/View';
import {
  RecordFilterGroupLogicalOperator,
  ViewFilterOperand,
} from 'twenty-shared/types';

const metadata = {
  id: 'creator-object',
  nameSingular: 'creator',
  fields: [{ id: 'name-id', name: 'name', type: 'TEXT' }],
} as EnrichedObjectMetadataItem;
const view = {
  id: 'view-id',
  objectMetadataId: 'creator-object',
  viewFilters: [],
  viewSorts: [],
} as unknown as View;

const dispatch = jest.fn();
const Query = () => {
  useEffect(() => {
    dispatch();
  }, []);
  return <div>Creator records</div>;
};

const LocationProbe = () => {
  const { search } = useLocation();
  return <span data-testid="location-search">{search}</span>;
};

const manyParams = (count: number) =>
  new URLSearchParams(
    Array.from({ length: count }, (_, i) => [`utm${i}`, '1']),
  );

const renderGate = ({
  query = '',
  savedView = view,
  metadataReady = true,
  currentViewReady = true,
  checkUrl = true,
}: {
  query?: string;
  savedView?: View;
  metadataReady?: boolean;
  currentViewReady?: boolean;
  checkUrl?: boolean;
} = {}) =>
  render(
    <MemoryRouter initialEntries={[`/objects/creators?${query}`]}>
      <LocationProbe />
      <CreatorRecordIndexReferenceGate
        objectMetadataItem={metadata}
        view={savedView}
        metadataReady={metadataReady}
        currentViewReady={currentViewReady}
        checkUrl={checkUrl}
      >
        <Query />
      </CreatorRecordIndexReferenceGate>
    </MemoryRouter>,
  );

beforeEach(() => dispatch.mockClear());

it('blocks an obsolete simple Creator URL filter even alongside a valid predicate', () => {
  renderGate({
    query: qs.stringify({
      filter: { name: { IS: 'valid' }, instagramUsername: { IS: 'old' } },
    }),
  });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
});

it('blocks an obsolete filter inside nested URL groups', () => {
  renderGate({
    query: qs.stringify({
      filterGroup: {
        operator: RecordFilterGroupLogicalOperator.AND,
        groups: [
          {
            operator: RecordFilterGroupLogicalOperator.OR,
            filters: [
              { field: 'name', op: ViewFilterOperand.IS, value: 'valid' },
              {
                field: 'instagramUsername',
                op: ViewFilterOperand.IS,
                value: 'old',
              },
            ],
          },
        ],
      },
    }),
  });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
});

it('allows a valid nested URL group after the metadata and current view are ready', () => {
  renderGate({
    query: qs.stringify({
      filterGroup: {
        operator: RecordFilterGroupLogicalOperator.AND,
        groups: [
          {
            operator: RecordFilterGroupLogicalOperator.OR,
            filters: [
              { field: 'name', op: ViewFilterOperand.IS, value: 'valid' },
            ],
          },
        ],
      },
    }),
  });
  expect(screen.getByText('Creator records')).toBeInTheDocument();
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('does not treat an unrelated URL filter as an embedded Creator list filter', () => {
  renderGate({
    query: qs.stringify({ filter: { instagramUsername: { IS: 'old' } } }),
    checkUrl: false,
  });
  expect(screen.getByText('Creator records')).toBeInTheDocument();
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it.each([
  ['simple filter', 'filter[instagramUsername][IS]', 'old'],
  ['nested filter', 'filterGroup[filters][0][field]', 'instagramUsername'],
  ['sort', 'sort[instagramUsername]', 'ASC'],
])(
  'blocks a %s after the qs parameter limit without mounting query children or changing the URL',
  (_label, key, value) => {
    const params = manyParams(1000);
    params.append(key, value);
    const query = params.toString();
    renderGate({ query });
    expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
    expect(screen.getByText(/excess URL parameters/i)).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-search').textContent).toBe(`?${query}`);
  },
);

it('does not hide an obsolete filter after the limit when a valid companion precedes it', () => {
  const params = new URLSearchParams({ 'filter[name][IS]': 'valid' });
  manyParams(999).forEach((value, key) => params.append(key, value));
  params.append('filter[instagramUsername][IS]', 'old');
  const query = params.toString();
  renderGate({ query });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.getByTestId('location-search').textContent).toBe(`?${query}`);
});

it('accepts valid nested filters at exactly the qs parameter limit', () => {
  const nested = new URLSearchParams(
    qs.stringify({
      filterGroup: {
        operator: RecordFilterGroupLogicalOperator.AND,
        filters: [{ field: 'name', op: ViewFilterOperand.IS, value: 'valid' }],
      },
    }),
  );
  const params = manyParams(1000 - nested.size);
  nested.forEach((value, key) => params.append(key, value));
  expect(params.size).toBe(1000);
  renderGate({ query: params.toString() });
  expect(screen.getByText('Creator records')).toBeInTheDocument();
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('permits unrelated URLs beyond the qs parameter limit', () => {
  renderGate({ query: manyParams(1001).toString() });
  expect(screen.getByText('Creator records')).toBeInTheDocument();
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('keeps an overflowing Creator URL pending while metadata loads, then requires repair', () => {
  const params = manyParams(1000);
  params.append('sort[instagramUsername]', 'ASC');
  const query = params.toString();
  const { rerender } = renderGate({ query, metadataReady: false });
  expect(screen.queryByText(/needs repair/i)).not.toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
  rerender(
    <MemoryRouter initialEntries={[`/objects/creators?${query}`]}>
      <LocationProbe />
      <CreatorRecordIndexReferenceGate
        objectMetadataItem={metadata}
        view={view}
        metadataReady
        currentViewReady
        checkUrl
      >
        <Query />
      </CreatorRecordIndexReferenceGate>
    </MemoryRouter>,
  );
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.getByTestId('location-search').textContent).toBe(`?${query}`);
});

it('blocks a saved view with an obsolete field ID or relation target even alongside a valid filter', () => {
  const valid = { id: 'valid', fieldMetadataId: 'name-id' };
  const { unmount } = renderGate({
    savedView: {
      ...view,
      viewFilters: [valid, { id: 'old', fieldMetadataId: 'missing-id' }],
    } as View,
  });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
  unmount();
  renderGate({
    savedView: {
      ...view,
      viewFilters: [
        valid,
        {
          id: 'old-target',
          fieldMetadataId: 'name-id',
          relationTargetFieldMetadataId: 'missing-target',
        },
      ],
    } as View,
  });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
});

it('blocks an obsolete URL sort and saved-view sort', () => {
  const { unmount } = renderGate({
    query: qs.stringify({ sort: { instagramUsername: 'ASC' } }),
  });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
  unmount();
  renderGate({
    savedView: {
      ...view,
      viewSorts: [
        { id: 'old', fieldMetadataId: 'missing-id', direction: 'ASC' },
      ],
    } as View,
  });
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
});

it('waits for metadata before marking an obsolete URL as repair-required', () => {
  const query = qs.stringify({ filter: { instagramUsername: { IS: 'old' } } });
  const { rerender } = renderGate({ query, metadataReady: false });
  expect(screen.queryByText(/needs repair/i)).not.toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
  rerender(
    <MemoryRouter initialEntries={[`/objects/creators?${query}`]}>
      <CreatorRecordIndexReferenceGate
        objectMetadataItem={metadata}
        view={view}
        metadataReady
        currentViewReady
        checkUrl
      >
        <Query />
      </CreatorRecordIndexReferenceGate>
    </MemoryRouter>,
  );
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
});

it('keeps the connected query boundary unmounted until store metadata settles, then rejects the saved obsolete ID', () => {
  const store = createStore();
  for (const key of [
    'views',
    'fieldMetadataItems',
    'viewSorts',
    'objectMetadataItems',
  ] as const) {
    store.set(metadataStoreState.atomFamily(key), {
      current:
        key === 'views'
          ? [{ ...view, name: 'Creators', isActive: true }]
          : key === 'fieldMetadataItems'
            ? [
                {
                  id: 'name-id',
                  name: 'name',
                  objectMetadataId: 'creator-object',
                  type: 'TEXT',
                },
              ]
            : key === 'objectMetadataItems'
              ? [{ id: 'creator-object', nameSingular: 'creator' }]
              : [],
      draft: [],
      status: 'up-to-date',
    });
  }
  store.set(metadataStoreState.atomFamily('viewFilters'), {
    current: [
      { id: 'obsolete', viewId: 'view-id', fieldMetadataId: 'missing-id' },
    ],
    draft: [],
    status: 'empty',
  });
  store.set(
    contextStoreCurrentViewIdComponentState.atomFamily({
      instanceId: 'creator-index',
    }),
    'view-id',
  );
  render(
    <Provider store={store}>
      <ContextStoreComponentInstanceContext.Provider
        value={{ instanceId: 'creator-index' }}
      >
        <MemoryRouter>
          <ConnectedCreatorRecordIndexReferenceGate
            objectMetadataItem={metadata}
            viewId="view-id"
            checkUrl
          >
            <Query />
          </ConnectedCreatorRecordIndexReferenceGate>
        </MemoryRouter>
      </ContextStoreComponentInstanceContext.Provider>
    </Provider>,
  );
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.queryByText(/needs repair/i)).not.toBeInTheDocument();
  act(() =>
    store.set(metadataStoreState.atomFamily('viewFilters'), (previous) => ({
      ...previous,
      status: 'up-to-date',
    })),
  );
  expect(screen.getByText(/needs repair/i)).toBeInTheDocument();
  expect(dispatch).not.toHaveBeenCalled();
});

it('waits for metadata and view switch, then permits valid filters without blocking other URLs', () => {
  const query = qs.stringify({
    filter: { name: { IS: 'valid' } },
    sort: { name: 'ASC' },
  });
  const { rerender } = renderGate({ query, metadataReady: false });
  expect(dispatch).not.toHaveBeenCalled();
  rerender(
    <MemoryRouter initialEntries={[`/objects/creators?${query}`]}>
      <CreatorRecordIndexReferenceGate
        objectMetadataItem={metadata}
        view={view}
        metadataReady
        currentViewReady={false}
        checkUrl
      >
        <Query />
      </CreatorRecordIndexReferenceGate>
    </MemoryRouter>,
  );
  expect(dispatch).not.toHaveBeenCalled();
  rerender(
    <MemoryRouter initialEntries={[`/objects/creators?${query}`]}>
      <CreatorRecordIndexReferenceGate
        objectMetadataItem={metadata}
        view={view}
        metadataReady
        currentViewReady
        checkUrl
      >
        <Query />
      </CreatorRecordIndexReferenceGate>
    </MemoryRouter>,
  );
  expect(screen.getByText('Creator records')).toBeInTheDocument();
  expect(dispatch).toHaveBeenCalledTimes(1);
});
