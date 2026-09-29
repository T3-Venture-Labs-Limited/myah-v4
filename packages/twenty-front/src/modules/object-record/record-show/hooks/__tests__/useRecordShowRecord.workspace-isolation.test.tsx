import { ApolloClient, ApolloLink, InMemoryCache, gql } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { Observable, type Subscriber } from 'rxjs';
import { useState, type ReactNode } from 'react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  tokenPairState,
  TOKEN_PAIR_LOCAL_STORAGE_KEY,
} from '@/auth/states/tokenPairState';
import { campaignRecordReadLink } from '@/apollo/utils/campaignRecordReadLink';
import {
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { useRecordShowRecord } from '@/object-record/record-show/hooks/useRecordShowRecord';

const campaignQuery = gql`
  query FindOneCampaign($objectRecordId: String!) {
    campaign(id: $objectRecordId) {
      id
      name
      __typename
    }
  }
`;

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { id: 'campaign-metadata' },
  }),
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));
jest.mock(
  '@/object-record/record-show/graphql/operations/factories/findOneRecordForShowPageOperationSignatureFactory',
  () => ({
    buildFindOneRecordForShowPageOperationSignature: () => ({
      fields: { id: true, name: true },
    }),
  }),
);
jest.mock(
  '@/object-record/graphql/record-gql-fields/hooks/useGenerateDepthRecordGqlFieldsFromObject',
  () => ({
    useGenerateDepthRecordGqlFieldsFromObject: () => ({
      recordGqlFields: { id: true, name: true },
    }),
  }),
);
jest.mock('@/object-record/hooks/useFindOneRecordQuery', () => ({
  useFindOneRecordQuery: () => ({ findOneRecordQuery: campaignQuery }),
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({ canReadObjectRecords: true }),
}));

const recordId = '00000000-0000-4000-8000-000000000001';
const token = (workspaceId: string) =>
  `header.${btoa(JSON.stringify({ type: 'ACCESS', workspaceId, userId: 'test-user', userWorkspaceId: 'test-membership' }))}.signature`;
const tokenPair = (workspaceId: string) => ({
  accessOrWorkspaceAgnosticToken: { token: token(workspaceId) },
});
const setToken = (workspaceId: string) =>
  localStorage.setItem(
    TOKEN_PAIR_LOCAL_STORAGE_KEY,
    JSON.stringify(tokenPair(workspaceId)),
  );
afterEach(() => localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY));
type Pending = { authority: string; observer: Subscriber<unknown> };

const Read = () => {
  const { record, hasLoadedRecord } = useRecordShowRecord({
    objectNameSingular: 'campaign',
    recordId,
  });
  return (
    <div data-testid="read">
      {hasLoadedRecord ? String(record?.name) : 'unavailable'}
    </div>
  );
};

const makeHarness = () => {
  const pending: Pending[] = [];
  let tokenWorkspace = 'A';
  const store = createStore();
  setToken('A');
  store.set(tokenPairState.atom, tokenPair('A') as never);
  store.set(currentWorkspaceState.atom, { id: 'A' } as never);
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([
      new ApolloLink((operation, forward) => {
        operation.setContext({
          headers: { authorization: `Bearer ${token(tokenWorkspace)}` },
        });
        return forward(operation);
      }),
      campaignRecordReadLink,
      new ApolloLink(() => {
        const authority = tokenWorkspace;
        return new Observable((observer) => {
          pending.push({ authority, observer });
        });
      }),
    ]),
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <ApolloProvider client={client}>{children}</ApolloProvider>
    </Provider>
  );
  const resolve = (index: number, name: string) => {
    pending[index].observer.next({
      data: { campaign: { __typename: 'Campaign', id: recordId, name } },
    });
    pending[index].observer.complete();
  };
  return {
    client,
    pending,
    store,
    Wrapper,
    resolve,
    setTokenWorkspace: (workspace: string) => {
      tokenWorkspace = workspace;
    },
    setToken,
  };
};

