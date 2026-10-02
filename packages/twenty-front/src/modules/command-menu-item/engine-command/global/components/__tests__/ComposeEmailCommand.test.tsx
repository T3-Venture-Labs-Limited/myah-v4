import { render, waitFor } from '@testing-library/react';
import { MAX_EMAIL_RECIPIENTS } from 'twenty-shared/constants';
import { SettingsPath, type ObjectPermissions } from 'twenty-shared/types';
import { ComposeEmailCommand } from '@/command-menu-item/engine-command/global/components/ComposeEmailCommand';
import { MockedProvider } from '@apollo/client/testing/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { JestObjectMetadataItemSetter } from '~/testing/jest/JestObjectMetadataItemSetter';

const metadataWrapper = (
  objectMetadataItems: EnrichedObjectMetadataItem[],
  readableCreatorId?: string,
) => {
  const store = resetJotaiStore();
  if (readableCreatorId) {
    store.set(currentUserWorkspaceState.atom, {
      objectsPermissions: [
        {
          objectMetadataId: readableCreatorId,
          canReadObjectRecords: true,
          canUpdateObjectRecords: true,
          canSoftDeleteObjectRecords: true,
          canDestroyObjectRecords: true,
          restrictedFields: {},
          rowLevelPermissionPredicates: [],
          rowLevelPermissionPredicateGroups: [],
        } satisfies ObjectPermissions & { objectMetadataId: string },
      ],
      permissionFlags: [],
      twoFactorAuthenticationMethodSummary: null,
    });
  }
  // Do not seed the shared test wrapper's Company-dependent command context.
  return ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <MockedProvider mocks={[]}>
        <JestObjectMetadataItemSetter objectMetadataItems={objectMetadataItems}>
          {children}
        </JestObjectMetadataItemSetter>
      </MockedProvider>
    </JotaiProvider>
  );
};
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const mockQuery = jest.fn();
const mockClient = { query: mockQuery };
const mockOpen = jest.fn();
const mockNavigate = jest.fn();
const mockAccount = jest.fn();
const mockContext = jest.fn();
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockClient,
}));
jest.mock('@/activities/emails/hooks/useFirstConnectedAccount', () => ({
  useFirstConnectedAccount: () => mockAccount(),
}));
jest.mock('@/side-panel/hooks/useOpenComposeEmailInSidePanel', () => ({
  useOpenComposeEmailInSidePanel: () => ({
    openComposeEmailInSidePanel: mockOpen,
  }),
}));
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigate,
}));
jest.mock(
  '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi',
  () => ({ useHeadlessCommandContextApi: () => mockContext() }),
);
jest.mock(
  '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect',
  () => ({
    HeadlessEngineCommandWrapperEffect: ({
      execute,
      ready,
    }: {
      execute: () => void;
      ready: boolean;
    }) => {
      const React = jest.requireActual('react');
      const executed = React.useRef(false);
      React.useEffect(() => {
        if (ready && !executed.current) {
          executed.current = true;
          execute();
        }
      }, [execute, ready]);
      return null;
    },
  }),
);
const items = getTestEnrichedObjectMetadataItemsMock();
const person = items.find(({ nameSingular }) => nameSingular === 'person');
const noCrm = items.filter(
  ({ nameSingular }) =>
    !['person', 'company', 'opportunity'].includes(nameSingular),
);
const mount = (objectMetadataItems = noCrm, readableCreatorId?: string) =>
  render(<ComposeEmailCommand />, {
    wrapper: metadataWrapper(objectMetadataItems, readableCreatorId),
  });
