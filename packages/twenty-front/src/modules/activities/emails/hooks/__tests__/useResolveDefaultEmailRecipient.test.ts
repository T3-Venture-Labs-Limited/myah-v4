import { useUpdateMetadataStoreDraft } from '@/metadata-store/hooks/useUpdateMetadataStoreDraft';
import { splitCompositeObjectMetadataItems } from '@/metadata-store/utils/splitCompositeObjectMetadataItems';

import { MockedProvider } from '@apollo/client/testing/react';
import { Provider as JotaiProvider, useAtomValue } from 'jotai';
import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { print } from 'graphql';
import { MAX_EMAIL_RECIPIENTS } from 'twenty-shared/constants';
import { type ObjectPermissions } from 'twenty-shared/types';

import { useResolveDefaultEmailRecipient } from '@/activities/emails/hooks/useResolveDefaultEmailRecipient';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import {
  currentWorkspaceState,
  type CurrentWorkspace,
} from '@/auth/states/currentWorkspaceState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { JestObjectMetadataItemSetter } from '~/testing/jest/JestObjectMetadataItemSetter';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const mockQuery = jest.fn();
const mockClient = { query: mockQuery };
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));

const nativeItems = getTestEnrichedObjectMetadataItemsMock();
const noCrmItems = nativeItems.filter(
  ({ nameSingular }) =>
    !['person', 'company', 'opportunity'].includes(nameSingular),
);
const item = (name: string) => {
  const found = nativeItems.find(({ nameSingular }) => nameSingular === name);
  if (!found) throw new Error(`Missing native test metadata: ${name}`);
  return found;
};
const permission = (
  name: string,
  overrides: Partial<ObjectPermissions> = {},
): ObjectPermissions & { objectMetadataId: string } => ({
  objectMetadataId: item(name).id,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
  ...overrides,
});
const wrapper = (
  items: EnrichedObjectMetadataItem[] = nativeItems,
  permissions: ReturnType<typeof permission>[] = [],
) => {
  resetJotaiStore();
  const store = jotaiStore;
  store.set(currentWorkspaceState.atom, null);
  store.set(currentUserWorkspaceState.atom, {
    objectsPermissions: permissions,
    permissionFlags: [],
    twoFactorAuthenticationMethodSummary: null,
  });
  // Mount persisted auth atoms before the metadata setter exposes the hook.
  const Metadata = ({ children }: { children: ReactNode }) => {
    useAtomValue(currentWorkspaceState.atom, { store });
    useAtomValue(currentUserWorkspaceState.atom, { store });
    return createElement(JestObjectMetadataItemSetter, {
      objectMetadataItems: items,
      children,
    });
  };
  // The shared wrapper seeds Company context, which is intentionally absent here.
  return ({ children }: { children: ReactNode }) =>
    createElement(
      JotaiProvider,
      { store },
      createElement(
        MockedProvider,
        { mocks: [] },
        createElement(Metadata, { children }),
      ),
    );
};

const connection = (name: string, nodes: Record<string, unknown>[]) => ({
  data: {
    [name]: {
      edges: nodes.map((node, index) => ({ node, cursor: `${index}` })),
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: null,
        endCursor: null,
      },
      totalCount: nodes.length,
    },
  },
});
const emailNode = (email: string) => ({
  id: email,
  emails: { primaryEmail: email },
});
const withoutField = (objectName: string, fieldName: string) =>
  nativeItems.map((metadata) =>
    metadata.nameSingular === objectName
      ? {
          ...metadata,
          fields: metadata.fields.filter(({ name }) => name !== fieldName),
        }
      : metadata,
  );

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue(connection('people', []));
});