describe('Campaign show reads across workspace switches (real Apollo)', () => {
  it('rejects a B show read dispatched while the active token still belongs to A', async () => {
    const { pending, store, Wrapper, setToken: updateToken } = makeHarness();
    const Page = () => {
      const [workspace, setWorkspace] = useState('A');
      return (
        <>
          <button
            onClick={() => {
              store.set(currentWorkspaceState.atom, { id: 'B' } as never);
              setWorkspace('B');
            }}
          >
            Switch
          </button>
          <Read key={workspace} />
        </>
      );
    };
    render(<Page />, { wrapper: Wrapper });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => {
      updateToken('B');
      store.set(tokenPairState.atom, tokenPair('B') as never);
      screen.getByText('Switch').click();
    });
    // The hook must not accept a response dispatched under A, even when its
    // render observes B's new session while the transport still uses A.
    // This client tries to dispatch B while the transport is still authorized
    // as A; the opt-in link rejects it before any response can be trusted.
    expect(pending).toHaveLength(1);
    expect(screen.getByTestId('read')).toHaveTextContent('unavailable');
  });

  it('rejects a pending Campaign read after logout without caching its private result', async () => {
    const { client, pending, store, resolve } = makeHarness();
    const identity = decodeCampaignCreationIdentity(token('A'))!;
    const oldRead = client.query({
      query: campaignQuery,
      variables: { objectRecordId: recordId },
      fetchPolicy: 'no-cache',
      context: {
        queryDeduplication: false,
        campaignRecordRead: {
          store,
          workspaceId: 'A',
          identityKey: campaignCreationIdentityKey(identity),
        },
      },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => {
      localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
      store.set(tokenPairState.atom, null);
    });
    await act(async () => {
      resolve(0, 'Old private Campaign');
      await expect(oldRead).rejects.toThrow(
        'Campaign show read authority changed',
      );
    });
    expect(JSON.stringify(client.cache.extract())).not.toContain(
      'Old private Campaign',
    );
  });

  it.each(['before', 'after'] as const)(
    'rejects an A response that resolves %s B while B stays readable',
    async (order) => {
      const {
        client,
        pending,
        store,
        Wrapper,
        resolve,
        setTokenWorkspace,
        setToken: updateToken,
      } = makeHarness();
      // Keep A's request alive across the switch, as with another mounted Campaign reader.
      const identity = decodeCampaignCreationIdentity(token('A'))!;
      const oldRead = client.query({
        query: campaignQuery,
        variables: { objectRecordId: recordId },
        fetchPolicy: 'no-cache',
        context: {
          queryDeduplication: false,
          campaignRecordRead: {
            store,
            workspaceId: 'A',
            identityKey: campaignCreationIdentityKey(identity),
          },
        },
      });
      await waitFor(() => expect(pending).toHaveLength(1));
      act(() => {
        store.set(currentWorkspaceState.atom, { id: 'B' } as never);
        updateToken('B');
        store.set(tokenPairState.atom, tokenPair('B') as never);
        setTokenWorkspace('B');
      });
      render(<Read />, { wrapper: Wrapper });
      await waitFor(() => expect(pending).toHaveLength(2));
      const rejectA = async () => {
        await act(async () => {
          resolve(0, 'A private data');
          await expect(oldRead).rejects.toThrow(
            'Campaign show read authority changed',
          );
        });
        expect(JSON.stringify(client.cache.extract())).not.toContain(
          'A private data',
        );
      };
      if (order === 'before') {
        await rejectA();
        expect(screen.getByTestId('read')).toHaveTextContent('unavailable');
      }
      await act(async () => {
        resolve(1, 'B record');
      });
      expect(screen.getByTestId('read')).toHaveTextContent('B record');
      if (order === 'after') await rejectA();
      expect(screen.getByTestId('read')).toHaveTextContent('B record');
    },
  );
});