beforeEach(() => {
  jest.clearAllMocks();
  mockAccount.mockReturnValue({
    connectedAccountId: 'account-id',
    loading: false,
  });
  mockContext.mockReturnValue({
    objectMetadataItem: null,
    selectedRecords: [],
    graphqlFilter: null,
    targetedRecordsRule: { mode: 'selection', selectedRecordIds: [] },
  });
  mockQuery.mockResolvedValue({
    data: {
      people: {
        edges: [
          {
            node: { id: 'a', emails: { primaryEmail: 'a@example.com' } },
            cursor: 'a',
          },
        ],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 1,
      },
    },
  });
});
it('opens native compose with empty To without any CRM query', async () => {
  mount();
  await waitFor(() =>
    expect(mockOpen).toHaveBeenCalledWith({
      connectedAccountId: 'account-id',
      defaultTo: '',
      creatorId: undefined,
    }),
  );
  expect(mockQuery).not.toHaveBeenCalled();
});
it.each([
  ['selection', [{ id: 'creator-id' }], 'creator-id'],
  ['selection', [{ id: 'one' }, { id: 'two' }], undefined],
  ['exclusion', [{ id: 'creator-id' }], undefined],
])(
  'uses only a single selected Creator origin in %s mode',
  async (mode, selectedRecords, creatorId) => {
    mockContext.mockReturnValue({
      objectMetadataItem: { nameSingular: 'creator' },
      selectedRecords,
      graphqlFilter: null,
      targetedRecordsRule: { mode },
    });
    mount();
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith({
        connectedAccountId: 'account-id',
        defaultTo: '',
        creatorId,
      }),
    );
  },
);

it.each([
  ['multiple Creators', 'selection', [{ id: 'first' }, { id: 'second' }]],
  ['excluded Creator selection', 'exclusion', [{ id: 'first' }]],
])(
  'does not prefill a recipient from the first of %s',
  async (_case, mode, selectedRecords) => {
    const personMetadata = items.find(
      ({ nameSingular }) => nameSingular === 'person',
    )!;
    const textField = personMetadata.fields.find(
      ({ name }) => name === 'jobTitle',
    )!;
    const creatorMetadata = {
      ...personMetadata,
      id: '00000000-0000-4000-8000-000000000425',
      nameSingular: 'creator',
      namePlural: 'creators',
      fields: personMetadata.fields
        .filter(({ name }) => name === 'id')
        .concat({ ...textField, name: 'email' }),
    } as EnrichedObjectMetadataItem;
    mockContext.mockReturnValue({
      objectMetadataItem: creatorMetadata,
      selectedRecords,
      graphqlFilter: null,
      targetedRecordsRule: { mode },
    });
    mockQuery.mockResolvedValue({
      data: {
        creators: {
          edges: [{ node: { id: 'first', email: 'first@example.test' } }],
          totalCount: 1,
        },
      },
    });

    mount([...items, creatorMetadata], creatorMetadata.id);
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith({
        connectedAccountId: 'account-id',
        defaultTo: '',
        creatorId: undefined,
      }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  },
);

it('keeps account setup navigation', async () => {
  mockAccount.mockReturnValue({ connectedAccountId: null, loading: false });
  mount();
  await waitFor(() =>
    expect(mockNavigate).toHaveBeenCalledWith(SettingsPath.NewAccount),
  );
  expect(mockOpen).not.toHaveBeenCalled();
});
it('waits for account loading', () => {
  mockAccount.mockReturnValue({ connectedAccountId: null, loading: true });
  mount();
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});
it.each([
  ['selection', [{ id: 'a' }, { id: 'b' }], { id: { in: ['a', 'b'] } }],
  [
    'exclusion',
    [],
    { and: [{ not: { id: { in: ['excluded'] } } }, { city: { eq: 'Paris' } }] },
  ],
])(
  'forwards %s bulk context filter unchanged with native cap',
  async (mode, selectedRecords, graphqlFilter) => {
    mockContext.mockReturnValue({
      objectMetadataItem: person,
      selectedRecords,
      graphqlFilter,
      targetedRecordsRule: { mode },
    });
    mount(items);
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith({
        connectedAccountId: 'account-id',
        defaultTo: 'a@example.com',
        creatorId: undefined,
      }),
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0].variables).toEqual({
      filterPerson: graphqlFilter,
      firstPerson: MAX_EMAIL_RECIPIENTS,
    });
  },
);