it.each([
  [null, null],
  ['person', null],
  ['customObject', 'custom-id'],
  ['person', 'person-id'],
  ['company', 'company-id'],
  ['opportunity', 'opportunity-id'],
])(
  'opens without legacy metadata for %s/%s',
  async (objectNameSingular, recordId) => {
    const { result } = renderHook(
      () => useResolveDefaultEmailRecipient({ objectNameSingular, recordId }),
      { wrapper: wrapper(noCrmItems) },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ defaultTo: '', loading: false }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it.each([
  [null, null],
  ['person', null],
  ['customObject', 'custom-id'],
])(
  'does not query optional empty/custom context with native metadata: %s',
  async (objectNameSingular, recordId) => {
    const { result } = renderHook(
      () => useResolveDefaultEmailRecipient({ objectNameSingular, recordId }),
      { wrapper: wrapper() },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ defaultTo: '', loading: false }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it.each([
  ['person', 'people', emailNode('person@example.com'), 'person@example.com'],
  [
    'company',
    'people',
    emailNode('employee@example.com'),
    'employee@example.com',
  ],
  [
    'opportunity',
    'opportunities',
    {
      id: 'opportunity-id',
      pointOfContact: emailNode('contact@example.com'),
    },
    'contact@example.com',
  ],
])(
  'preserves %s prefill through actual query generation',
  async (objectNameSingular, plural, node, expected) => {
    mockQuery.mockResolvedValue(
      connection(plural as string, [node as Record<string, unknown>]),
    );
    const { result } = renderHook(
      () =>
        useResolveDefaultEmailRecipient({
          objectNameSingular: objectNameSingular as string,
          recordId: 'record-id',
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.defaultTo).toBe(expected));
    const request = mockQuery.mock.calls[0][0];
    const opportunity = objectNameSingular === 'opportunity';
    expect(request.variables).toEqual(
      opportunity
        ? {
            filterOpportunity: { id: { eq: 'record-id' } },
            firstOpportunity: 1,
          }
        : {
            filterPerson: {
              [objectNameSingular === 'company' ? 'companyId' : 'id']: {
                eq: 'record-id',
              },
            },
            firstPerson: 1,
          },
    );
    const query = print(request.query);
    expect(query).toContain(opportunity ? 'opportunities(' : 'people(');
    expect(query).toContain('primaryEmail');
    expect(query.includes('pointOfContact {')).toBe(opportunity);
    expect(request.fetchPolicy).toBe('no-cache');
    expect(result.current.loading).toBe(false);
  },
);

it.each([
  ['person', []],
  ['person', [emailNode('')]],
  ['opportunity', [{ id: 'opportunity-id', pointOfContact: null }]],
])(
  'returns empty for missing email/contact on %s',
  async (objectNameSingular, nodes) => {
    mockQuery.mockResolvedValue(
      connection(
        objectNameSingular === 'opportunity' ? 'opportunities' : 'people',
        nodes as Record<string, unknown>[],
      ),
    );
    const { result } = renderHook(
      () =>
        useResolveDefaultEmailRecipient({
          objectNameSingular: objectNameSingular as string,
          recordId: 'record-id',
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current).toEqual({ defaultTo: '', loading: false }),
    );
  },
);

it.each([
  ['person', withoutField('person', 'emails')],
  ['company', withoutField('person', 'company')],
  ['opportunity', withoutField('opportunity', 'pointOfContact')],
  [
    'opportunity',
    nativeItems.filter(({ nameSingular }) => nameSingular !== 'person'),
  ],
  [
    'company',
    nativeItems.filter(({ nameSingular }) => nameSingular !== 'company'),
  ],
])(
  'does not construct a query when required %s metadata/fields/relations are absent',
  async (objectNameSingular, items) => {
    const { result } = renderHook(
      () =>
        useResolveDefaultEmailRecipient({
          objectNameSingular: objectNameSingular as string,
          recordId: 'record-id',
        }),
      { wrapper: wrapper(items as EnrichedObjectMetadataItem[]) },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ defaultTo: '', loading: false }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it.each(['person', 'company', 'opportunity'])(
  'honors denied %s root reads',
  async (name) => {
    const { result } = renderHook(
      () =>
        useResolveDefaultEmailRecipient({
          objectNameSingular: name,
          recordId: 'record-id',
        }),
      {
        wrapper: wrapper(nativeItems, [
          permission(name, { canReadObjectRecords: false }),
        ]),
      },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ defaultTo: '', loading: false }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it('honors denied related Person reads for Opportunity', async () => {
  const { result } = renderHook(
    () =>
      useResolveDefaultEmailRecipient({
        objectNameSingular: 'opportunity',
        recordId: 'opp-id',
      }),
    {
      wrapper: wrapper(nativeItems, [
        permission('person', { canReadObjectRecords: false }),
      ]),
    },
  );
  await waitFor(() =>
    expect(result.current).toEqual({ defaultTo: '', loading: false }),
  );
  expect(mockQuery).not.toHaveBeenCalled();
});

it('honors a restricted email field derived by the real metadata selector', async () => {
  const emails = item('person').fields.find(({ name }) => name === 'emails');
  if (!emails) throw new Error('Missing emails test field');
  const { result } = renderHook(
    () =>
      useResolveDefaultEmailRecipient({
        objectNameSingular: 'person',
        recordId: 'person-id',
      }),
    {
      wrapper: wrapper(nativeItems, [
        permission('person', {
          restrictedFields: {
            [emails.id]: { canRead: false, canUpdate: false },
          },
        }),
      ]),
    },
  );
  await waitFor(() =>
    expect(result.current).toEqual({ defaultTo: '', loading: false }),
  );
  expect(mockQuery).not.toHaveBeenCalled();
});

it.each([
  { id: { in: ['a', 'b'] } },
  { and: [{ not: { id: { in: ['excluded'] } } }, { city: { eq: 'Paris' } }] },
])('preserves bulk filters and cap', async (filter) => {
  mockQuery.mockResolvedValue(
    connection('people', [
      emailNode('a@example.com'),
      emailNode(''),
      emailNode('b@example.com'),
    ]),
  );
  const { result } = renderHook(
    () =>
      useResolveDefaultEmailRecipient({
        objectNameSingular: 'person',
        recordId: null,
        bulkPerson: { filter },
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() =>
    expect(result.current.defaultTo).toBe('a@example.com, b@example.com'),
  );
  expect(mockQuery.mock.calls[0][0].variables).toEqual({
    filterPerson: filter,
    firstPerson: MAX_EMAIL_RECIPIENTS,
  });
});

it('returns empty on transport failure rather than hanging the composer', async () => {
  mockQuery.mockRejectedValue(new Error('local transport failure'));
  const { result } = renderHook(
    () =>
      useResolveDefaultEmailRecipient({
        objectNameSingular: 'person',
        recordId: 'person-id',
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(result.current).toEqual({ defaultTo: '', loading: false }),
  );
});

it('masks completed data immediately on null/custom context and ignores old in-flight context data', async () => {
  let finishOld: (value: ReturnType<typeof connection>) => void = () => {
    throw new Error('Old request has not started');
  };
  mockQuery.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  mockQuery.mockResolvedValue(
    connection('people', [emailNode('new@example.com')]),
  );
  const { result, rerender } = renderHook(
    (props: { objectNameSingular: string | null; recordId: string | null }) =>
      useResolveDefaultEmailRecipient(props),
    {
      wrapper: wrapper(),
      initialProps: { objectNameSingular: 'person', recordId: 'old-id' } as {
        objectNameSingular: string | null;
        recordId: string | null;
      },
    },
  );
  await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
  expect(result.current).toEqual({ defaultTo: '', loading: true });
  rerender({ objectNameSingular: 'person', recordId: 'new-id' });
  expect(result.current.defaultTo).toBe('');
  await waitFor(() => expect(result.current.defaultTo).toBe('new@example.com'));
  await act(async () => {
    finishOld(connection('people', [emailNode('old@example.com')]));
  });
  expect(result.current.defaultTo).toBe('new@example.com');
  rerender({ objectNameSingular: 'person', recordId: null });
  expect(result.current).toEqual({ defaultTo: '', loading: false });
  rerender({ objectNameSingular: 'customObject', recordId: 'custom-id' });
  expect(result.current).toEqual({ defaultTo: '', loading: false });
  expect(mockQuery).toHaveBeenCalledTimes(2);
});

it('masks a completed recipient as soon as read permission is revoked', async () => {
  mockQuery.mockResolvedValue(
    connection('people', [emailNode('private@example.com')]),
  );
  const { result } = renderHook(
    () =>
      useResolveDefaultEmailRecipient({
        objectNameSingular: 'person',
        recordId: 'person-id',
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() =>
    expect(result.current.defaultTo).toBe('private@example.com'),
  );
  act(() =>
    jotaiStore.set(currentUserWorkspaceState.atom, {
      objectsPermissions: [
        permission('person', { canReadObjectRecords: false }),
      ],
      permissionFlags: [],
      twoFactorAuthenticationMethodSummary: null,
    }),
  );
  expect(result.current).toEqual({ defaultTo: '', loading: false });
  expect(mockQuery).toHaveBeenCalledTimes(1);
});

it('rejects inactive and wrong-target relations', async () => {
  const company = item('company');
  for (const transform of [
    (field: EnrichedObjectMetadataItem['fields'][number]) => ({
      ...field,
      isActive: false,
    }),
    (field: EnrichedObjectMetadataItem['fields'][number]) => ({
      ...field,
      relation: field.relation
        ? {
            ...field.relation,
            targetObjectMetadata: {
              ...field.relation.targetObjectMetadata,
              id: company.id,
            },
          }
        : field.relation,
    }),
  ]) {
    const items = nativeItems.map((metadata) =>
      metadata.nameSingular !== 'opportunity'
        ? metadata
        : {
            ...metadata,
            fields: metadata.fields.map((field) =>
              field.name === 'pointOfContact' ? transform(field) : field,
            ),
          },
    );
    const { result, unmount } = renderHook(
      () =>
        useResolveDefaultEmailRecipient({
          objectNameSingular: 'opportunity',
          recordId: 'opp-id',
        }),
      { wrapper: wrapper(items) },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ defaultTo: '', loading: false }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
    unmount();
  }
});

it('removes metadata while mounted and ignores its late result', async () => {
  let finish: (value: ReturnType<typeof connection>) => void = () => {
    throw new Error('Request has not started');
  };
  mockQuery.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(
    () => ({
      recipient: useResolveDefaultEmailRecipient({
        objectNameSingular: 'person',
        recordId: 'person-id',
      }),
      metadata: useUpdateMetadataStoreDraft(),
    }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(mockQuery).toHaveBeenCalledTimes(1));
  act(() => {
    const split = splitCompositeObjectMetadataItems(noCrmItems);
    result.current.metadata.replaceDraft(
      'objectMetadataItems',
      split.flatObjects,
    );
    result.current.metadata.replaceDraft(
      'fieldMetadataItems',
      split.flatFields,
    );
    result.current.metadata.replaceDraft(
      'indexMetadataItems',
      split.flatIndexes,
    );
    result.current.metadata.applyChanges();
  });
  expect(result.current.recipient).toEqual({ defaultTo: '', loading: false });
  await act(async () => {
    finish(connection('people', [emailNode('old@example.com')]));
  });
  expect(result.current.recipient).toEqual({ defaultTo: '', loading: false });
});

it('does not reuse completed or in-flight results across workspace identity changes', async () => {
  // Only the two properties consumed by this hook are needed by this isolated fixture.
  const workspace = (id: string) =>
    ({ id, metadataVersion: 1 }) as CurrentWorkspace;
  const pending: ((value: ReturnType<typeof connection>) => void)[] = [];
  mockQuery.mockImplementation(
    () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  );
  const { result } = renderHook(
    () =>
      useResolveDefaultEmailRecipient({
        objectNameSingular: 'person',
        recordId: 'same-record-id',
      }),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(pending).toHaveLength(1));
  await act(async () => {
    pending[0](connection('people', [emailNode('initial@example.com')]));
  });
  expect(result.current.defaultTo).toBe('initial@example.com');
  act(() =>
    jotaiStore.set(currentWorkspaceState.atom, workspace('workspace-a')),
  );
  expect(result.current).toEqual({ defaultTo: '', loading: true });
  await waitFor(() => expect(pending).toHaveLength(2));
  act(() =>
    jotaiStore.set(currentWorkspaceState.atom, workspace('workspace-b')),
  );
  expect(result.current).toEqual({ defaultTo: '', loading: true });
  await waitFor(() => expect(pending).toHaveLength(3));
  await act(async () => {
    pending[1](connection('people', [emailNode('workspace-a@example.com')]));
  });
  expect(result.current).toEqual({ defaultTo: '', loading: true });
  await act(async () => {
    pending[2](connection('people', [emailNode('workspace-b@example.com')]));
  });
  expect(result.current).toEqual({
    defaultTo: 'workspace-b@example.com',
    loading: false,
  });
  for (const [request] of mockQuery.mock.calls) {
    expect(request.fetchPolicy).toBe('no-cache');
    expect(request.context).toEqual({ queryDeduplication: false });
  }
});
