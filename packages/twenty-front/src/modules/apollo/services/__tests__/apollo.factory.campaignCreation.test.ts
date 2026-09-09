import { ApolloLink, gql, InMemoryCache } from '@apollo/client';
import { from, switchMap } from 'rxjs';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { addTypenameToDocument } from '@apollo/client/utilities';
import { getOperationAST, Kind, parse, print } from 'graphql';
import { createStore } from 'jotai';
import fetchMock, { enableFetchMocks } from 'jest-fetch-mock';
import { type ObjectPermissions } from 'twenty-shared/types';
import { z } from 'zod';
import { ApolloFactory } from '@/apollo/services/apollo.factory';
import {
  assertCampaignCreationCurrent,
  assertCampaignCreationIdentityCurrent,
  CampaignCreationBoundaryError,
  campaignCreationAttemptKey,
  decodeCampaignCreationIdentity,
  isCampaignCreationRecordNotConfirmed,
} from '@/apollo/utils/campaignCreationOperation';
import { renewToken } from '@/auth/services/AuthService';
import {
  currentWorkspaceState,
  type CurrentWorkspace,
} from '@/auth/states/currentWorkspaceState';
import {
  currentUserState,
  type CurrentUser,
} from '@/auth/states/currentUserState';
import {
  currentWorkspaceMemberState,
  type CurrentWorkspaceMember,
} from '@/auth/states/currentWorkspaceMemberState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import {
  tokenPairState,
  TOKEN_PAIR_LOCAL_STORAGE_KEY,
} from '@/auth/states/tokenPairState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { splitCompositeObjectMetadataItems } from '@/metadata-store/utils/splitCompositeObjectMetadataItems';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { mapObjectMetadataToGraphQLQuery } from '@/object-metadata/utils/mapObjectMetadataToGraphQLQuery';
import { generateCreateOneRecordMutation } from '@/object-metadata/utils/generateCreateOneRecordMutation';
import {
  campaignCreationState,
  subscribeCampaignCreationSession,
} from '@/object-record/record-index/states/campaignCreationState';
import { type CampaignCreationOperationContext } from '@/object-record/record-index/types/CampaignCreationAttempt';
import {
  type AuthTokenPair,
  FieldMetadataType,
  ViewOpenRecordIn,
} from '~/generated-metadata/graphql';
import {
  mockCurrentWorkspace,
  mockedUserData,
  mockedWorkspaceMemberData,
} from '~/testing/mock-data/users';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
jest.mock('@/auth/services/AuthService', () => ({
  ...jest.requireActual('@/auth/services/AuthService'),
  renewToken: jest.fn(),
}));
const mockRenewToken = jest.mocked(renewToken);
const CAMPAIGN_METADATA_ID = '34700000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '34700000-0000-4000-8000-000000000002';
const USER_ID = '34700000-0000-4000-8000-000000000003';
const USER_WORKSPACE_ID = '34700000-0000-4000-8000-000000000004';
const MEMBER_ID = '34700000-0000-4000-8000-000000000005';
const VIEW_ID = '34700000-0000-4000-8000-000000000006';
const INDEX_ID = `campaigns-${VIEW_ID}`;
const RETURN_PATH = `/objects/campaigns?viewId=${VIEW_ID}`;
const standardMetadata = getTestEnrichedObjectMetadataItemsMock();
const company = standardMetadata.find(
  (item) => item.nameSingular === 'company',
);
if (!company) throw new Error('Native Company metadata fixture missing');
const requiredField = (name: string): FieldMetadataItem => {
  const field = company.fields.find((item) => item.name === name);
  if (!field) throw new Error(`Native scalar metadata missing: ${name}`);
  return field;
};
const fieldNames = [
  'id',
  'name',
  'objective',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'position',
];
const fields: FieldMetadataItem[] = fieldNames.map((name, index) => ({
  ...requiredField(name === 'objective' ? 'name' : name),
  id: `34700000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  objectMetadataId: CAMPAIGN_METADATA_ID,
  universalIdentifier: `34700000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
  name,
  label: name === 'objective' ? 'Objective' : requiredField(name).label,
  ...(['name', 'objective'].includes(name)
    ? {
        type: FieldMetadataType.TEXT,
        defaultValue: name === 'name' ? "''" : null,
        isNullable: true,
      }
    : {}),
}));
const campaign: EnrichedObjectMetadataItem = {
  ...company,
  id: CAMPAIGN_METADATA_ID,
  universalIdentifier: '34700000-0000-4000-8000-000000000007',
  nameSingular: 'campaign',
  namePlural: 'campaigns',
  labelSingular: 'Campaign',
  labelPlural: 'Campaigns',
  isUICreatable: true,
  isUIEditable: true,
  isRemote: false,
  fields,
  readableFields: fields,
  updatableFields: fields,
  labelIdentifierFieldMetadataId: fields[1].id,
  imageIdentifierFieldMetadataId: null,
  indexMetadatas: [],
  searchFieldMetadatas: [],
};
const metadata = [...standardMetadata, campaign];
const selectedFields = Object.fromEntries(
  fieldNames.map((name) => [name, true]),
);
const permissions: ObjectPermissions & { objectMetadataId: string } = {
  objectMetadataId: CAMPAIGN_METADATA_ID,
  canReadObjectRecords: true,
  canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true,
  canDestroyObjectRecords: true,
  restrictedFields: {},
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
};
const tokenPair = (identity: Record<string, unknown>): AuthTokenPair => ({
  accessOrWorkspaceAgnosticToken: {
    token: `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(
      JSON.stringify({
        type: 'ACCESS',
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
        workspaceMemberId: MEMBER_ID,
        ...identity,
      }),
    )}.fixture`,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  refreshToken: {
    token: 'synthetic-refresh',
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
});

const mutation = generateCreateOneRecordMutation({
  objectMetadataItem: campaign,
  objectMetadataItems: metadata,
  recordGqlFields: selectedFields,
  objectPermissionsByObjectMetadataId: { [CAMPAIGN_METADATA_ID]: permissions },
});
const input = { id: '34700000-0000-4000-8000-000000000020', position: 'first' };
const originalFetch = globalThis.fetch;
const originalStorage = new Map(
  Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)!]),
);
enableFetchMocks();

const fixture = (
  extraLinks: ApolloLink[] = [],
  identityClaims: Record<string, unknown> = {},
) => {
  const store = createStore();
  const workspace: CurrentWorkspace = {
    ...mockCurrentWorkspace,
    id: WORKSPACE_ID,
  };
  const user: CurrentUser = { ...mockedUserData, id: USER_ID };
  const member: CurrentWorkspaceMember = {
    ...mockedWorkspaceMemberData,
    id: MEMBER_ID,
    userWorkspaceId: USER_WORKSPACE_ID,
  };
  const workspaceMemberMetadata = standardMetadata.find(
    (item) => item.nameSingular === 'workspaceMember',
  );
  if (!workspaceMemberMetadata)
    throw new Error('Native WorkspaceMember metadata missing');
  store.set(currentWorkspaceState.atom, workspace);
  store.set(currentUserState.atom, user);
  store.set(currentWorkspaceMemberState.atom, member);
  store.set(currentUserWorkspaceState.atom, {
    ...mockedUserData.currentUserWorkspace,
    objectsPermissions: [
      permissions,
      {
        ...permissions,
        objectMetadataId: workspaceMemberMetadata.id,
        canReadObjectRecords: false,
      },
    ],
  });
  const tokens = tokenPair(identityClaims);
  store.set(tokenPairState.atom, tokens);
  localStorage.setItem(TOKEN_PAIR_LOCAL_STORAGE_KEY, JSON.stringify(tokens));

  const { flatObjects, flatFields, flatIndexes } =
    splitCompositeObjectMetadataItems(metadata);
  store.set(metadataStoreState.atomFamily('objectMetadataItems'), {
    current: flatObjects,
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('fieldMetadataItems'), {
    current: flatFields,
    draft: [],
    status: 'up-to-date',
  });
  store.set(metadataStoreState.atomFamily('indexMetadataItems'), {
    current: flatIndexes,
    draft: [],
    status: 'up-to-date',
  });
  const unsubscribe = subscribeCampaignCreationSession(store);
  const identity = decodeCampaignCreationIdentity(
    tokens.accessOrWorkspaceAgnosticToken.token,
  );
  if (!identity) throw new Error('Expected synthetic native identity');
  const attemptKey = campaignCreationAttemptKey(identity);
  const state = store.get(campaignCreationState.atom);
  store.set(campaignCreationState.atom, {
    ...state,
    nextRunId: 1,
    attempts: {
      [attemptKey]: {
        identity,
        recordId: input.id,
        objectMetadataId: campaign.id,
        inputJson: JSON.stringify(input),
        origin: {
          recordIndexId: INDEX_ID,
          contextStoreInstanceId: 'main',
          returnPath: RETURN_PATH,
          openRecordIn: ViewOpenRecordIn.RECORD_PAGE,
          shouldCloseAfterCreation: false,
          position: 'first',
        },
        phase: 'creating',
        runId: 1,
        uncertain: false,
        completionAttempted: false,
        warnings: [],
      },
    },
  });
  const context: CampaignCreationOperationContext = {
    store,
    identity,
    attemptKey,
    runId: 1,
    sessionGeneration: state.sessionGeneration,
    boundaryGeneration: state.boundaryGeneration,
    objectMetadataId: campaign.id,
    kind: 'create',
    transport: { dispatched: false, uncertain: false },
    invalidated: false,
  };
  assertCampaignCreationCurrent(context);
  const callbacks = {
    onPayloadTooLarge: jest.fn(),
    onNetworkError: jest.fn(),
    onError: jest.fn(),
    onUnauthenticatedError: jest.fn(),
  };
  const onTokenPairChange = jest.fn((newTokens: AuthTokenPair) => {
    localStorage.setItem(
      TOKEN_PAIR_LOCAL_STORAGE_KEY,
      JSON.stringify(newTokens),
    );
    store.set(tokenPairState.atom, newTokens);
  });
  const authForward = jest.fn();
  const client = new ApolloFactory({
    uri: 'http://localhost/graphql',
    cache: new InMemoryCache(),
    currentWorkspace: workspace,
    currentWorkspaceMember: member,
    ...callbacks,
    extraLinks: [
      new ApolloLink((operation, forward) => {
        authForward();
        return forward(operation);
      }),
      ...extraLinks,
    ],
    onTokenPairChange,
  }).getClient();
  const transition = (boundary: 'workspace-switch' | 'logout-new-actor') => {
    const previous = store.get(currentUserWorkspaceState.atom);
    if (!previous) throw new Error('Expected active identity');
    if (boundary === 'logout-new-actor') {
      localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
      store.set(tokenPairState.atom, null);
      store.set(currentUserState.atom, null);
      store.set(currentWorkspaceMemberState.atom, null);
      store.set(currentWorkspaceState.atom, null);
      store.set(currentUserWorkspaceState.atom, null);
    }
    const next = {
      workspaceId: '34700000-0000-4000-8000-000000000012',
      userId:
        boundary === 'logout-new-actor'
          ? '34700000-0000-4000-8000-000000000013'
          : USER_ID,
      userWorkspaceId: '34700000-0000-4000-8000-000000000014',
      workspaceMemberId: '34700000-0000-4000-8000-000000000015',
    };
    const nextTokens = tokenPair(next);
    localStorage.setItem(
      TOKEN_PAIR_LOCAL_STORAGE_KEY,
      JSON.stringify(nextTokens),
    );
    store.set(tokenPairState.atom, nextTokens);
    store.set(currentWorkspaceState.atom, {
      ...workspace,
      id: next.workspaceId,
    });
    store.set(currentUserState.atom, { ...user, id: next.userId });
    store.set(currentWorkspaceMemberState.atom, {
      ...member,
      id: next.workspaceMemberId,
      userWorkspaceId: next.userWorkspaceId,
    });
    store.set(currentUserWorkspaceState.atom, { ...previous });
  };
  const dispose = () => {
    client.stop();
    unsubscribe();
  };
  return {
    context,
    client,
    callbacks,
    authForward,
    onTokenPairChange,
    transition,
    dispose,
  };
};

const parseRequest = async (request: Request) => {
  expect(request.url).toBe('http://localhost/graphql');
  expect(request.method).toBe('POST');
  const envelope = z
    .object({
      operationName: z.literal('CreateOneCampaign'),
      query: z.string(),
      variables: z
        .object({
          input: z
            .object({ id: z.literal(input.id), position: z.literal('first') })
            .strict(),
        })
        .strict(),
      extensions: z.unknown().optional(),
    })
    .strict()
    .parse(JSON.parse(await request.text()));
  const document = parse(envelope.query);
  expect(print(document)).toBe(print(addTypenameToDocument(mutation)));
  const operation = getOperationAST(document);
  expect(operation?.operation).toBe('mutation');
  expect(operation?.selectionSet.selections[0].kind).toBe(Kind.FIELD);
};
beforeEach(() => {
  enableFetchMocks();
  fetchMock.resetMocks();
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  fetchMock.resetMocks();
  globalThis.fetch = originalFetch;
  localStorage.clear();
  originalStorage.forEach((value, key) => localStorage.setItem(key, value));
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe.each(['workspace-switch', 'logout-new-actor'] as const)(
  '%s',
  (boundary) => {
    describe('deferred error', () => {
      it.each([
        'http413',
        'http503',
        'transport-type-error',
        'terminal-error',
      ] as const)(
        'blocks late %s before callbacks and uncertainty',
        async (lateError) => {
          const f = fixture();
          let releaseGate!: () => void;
          const gatePromise = new Promise<void>((resolve) => {
            releaseGate = resolve;
          });
          let markDispatched!: () => void;
          const dispatchedPromise = new Promise<void>((resolve) => {
            markDispatched = resolve;
          });
          let calls = 0;
          fetchMock.mockResponse(async (request) => {
            calls += 1;
            await parseRequest(request);
            markDispatched();
            await gatePromise;
            if (lateError === 'transport-type-error')
              throw new TypeError('Synthetic late delivery loss');
            if (lateError === 'terminal-error')
              throw new Error('Synthetic terminal error');
            return {
              status: lateError === 'http413' ? 413 : 503,
              body: 'Synthetic HTTP error',
              headers: { 'Content-Type': 'text/plain' },
            };
          });
          try {
            const promise = f.client.mutate({
              mutation,
              variables: { input },
              fetchPolicy: 'no-cache',
              errorPolicy: 'none',
              context: {
                campaignCreation: f.context,
                queryDeduplication: false,
              },
            });
            const rejected = expect(promise).rejects.toBeInstanceOf(
              CampaignCreationBoundaryError,
            );
            await dispatchedPromise;
            f.transition(boundary);
            releaseGate();
            await jest.advanceTimersByTimeAsync(7000);
            await rejected;
            expect(calls).toBe(1);
            expect(f.authForward).toHaveBeenCalledTimes(1);
            expect(f.context.transport).toEqual({
              dispatched: true,
              uncertain: false,
            });
            Object.values(f.callbacks).forEach((callback) =>
              expect(callback).not.toHaveBeenCalled(),
            );
            expect(mockRenewToken).not.toHaveBeenCalled();
          } finally {
            releaseGate();
            f.dispose();
          }
        },
      );
    });
    describe('awaited false', () => {
      it('rechecks the Campaign identity at native ErrorLink callback entry', async () => {
        const f = fixture();
        let releaseGate!: () => void;
        const gatePromise = new Promise<void>((resolve) => {
          releaseGate = resolve;
        });
        let markDispatched!: () => void;
        const dispatchedPromise = new Promise<void>((resolve) => {
          markDispatched = resolve;
        });
        let calls = 0;
        let diagnosticCount = 0;
        let boundaryWasCurrent = false;
        let transitionRan = false;
        let scheduledTransition: Promise<void> | undefined;
        const diagnosticSpy = jest
          .spyOn(console, 'log')
          .mockImplementation((...args: unknown[]) => {
            if (
              args[0] !== 'retryIf error from retryLink' ||
              !ServerError.is(args[1]) ||
              args[1].statusCode !== 413
            )
              return;
            diagnosticCount += 1;
            assertCampaignCreationCurrent(f.context);
            boundaryWasCurrent = true;
            scheduledTransition = Promise.resolve().then(() => {
              f.transition(boundary);
              transitionRan = true;
            });
          });
        fetchMock.mockResponse(async (request) => {
          calls += 1;
          await parseRequest(request);
          markDispatched();
          await gatePromise;
          return {
            status: 413,
            body: 'Synthetic HTTP error',
            headers: { 'Content-Type': 'text/plain' },
          };
        });
        try {
          const promise = f.client.mutate({
            mutation,
            variables: { input },
            fetchPolicy: 'no-cache',
            errorPolicy: 'none',
            context: { campaignCreation: f.context, queryDeduplication: false },
          });
          const rejected = expect(promise).rejects.toBeInstanceOf(
            CampaignCreationBoundaryError,
          );
          await dispatchedPromise;
          assertCampaignCreationCurrent(f.context);
          releaseGate();
          await rejected;
          await scheduledTransition;
          expect(diagnosticCount).toBe(1);
          expect(boundaryWasCurrent).toBe(true);
          expect(transitionRan).toBe(true);
          expect(() => assertCampaignCreationCurrent(f.context)).toThrow(
            CampaignCreationBoundaryError,
          );
          expect(calls).toBe(1);
          expect(f.authForward).toHaveBeenCalledTimes(1);
          expect(f.context.transport.uncertain).toBe(false);
          Object.values(f.callbacks).forEach((callback) =>
            expect(callback).not.toHaveBeenCalled(),
          );
          expect(mockRenewToken).not.toHaveBeenCalled();
        } finally {
          releaseGate();
          diagnosticSpy.mockRestore();
          f.dispose();
        }
      });
    });
  },
);

it.each([true, false])(
  'preserves current-identity HTTP413 callbacks, Campaign opt-in=%s',
  async (optedIn) => {
    const f = fixture();
    let calls = 0;
    fetchMock.mockResponse(async (request) => {
      calls += 1;
      await parseRequest(request);
      return {
        status: 413,
        body: 'Synthetic HTTP error',
        headers: { 'Content-Type': 'text/plain' },
      };
    });
    try {
      await expect(
        f.client.mutate({
          mutation,
          variables: { input },
          fetchPolicy: 'no-cache',
          context: optedIn ? { campaignCreation: f.context } : {},
        }),
      ).rejects.toMatchObject({ statusCode: 413 });
      expect(calls).toBe(1);
      expect(f.authForward).toHaveBeenCalledTimes(1);
      expect(f.callbacks.onPayloadTooLarge).toHaveBeenCalledTimes(1);
      expect(f.callbacks.onNetworkError).not.toHaveBeenCalled();
      expect(mockRenewToken).not.toHaveBeenCalled();
      expect(f.context.transport.uncertain).toBe(false);
    } finally {
      f.dispose();
    }
  },
);

it.each([
  ['http401', 401, 1, false],
  ['http403', 403, 2, false],
  ['http503', 503, 2, true],
  ['type-error', 0, 2, true],
  ['terminal-error', 0, 2, false],
] as const)(
  'preserves current-identity native retry/callback counts for %s',
  async (kind, status, expectedCalls, uncertain) => {
    const f = fixture();
    let calls = 0;
    const failure =
      kind === 'type-error'
        ? new TypeError('Synthetic current-session loss')
        : new Error('Synthetic terminal transport error');
    fetchMock.mockResponse(async (request) => {
      calls += 1;
      await parseRequest(request);
      if (!status) throw failure;
      return {
        status,
        body: 'Synthetic current HTTP error',
        headers: { 'Content-Type': 'text/plain' },
      };
    });
    try {
      const promise = f.client.mutate({
        mutation,
        variables: { input },
        fetchPolicy: 'no-cache',
        context: { campaignCreation: f.context },
      });
      const rejected = status
        ? expect(promise).rejects.toMatchObject({ statusCode: status })
        : expect(promise).rejects.toBe(failure);
      await jest.advanceTimersByTimeAsync(7000);
      await rejected;
      expect(calls).toBe(expectedCalls);
      expect(f.authForward).toHaveBeenCalledTimes(1);
      expect(mockRenewToken).not.toHaveBeenCalled();
      expect(f.callbacks.onNetworkError).toHaveBeenCalledTimes(1);
      expect(f.callbacks.onPayloadTooLarge).not.toHaveBeenCalled();
      expect(f.context.transport).toEqual({ dispatched: true, uncertain });
    } finally {
      f.dispose();
    }
  },
);

it('records create uncertainty from native transport retry without re-entering auth', async () => {
  const f = fixture();
  let calls = 0;
  fetchMock.mockResponse(async (request) => {
    calls += 1;
    await parseRequest(request);
    if (calls === 1) throw new TypeError('Synthetic first delivery loss');
    return JSON.stringify({
      data: { createCampaign: { __typename: 'Campaign', id: input.id } },
    });
  });
  try {
    const promise = f.client.mutate({
      mutation,
      variables: { input },
      fetchPolicy: 'no-cache',
      context: { campaignCreation: f.context },
    });
    const resolved = expect(promise).resolves.toMatchObject({
      data: { createCampaign: { id: input.id } },
    });
    await jest.advanceTimersByTimeAsync(7000);
    await resolved;
    expect(calls).toBe(2);
    expect(f.authForward).toHaveBeenCalledTimes(1);
    expect(mockRenewToken).not.toHaveBeenCalled();
    expect(f.context.transport.uncertain).toBe(true);
    Object.values(f.callbacks).forEach((callback) =>
      expect(callback).not.toHaveBeenCalled(),
    );
  } finally {
    f.dispose();
  }
});

it.each(['UNAUTHENTICATED', 'Unauthorized'] as const)(
  'keeps native same-identity %s renewal and authenticated re-forward',
  async (authError) => {
    const f = fixture();
    const renewed = tokenPair({ exp: 9999999999 });
    mockRenewToken.mockResolvedValueOnce(renewed);
    let calls = 0;
    fetchMock.mockResponse(async (request) => {
      calls += 1;
      await parseRequest(request);
      if (calls === 1)
        return JSON.stringify({
          errors: [
            {
              message: authError,
              extensions: {
                code:
                  authError === 'UNAUTHENTICATED'
                    ? 'UNAUTHENTICATED'
                    : 'BAD_USER_INPUT',
              },
            },
          ],
        });
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${renewed.accessOrWorkspaceAgnosticToken.token}`,
      );
      return JSON.stringify({
        data: { createCampaign: { __typename: 'Campaign', id: input.id } },
      });
    });
    try {
      const generation = f.context.store.get(
        campaignCreationState.atom,
      ).sessionGeneration;
      await expect(
        f.client.mutate({
          mutation,
          variables: { input },
          fetchPolicy: 'no-cache',
          context: { campaignCreation: f.context },
        }),
      ).resolves.toMatchObject({ data: { createCampaign: { id: input.id } } });
      expect(calls).toBe(2);
      expect(f.authForward).toHaveBeenCalledTimes(2);
      expect(mockRenewToken).toHaveBeenCalledTimes(1);
      expect(f.onTokenPairChange).toHaveBeenCalledTimes(1);
      expect(f.callbacks.onUnauthenticatedError).not.toHaveBeenCalled();
      expect(f.context.transport.uncertain).toBe(false);
      expect(
        f.context.store.get(campaignCreationState.atom).sessionGeneration,
      ).toBe(generation);
    } finally {
      f.dispose();
    }
  },
);

it.each(['object', 'id', 'deletedAt'] as const)(
  'identity preflight never authorizes a full operation with %s confirmation denied',
  (denied) => {
    const f = fixture();
    const store = f.context.store;
    try {
      const current = store.get(currentUserWorkspaceState.atom);
      if (!current) throw new Error('Expected native permissions');
      store.set(currentUserWorkspaceState.atom, {
        ...current,
        objectsPermissions: current.objectsPermissions.map((item) => {
          if (item.objectMetadataId !== campaign.id) return item;
          if (denied === 'object')
            return { ...item, canReadObjectRecords: false };
          const field = campaign.fields.find((field) => field.name === denied);
          if (!field) throw new Error('Expected required metadata');
          return {
            ...item,
            restrictedFields: {
              ...item.restrictedFields,
              [field.id]: { canRead: false },
            },
          };
        }),
      });
      const state = store.get(campaignCreationState.atom);
      const attempt = state.attempts[f.context.attemptKey];
      const runId = state.nextRunId + 1;
      store.set(campaignCreationState.atom, {
        ...state,
        nextRunId: runId,
        attempts: {
          ...state.attempts,
          [f.context.attemptKey]: { ...attempt, runId },
        },
      });
      const context: CampaignCreationOperationContext = {
        ...f.context,
        runId,
        boundaryGeneration: state.boundaryGeneration,
        kind: 'read',
        invalidated: false,
      };
      expect(() =>
        assertCampaignCreationIdentityCurrent(context),
      ).not.toThrow();
      expect(() => assertCampaignCreationCurrent(context)).toThrow(
        CampaignCreationBoundaryError,
      );
      expect(context.invalidated).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(() => assertCampaignCreationIdentityCurrent(f.context)).toThrow(
        CampaignCreationBoundaryError,
      );
    } finally {
      f.dispose();
    }
  },
);

it('checks actual storage again after async native auth but before transport', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const afterAuth = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const f = fixture([
    new ApolloLink((operation, forward) => {
      entered();
      return from(gate).pipe(switchMap(() => forward(operation)));
    }),
  ]);
  try {
    const promise = f.client.mutate({
      mutation,
      variables: { input },
      fetchPolicy: 'no-cache',
      context: { campaignCreation: f.context },
    });
    const rejected = expect(promise).rejects.toBeInstanceOf(
      CampaignCreationBoundaryError,
    );
    await afterAuth;
    localStorage.setItem(
      TOKEN_PAIR_LOCAL_STORAGE_KEY,
      JSON.stringify(tokenPair({ workspaceId: 'different-workspace' })),
    );
    release();
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(f.authForward).toHaveBeenCalledTimes(1);
    expect(f.context.transport).toEqual({
      dispatched: false,
      uncertain: false,
    });
    Object.values(f.callbacks).forEach((callback) =>
      expect(callback).not.toHaveBeenCalled(),
    );
    expect(mockRenewToken).not.toHaveBeenCalled();
  } finally {
    release();
    f.dispose();
  }
});

it('blocks a stale native retry even though retries do not re-enter auth', async () => {
  const f = fixture();
  let calls = 0;
  let dispatched!: () => void;
  const firstDispatch = new Promise<void>((resolve) => {
    dispatched = resolve;
  });
  fetchMock.mockResponse(async (request) => {
    calls += 1;
    await parseRequest(request);
    dispatched();
    throw new TypeError('Synthetic retry loss');
  });
  try {
    const promise = f.client.mutate({
      mutation,
      variables: { input },
      fetchPolicy: 'no-cache',
      context: { campaignCreation: f.context },
    });
    const rejected = expect(promise).rejects.toBeInstanceOf(
      CampaignCreationBoundaryError,
    );
    await firstDispatch;
    await jest.advanceTimersByTimeAsync(0);
    localStorage.setItem(
      TOKEN_PAIR_LOCAL_STORAGE_KEY,
      JSON.stringify(tokenPair({ workspaceId: 'different-workspace' })),
    );
    await jest.advanceTimersByTimeAsync(7000);
    await rejected;
    expect(calls).toBe(1);
    expect(f.authForward).toHaveBeenCalledTimes(1);
    expect(f.context.transport).toEqual({ dispatched: true, uncertain: true });
    Object.values(f.callbacks).forEach((callback) =>
      expect(callback).not.toHaveBeenCalled(),
    );
    expect(mockRenewToken).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it('rejects inbound success after a native workspace ABA transition before normalization', async () => {
  const f = fixture();
  const store = f.context.store;
  const original = {
    workspace: store.get(currentWorkspaceState.atom),
    member: store.get(currentWorkspaceMemberState.atom),
    user: store.get(currentUserState.atom),
    permissions: store.get(currentUserWorkspaceState.atom),
    tokens: store.get(tokenPairState.atom),
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markDispatched!: () => void;
  const dispatched = new Promise<void>((resolve) => {
    markDispatched = resolve;
  });
  let calls = 0;
  fetchMock.mockResponse(async (request) => {
    calls += 1;
    await parseRequest(request);
    markDispatched();
    await gate;
    return JSON.stringify({
      data: { createCampaign: { __typename: 'Campaign', id: input.id } },
    });
  });
  try {
    const promise = f.client.mutate({
      mutation,
      variables: { input },
      context: { campaignCreation: f.context },
    });
    const rejected = expect(promise).rejects.toBeInstanceOf(
      CampaignCreationBoundaryError,
    );
    await dispatched;
    f.transition('workspace-switch');
    localStorage.setItem(
      TOKEN_PAIR_LOCAL_STORAGE_KEY,
      JSON.stringify(original.tokens),
    );
    store.set(tokenPairState.atom, original.tokens);
    store.set(currentWorkspaceState.atom, original.workspace);
    store.set(currentWorkspaceMemberState.atom, original.member);
    store.set(currentUserState.atom, original.user);
    store.set(currentUserWorkspaceState.atom, original.permissions);
    release();
    await rejected;
    expect(calls).toBe(1);
    expect(f.client.cache.extract()).not.toHaveProperty(`Campaign:${input.id}`);
    expect(f.context.transport.uncertain).toBe(false);
    Object.values(f.callbacks).forEach((callback) =>
      expect(callback).not.toHaveBeenCalled(),
    );
  } finally {
    release();
    f.dispose();
  }
});

it.each(['graphql-failure', 'transport-backoffs', 'repeated-auth'] as const)(
  'unconditionally bounds native renewal %s',
  async (outcome) => {
    const f = fixture();
    const authErrors = [
      { message: 'UNAUTHENTICATED', extensions: { code: 'UNAUTHENTICATED' } },
    ];
    const renewed = tokenPair({ exp: 9999999999 });
    if (outcome === 'graphql-failure')
      mockRenewToken.mockRejectedValueOnce(
        new CombinedGraphQLErrors({ errors: authErrors }),
      );
    else if (outcome === 'transport-backoffs') {
      for (let attempt = 0; attempt < 4; attempt += 1)
        mockRenewToken.mockRejectedValueOnce(new TypeError('Renewal offline'));
    } else mockRenewToken.mockResolvedValueOnce(renewed);
    let tokenChanges = 0;
    const unsubscribe = f.context.store.sub(tokenPairState.atom, () => {
      tokenChanges += 1;
    });
    let calls = 0;
    fetchMock.mockResponse(async (request) => {
      calls += 1;
      await parseRequest(request);
      return JSON.stringify({ errors: authErrors });
    });
    try {
      const rejected = expect(
        f.client.mutate({
          mutation,
          variables: { input },
          fetchPolicy: 'no-cache',
          context: { campaignCreation: f.context },
        }),
      ).rejects.toMatchObject({ errors: authErrors });
      await jest.advanceTimersByTimeAsync(0);
      expect(mockRenewToken).toHaveBeenCalledTimes(1);
      if (outcome === 'transport-backoffs') {
        for (const [delay, count] of [
          [1000, 2],
          [2000, 3],
          [3000, 4],
        ]) {
          await jest.advanceTimersByTimeAsync(delay - 1);
          expect(mockRenewToken).toHaveBeenCalledTimes(count - 1);
          await jest.advanceTimersByTimeAsync(1);
          expect(mockRenewToken).toHaveBeenCalledTimes(count);
        }
      }
      await rejected;
      await jest.advanceTimersByTimeAsync(7000);
      expect(calls).toBe(outcome === 'repeated-auth' ? 2 : 1);
      expect(f.authForward).toHaveBeenCalledTimes(calls);
      expect(mockRenewToken).toHaveBeenCalledTimes(
        outcome === 'transport-backoffs' ? 4 : 1,
      );
      expect(tokenChanges).toBe(outcome === 'repeated-auth' ? 1 : 0);
      expect(f.onTokenPairChange).toHaveBeenCalledTimes(
        outcome === 'repeated-auth' ? 1 : 0,
      );
      expect(f.callbacks.onUnauthenticatedError).toHaveBeenCalledTimes(
        outcome === 'repeated-auth' ? 0 : 1,
      );
      expect(f.context.transport.uncertain).toBe(false);
    } finally {
      unsubscribe();
      f.dispose();
    }
  },
);

it.each([
  { userId: 'other-actor' },
  {
    isImpersonating: true,
    impersonatorUserWorkspaceId: 'other-impersonator',
    impersonatedUserWorkspaceId: USER_WORKSPACE_ID,
  },
  { type: 'WORKSPACE_AGNOSTIC' },
])(
  'rejects a changed actual token identity before auth forwarding %j',
  async (identity) => {
    const f = fixture();
    try {
      localStorage.setItem(
        TOKEN_PAIR_LOCAL_STORAGE_KEY,
        JSON.stringify(tokenPair(identity)),
      );
      await expect(
        f.client.mutate({
          mutation,
          variables: { input },
          fetchPolicy: 'no-cache',
          context: { campaignCreation: f.context },
        }),
      ).rejects.toBeInstanceOf(CampaignCreationBoundaryError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(f.authForward).not.toHaveBeenCalled();
      expect(mockRenewToken).not.toHaveBeenCalled();
      expect(f.context.transport).toEqual({
        dispatched: false,
        uncertain: false,
      });
    } finally {
      f.dispose();
    }
  },
);

it('keeps concurrent unrelated native retry provenance out of a fresh Campaign duplicate', async () => {
  const f = fixture();
  const unrelated = gql`
    query UnrelatedCampaignProbe {
      companies {
        totalCount
      }
    }
  `;
  let unrelatedCalls = 0;
  let campaignCalls = 0;
  fetchMock.mockResponse(async (request) => {
    const envelope = z
      .object({
        operationName: z.string(),
        query: z.string(),
        variables: z.record(z.string(), z.unknown()),
        extensions: z.unknown().optional(),
      })
      .strict()
      .parse(JSON.parse(await request.clone().text()));
    if (envelope.operationName === 'UnrelatedCampaignProbe') {
      expect(print(parse(envelope.query))).toBe(
        print(addTypenameToDocument(unrelated)),
      );
      expect(envelope.variables).toEqual({});
      unrelatedCalls += 1;
      if (unrelatedCalls === 1)
        throw new TypeError('Unrelated dispatched loss');
      return JSON.stringify({
        data: { companies: { __typename: 'CompanyConnection', totalCount: 1 } },
      });
    }
    await parseRequest(request);
    campaignCalls += 1;
    return JSON.stringify({
      errors: [
        {
          message: 'A duplicate entry was detected',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    });
  });
  try {
    const query = expect(
      f.client.query({ query: unrelated, fetchPolicy: 'no-cache' }),
    ).resolves.toMatchObject({ data: { companies: { totalCount: 1 } } });
    const create = expect(
      f.client.mutate({
        mutation,
        variables: { input },
        fetchPolicy: 'no-cache',
        context: { campaignCreation: f.context },
      }),
    ).rejects.toBeInstanceOf(CombinedGraphQLErrors);
    await jest.advanceTimersByTimeAsync(7000);
    await Promise.all([query, create]);
    expect(unrelatedCalls).toBe(2);
    expect(campaignCalls).toBe(1);
    expect(f.authForward).toHaveBeenCalledTimes(2);
    expect(f.context.transport).toEqual({ dispatched: true, uncertain: false });
    expect(
      f.context.store.get(campaignCreationState.atom).attempts[
        f.context.attemptKey
      ].uncertain,
    ).toBe(false);
    expect(mockRenewToken).not.toHaveBeenCalled();
  } finally {
    f.dispose();
  }
});

it.each([
  { impersonatorUserWorkspaceId: 'different-impersonator' },
  { impersonatedUserWorkspaceId: 'different-impersonated-membership' },
  { isImpersonating: false },
])(
  'invalidates a live impersonated Campaign operation on changed provenance %j',
  async (changed) => {
    const original = {
      isImpersonating: true,
      impersonatorUserWorkspaceId: 'original-impersonator',
      impersonatedUserWorkspaceId: USER_WORKSPACE_ID,
    };
    const f = fixture([], original);
    try {
      localStorage.setItem(
        TOKEN_PAIR_LOCAL_STORAGE_KEY,
        JSON.stringify(tokenPair({ ...original, ...changed })),
      );
      await expect(
        f.client.mutate({
          mutation,
          variables: { input },
          fetchPolicy: 'no-cache',
          context: { campaignCreation: f.context },
        }),
      ).rejects.toBeInstanceOf(CampaignCreationBoundaryError);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(f.authForward).not.toHaveBeenCalled();
      expect(mockRenewToken).not.toHaveBeenCalled();
      expect(f.context.invalidated).toBe(true);
    } finally {
      f.dispose();
    }
  },
);

it.each(['abort', 'parse', 'http503'] as const)(
  'records only dispatched %s transport uncertainty with native max two forwards',
  async (failure) => {
    const f = fixture();
    let calls = 0;
    fetchMock.mockResponse(async (request) => {
      calls += 1;
      await parseRequest(request);
      if (calls === 1) {
        if (failure === 'abort') {
          const error = new Error('Dispatched abort');
          error.name = 'AbortError';
          throw error;
        }
        if (failure === 'parse')
          return {
            body: '{invalid-json',
            headers: { 'Content-Type': 'application/json' },
          };
        return { status: 503, body: 'Synthetic unavailable' };
      }
      return JSON.stringify({
        data: { createCampaign: { __typename: 'Campaign', id: input.id } },
      });
    });
    try {
      const resolved = expect(
        f.client.mutate({
          mutation,
          variables: { input },
          fetchPolicy: 'no-cache',
          context: { campaignCreation: f.context },
        }),
      ).resolves.toMatchObject({ data: { createCampaign: { id: input.id } } });
      await jest.advanceTimersByTimeAsync(7000);
      await resolved;
      expect(calls).toBe(2);
      expect(f.authForward).toHaveBeenCalledTimes(1);
      expect(mockRenewToken).not.toHaveBeenCalled();
      expect(f.context.transport).toEqual({
        dispatched: true,
        uncertain: true,
      });
      await jest.advanceTimersByTimeAsync(7000);
      expect(calls).toBe(2);
    } finally {
      f.dispose();
    }
  },
);

describe('native Campaign not-confirmation', () => {
  const missingError = {
    message: 'Record not found',
    extensions: { code: 'NOT_FOUND', subCode: 'RECORD_NOT_FOUND' },
  };
  it.each([undefined, ['campaign']])(
    'retains strict native error.data with path %p through the real factory',
    async (path) => {
      const f = fixture();
      // Same native selection builder and exact-ID query as useFindOneRecordQuery.
      const query = gql`query FindOneCampaign($objectRecordId: UUID!) {
      campaign(filter: {id: {eq: $objectRecordId}}) ${mapObjectMetadataToGraphQLQuery(
        {
          objectMetadataItem: campaign,
          objectMetadataItems: metadata,
          recordGqlFields: selectedFields,
          objectPermissionsByObjectMetadataId: { [campaign.id]: permissions },
        },
      )}
    }`;
      const envelope = {
        data: { campaign: null },
        errors: [{ ...missingError, ...(path ? { path } : {}) }],
      };
      fetchMock.mockResponse(async (request) => {
        const body = JSON.parse(await request.text());
        expect(body.operationName).toBe('FindOneCampaign');
        expect(print(parse(body.query))).toBe(
          print(addTypenameToDocument(query)),
        );
        expect(body.variables).toEqual({ objectRecordId: input.id });
        return JSON.stringify(envelope);
      });
      try {
        const promise = f.client.query({
          query,
          variables: { objectRecordId: input.id },
          fetchPolicy: 'no-cache',
          errorPolicy: 'none',
          context: {
            campaignCreation: { ...f.context, kind: 'read' },
            queryDeduplication: false,
          },
        });
        const rejected = promise.then(
          () => {
            throw new Error('Expected native rejection');
          },
          (error: unknown) => error,
        );
        const error = await rejected;
        expect(CombinedGraphQLErrors.is(error)).toBe(true);
        expect(error).toMatchObject({ data: { campaign: null } });
        expect(isCampaignCreationRecordNotConfirmed(error)).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(f.client.cache.extract()).not.toHaveProperty(
          `Campaign:${input.id}`,
        );
      } finally {
        f.dispose();
      }
    },
  );

  it.each([
    [
      'code only',
      {
        errors: [
          { message: 'Record not found', extensions: { code: 'NOT_FOUND' } },
        ],
        data: { campaign: null },
      },
    ],
    [
      'wrong subCode',
      {
        errors: [
          {
            ...missingError,
            extensions: { code: 'NOT_FOUND', subCode: 'OTHER' },
          },
        ],
        data: { campaign: null },
      },
    ],
    [
      'wrong message',
      {
        errors: [{ ...missingError, message: 'Other missing record' }],
        data: { campaign: null },
      },
    ],
    ['missing data', { errors: [missingError] }],
    ['missing root', { errors: [missingError], data: {} }],
    ['other root', { errors: [missingError], data: { person: null } }],
    [
      'extra root',
      { errors: [missingError], data: { campaign: null, person: null } },
    ],
    [
      'inherited root',
      { errors: [missingError], data: Object.create({ campaign: null }) },
    ],
    ['array data', { errors: [missingError], data: [] }],
    [
      'wrong path',
      {
        errors: [{ ...missingError, path: ['person'] }],
        data: { campaign: null },
      },
    ],
    [
      'nested path',
      {
        errors: [{ ...missingError, path: ['campaign', 'owner'] }],
        data: { campaign: null },
      },
    ],
    [
      'null path',
      { errors: [{ ...missingError, path: null }], data: { campaign: null } },
    ],
    [
      'multiple duplicate',
      {
        errors: [
          missingError,
          {
            message: 'A duplicate entry was detected',
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
        data: { campaign: null },
      },
    ],
    [
      'multiple forbidden',
      {
        errors: [
          missingError,
          { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
        ],
        data: { campaign: null },
      },
    ],
    [
      'null forbidden',
      {
        errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
        data: { campaign: null },
      },
    ],
    [
      'partial nonnull',
      { errors: [missingError], data: { campaign: { id: input.id } } },
    ],
    ['error-free null', { errors: [], data: { campaign: null } }],
  ])('rejects %s as a non-confirmation classifier permit', (_, envelope) => {
    // Malformed wire shapes intentionally enter the unknown boundary, not typed production data.
    const error = new CombinedGraphQLErrors(
      envelope as ConstructorParameters<typeof CombinedGraphQLErrors>[0],
    );
    expect(isCampaignCreationRecordNotConfirmed(error)).toBe(false);
  });
  it.each([
    {},
    new Error('Record not found'),
    { statusCode: 404 },
    { data: { campaign: null }, errors: [missingError] },
  ])('rejects arbitrary thrown %p', (error) => {
    expect(isCampaignCreationRecordNotConfirmed(error)).toBe(false);
  });

  it.each(['campaign', 'person'])(
    'leaves non-opted %s strict native missing reads rejected',
    async (name) => {
      const f = fixture();
      const query = gql`query NativeMissingControl($objectRecordId: UUID!) { ${name}(filter: { id: { eq: $objectRecordId } }) { id } }`;
      fetchMock.mockResponse(
        JSON.stringify({ data: { [name]: null }, errors: [missingError] }),
      );
      try {
        await expect(
          f.client.query({
            query,
            variables: { objectRecordId: input.id },
            fetchPolicy: 'no-cache',
            errorPolicy: 'none',
          }),
        ).rejects.toBeInstanceOf(CombinedGraphQLErrors);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(f.client.cache.extract()).toEqual({});
      } finally {
        f.dispose();
      }
    },
  );
});
