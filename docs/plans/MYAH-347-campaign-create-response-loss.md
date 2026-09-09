# MYAH-347 Campaign create response-loss implementation plan

> **For the later authorized sequential writer:** use Superpowers executing-plans and test-driven-development task by task. Parent owns delegation/review. No commits/staging. **Revision 4 is docs-only: targeted ErrorLink entry check and awaited-false regression, pending independent delta audit, not authorization to execute.**

**Goal:** Recover the exact saved Campaign after response delivery loss; retain actionable same-ID user retry without false success or stale authorization.

**Architecture:** Campaign-gated branch in native index/create hooks; one nonpersistent Jotai state owns identity/origin and unresolved work. Native Apollo mutation/query/RetryLink remain; an operation-local guard below RetryLink checks actual identity outbound and inbound. Campaign insertion is deferred until verified persistence, then native fragment/list/store/count/event/navigation primitives complete once. No generic callback/replay engine.

**Tech stack:** supplied Node v24.16.0, worktree-owned Yarn4 4.13.0 dependencies, React/Jotai, Apollo4/RxJS, native generated metadata GraphQL, Jest/testing-library, Nx/Oxlint/Oxfmt. Use installed `jwt-decode` and Zod; add no dependency.

## 0. Constraints and gates

- Exact cwd `/home/zachary/development/myah-v4/.worktrees/zeno/myah-347-campaign-creation-recover-a-successful-save-after-response`; branch `zeno/myah-347-campaign-creation-recover-a-successful-save-after-response`; baseline `63b0549479aa375001d1f12a1abda98d6cbcab2f`.
- Root AGENTS.md and [spec revision 4](../specs/MYAH-347-campaign-create-response-loss.md) are normative. Read directly: root `.gitignore:41` ignores `/docs/`.
- One writer; no new worktree, ancestor/borrowed modules, original MYAH-323 changes or other-worktree service use. Parent owns Linear/wiki and independent reviews/UAT delegation.
- No stage/commit/push/PR, deployment, production access/fault injection, activation/send/deletion. Even later local response-loss interception requires explicit runtime authorization.
- Infrastructure/setup failure: stop/report, no protocol/execution fallback. Missing optional LSP alone: give parent exact changed JS/TS paths.
- Parent approves the bounded policies and Campaign-only deferred insertion (supervisor reply in revision receipt); **both independent re-audits and implementation authorization remain mandatory**.
- Prior `.myah347-local/install.log` records immutable installation only. No tests/build/runtime results are claimed by this plan.

- [x] Read both recovered audits in full (not zero-byte originals), source-native seams, installed Apollo behavior, applicable skills and baseline identity.
- [x] Resolve policy and freeze contracts below; read-only retry dead end and callback framework removed.
- [ ] Independent design re-audit passes.
- [ ] Independent plan/test re-audit passes.
- [ ] Parent archives approved spec+plan with SHA256, durable artifact path and Linear reference; grants implementation authorization.

## 1. Exact file map and scope ceiling

All `F/` paths expand to `packages/twenty-front/src/modules/`. `T/` expands to `packages/twenty-front/src/testing/`. These aliases apply to the file map; commands below use full executable paths.

| File | Change |
|---|---|
| NEW `F/object-record/record-index/types/CampaignCreationAttempt.ts` | Types in §2 only |
| NEW `F/object-record/record-index/states/campaignCreationState.ts` | Native state and synchronous session/origin subscriptions/lease updates; no stored functions |
| NEW `F/object-record/record-index/components/CampaignCreationSessionEffect.tsx` | Single core-provider-lifetime subscription adapter |
| NEW `F/apollo/utils/campaignCreationOperation.ts` | JWT identity decoding, precise error classes/classifiers and opted-in boundary guard; no credentials writes |
| `F/object-metadata/components/ApolloCoreProvider.tsx` | Mount Campaign session effect once beneath core context |
| `F/apollo/services/apollo.factory.ts` | Async auth check and one next/error guard/evidence link after RetryLink; scoped local BoundaryError bypasses retry and native error callbacks, not operation rejection |
| `F/object-record/hooks/useCreateOneRecord.ts` | Optional second argument; Campaign no-cache mutate/read/completion branch; all-path loading finally; default branch unchanged |
| `F/object-record/hooks/useRefetchAggregateQueries.ts` | Narrow optional Campaign context: same active aggregate selection, guarded no-cache query then guarded native writeQuery; default refetchQueries unchanged |
| `F/apollo/optimistic-effect/utils/triggerCreateRecordsOptimisticEffect.ts` | Optional transient creationPosition hint only after authoritative filtering and only without explicit root sort; node/fragment/store/group values unchanged |
| NEW `F/apollo/optimistic-effect/utils/__tests__/triggerCreateRecordsOptimisticEffect.test.ts` | Native insertion hint/default compatibility, numeric filters/group dimensions and explicit-sort precedence |
| `F/object-record/record-table/hooks/useCreateNewIndexRecord.ts` | Campaign slot reservation/input freeze/origin handling and handled result; default branch unchanged |
| `F/object-record/record-index/components/RecordIndexSurface.tsx` | Register Campaign origin mount count in existing creation-options effect, not command effect |
| `F/object-record/record-table/components/RecordTableNoRecordGroupAddNew.tsx` | Guard undefined before upsert/virtualization |
| NEW `F/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx` | File-local typed Campaign/real-client fixture; native-hook causal, cache/retry/update, origin and distinct real-command regression sections |
| NEW `F/apollo/services/__tests__/apollo.factory.campaignCreation.test.ts` | Real auth/transport boundary and precise retry/renewal-count assertions |
| NEW `F/object-record/record-index/states/__tests__/campaignCreationState.test.ts` | Synchronous reservation, generation/mount lifetime/ABA and immutable input contracts |
| Existing `F/object-record/hooks/__tests__/useCreateOneRecord.test.tsx` | Default opt-out/loading/field/skip contracts |
| Existing `F/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.test.tsx` | Preserve four Creator cases; add real Workflow metadata and native caller input propagation at mocked shared-hook seam |
| Existing table and two empty-state suites in §9 | Stable spies and clickable visual stubs; handled-undefined behavior |
| NEW `F/error-handler/components/__tests__/PromiseRejectionEffect.campaignCreation.test.tsx` | Controlled unrelated Apollo rejection still produces native snackbar; no production error-handler edit |

No separate recovery hook, generic completion service, server/query schema, migration, generated GraphQL change, shared fixture framework, auth manager or Creator production edit. If those become necessary, stop for scope decision.

## 2. Frozen types and APIs (implement verbatim shape)

Use native `ObjectRecord`, `RecordGqlNode`, Jotai `Store` (`jotai/vanilla/store`) and `ViewOpenRecordIn`. Existing record types contain broad native index signatures; new boundary payloads use `unknown` and runtime checks, not new `any` assertions.

```ts
export type CampaignCreationIdentity = Readonly<{
  workspaceId: string;
  userId: string;
  userWorkspaceId: string;
  workspaceMemberId?: string;
  isImpersonating: boolean;
  impersonatorUserWorkspaceId?: string;
  impersonatedUserWorkspaceId?: string;
}>;

export type CampaignCreationOrigin = Readonly<{
  recordIndexId: string;
  contextStoreInstanceId: string;
  returnPath: string;
  openRecordIn: ViewOpenRecordIn;
  shouldCloseAfterCreation: boolean;
  position: 'first' | 'last' | null;
  groupFieldMetadataId?: string;
}>;

export type CampaignCreationWarning = 'cache' | 'store' | 'group' | 'aggregate' | 'event';
export type CampaignCreationAttempt = {
  readonly recordId: string;
  readonly objectMetadataId: string;
  readonly identity: CampaignCreationIdentity;
  readonly origin: CampaignCreationOrigin;
  // null only during synchronous preparing; immutable JSON string thereafter.
  readonly inputJson: string | null;
  phase: 'preparing' | 'creating' | 'checking' | 'unconfirmed' | 'saved';
  runId: number | null;
  uncertain: boolean;
  savedNode?: RecordGqlNode;
  savedBoundaryGeneration?: number;
  completionAttempted: boolean;
  warnings: CampaignCreationWarning[];
};

export type CampaignCreationState = {
  sessionGeneration: number;
  boundaryGeneration: number;
  actorKey: string | null;
  observedIdentityKey: string | null;
  nextRunId: number;
  attempts: Record<string, CampaignCreationAttempt>;
  mountedOrigins: Record<string, number>;
};

export type CampaignCreationOperationContext = {
  store: Store;
  attemptKey: string;
  runId: number;
  sessionGeneration: number;
  boundaryGeneration: number;
  identity: CampaignCreationIdentity;
  objectMetadataId: string;
  kind: 'create' | 'read';
  transport: { dispatched: boolean; uncertain: boolean };
  invalidated: boolean;
};

export type CampaignCreationRequest = {
  context: CampaignCreationOperationContext;
  intent: 'create' | 'retry' | 'open-saved';
};
export type CreateOneRecordOptions = {
  campaignCreation?: CampaignCreationRequest;
};
```

Existing `useCreateOneRecord` props are unchanged. Freeze its callable signature to:

```ts
createOneRecord(
  recordInput: Partial<CreatedObjectRecord>,
  options?: CreateOneRecordOptions,
): Promise<CreatedObjectRecord>;
```

Implementation may need to make its existing inferred generic return explicit by using `getRecordFromRecordNode<CreatedObjectRecord>`; do not change the default shape. Campaign branch rejects with the errors below before persistence, returns verified record despite refresh warnings, writes saved/warnings to its owned state before returning. The index alone catches Campaign failures. Existing `createNewIndexRecord(recordInput?: Partial<ObjectRecord>): Promise<ObjectRecord | undefined>` returns undefined on Campaign pending/different-origin/handled failure. Non-Campaign exceptions still reject. No arbitrary caller may enable recovery by setting a record ID.

All Apollo operations from this branch pass `context: { campaignCreation: operationContext, queryDeduplication: false }`. The context is **not** placed in mutation input, headers or browser events. Derive a fresh per-operation context for each read/mutate by copying the identity/lease fields, setting `kind` and resetting `transport`; the attempt's `uncertain` fact survives all these copies. Context stores only native store access, data and local transport evidence, not callbacks.

In `campaignCreationOperation.ts` expose exactly:

```ts
export const decodeCampaignCreationIdentity:
  (token: string | undefined) => CampaignCreationIdentity | undefined;
export const campaignCreationIdentityKey:
  (identity: CampaignCreationIdentity) => string;
export const campaignCreationActorKey:
  (identity: CampaignCreationIdentity) => string;
export const campaignCreationAttemptKey:
  (identity: CampaignCreationIdentity) => string;
export const assertCampaignCreationCurrent:
  (context: CampaignCreationOperationContext, authorization?: string) => void;
export const isCampaignCreationTransportUncertain:
  (error: unknown) => boolean;
export const isCampaignCreationDuplicate:
  (error: unknown) => boolean;
export const hasCompleteCampaignCreationSelection:
  (value: unknown, selection: SelectionSetNode) => boolean;

export class CampaignCreationBoundaryError extends Error {
  readonly code = 'CAMPAIGN_CREATION_BOUNDARY_CHANGED';
}
export class CampaignCreationUnconfirmedError extends Error {
  readonly code = 'CAMPAIGN_CREATION_UNCONFIRMED';
}
```

Use original Apollo error for genuine server/auth failures, not a synthetic duplicate-success error. BoundaryError is nonretryable, silently handled by the old index when context is no longer active. UnconfirmedError maps to the spec's localized check/same-creation retry message. Preparation failures use native friendly formatting and clear only an undispatched fresh attempt. All `finally` cleanup is compare-by-lease; never clear another run or a saved attempt.

State utility exports in `campaignCreationState.ts`:

```ts
export const campaignCreationState = createAtomState<CampaignCreationState>({
  key: 'campaignCreationState',
  defaultValue: {
    sessionGeneration: 0, boundaryGeneration: 0,
    actorKey: null, observedIdentityKey: null, nextRunId: 0,
    attempts: {}, mountedOrigins: {},
  },
});
export const subscribeCampaignCreationSession: (store: Store) => () => void;
export const registerCampaignCreationOrigin:
  (store: Store, recordIndexId: string) => () => void;
```

No auto-storage flags. `campaignCreationActorKey` is JSON.stringify of `[userId,isImpersonating,impersonatorUserWorkspaceId ?? null,impersonatedUserWorkspaceId ?? null]`. `campaignCreationAttemptKey` is JSON.stringify of `[workspaceId,campaignCreationActorKey(identity)]`; **not** the full token identity key, optional member claim, origin or generated UUID. Thus member/permission/token changes cannot mint another pending Campaign in the same workspace+actor session. `campaignCreationIdentityKey` is the full fixed-order JSON tuple `[workspaceId,userId,userWorkspaceId,workspaceMemberId ?? null,isImpersonating,impersonatorUserWorkspaceId ?? null,impersonatedUserWorkspaceId ?? null]`, used for operation-boundary comparison, not ownership. Session generation is state-wide; same-actor SPA workspace switches retain entries; null/non-ACCESS/actor changes clear entries. Origin mounts are reference counts, not callback registries.

At each explicit retry capture a fresh operation identity from current native token/Jotai, require its workspace and actor key equal the retained attempt's originating workspace/actor, and retain the original immutable input/record ID. Membership/permission changes can therefore check the same ID under **current** authorization, never reuse stale dispatched headers. Within that run all full-identity changes invalidate it. The original attempt identity remains descriptive data; do not require an obsolete userWorkspace/member claim to authorize a new explicit check. Server/RLS validates any unchanged resend input.

### Session and guard code steps

- [ ] Write unit assertions for synchronous state/ABA contracts before production utilities (Task 4). Then implement the two subscriptions.
- [ ] `subscribeCampaignCreationSession` synchronously reads `tokenPairState`, `currentUserState`, `currentWorkspaceState`, `currentWorkspaceMemberState`, `currentUserWorkspaceState`. Subscribe with `store.sub` to each. Call refresh once on mount. A null/non-ACCESS token, null user or different actor increments session+boundary and clears attempts. Same actor workspace/member identity change increments boundary and marks each active `creating`/`checking` attempt unconfirmed with `uncertain:true`, clearing its run lease. Permission-map changes also increment boundary and release active leases; saved entries stay saved. Same-identity token renewal changes neither generation. Synchronous current workspace/user mismatch invalidates the boundary even when the storage token has not yet changed. The guard independently checks localStorage and latches mismatch into `context.invalidated` to close asynchronous auth races. Teardown unsubscribes all and increments both generations/clears attempts. Do not subscribe from transient index commands.
- [ ] The adapter component contains no request or retry:

```tsx
export const CampaignCreationSessionEffect = () => {
  const store = useStore();
  useEffect(() => subscribeCampaignCreationSession(store), [store]);
  return null;
};
```

Mount it under `ApolloCoreClientContext.Provider` alongside children. Extend existing `RecordIndexSurfaceCreationOptionsEffect` props with `objectNameSingular`; its separate Campaign-only effect returns `registerCampaignCreationOrigin(store, recordIndexId)`. Pass actual object name from the containing surface. On unmount decrement/delete count, **do not delete attempts**. Constructor tests can register origins directly; command regression must use the native mounted-origin registration adapter, not mock creation.

- [ ] Decode native JWT with Zod `.passthrough()` schema: `type:z.literal('ACCESS')`, nonempty workspaceId/userId/userWorkspaceId; optional string member/impersonation IDs, optional boolean isImpersonating default false. Return undefined on decode/schema error; ignore signature/exp for client consistency (server validates them). Key with JSON.stringify tuple, not delimiters or the raw JWT.
- [ ] `assertCampaignCreationCurrent` throws BoundaryError and latches `invalidated=true` if any expected identity, current actual `getTokenPair()` identity, optional forwarded `Bearer` header identity, live session/boundary generation, current workspace/user/member IDs, attempt key/run ID/object metadata ID differs. Check current explicit object permission via native `getObjectPermissionsForObject` using the current userWorkspace permission array; require read and, for creates, native `canCreateRecordsForObjectMetadataItem` (canUpdate is the existing create proxy; there is no canCreateObjectRecords flag). Resolve current Campaign metadata by ID/name from `objectMetadataItemsSelector`; mandatory fields must be readable. Treat absent current workspace/userWorkspace as invalid, not default permission. The guard does not normalize, navigate or change tokens. Invocation capture also calls this guard before preparation.
- [ ] A permission check for read cannot authorize a resend: derived create context checks current create permission separately. Preserve server permissions and field query generation; if permissions change mid-operation the old boundary fails, and a user action obtains newly permission-shaped queries.

## 3. RED harness: genuine Campaign metadata, real nearest Apollo, strict transport

**File:** `F/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx`. Keep harness local to this file. No shared testing-framework change. Import native helpers with the paths below; only navigation/side-panel visual dependencies may be stubbed. Do not mock `useCreateOneRecord`, `useApolloCoreClient`, RetryLink, cache/store or aggregate hook in causal/cache tests.

### 3a. Typed scalar Campaign metadata and identities

Default test metadata has no Campaign. Use the complete native Company metadata structure as the typed base, selecting only valid native scalar base fields, replacing object/field identity and two TEXT fields. This is a metadata fixture, **not** casting `{fields:[]} as never`. Campaign native Name/Objective evidence is server builder lines 2853–2870 and 2970–2985. Select no relations in this **scalar causal** fixture: no fake relation connections/dependencies; retain the standard metadata collection for native provider helpers. Keep it small. The separate file-local owner variant (§3e) tests the changed Campaign deferred branch (§6a); default Person relation/junction compatibility (§8) is supplementary, not a substitute.

```ts
const CAMPAIGN_METADATA_ID = '34700000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '34700000-0000-4000-8000-000000000002';
const USER_ID = '34700000-0000-4000-8000-000000000003';
const USER_WORKSPACE_ID = '34700000-0000-4000-8000-000000000004';
const MEMBER_ID = '34700000-0000-4000-8000-000000000005';
const VIEW_ID = '34700000-0000-4000-8000-000000000006';
const INDEX_ID = `campaigns-${VIEW_ID}`;
const RETURN_PATH = `/objects/campaigns?viewId=${VIEW_ID}`;
const standardMetadata = getTestEnrichedObjectMetadataItemsMock();
const company = standardMetadata.find((item) => item.nameSingular === 'company');
if (!company) throw new Error('Native Company metadata fixture missing');
const requiredField = (name: string): FieldMetadataItem => {
  const field = company.fields.find((item) => item.name === name);
  if (!field) throw new Error(`Native scalar metadata missing: ${name}`);
  return field;
};
const fieldNames = ['id', 'name', 'objective', 'createdAt', 'updatedAt', 'deletedAt', 'position'];
const fields: FieldMetadataItem[] = fieldNames.map((name, index) => ({
  ...requiredField(name === 'objective' ? 'name' : name),
  id: `34700000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  objectMetadataId: CAMPAIGN_METADATA_ID,
  universalIdentifier: `34700000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
  name,
  label: name === 'objective' ? 'Objective' : requiredField(name).label,
  ...(['name', 'objective'].includes(name) ? {
    type: FieldMetadataType.TEXT, defaultValue: name === 'name' ? "''" : null, isNullable: true,
  } : {}),
}));
const campaign: EnrichedObjectMetadataItem = {
  ...company,
  id: CAMPAIGN_METADATA_ID,
  universalIdentifier: '34700000-0000-4000-8000-000000000007',
  nameSingular: 'campaign', namePlural: 'campaigns',
  labelSingular: 'Campaign', labelPlural: 'Campaigns',
  isUICreatable: true, isUIEditable: true, isRemote: false,
  fields, readableFields: fields, updatableFields: fields,
  labelIdentifierFieldMetadataId: fields[1].id,
  imageIdentifierFieldMetadataId: null,
  indexMetadatas: [], searchFieldMetadatas: [],
};
const metadata = [...standardMetadata, campaign];
const selectedFields = Object.fromEntries(fieldNames.map((name) => [name, true]));
const permissions: ObjectPermissions & { objectMetadataId: string } = {
  objectMetadataId: CAMPAIGN_METADATA_ID,
  canReadObjectRecords: true, canUpdateObjectRecords: true,
  canSoftDeleteObjectRecords: true, canDestroyObjectRecords: true,
  restrictedFields: {}, rowLevelPermissionPredicates: [], rowLevelPermissionPredicateGroups: [],
};
const tokenPair = (identity: Record<string, unknown>): AuthTokenPair => ({
  accessOrWorkspaceAgnosticToken: {
    token: `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(JSON.stringify({
      type: 'ACCESS', workspaceId: WORKSPACE_ID, userId: USER_ID,
      userWorkspaceId: USER_WORKSPACE_ID, workspaceMemberId: MEMBER_ID, ...identity,
    }))}.fixture`,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  refreshToken: { token: 'synthetic-refresh', expiresAt: '2099-01-01T00:00:00.000Z' },
});
```

Import `mockCurrentWorkspace`, `mockedUserData`, `mockedWorkspaceMemberData` from `T/mock-data/users.ts` (exports verified at lines 63,171,190). Seed native values explicitly:

```ts
const store = createStore();
const workspace: CurrentWorkspace = { ...mockCurrentWorkspace, id: WORKSPACE_ID };
const user: CurrentUser = { ...mockedUserData, id: USER_ID };
const member: CurrentWorkspaceMember = {
  ...mockedWorkspaceMemberData, id: MEMBER_ID, userWorkspaceId: USER_WORKSPACE_ID,
};
const workspaceMemberMetadata = standardMetadata.find((item) => item.nameSingular === 'workspaceMember');
if (!workspaceMemberMetadata) throw new Error('Native WorkspaceMember metadata missing');
store.set(currentWorkspaceState.atom, workspace);
store.set(currentUserState.atom, user);
store.set(currentWorkspaceMemberState.atom, member);
store.set(currentUserWorkspaceState.atom, {
  ...mockedUserData.currentUserWorkspace,
  objectsPermissions: [permissions, {
    ...permissions, objectMetadataId: workspaceMemberMetadata.id, canReadObjectRecords: false,
  }],
});
const tokens = tokenPair({});
store.set(tokenPairState.atom, tokens);
localStorage.setItem(TOKEN_PAIR_LOCAL_STORAGE_KEY, JSON.stringify(tokens));
```

`useBuildRecordInputFromRLSPredicates` itself calls native `useFindOneRecord('workspaceMember')`. The deliberate explicit WorkspaceMember read denial above makes that hook skip its query; there are no dynamic RLS predicates or Campaign relations in this scalar causal fixture, so this is a valid permission configuration, not a mocked builder or permissive unknown-request response. Native static RLS/filter tests seed their actual predicate/filter atoms separately; dynamic membership recovery is not in scope. Do not mock getTokenPair or the native create/read hooks. Tests deliberately replacing only localStorage retain stale React atoms to establish the real auth race.

### 3b. File-local provider (real client nearest tested hooks)

`getJestMetadataAndApolloMocksWrapper` always inserts MockedProvider; do **not** wrap it with an outer real client. Build this explicit wrapper using imports from `T/jest/JestObjectMetadataItemSetter`, `T/jest/JestContextStoreSetter`, native component contexts, real ApolloFactory and `ApolloProvider` from `@apollo/client/react`:

```tsx
const cache = new InMemoryCache();
const factory = new ApolloFactory({
  uri: 'http://localhost/graphql', cache,
  currentWorkspace: workspace, currentWorkspaceMember: member,
  onTokenPairChange: (tokens) => store.set(tokenPairState.atom, tokens),
});
const client = factory.getClient();
const Wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <BrowserRouter>
      <SnackBarComponentInstanceContext.Provider value={{ instanceId: 'campaign-test-snacks' }}>
        <ApolloProvider client={client}>
          <JestObjectMetadataItemSetter objectMetadataItems={metadata}>
            <RecordComponentInstanceContextsWrapper componentInstanceId={INDEX_ID}>
              <ViewComponentInstanceContext.Provider value={{ instanceId: INDEX_ID }}>
                <ContextStoreComponentInstanceContext.Provider value={{ instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID }}>
                  <JestContextStoreSetter
                    contextStoreCurrentObjectMetadataNameSingular="campaign"
                    contextStoreCurrentViewId={VIEW_ID}
                    contextStoreCurrentViewType={ContextStoreViewType.Table}
                  >
                    {children}
                  </JestContextStoreSetter>
                </ContextStoreComponentInstanceContext.Provider>
              </ViewComponentInstanceContext.Provider>
            </RecordComponentInstanceContextsWrapper>
          </JestObjectMetadataItemSetter>
        </ApolloProvider>
      </SnackBarComponentInstanceContext.Provider>
    </BrowserRouter>
  </Provider>
);
```

At baseline RED there is no new session/origin effect import. After Task 4 exists, add `<CampaignCreationSessionEffect />` inside the loaded setter and a local mounted-origin adapter with `useEffect(() => registerCampaignCreationOrigin(store, INDEX_ID), [])`. This adapter exercises the real registration utility also used by the surface, not a creation stub. Seed native `recordIndexOpenRecordInState` to RECORD_PAGE and empty creation options. Use `window.history.replaceState({}, '', RETURN_PATH)` before rendering; restore it after tests. Assert from a probe that `useApolloCoreClient() === client`; fail immediately if nearest provider is MockLink. For native-hook test, pass explicit instanceId so no false RecordIndexContext is needed. Group/control tests add a complete typed RecordIndexContext using the real Campaign metadata.

### 3c. Stateful strict fetch transport

Use existing installed `jest-fetch-mock` Response implementation; initialize before constructing ApolloFactory (existing factory tests show integration). Save/restore fetch and its mock implementation. JSON GraphQL requests only, no network server. Capture safe `{operationName,id,outcome}` and actual input values, **not headers/tokens**. Read and mutation responses come from one Map. Enforce recognized endpoint, POST body, AST operation/field/argument/selection and strict variables. Do not return permissive success for unknown operations.

Core parser/body and fixture logic to place in this test file (use `parse`, `getOperationAST`, `Kind`, and installed Zod):

```ts
const envelopeSchema = z.object({
  operationName: z.string(), query: z.string(), variables: z.record(z.string(), z.unknown()),
  extensions: z.unknown().optional(),
}).strict();
const inputSchema = z.object({
  id: z.string().uuid(), name: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  position: z.union([z.number(), z.literal('first'), z.literal('last')]).optional(),
}).strict();
const parseRequest = (request: Request) => request.text().then((body) => {
  const envelope = envelopeSchema.parse(JSON.parse(body));
  const document = parse(envelope.query);
  const operation = getOperationAST(document, envelope.operationName);
  if (!operation) throw new Error('Missing named GraphQL operation');
  const roots = operation.selectionSet.selections;
  if (roots.length !== 1 || roots[0].kind !== Kind.FIELD || roots[0].alias) {
    throw new Error('Expected one unaliased native root');
  }
  return { ...envelope, operation, root: roots[0], document };
});
const rows = new Map<string, RecordGqlNode>();
const createInputs: Array<z.infer<typeof inputSchema>> = [];
const readIds: string[] = [];
const updateIds: string[] = [];
const requestLog: string[] = [];
const duplicate = {
  errors: [{ message: 'A duplicate entry was detected', extensions: {
    code: 'BAD_USER_INPUT', userFriendlyMessage: 'A duplicate entry was detected',
  } }],
};
type Delivery = 'deliver' | 'fail-before-save' | 'fail-after-save';
let createDeliveries: Delivery[] = ['fail-after-save', 'deliver'];
const now = '2026-01-01T00:00:00.000Z';
const transport = async (request: Request): Promise<string> => {
  if (request.url !== 'http://localhost/graphql' || request.method !== 'POST') {
    throw new Error('Unexpected transport endpoint/method');
  }
  const parsed = await parseRequest(request);
  requestLog.push(parsed.operationName);
  const root = parsed.root;
  if (parsed.operationName === 'CreateOneCampaign') {
    expect(parsed.operation.operation).toBe('mutation');
    expect(root.name.value).toBe('createCampaign');
    expect(root.arguments?.map((arg) => arg.name.value)).toEqual(['data']);
    expect(Object.keys(parsed.variables)).toEqual(['input']);
    const input = inputSchema.parse(parsed.variables.input);
    createInputs.push(structuredClone(input));
    const delivery = createDeliveries.shift();
    if (!delivery) throw new Error('Unplanned create dispatch');
    if (delivery === 'fail-before-save') throw new TypeError('Synthetic pre-dispatch loss');
    if (rows.has(input.id)) {
      if (delivery === 'fail-after-save') throw new TypeError('Synthetic duplicate response loss');
      return JSON.stringify(duplicate);
    }
    const node: RecordGqlNode = {
      __typename: 'Campaign', id: input.id,
      name: input.name ?? 'Server Campaign', objective: input.objective ?? 'Server objective',
      position: input.position === 'first' ? -1 : 1,
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    rows.set(input.id, node);
    if (delivery === 'fail-after-save') throw new TypeError('Synthetic committed response loss');
    return JSON.stringify({ data: { createCampaign: node } });
  }
  if (parsed.operationName === 'FindOneCampaign') {
    expect(parsed.operation.operation).toBe('query');
    expect(root.name.value).toBe('campaign');
    expect(print(root.arguments?.[0].value!)).toBe('{id: {eq: $objectRecordId}}');
    const { objectRecordId } = z.object({ objectRecordId: z.string().uuid() }).strict().parse(parsed.variables);
    readIds.push(objectRecordId);
    return JSON.stringify({ data: { campaign: rows.get(objectRecordId) ?? null } });
  }
  if (parsed.operationName === 'UpdateOneCampaign') {
    expect(parsed.operation.operation).toBe('mutation');
    expect(root.name.value).toBe('updateCampaign');
    const { idToUpdate, input } = z.object({
      idToUpdate: z.string().uuid(),
      input: z.object({ name: z.string(), objective: z.string() }).strict(),
    }).strict().parse(parsed.variables);
    const prior = rows.get(idToUpdate);
    if (!prior) throw new Error('Update must target persisted fixture row');
    updateIds.push(idToUpdate);
    const node = { ...prior, ...input };
    rows.set(idToUpdate, node);
    return JSON.stringify({ data: { updateCampaign: node } });
  }
  throw new Error(`Unexpected GraphQL operation: ${parsed.operationName}`);
};
fetchMock.mockResponse(async (request) => ({
  body: await transport(request), headers: { 'Content-Type': 'application/json' },
}));
```

Before each response, validate the exact native `DocumentNode` against public `addTypenameToDocument` from `@apollo/client/utilities` (export verified in installed utilities/index.d.ts). Build `expectedDocuments: Record<string, DocumentNode>` with `generateCreateOneRecordMutation({objectMetadataItem:campaign,objectMetadataItems:metadata,recordGqlFields:selectedFields,objectPermissionsByObjectMetadataId:{[CAMPAIGN_METADATA_ID]:permissions}})`, native `useFindOneRecordQuery` captured in the test probe, `generateUpdateOneRecordMutation` with the same arguments plus `computeReferences:false`, and the watched query constants in §6. The probe invokes the native find query hook before the user invokes create, so FindOneCampaign's document is available before transport. Assert `print(parsed.document) === print(addTypenameToDocument(expectedDocuments[parsed.operationName]))`, rejecting an absent map entry first. This freezes variable definitions, scalar selections and filter arguments without private Apollo access. For watched list variants use the same document with strict variables. These are native generated document assertions, not backend schema validation; UAT remains actual server evidence.

The baseline helper parser above allows only three mutations/read operations. In cache slices add the exact list/aggregate branches in §6, not a fallback response. In failure cases replace one recognized operation's delivery outcome (null/error/wrong node/deferred response); do not bypass parser validation. A planned read/aggregate failure is consumed a finite number of times; unexpected remaining or extra dispatches fail tests. Use normal synchronous Zod assertions; TypeError transport failures deliberately cross actual UploadHttpLink.

### 3d. First causal native-hook RED, safe rejection capture

- [ ] Read root setup receipt. Only after gates run §9 setup/baselines.
- [ ] Add baseline-import-only wrapper/fixture, then this **native-hook** regression. Use real timers with bounded `jest.setTimeout(20000)` for the first two-dispatch causal case; later counts suites use modern fake timers and `advanceTimersByTimeAsync(7000)` (native jitter max for initial retry is 6000ms). Do not replace RetryLink or production delay/max.

```tsx
it('native hook recovers the generated Campaign after persisted response loss and automatic same-ID duplicate', async () => {
  const { result } = renderHook(() => ({
    index: useCreateNewIndexRecord({ objectMetadataItem: campaign, instanceId: INDEX_ID }),
    core: useApolloCoreClient(),
  }), { wrapper: Wrapper });
  expect(result.current.core).toBe(client);
  let settled: { value?: ObjectRecord; error?: unknown } = {};
  await act(async () => {
    settled = await result.current.index.createNewIndexRecord({ position: 'first' })
      .then((value) => ({ value }), (error: unknown) => ({ error }));
  });
  expect(createInputs).toHaveLength(2);
  const attemptedId = createInputs[0].id;
  expect(createInputs[1]).toEqual(createInputs[0]);
  expect(rows.size).toBe(1);
  expect(settled.error).toBeUndefined();
  expect(readIds).toEqual([attemptedId]);
  expect(settled.value?.id).toBe(attemptedId);
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith(AppPath.RecordShowPage,
    { objectNameSingular: 'campaign', objectRecordId: attemptedId }, undefined,
    expect.objectContaining({ state: expect.objectContaining({ objectRecordId: attemptedId, isNewRecord: true }) }));
});
```

Baseline expected failure is duplicate rejection/missing native read/navigation **after** proven two same-input dispatches/one inserted Map row, not import/schema/translation failure. Capturing this hook promise is honest causal RED, **not evidence of browser unhandled-rejection absence or command cleanup**. Do not mount real command in this caught-promise test. Save exact RED output/source diff before production edits.

### 3e. Revision-3 owner relation variant (same integration file, not the scalar RED)

Add a separate `describe('Campaign owner inverse')` with its own fresh store/cache/rows and the §3b real-client wrapper. Retain the scalar fixture unchanged. Derive a typed native relation pair from Company.accountOwner ↔ WorkspaceMember.accountOwnerForCompanies, replacing both ends with the **actual** Campaign.owner ↔ WorkspaceMember.ownedCampaigns names/types/IDs/settings. Native metadata proof: server `myah-standard-object-field-builders.util.ts:2986–3005` and `field-metadata/compute-workspace-member-standard-flat-field-metadata.util.ts:671–692`; fixture bases are in `T/mock-data/generated/metadata/objects/mock-objects-metadata.ts:10944–10993,17214–17274`. Do not invent an ownerId metadata field; native generation derives the join column from the relation.

```ts
const ownerBase = company.fields.find((field) => field.name === 'accountOwner');
const inverseBase = workspaceMemberMetadata.fields.find((field) => field.name === 'accountOwnerForCompanies');
if (!ownerBase?.relation || !inverseBase?.relation) throw new Error('Native owner relation fixture missing');
const ownerFieldId = '34700000-0000-4000-8000-000000000301';
const inverseFieldId = '34700000-0000-4000-8000-000000000302';
const campaignRef = { id: campaign.id, nameSingular: 'campaign', namePlural: 'campaigns' };
const memberRef = { id: workspaceMemberMetadata.id, nameSingular: 'workspaceMember', namePlural: 'workspaceMembers' };
const ownerField: FieldMetadataItem = {
  ...ownerBase, id: ownerFieldId, universalIdentifier: ownerFieldId,
  objectMetadataId: campaign.id, name: 'owner', label: 'Owner',
  settings: { ...ownerBase.settings, relationType: RelationType.MANY_TO_ONE, joinColumnName: 'ownerId' },
  relation: { ...ownerBase.relation,
    sourceObjectMetadata: campaignRef, targetObjectMetadata: memberRef,
    sourceFieldMetadata: { id: ownerFieldId, name: 'owner' },
    targetFieldMetadata: { id: inverseFieldId, name: 'ownedCampaigns' },
  },
};
const inverseField: FieldMetadataItem = {
  ...inverseBase, id: inverseFieldId, universalIdentifier: inverseFieldId,
  objectMetadataId: workspaceMemberMetadata.id, name: 'ownedCampaigns', label: 'Owned campaigns',
  isNullable: true, isUIEditable: false, settings: { relationType: RelationType.ONE_TO_MANY },
  relation: { ...inverseBase.relation,
    sourceObjectMetadata: memberRef, targetObjectMetadata: campaignRef,
    sourceFieldMetadata: { id: inverseFieldId, name: 'ownedCampaigns' },
    targetFieldMetadata: { id: ownerFieldId, name: 'owner' },
  },
};
const ownerCampaignFields = [...campaign.fields, ownerField];
const ownerCampaign: EnrichedObjectMetadataItem = {
  ...campaign, fields: ownerCampaignFields, readableFields: ownerCampaignFields,
  updatableFields: ownerCampaignFields,
};
const memberScalarFields = ['id', 'name', 'avatarUrl', 'createdAt', 'updatedAt', 'deletedAt'].map((name) => {
  const field = workspaceMemberMetadata.fields.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`Native member field missing: ${name}`);
  return field;
});
const memberFields = [...memberScalarFields, inverseField];
const ownerMember: EnrichedObjectMetadataItem = {
  ...workspaceMemberMetadata, fields: memberFields, readableFields: memberFields,
  updatableFields: memberScalarFields,
};
const ownerMetadata = [...standardMetadata.filter((item) => item.id !== ownerMember.id), ownerMember, ownerCampaign];
const ownerPermissions = {
  [ownerCampaign.id]: permissions,
  [ownerMember.id]: { ...permissions, objectMetadataId: ownerMember.id, canReadObjectRecords: true },
};
const ownerSelectedFields = generateDepthRecordGqlFieldsFromObject({
  objectMetadataItem: ownerCampaign, objectMetadataItems: ownerMetadata, depth: 1,
});
const memberSelectedFields = generateDepthRecordGqlFieldsFromObject({
  objectMetadataItem: ownerMember, objectMetadataItems: ownerMetadata, depth: 1,
});
const ownerInputSchema = inputSchema.extend({ ownerId: z.literal(MEMBER_ID) });
const ownerInputs: Array<z.infer<typeof ownerInputSchema>> = [];
const memberReadIds: string[] = [];
```

Use `RelationType` from `twenty-shared/types` for settings; the native base supplies each relation descriptor's generated GraphQL type. Do not mutate `standardMetadata` (its helper memoizes it). Keep actual member label/image identifier IDs; the retained name/avatarUrl fields satisfy native `buildIdentifierGqlFields`. Thus owner selection is `{id,name{firstName,lastName},avatarUrl,__typename}`, plus root ownerId and all Campaign scalars; member selection includes its retained scalar fields and `ownedCampaigns.edges.node{id,name,__typename}`. `FullName` is the native composite typename (see `F/object-record/cache/utils/__tests__/getRecordFromRecordNode.test.ts:22`). No recursive owner/inverse expansion or broad member schema fixture.

Configure the wrapper setter with `ownerMetadata` and seed currentUserWorkspace permissions from `Object.values(ownerPermissions)`, **not** the scalar fixture's member read denial. Capture the two actual `useFindOneRecordQuery` documents in a probe using `ownerSelectedFields` and `memberSelectedFields`. Generate expected create/update documents using `ownerCampaign`, `ownerMetadata`, `ownerPermissions`, `ownerSelectedFields`. Register exact `FindOneWorkspaceMember` document in `expectedDocuments` before the index mounts (render the document/snackbar/store probe first, then the index probe); its native RLS-builder member read must be permitted and handled, not mocked, skipped or answered by a catch-all. With fresh cache/no StrictMode it dispatches exactly once; wait for this read to finish before invoking create. Subsequent index rerenders must not add a member dispatch.

Freeze this extra branch inside the same strict §3c parser, after exact `addTypenameToDocument` comparison and before the unknown-operation throw. Use one persisted `existingCampaign` with a fixed distinct UUID in `rows` as the preexisting inverse edge. Seed that node with the scalar Campaign schema, ownerId MEMBER_ID and the owner identity below; it is not the new generated ID. This member response supplies the initially cached readable owner. Native `useFindOneRecord` normalizes the cache but is not a store upsert receipt: after its response explicitly seed the existing member into the native store via real `useUpsertRecordsInStore` from `F/object-record/record-store/hooks/useUpsertRecordsInStore.ts` and `getRecordFromRecordNode`, then assert inverse `[existingCampaign.id]` in both surfaces before create.

```ts
const ownerIdentity = {
  __typename: 'WorkspaceMember', id: MEMBER_ID, avatarUrl: null,
  name: { __typename: 'FullName', firstName: 'Campaign', lastName: 'Owner' },
};
const existingCampaign: RecordGqlNode = {
  __typename: 'Campaign', id: '34700000-0000-4000-8000-000000000303',
  name: 'Existing owned Campaign', objective: 'Existing', position: 10,
  createdAt: now, updatedAt: now, deletedAt: null, ownerId: MEMBER_ID, owner: ownerIdentity,
};
rows.set(existingCampaign.id, existingCampaign);
const memberNode: RecordGqlNode = {
  ...ownerIdentity, createdAt: now, updatedAt: now, deletedAt: null,
  ownedCampaigns: { __typename: 'CampaignConnection', edges: [{
    __typename: 'CampaignEdge', node: {
      __typename: 'Campaign', id: existingCampaign.id, name: existingCampaign.name,
    },
  }] },
};
// Inside transport after parse/document checks:
if (parsed.operationName === 'FindOneWorkspaceMember') {
  expect(parsed.operation.operation).toBe('query');
  expect(parsed.root.name.value).toBe('workspaceMember');
  expect(print(parsed.root.arguments?.[0].value!)).toBe('{id: {eq: $objectRecordId}}');
  const variables = z.object({ objectRecordId: z.literal(MEMBER_ID) }).strict().parse(parsed.variables);
  memberReadIds.push(variables.objectRecordId);
  if (memberReadIds.length !== 1) throw new Error('Unexpected extra member read');
  return JSON.stringify({ data: { workspaceMember: memberNode } });
}
```

In this variant's existing recognized `CreateOneCampaign` branch, parse `ownerInputSchema`, push a structured clone into `ownerInputs` and retain §3c's exact dispatch/delivery/duplicate rules. The new saved node is **authoritative** `{__typename:'Campaign',id:input.id,name:'Authoritative owner Campaign',objective:'Owner test',position:15,createdAt:now,updatedAt:now,deletedAt:null,ownerId:input.ownerId,owner:ownerIdentity}`; put it in the same `rows` Map before any fail-after-save. `FindOneCampaign` returns that exact Map node with the generated selected owner identity fields; it must not synthesize a success from cache. Strict input expects caller `{name:'Client Campaign',objective:'Client objective',position:'first',ownerId:MEMBER_ID}` plus the generated ID. The input ID is owned/assigned last and both automatic dispatches must carry exactly that input; output position is numeric 15, not first/last. No WorkspaceMember mutation, relation create, callback or aggregate request is permitted in this focused variant; unexpected operations fail.

## 4. Task: immutable ownership and identity transport (RED → GREEN)

**Files:** state/types/session component/guard/factory/provider/surface in §1. Test state and factory source-named new files; they are independently reviewable from UI completion. Each row is its own smallest RED command via §9 `--testNamePattern` then implement only its seam, rerun GREEN.

### 4a. Frozen input / run leasing

Implement Campaign index reservation synchronously using store.get/set before builders or awaits. No other control can pass reservation while `runId !== null`. Generate UUID **after checking existing entry**, then reserve preparing. A preparation error clears only this fresh preparing entry. Store string snapshot once:

```ts
const merged = { ...buildRecordInputFromRLSPredicates(), ...buildRecordInputFromFilters(), ...recordInput };
const inputJson = JSON.stringify({
  ...sanitizeRecordInput({ objectMetadataItem, recordInput: merged }),
  id: recordId,
});
// Replace the preparing attempt with this string; never rebuild it on retry.
const inputForDispatch = JSON.parse(inputJson) as Partial<ObjectRecord>;
```

No deep-freeze utility needed: the canonical string is immutable; JSON parsing yields a new dispatch copy every time. Sanitize before serialization once; stringify failure is an undispatched preparation failure. Do not re-sanitize the retained payload on resend, which could change relation/filter defaults. Metadata schema errors on resend remain genuine errors, not permission to change input.

Concrete state tests:

```ts
expect(first.recordId).not.toBe(callerId);
expect(JSON.parse(first.inputJson!).id).toBe(first.recordId);
expect(JSON.parse(first.inputJson!).id).not.toBe(filterId);
expect(JSON.parse(first.inputJson!).id).not.toBe(rlsId);
callerInput.name = 'later edit';
expect(JSON.parse(first.inputJson!).name).toBe('original');
expect(secondSameTick).toBeUndefined();
expect(createInputs).toHaveLength(1); // while deferred first response is pending
expect(store.get(campaignCreationState.atom).attempts[key].runId).not.toBeNull();
```

Use actual two rendered index hooks in integration for cross-control ownership. Unit helper tests set real state directly only for session/guard setup, not to simulate passing index behavior. After successful navigation and return to index, explicit New yields another different request ID. If preparation builder/sanitize/JSON stringify throws, no dispatch, attempt removed, create-hook loading and pending snackbar settle. Default hook preparation failure separately exercises its finally.

### 4b. Actual transport link code

`apollo.factory.ts`: keep existing ordering and retry max/delay. Preserve native error callbacks for all default operations and current-boundary genuine errors; only opted-in local BoundaryError bypasses callbacks as frozen below. Read optional `campaignCreation` via a narrow structural/type guard; unrelated contexts pass through unchanged. In auth `setContext` accept the previous operation context, build headers exactly as today, call guard with the **resulting** Authorization header before returning them. A second check is mandatory below RetryLink because async setContext schedules forwarding and retries do not rerun auth.

Use RxJS imports already used by factory (`defer`, `tap` added) and ApolloLink:

```ts
const campaignCreationLink = new ApolloLink((operation, forward) =>
  defer(() => {
    const context = operation.getContext().campaignCreation as CampaignCreationOperationContext | undefined;
    if (!context) return forward(operation);
    assertCampaignCreationCurrent(context, operation.getContext().headers?.authorization ?? '');
    context.transport.dispatched = true;
    return forward(operation).pipe(tap({
      next: () => assertCampaignCreationCurrent(context, operation.getContext().headers?.authorization ?? ''),
      error: (error: unknown) => {
        // Guard the error channel before uncertainty or native error callbacks.
        assertCampaignCreationCurrent(context, operation.getContext().headers?.authorization ?? '');
        if (context.kind === 'create' && isCampaignCreationTransportUncertain(error)) {
          context.transport.uncertain = true;
          const state = context.store.get(campaignCreationState.atom);
          const attempt = state.attempts[context.attemptKey];
          if (attempt?.runId === context.runId && state.sessionGeneration === context.sessionGeneration) {
            context.store.set(campaignCreationState.atom, {
              ...state, attempts: { ...state.attempts,
                [context.attemptKey]: { ...attempt, uncertain: true } },
            });
          }
        }
      },
    }));
  }),
);
```

Insert `campaignCreationLink` immediately after `retryLink`, before streaming/rest/upload. Add `if (error instanceof CampaignCreationBoundaryError) return false;` before native retryIf classification. A synchronous throw in RxJS `tap.error` replaces the original error; do not catch that assertion and forward the stale error. Guard failures before forwarding leave `transport.dispatched=false`; failures on inbound next/error keep the original dispatch count but record no new transport uncertainty. Session invalidation may independently mark the retained old attempt uncertain (§2); do not confuse that state transition with this operation's transport evidence. No new provenance notification in retryIf: the downstream link sees terminal errors as well as individual forwards. Do not catch known GraphQL results as TypeError. Unrelated retry concurrently must leave the Campaign context false.

At the **start** of the existing ErrorLink callback, before every native GraphQL/HTTP/network classification, add this Campaign-only entry check (same opt-in context recognition as the link). Revision 4 closes the real asynchronous gap: native RetryLink awaits even a synchronous false retryIf decision, so identity may change after downstream tap.error passed. Add `throwError` to existing RxJS imports. Do not throw directly out of ErrorLink's observer callback; return its error Observable:

```ts
const campaignCreation = operation.getContext().campaignCreation as
  CampaignCreationOperationContext | undefined;
if (campaignCreation) {
  if (error instanceof CampaignCreationBoundaryError) return;
  try {
    assertCampaignCreationCurrent(
      campaignCreation,
      operation.getContext().headers?.authorization ?? '',
    );
  } catch (boundaryError) {
    return throwError(() => boundaryError);
  }
}
```

Default operations bypass this assertion; valid-current Campaign errors continue through unchanged native classification. The returned Observable preserves a failed outcome without native callbacks. Keep downstream next/error guards and native retry settings unchanged; no extra checks between synchronous classification statements or global credential-renewal redesign.

ErrorLink's void return leaves the operation rejected with BoundaryError; it is not an empty successful Observable. Native `onNetworkError` must **not** observe this local stale-operation error, because a consumer may render UI. Also no payload-too-large, GraphQL, unauthenticated, app-version callback or renewal for it. This is not global notification suppression: default operations are untouched; a current-boundary HTTP413 still reaches `onPayloadTooLarge` once and rejects status413, and a current-boundary terminal network error still reaches `onNetworkError` once. Source: factory `:329–342` and real core hook `useApolloFactory.ts:99–105`; the late error otherwise toasts before the index can silently handle its old invocation. §4d is the regression gate.

Classifiers are exact:

```ts
export const isCampaignCreationTransportUncertain = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error && error.name === 'AbortError') ||
  ServerParseError.is(error) ||
  (ServerError.is(error) && error.statusCode >= 500);

export const isCampaignCreationDuplicate = (error: unknown): boolean =>
  CombinedGraphQLErrors.is(error) && error.errors.length > 0 &&
  error.errors.every((item) =>
    item.extensions?.subCode === 'DUPLICATE_ENTRY_DETECTED' ||
    (item.extensions?.code === 'BAD_USER_INPUT' && item.message === 'A duplicate entry was detected'));
```

Mixed duplicate+forbidden is not eligible. `every`, not `some`. Require attempt uncertainty in caller as well. Native `ServerParseError` represents a dispatched transport response that cannot be parsed; malformed GraphQL data is a separate unconfirmed case. A local cache TypeError is outside this transport observer and must not acquire provenance.

### 4c. Exact auth/retry counts and races

Factory suite uses real synthetic localStorage tokenPair and real auth SetContext/RetryLink/UploadHttpLink. Mock only native `renewToken` for these focused count tests; count mock invocations explicitly and configure `onTokenPairChange` to write the native atom/localStorage. This focused suite measures native renewal function calls, not HTTP metadata-request parsing. AuthService itself remains unmodified; do not claim its HTTP request count from a function spy. All outcomes use unconditional `await expect(promise).resolves...` / `.rejects...`; never assertions only inside catch.

| Test / fixture | Exact expected counts / evidence |
|---|---|
| Ordinary transport TypeError then success | core transport 2, auth header construction 1, renewToken 0; opted create uncertainty true; normal query context unaffected |
| HTTP401 on GraphQL transport | core 1, renewToken 0, retry forwards 0; rejects ServerError status401 |
| HTTP413 | core 1, renewToken 0, onPayloadTooLarge 1; rejects status413 |
| HTTP403 | Native policy currently permits RetryLink retry (not 401/413); core 2, renewToken 0; Campaign uncertainty false; no recovery read |
| GraphQL UNAUTHENTICATED then success | core 2, auth header construction 2, renewToken 1, onTokenPairChange 1, onUnauthenticatedError 0; no RetryLink-delay resend, no uncertainty |
| GraphQL message Unauthorized then success | same as preceding, separate parameterization |
| Renewal fails with CombinedGraphQLErrors | core 1, renewToken 1, onTokenPairChange 0, onUnauthenticatedError 1; rejects original GraphQL auth error |
| Renewal transport fails all native backoffs | core 1, renewToken 4 (initial+3 retries), onUnauthenticatedError 1, no re-forward; delays **1000/2000/3000ms** from native retryWithBackoff's linear `baseDelayMs * (attempt + 1)` |
| Successful renewal followed by another UNAUTHENTICATED | core 2, renewToken 1; ErrorLink re-forward result is not an infinite renewal loop; rejects |
| Same-identity token refresh | renewal allowed, actual forwarded new token checked, saved once; generation unchanged |
| Replace only localStorage token after hook invocation before auth resolves; React stale | 0 wrong-workspace/user/impersonation dispatch; BoundaryError, no read/cache/store/event/navigation |
| Change token during native retry delay | first create 1, second 0; no wrong-context transport, retained old unconfirmed if same actor/workspace switch |
| Change after dispatch before inbound next, then restore before old promise settles | 0 inbound normalization/cache writes/events/navigation; sticky boundary/lease prevents ABA completion |
| Logout and same-actor login | session generation changes; old response cannot act; no old attempt/session continuity claim |
| Same workspace, different user or impersonator | stale operation blocked; state invalidated; no data leaked to new actor |
| Permission revoke before recovery read | no read transport; unconfirmed; no resend |
| Permission revoke before completion | response rejected before fragment/cache/store; no stale navigation |
| Concurrent unrelated query transport retry | unrelated request count 2; Campaign fresh duplicate does not acquire uncertainty or read; no extra Campaign write |

Use an actual factory `extraLinks` observer immediately after auth and before RetryLink; do not count getTokenPair calls (guards also read it) or replace SetContext. This observes authenticated forwarding entries: native retry remains downstream and renewal re-enters it.

```ts
let authenticatedForwards = 0;
const observeAuthForward = new ApolloLink((operation, forward) => {
  authenticatedForwards += 1;
  return forward(operation);
});
// Include extraLinks: [observeAuthForward] in the real factory options.
await expect(operationPromise).resolves.toMatchObject({ data: expect.any(Object) });
expect(authenticatedForwards).toBe(1); // ordinary native transport retry
expect(coreTransportCalls).toBe(2);
expect(mockRenewToken).toHaveBeenCalledTimes(0);
```

Each error row instead uses explicit rejects assertions; HTTP401 example `await expect(operationPromise).rejects.toMatchObject({statusCode:401})`, then unconditional core count1/renewal0 assertions. For the after-auth-before-transport race, add a test-only deferred extraLink **after** this observer, mutate actual localStorage while its forward gate is held, then release it: the real below-RetryLink guard must reject zero wrong-identity forwards. Do not change production auth scheduling. Compare actual captured transport token values to synthetic expected tokens in memory without printing them; these are authenticated-forward counts, not inferred getTokenPair-call counts.

### 4d. Revision-3 deferred-error regression (real factory, not an upstream fake link)

**Files:** actual-factory suite and the same real-client integration file in §1. RED must show the original late HTTP413 callback (or late terminal error/uncertainty) leaking through the old error channel; this is separate from successful `next` ABA tests. Use modern fake timers, actual UploadHttpLink fetch delivery, a valid leased Campaign create context from §2 and the exact native create document/input from §3. No mock getTokenPair, RetryLink, auth link or replacement error channel.

Use `describe('deferred error')` in each named file so §9's narrow RED/GREEN commands select these cases. Parameterize `boundaryChange` over `workspace-switch` and `logout-new-actor`, and `lateError` over `http413`, `http503`, `transport-type-error`, `terminal-error`. A per-test native session subscription is active before dispatch. For workspace switch, set actual tokenPair localStorage+atom and current workspace atom to workspace B for the same actor (with matching native userWorkspace/member IDs). For logout/new actor, set tokenPair null and clear native user/workspace/member/userWorkspace atoms first (matching clearSession order), then install actor B's full valid identity/tokens. Never mutate only a captured context or directly toggle `invalidated`; the native subscription must invalidate the old lease. Record snapshots **after** this legitimate boundary change and before releasing the old response. Old-workspace attempt uncertainty from session invalidation is allowed; old operation `transport.uncertain` must remain false.

Freeze this dispatch/error block inside each factory test. `createContext`, `campaignCreateOneRecordMutation`, `inputForDispatch`, store and current identity are seeded by §§2/3; `client` is a real ApolloFactory client with `onPayloadTooLarge`, `onNetworkError`, `onError`, `onUnauthenticatedError` spies and the §4c auth-forward observer. Count fetches separately from authenticated forwards. No read/list/aggregate watcher is mounted in this focused suite.

```ts
const responseGate = Promise.withResolvers<void>();
const dispatched = Promise.withResolvers<void>();
const terminalError = new Error('Synthetic terminal transport error');
let coreTransportCalls = 0;
fetchMock.mockResponse(async (request) => {
  coreTransportCalls += 1;
  const parsed = await parseRequest(request); // §3c strict native document/input checks also apply
  expect(parsed.operationName).toBe('CreateOneCampaign');
  expect(parsed.variables).toEqual({ input: inputForDispatch });
  dispatched.resolve();
  await responseGate.promise;
  if (lateError === 'transport-type-error') throw new TypeError('Synthetic late delivery loss');
  if (lateError === 'terminal-error') throw terminalError;
  return { status: lateError === 'http413' ? 413 : 503,
    body: 'Synthetic late HTTP error', headers: { 'Content-Type': 'text/plain' } };
});
const operationPromise = client.mutate({
  mutation: campaignCreateOneRecordMutation,
  variables: { input: inputForDispatch }, fetchPolicy: 'no-cache', errorPolicy: 'none',
  context: { campaignCreation: createContext, queryDeduplication: false },
});
// Attach the rejection assertion before releasing a potentially rejected promise.
const rejected = expect(operationPromise).rejects.toBeInstanceOf(CampaignCreationBoundaryError);
await dispatched.promise;
expect(coreTransportCalls).toBe(1);
expect(createContext.transport).toEqual({ dispatched: true, uncertain: false });
const nextWorkspaceId = '34700000-0000-4000-8000-000000000012';
const nextUserId = boundaryChange === 'logout-new-actor'
  ? '34700000-0000-4000-8000-000000000013' : USER_ID;
const nextUserWorkspaceId = '34700000-0000-4000-8000-000000000014';
const nextMemberId = '34700000-0000-4000-8000-000000000015';
const previousUserWorkspace = store.get(currentUserWorkspaceState.atom);
if (!previousUserWorkspace) throw new Error('Expected authenticated fixture');
if (boundaryChange === 'logout-new-actor') {
  localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
  store.set(tokenPairState.atom, null);
  store.set(currentUserState.atom, null);
  store.set(currentWorkspaceMemberState.atom, null);
  store.set(currentWorkspaceState.atom, null);
  store.set(currentUserWorkspaceState.atom, null);
}
const nextTokens = tokenPair({ workspaceId: nextWorkspaceId, userId: nextUserId,
  userWorkspaceId: nextUserWorkspaceId, workspaceMemberId: nextMemberId });
localStorage.setItem(TOKEN_PAIR_LOCAL_STORAGE_KEY, JSON.stringify(nextTokens));
store.set(tokenPairState.atom, nextTokens);
store.set(currentWorkspaceState.atom, { ...workspace, id: nextWorkspaceId });
store.set(currentUserState.atom, { ...user, id: nextUserId });
store.set(currentWorkspaceMemberState.atom, { ...member, id: nextMemberId,
  userWorkspaceId: nextUserWorkspaceId });
store.set(currentUserWorkspaceState.atom, { ...previousUserWorkspace });
responseGate.resolve();
await rejected;
await jest.advanceTimersByTimeAsync(7000);
expect(coreTransportCalls).toBe(1);
expect(authenticatedForwards).toBe(1);
expect(createContext.transport).toEqual({ dispatched: true, uncertain: false });
expect(mockRenewToken).toHaveBeenCalledTimes(0);
expect(mockOnPayloadTooLarge).toHaveBeenCalledTimes(0);
expect(mockOnNetworkError).toHaveBeenCalledTimes(0);
expect(mockOnError).toHaveBeenCalledTimes(0);
expect(mockOnUnauthenticatedError).toHaveBeenCalledTimes(0);
```

`currentUserWorkspaceState` contains permission data, not an `id`; userWorkspace identity is carried by the token and member's `userWorkspaceId`. Keep the permission payload valid for the new synthetic identity; do not fabricate an atom property.

**Current-session and default controls are unconditional:** reuse the deferred HTTP413 transport with **no** identity transition, attach `const rejected = expect(operationPromise).rejects.toMatchObject({statusCode:413})`, release the gate, then `await rejected` and assert core1/auth1/renew0, payload callback1/network callback0, uncertainty false. Run once opted-in and once with no `campaignCreation` context: neither may be suppressed. For a same-identity terminal Error use two planned deliveries (native retry unchanged), advance the bounded 7000ms, assert rejects with that error, core2/auth1/renew0/network callback1/payload callback0. These controls prohibit globally disabling callbacks or classifying every transport error as BoundaryError.

**Real index/UI negative proof:** repeat the two-boundary × late-error matrix in `useCreateNewIndexRecord.responseLoss.test.tsx` through the real index hook/real factory (§3 wrapper), not a directly caught replacement create. Add the factory `onPayloadTooLarge` callback using real `useSnackBar().enqueueErrorSnackBar({message,options:{dedupeKey:'payload-too-large'}})` as in `useApolloFactory.ts:99–105`; obtain it with a rendered probe under the native snackbar/Jotai provider. Spy around that real callback, not instead of it. The stale factory promise rejects BoundaryError in the focused suite; the real Campaign index handles it and resolves undefined. Keep the real event listener/native store/cache and navigation spy from §6. After dispatch, switch identity inside `act`, snapshot cache/store/snackbar queue, release error, await the index invocation and drain the bounded retry window. Assert create inputs `[originalInput]` only, Campaign `readIds=[]`, no resend/renewal, callback0, queue contains no new error snackbar (pending removal is allowed), no new Campaign fragment/list row/member attachment, store unchanged, create events0, navigation0 and loading/pending controls settled. Do not claim a never-wired navigation spy in the direct factory suite proves the index behavior. In the current-session HTTP413 integration control, assert native payload callback1 and exactly one snackbar with dedupeKey `payload-too-large`; any separate existing friendly index error must not be suppressed as part of this fix. No stale terminal error may enqueue either snackbar.

### 4e. Revision-4 awaited-false callback regression

Use the §4d real-factory fixture with HTTP413 and identity A still valid when its deferred response is released. Parameterize workspace switch and logout/new actor. Retain §4d's current-identity opted/default HTTP413 and terminal-network controls unchanged. The test-only scheduling seam observes the existing native retry diagnostic; it does not replace retryIf, RetryLink, auth, getTokenPair or the transport response.

Insert this scheduling observer before calling `client.mutate` in the §4d fixture. The fixture supplies the same store/workspace/user/member/tokenPair constants and real leased `createContext`; its deferred transport still returns actual HTTP413. Unlike §4d, do not change identity before releasing `responseGate`.

```ts
let scheduledTransition: Promise<void> | undefined;
let retryDiagnosticCount = 0;
let boundaryWasCurrent = false;
let transitionRan = false;
const diagnosticSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
  if (args[0] !== 'retryIf error from retryLink' ||
      !ServerError.is(args[1]) || args[1].statusCode !== 413) return;
  retryDiagnosticCount += 1;
  assertCampaignCreationCurrent(createContext);
  boundaryWasCurrent = true;
  scheduledTransition = Promise.resolve().then(() => {
    const nextWorkspaceId = '34700000-0000-4000-8000-000000000012';
    const nextUserId = boundaryChange === 'logout-new-actor'
      ? '34700000-0000-4000-8000-000000000013' : USER_ID;
    const nextUserWorkspaceId = '34700000-0000-4000-8000-000000000014';
    const nextMemberId = '34700000-0000-4000-8000-000000000015';
    const previousUserWorkspace = store.get(currentUserWorkspaceState.atom);
    if (!previousUserWorkspace) throw new Error('Expected authenticated fixture');
    if (boundaryChange === 'logout-new-actor') {
      localStorage.removeItem(TOKEN_PAIR_LOCAL_STORAGE_KEY);
      store.set(tokenPairState.atom, null);
      store.set(currentUserState.atom, null);
      store.set(currentWorkspaceMemberState.atom, null);
      store.set(currentWorkspaceState.atom, null);
      store.set(currentUserWorkspaceState.atom, null);
    }
    const nextTokens = tokenPair({ workspaceId: nextWorkspaceId, userId: nextUserId,
      userWorkspaceId: nextUserWorkspaceId, workspaceMemberId: nextMemberId });
    localStorage.setItem(TOKEN_PAIR_LOCAL_STORAGE_KEY, JSON.stringify(nextTokens));
    store.set(tokenPairState.atom, nextTokens);
    store.set(currentWorkspaceState.atom, { ...workspace, id: nextWorkspaceId });
    store.set(currentUserState.atom, { ...user, id: nextUserId });
    store.set(currentWorkspaceMemberState.atom, { ...member, id: nextMemberId,
      userWorkspaceId: nextUserWorkspaceId });
    store.set(currentUserWorkspaceState.atom, { ...previousUserWorkspace });
    transitionRan = true;
  });
});
try {
  const operationPromise = client.mutate({
    mutation: campaignCreateOneRecordMutation,
    variables: { input: inputForDispatch }, fetchPolicy: 'no-cache', errorPolicy: 'none',
    context: { campaignCreation: createContext, queryDeduplication: false },
  });
  const rejected = expect(operationPromise).rejects.toBeInstanceOf(CampaignCreationBoundaryError);
  await dispatched.promise;
  assertCampaignCreationCurrent(createContext);
  responseGate.resolve();
  await rejected;
  await scheduledTransition;
  expect(retryDiagnosticCount).toBe(1);
  expect(boundaryWasCurrent).toBe(true);
  expect(transitionRan).toBe(true);
  expect(() => assertCampaignCreationCurrent(createContext))
    .toThrow(CampaignCreationBoundaryError);
  expect(coreTransportCalls).toBe(1);
  expect(authenticatedForwards).toBe(1);
  expect(createContext.transport.uncertain).toBe(false);
  expect(mockRenewToken).not.toHaveBeenCalled();
  expect(mockOnPayloadTooLarge).not.toHaveBeenCalled();
  expect(mockOnNetworkError).not.toHaveBeenCalled();
  expect(mockOnError).not.toHaveBeenCalled();
  expect(mockOnUnauthenticatedError).not.toHaveBeenCalled();
} finally {
  diagnosticSpy.mockRestore();
}
```

Use the same narrowly filtered microtask schedule in the §4d real-index/UI fixture, with native transition updates inside testing-library `act` as required. Assert no read/resend/renewal, no new error snackbar and no stale cache/store/event/navigation; legitimate session cleanup/pending removal is allowed. Observe the real snackbar callback rather than a disconnected spy. Exact timing: diagnostic occurs after downstream tap.error passes, enqueues the transition, synchronous retryIf returns false, and its awaited continuation runs after the transition. Before the ErrorLink entry correction the identical schedule yields HTTP413 and invokes payload callback; retain that intended RED, not a missing-fixture/import failure. If the production diagnostic is later removed, update this test's bounded scheduling observation without introducing a production test hook. No storage/token values are logged.

Run the actual factory and index integration suites with `--testNamePattern='awaited false'` for this RED/GREEN pair; put both parameterized regression groups in `describe('awaited false')`. Then run §9's combined targeted commands. Revision-3 owner/inverse fixtures and passing planning-test audit remain unchanged; independent revision-4 review covers this amended error-boundary implementation recipe and its tests before any application edits.

## 5. Task: native Campaign persistence/read/completion (causal GREEN)

**Files:** `useCreateOneRecord.ts`, index hook. Keep local functions inside the existing create hook; no generic external recovery engine. Hook-level query builder is unconditional, but only the opt-in branch dispatches it; effective Campaign fields add id/deletedAt to native depth-one/explicit selection. When explicit selection is used on a **default** caller, preserve it exactly.

- [ ] Wrap whole body from setLoading through preparation/mutation/completion in try/finally. Move existing default branch unchanged inside it; remove update-only setLoading. This includes sanitizer/cache-preparation exceptions.
- [ ] Opt-in requires `objectNameSingular === 'campaign'`, attempt metadata ID and `recordInput.id` equal retained ID, and canonical JSON payload equal the saved payload. Reject forged/incompatible options before dispatch. Context is internal only.
- [ ] Local `readRetainedCampaign(context): Promise<RecordGqlNode | null>` obtains native `findOneRecordQuery` with exact ID and strict no-cache/error policy. Missing root property is UnconfirmedError, **only explicit root null** is absence. Validate selected response using metadata scalar types/nullable settings; root must have exact ID, Campaign typename and deletedAt null. Use Zod object for minimum identity shape and native metadata field iteration for selected mandatory fields; missing property fails. No unrequested-field requirement or inferred relation proof. Native getRecordFromRecordNode converts only after verification.

```ts
const result = await apolloCoreClient.query<Record<string, RecordGqlNode | null>>({
  query: findOneRecordQuery,
  variables: { objectRecordId: attempt.recordId },
  fetchPolicy: 'no-cache', errorPolicy: 'none',
  context: { campaignCreation: readContext, queryDeduplication: false },
});
assertCampaignCreationCurrent(readContext);
if (!result.data || !Object.hasOwn(result.data, 'campaign')) {
  throw new CampaignCreationUnconfirmedError();
}
const node = result.data.campaign;
if (node === null) return null;
return validateCampaignNode(node, readContext, findOneRecordQuery);
```

Use the following node validator local to the Campaign branch; place only `hasCompleteCampaignCreationSelection` in the existing new `campaignCreationOperation.ts` utility so the narrow aggregate branch can share that exact structural completeness check. Pass the actual generated mutation/read document; these generated documents have a single unaliased root and no fragments. This is not a new all-object schema framework. Validate Campaign's authority/core scalars explicitly, preserve other native selected values, and reject incomplete nested data. Native GraphQL/server schema remains authority for other field types.

```ts
export const hasCompleteCampaignCreationSelection = (value: unknown, selection: SelectionSetNode): boolean => {
  if (value === null) return true; // permitted GraphQL nullable relation; core nullability checked below
  if (Array.isArray(value)) return value.every((item) => hasCompleteCampaignCreationSelection(item, selection));
  if (typeof value !== 'object' || value === null) return false;
  const object = value as Record<string, unknown>;
  return selection.selections.every((field) => {
    if (field.kind !== Kind.FIELD) return false;
    const key = field.alias?.value ?? field.name.value;
    if (!Object.hasOwn(object, key) || object[key] === undefined) return false;
    return !field.selectionSet || hasCompleteCampaignCreationSelection(object[key], field.selectionSet);
  });
};
const validateCampaignNode = (
  value: unknown, context: CampaignCreationOperationContext, document: DocumentNode,
): RecordGqlNode => {
  assertCampaignCreationCurrent(context);
  const parsed = z.object({
    id: z.string().uuid(), __typename: z.literal('Campaign'), deletedAt: z.null(),
    name: z.string().nullable().optional(), objective: z.string().nullable().optional(),
    position: z.number().nullable().optional(),
    createdAt: z.string().optional(), updatedAt: z.string().optional(),
  }).passthrough().safeParse(value);
  const operation = getOperationAST(document);
  const root = operation?.selectionSet.selections[0];
  if (!parsed.success || parsed.data.id !== context.store.get(campaignCreationState.atom)
      .attempts[context.attemptKey]?.recordId || root?.kind !== Kind.FIELD ||
      !root.selectionSet || !hasCompleteCampaignCreationSelection(parsed.data, root.selectionSet)) {
    throw new CampaignCreationUnconfirmedError();
  }
  for (const field of objectMetadataItem.readableFields) {
    if (Object.hasOwn(parsed.data, field.name) && field.isNullable === false && parsed.data[field.name] === null) {
      throw new CampaignCreationUnconfirmedError();
    }
  }
  return parsed.data;
};
```

The selected id/deletedAt must be readable **before** generating/sending the query. A denied required field is unavailable confirmation, not permission to force selection. An unselected optional Name/Objective is not required. No root null from a mutation can become absence proof. Tests cover wrong ID/type, selected core scalar shape, missing scalar/connection/nested property and soft deletion. Catch malformed dispatched mutation result as unconfirmed; do not run native completion.

- [ ] Dispatch native mutation with **no optimistic/update/refetch callbacks**, and no cache writes before validation:

```ts
const result = await apolloCoreClient.mutate<Record<string, RecordGqlNode>>({
  mutation: campaignCreateOneRecordMutation,
  variables: { input: JSON.parse(attempt.inputJson!) },
  fetchPolicy: 'no-cache', errorPolicy: 'none',
  context: { campaignCreation: createContext, queryDeduplication: false },
});
assertCampaignCreationCurrent(createContext);
const node = validateCampaignNode(result.data?.createCampaign, createContext, campaignCreateOneRecordMutation);
```

The installed Apollo `core/QueryManager.js:128–155` uses `CacheWriteBehavior.FORBID` for this policy. `no-cache` does not prevent an explicit update callback; **omit it**. Mutation auth/response guards remain mandatory even without normalization because stale results must not be marked saved.

- [ ] Implement exact finite flow, not recursion:
  - `intent:create`: one mutate. On terminal eligible transport or narrow duplicate **and** current attempt uncertainty, one read. On authoritative null throw UnconfirmedError; do not resend during initial recovery.
  - `intent:retry`: one read first. Exact node completes; null permits this explicitly requested one same-ID mutate after create permission check. Its eligible failure allows one final read. Prior uncertainty remains true, including first-response duplicate on resend. Offline/forbidden/malformed read throws without mutate.
  - `intent:open-saved`: no mutation ever. If operation boundary has changed, one current authorized read; exact record opens, missing/denied/ambiguous retains saved status (not downgraded to creatable). Do not re-run completion. Same active-boundary saved node may be reused only with current identity/read permission guard.
  - Known auth/validation/403/413 errors after uncertainty never invoke automatic recovery in that invocation; keep uncertain attempt. Fresh known errors clear it. Unknown errors before dispatch clear; unknown dispatched mutation response retains UnconfirmedError.
- [ ] Mark phase saved, node and savedBoundaryGeneration=context.boundaryGeneration before native completion. Set completionAttempted=true before any completion side effects. No catch after this point may run rollback or creation retry. Build authoritative flat record with native `getRecordFromRecordNode`, write fragment with `createOneRecordInCache(flatRecord)`, then native list insertion and store. Record warning names in attempt data.

Bounded completion code pattern (all functions are the existing hook dependencies, not callbacks stored in state):

```ts
let normalized = false;
try {
  assertCampaignCreationCurrent(context);
  normalized = isDefined(createOneRecordInCache(record));
  if (!normalized) warnings.push('cache');
} catch (error) {
  if (error instanceof CampaignCreationBoundaryError) throw error;
  warnings.push('cache');
}
if (normalized) {
  try {
    assertCampaignCreationCurrent(context);
    triggerCreateRecordsOptimisticEffect({
      cache: apolloCoreClient.cache, objectMetadataItem, objectMetadataItems,
      // Deferred create has no prior optimistic attach; do not diff against the new fragment.
      recordsToCreate: [node], checkForRecordInCache: false,
      shouldMatchRootQueryFilter: true, objectPermissionsByObjectMetadataId,
      creationPosition: attempt.origin.position ?? undefined,
      upsertRecordsInStore,
    });
  } catch (error) {
    if (error instanceof CampaignCreationBoundaryError) throw error;
    warnings.push('cache');
  }
}
try {
  assertCampaignCreationCurrent(context);
  upsertRecordsInStore({ partialRecords: [record] });
} catch (error) {
  if (error instanceof CampaignCreationBoundaryError) throw error;
  warnings.push('store');
}
try {
  assertCampaignCreationCurrent(context);
  await refetchAggregateQueries({ objectMetadataNamePlural: 'campaigns', campaignCreation: context });
  assertCampaignCreationCurrent(context);
} catch (error) {
  if (error instanceof CampaignCreationBoundaryError) throw error;
  warnings.push('aggregate');
}
try {
  assertCampaignCreationCurrent(context);
  dispatchObjectRecordOperationBrowserEvent({ objectMetadataItem,
    operation: { type: 'create-one', createdRecord: { ...node, position: attempt.origin.position } },
  });
} catch (error) {
  if (error instanceof CampaignCreationBoundaryError) throw error;
  warnings.push('event');
}
return record;
```

Freeze `checkForRecordInCache:false` for this opted-in completion only. Native `triggerCreateRecordsOptimisticEffect.ts:51–77` then passes `currentSourceRecord:null` to relation reconciliation, so `triggerUpdateRelationsOptimisticEffect.ts:152–169` does not compare the new owner to itself and skip `:227–246` inverse attachment. `triggerAttachRelationOptimisticEffect.ts:68–104,115–126` already dedupes a cached Campaign reference and updates the WorkspaceMember store. Keep fragment-first normalization: passing false restores create/attach semantics, not earlier optimistic mutation, detach/reattach, callback replay or a new relation framework. §6a must fail if this flag regresses to true even when scalar/list tests still pass.

Persist the deduped warnings on the saved attempt using lease-checked store updates after each step/at finally. If boundary changes during aggregate await, do not run later events/navigation or surface warning in a new workspace; saved remains retained in surviving old session. Do not call completion a second time even if a cache step partially mutated before throwing. Server/browser listeners may have their own effects; this fix does not certify event subscriber completion.

- [ ] Index Campaign path checks current origin mount+path before original group writes/navigation. Group update uses original group metadata and original position, deduping ID:

```ts
const withoutCreated = currentRecordIds.filter((id) => id !== createdRecord.id);
const ids = attempt.origin.position === 'first'
  ? [createdRecord.id, ...withoutCreated]
  : [...withoutCreated, createdRecord.id];
store.set(recordIndexRecordIdsByGroupCallbackState(recordGroup.id), ids);
```

Use captured original instanceId when obtaining callback-state family; do not apply a second control's group defaults. If the currently mounted original index now groups by a different field metadata ID, skip its grouped-ID update and record a group warning rather than writing old-group IDs into new grouping. Catch group errors as warning, still open saved record. Campaign has no scoped membership consumer: do not retain/run arbitrary `onRecordCreated`; default non-Campaign path remains as-is. Native page/side-panel args unchanged. Clear saved entry only after successful authorized navigation; failed/absent origin returns undefined with saved retained and Return-to-origin action. `finally` removes pending message and releases owned run. Use current mounted original origin, not a stale command closure.

- [ ] Show native pending feedback:

```ts
const pendingKey = `campaign-create-${recordId}`;
enqueueInfoSnackBar({ message: t`Creating Campaign…`, options: { dedupeKey: pendingKey, progress: 0 } });
```

Native `SnackBar.tsx:161` disables auto-dismiss when progress is defined. Its hook does **not** return or accept an ID override. Read the assigned ID from the native snackbar queue by dedupeKey using the current `SnackBarComponentInstanceContext` instance ID, retain this ID only in the invocation's local variable, and remove it through `handleSnackBarClose(id)` in finally. Cross-control busy feedback uses the same dedupeKey, so it cannot replace the owner's pending message. Native toolbar progress still disables its own control; table clicks receive the shared busy result. Unconfirmed state shows the spec's New/check-and-retry message. Return-to-origin uses guarded router `navigate(returnPath)` in snackbar buttonOnClick, never a full reload; only immutable path data is in attempt state, not this closure. Validate the captured and action-time relative path with existing `F/auth/utils/isValidReturnToPath.ts` so protocol-relative/external/auth return paths cannot be used. Warning copy distinguishes aggregate-only from cache/store/group/event warnings; use Lingui `t` for every message.

- [ ] Table handled-result code:

```ts
const createdRecord = await createNewIndexRecord({ position: 'last' });
if (!isDefined(createdRecord)) return;
upsertRecordsInStore({ partialRecords: [createdRecord] });
```

- [ ] Rerun native-hook causal regression GREEN without weakening its red assertions, then baseline shared/index suites. Add ordinary Campaign response no recovery read; initial pending list/count unchanged is the approved timing change.

### 5a. Preserve insertion order without falsifying authoritative position

Supervisor approved this narrow optional primitive extension for re-audit. Add `creationPosition?: 'first' | 'last'` to `TriggerCreateRecordsOptimisticEffectArgs` and destructuring in `triggerCreateRecordsOptimisticEffect.ts`. Apply it **only** when constructing the arguments to existing `buildSortedConnectionEdges`, after `isRecordMatchingFilter`, toReference/cursor computation and deduplication have used the authoritative record. Do not mutate `recordsToCreate`; group-by effects outside the root-field modifier must keep the original numeric record. `buildSortedConnectionEdges` currently treats string first/last as absolute hints even with sorts, so never supply the new hint when a root query has an explicit orderBy.

```ts
const hasExplicitSort = Array.isArray(rootQueryVariables?.orderBy) && rootQueryVariables.orderBy.length > 0;
const entriesForSorting = creationPosition && !hasExplicitSort
  ? newEntries.map((entry) => ({ ...entry, record: { ...entry.record, position: creationPosition } }))
  : newEntries;
const sortedEdges = buildSortedConnectionEdges({
  currentEdges: rootQueryCachedRecordEdges ?? [],
  newEntries: entriesForSorting,
  orderBy: rootQueryVariables?.orderBy,
  readField,
});
```

Source-named new primitive test uses actual InMemoryCache/fragment/list docs and native trigger, not a mocked sorter. Start nodes A.position=10, B.position=20, new.position=15. Unsorted + first→[new,A,B], last→[A,B,new]. Explicit position ascending + either hint→[A,new,B]. Numeric filter position.eq=15 includes new regardless of hint; position.eq=99 excludes it. Position group dimensions are ['15'], never ['first']/['last']. readFragment and native store keep position=15. With no option preserve existing behavior, including existing callers supplying record.position string. SSE-preinserted edge yields one edge/count only; no force-reposition of an already inserted edge. Group-ID array ordering is independently tested in the index as described above.

### 5b. Guard the Campaign-initiated aggregate refresh without watcher mutation

Supervisor conditionally approved this additional existing-hook seam for independent audit. Modify `useRefetchAggregateQueries.ts` signature only by adding optional `campaignCreation?: CampaignCreationOperationContext` to its existing argument object; `Promise<void>` stays unchanged. The native names/active-observable selection are reused. Default callers execute the existing `refetchQueries({include:activeAggregateQueryNames})` untouched. In the Campaign branch snapshot exact documents/variables, no-cache read under a derived `kind:'read'` context, then check current identity and that the same observable is still active with unchanged variables/document before `writeQuery`. Never mutate its options, call refetch after write or write partial GraphQL errors. Use existing `~/utils/isDeeplyEqual`.

```ts
if (!campaignCreation) {
  await apolloCoreClient.refetchQueries({ include: activeAggregateQueryNames });
  return;
}
const snapshots = [...apolloCoreClient.getObservableQueries('active')]
  .filter((observable) => activeAggregateQueryNames.includes(observable.queryName ?? ''))
  .map((observable) => ({
    observable, query: observable.options.query,
    variables: structuredClone(observable.variables),
  }));
const refreshed = await Promise.allSettled(snapshots.map(async (snapshot) => {
  const stillActive = () => apolloCoreClient.getObservableQueries('active').has(snapshot.observable) &&
    snapshot.observable.options.query === snapshot.query &&
    isDeeplyEqual(snapshot.observable.variables, snapshot.variables);
  if (!stillActive()) return;
  const context: CampaignCreationOperationContext = {
    ...campaignCreation, kind: 'read', transport: { dispatched: false, uncertain: false },
  };
  assertCampaignCreationCurrent(context);
  const result = await apolloCoreClient.query({
    query: snapshot.query, variables: snapshot.variables,
    fetchPolicy: 'no-cache', errorPolicy: 'none',
    context: { campaignCreation: context, queryDeduplication: false },
  });
  assertCampaignCreationCurrent(context);
  const operation = getOperationAST(snapshot.query);
  if (!result.data || result.error || !operation ||
      !hasCompleteCampaignCreationSelection(result.data, operation.selectionSet)) {
    throw new Error('Campaign aggregate refresh returned no authoritative data');
  }
  if (!stillActive()) return;
  apolloCoreClient.writeQuery({ query: snapshot.query, variables: snapshot.variables, data: result.data });
}));
const failed = refreshed.find((result) => result.status === 'rejected');
if (failed?.status === 'rejected') throw failed.reason;
```

`getObservableQueries('active')` is a Set in installed ApolloClient.d.ts:1390. Await all snapshots before releasing the Campaign lease. Disposed or re-scoped watchers are skipped, never resurrected. Assert native observers receive the new absolute result from writeQuery without a second request, filter variables stay exact, inactive/unrelated query names excluded. Inject partial data+GraphQL errors (strict policy rejects; cache untouched), workspace/session switch before response (guarded inbound; no write), one of two refreshes failing (saved warning; no rollback), watcher disposal/variable change (no old-scope write), default omitted option (existing refetchQueries call unchanged). Extend existing aggregate hook suite for default API compatibility; real fixture §6 establishes actual observable/count effects. Bound this to Campaign creation action only; no general auth/cache refactor.

## 6. Task: cache, mutations, saved failures and user progression (test-first)

Same real-client integration file; add explicit recognized query documents and transport branches. Use public `gql`/native generated create/read/update documents, not fabricated create return mocks. Native aggregate hook selects active operation names `AggregateCampaigns` and `CampaignsGroupByAggregates`.

```ts
const listQuery = gql`
  query FindManyCampaigns($filter: CampaignFilterInput, $orderBy: [CampaignOrderByInput!]) {
    campaigns(filter: $filter, orderBy: $orderBy) {
      edges { node { id name objective position createdAt updatedAt deletedAt __typename } cursor __typename }
      totalCount pageInfo { startCursor endCursor hasNextPage hasPreviousPage __typename } __typename
    }
  }
`;
const aggregateQuery = generateAggregateQuery({
  objectMetadataItem: campaign, recordGqlFields: { totalCount: true },
});
const groupAggregateQuery = generateGroupByAggregateQuery({
  objectMetadataItem: campaign, aggregateOperationGqlFields: ['totalCount'],
});
const groupRecordsQuery = generateGroupByRecordsQuery({
  objectMetadataItem: campaign, objectMetadataItems: metadata,
  recordGqlFields: selectedFields, computeReferences: false,
  objectPermissionsByObjectMetadataId: { [CAMPAIGN_METADATA_ID]: permissions },
});
const groupVariables = { groupBy: [{ objective: true }], filter: {} };
const fragment = gql`
  fragment VerifiedCampaign on Campaign { id name objective position createdAt updatedAt deletedAt }
`;
```

Import `generateAggregateQuery` from `F/object-record/utils/generateAggregateQuery.ts`, `generateGroupByAggregateQuery` from `F/object-record/record-aggregate/utils/generateGroupByAggregateQuery.ts`, and `generateGroupByRecordsQuery` from `F/object-record/utils/generateGroupByRecordsQuery.ts`. These generate actual `AggregateCampaigns`, `CampaignsGroupByAggregates`, and `GroupByCampaigns` documents. Server `object-metadata-group-by-gql-input-type.generator.ts:86–120` maps non-date scalar group fields to GraphQLBoolean, so objective:true is the frozen correct shape, not an enum guess. Transport strict variables: list/aggregate permit only `{filter:{}}`, `{filter:{objective:{eq:'MATCH'}}}`, `{filter:{objective:{eq:'OTHER'}}}`; both group queries require exact `groupVariables`. List variables may additionally contain only `orderBy:[]` (unsorted) or `orderBy:[{position:'AscNullsLast'}]` (sorted native `OrderBy` string union from twenty-shared/types); aggregate variables remain filter-only. Numeric-filter primitive tests additionally recognize only position.eq=15 and position.eq=99. No unknown filter/sort may silently match. Return native CampaignConnection/CampaignEdge/PageInfo and CampaignGroupByConnection typenames using existing helpers. Map permitted objective filters by equality; counts come from Map; edges use native encodeCursor. Group dimension MATCH counts from Map, not a synthetic delta. Seed two original IDs with objective MATCH and positions 10,20, one OTHER at 30; matching count starts **2**, nonmatching **1**, overall/aggregate **3**.

Before creation write three list variants into cache with `client.writeQuery`, and activate aggregate and groupAggregate watchers via `client.watchQuery({query,fetchPolicy:'network-only'}).subscribe(...)`. Wait for their initial exact Map counts. Keep unsubscribe handles and client.stop cleanup. Assert aggregate **request names/counts and returned data**, not merely a spy on refetchAggregateQueries. An inactive aggregate query has no subscription and must not be dispatched. Add an unrelated active aggregate name to prove no broad refetch.

Capture real store and event observations:

```ts
const events: ObjectRecordOperationBrowserEventDetail[] = [];
const onRecordEvent = (event: Event) => events.push(
  (event as CustomEvent<ObjectRecordOperationBrowserEventDetail>).detail);
window.addEventListener(OBJECT_RECORD_OPERATION_BROWSER_EVENT_NAME, onRecordEvent);
// After verified save:
expect(cache.readFragment({ id: `Campaign:${attemptedId}`, fragment })).toMatchObject({
  id: attemptedId, name: 'Server Campaign', objective: 'MATCH', deletedAt: null,
});
expect(store.get(recordStoreFamilyState.atomFamily(attemptedId))).toMatchObject({
  id: attemptedId, name: 'Server Campaign', objective: 'MATCH',
});
expect(events.filter((event) => event.objectMetadataItem.id === CAMPAIGN_METADATA_ID &&
  event.operation.type === 'create-one')).toHaveLength(1);
```

Assertions per independent case (write/run RED before implementing case):

| Case | Exact observable outcome |
|---|---|
| Ordinary/recovered saved fields differ from defaults | Pending: no new fragment/list row, aggregate 3. Saved: fragment and native store authoritative server values; overall 4, MATCH 3, OTHER 1; exactly one new edge ID; route same ID |
| First/last ordering and group arrays | Initial original group IDs [A,B]; first becomes [new,A,B], last [A,B,new]; repeat SSE prior insertion never adds same ID twice |
| SSE-preinsert before recovery returns | Fixture inserts node into cache and native group/store using existing primitive before read settles; completion still 4/3/1 absolute counts, one event from this attempt, no duplicated IDs or eviction |
| Stale optimistic/cache-only shell seeded manually | Server exact read null never proves success. Initial recovery null retains unconfirmed; explicit New reads then same-ID resend only after authoritative null |
| Both automatic requests fail before save | Initial mutation dispatches 2, Map delta0; recovery read1/null; New triggers read1/null then create1/deliver; total creates3 with identical payload, one row, no new UUID |
| Second automatic request saves but response also lost | First fail-before, second fail-after; Map delta1, creates2, recovery read1 succeeds; exactly one normalized row/open |
| Both fail-after-save | First persists/lost; second duplicate delivered in normal fixture. Separate duplicate delivery loss mode rejects after constructing duplicate, yielding final transport; exact read still recovers same ID |
| Read denial/offline/malformed/partial | For null+GraphQL errors, forbidden GraphQL, client permission false, wrong ID/type, deletedAt nonnull, missing root/required selected field: no false saved/navigation. Offline read uses native max2, not infinite loop; subsequent New retains exact input/ID |
| Known validation/auth after transport | No recovery read in that invocation; genuine error once; uncertainty retained, no wrong conflict target |
| Fresh first-response duplicate with preexisting exact ID | creates1, reads0, no navigate, no completion event, no cache eviction of preexisting row; fresh attempt clears; server-friendly error |
| Unique-name conflict with different ID | Same no-read/no-navigation outcome; ignore conflictingRecordId/object metadata |
| Delayed original commit after retry null | Initial uncertain then user retry read returns null; before resend response insert original ID into Map; resend's **first** response duplicate; exact recovery read1 succeeds; payload unchanged; no fresh UUID |
| Aggregate refresh rejects | Verified fragment/store/list remain; opens saved ID, aggregate warning once; no rollback/new creation as a response to failure; event attempted once; actual count watcher retains stale count (do not assert refreshed) |
| Fragment write throws or returns undefined | Persistence marked saved first; no list dangling ref insertion, store best-effort; saved target opens, refresh warning; no record eviction, mutation/read counts do not increase as a completion retry |
| List/store/group/event dispatch throws after save | Each injected seam once; no rollback/replay, other bounded steps continue if identity valid; saved target opens; truthful warning; subsequent intentional New allowed only after successful navigation clears |
| Navigation throws / origin unmount | Saved retained; next original-origin New opens same ID, creates0 and completion replay0; if authorization changed exact read required, null never resends saved record |

Use controlled spy throw **only** for the particular completion-failure injection, leaving normal cache behavior real in other cases. For browser event listener throws, browser dispatch does not propagate listener exceptions; do not assert they become caught cache warnings. Test the dispatch primitive throwing separately, and document listener receipts out of scope.

Native Name/Objective normal and recovered update code (actual imported `useUpdateOneRecord` hook):

```ts
await act(async () => {
  await result.current.updateOneRecord({
    objectNameSingular: 'campaign', idToUpdate: savedId,
    updateOneRecordInput: { name: 'UAT name', objective: 'UAT objective' },
    recordGqlFields: selectedFields,
  });
});
const reread = await client.query({
  query: findOneRecordQuery, variables: { objectRecordId: savedId },
  fetchPolicy: 'no-cache', errorPolicy: 'none',
});
expect(reread.data.campaign).toMatchObject({ id: savedId, name: 'UAT name', objective: 'UAT objective' });
expect(rows.get(savedId)).toMatchObject({ name: 'UAT name', objective: 'UAT objective' });
expect(updateIds).toEqual([savedId]);
expect(createInputs).toHaveLength(createCountBeforeUpdate);
```

Run parameterized normal/recovered versions; no application update-hook production change. Map persistence is transport-fixture evidence, **not native field-editor or server durability evidence**; UAT covers gestures/reload.

### 6a. Revision-3 normal/recovered Campaign owner inverse proof

Use only the §3e variant in `useCreateNewIndexRecord.responseLoss.test.tsx`, parameterized over `delivery:normal|recovered` × `priorAttach:false|true` (four fresh cases). No new suite/framework or production relation file. First run **without prior attach** RED against the revision-2 `checkForRecordInCache:true` sequence: the Campaign's own owner normalizes but the cached member's inverse remains `[existingId]`. Replacing the flag with false is the only relation correction. Both normal and recovered cases must go GREEN; prior-attach cases separately prove native dedup, not conceal the missing attach.

Capture actual `useCreateOneRecordInCache({objectMetadataItem:ownerCampaign})` and `useUpsertRecordsInStore()` in the §3e probe alongside the actual index hook. No mocks for relation reconciliation, cache/store or create. Start with only `existingCampaign` in rows, member readable/cached from its one native RLS query, native member store inverse `[existingId]`. No aggregate/list watchers in this small owner variant (the scalar §6 matrix already covers them). Set deliveries normal=`['deliver']`, recovered=`['fail-after-save','deliver']`; allow native RetryLink unchanged. The normal create result or recovered exact read is held **after** persistence/strict parsing but before delivery using the following two test-local gates:

```ts
const savedResponseReady = Promise.withResolvers<RecordGqlNode>();
const savedResponseGate = Promise.withResolvers<void>();
// In CreateOneCampaign, only on a successful nonduplicate normal delivery, before return:
if (delivery === 'normal') {
  savedResponseReady.resolve(node);
  await savedResponseGate.promise;
}
// In FindOneCampaign, only in the recovered variant, after exact-ID parsing:
const savedNode = rows.get(objectRecordId);
if (!savedNode) throw new Error('Expected persisted owner Campaign');
savedResponseReady.resolve(savedNode);
await savedResponseGate.promise;
// Return the recognized operation's original strict response; do not add a read in normal mode.
```

Use a distinct local name (`createDelivery`) for §3c's individual transport outcome so it does not shadow this test parameter `delivery`. Start the real index promise inside `act`, immediately attach a rejection capture as in the causal hook test, then advance the bounded native retry window only for recovered. Await savedResponseReady. At this point without prior attachment there is **no** generated Campaign fragment/store, no created event/navigation, and the owner's inverse still contains only the existing ID; asserting this before release proves no optimistic attach. The test's saved-node gate is not a fake recovery return.

For `priorAttach:true`, before releasing the saved response perform exactly this native normalization/attachment (an independently delivered native/SSE attachment seam, not a claim of an actual live SSE connection). `result.current` exposes the real hooks above. Call attach twice to establish dedup before Campaign completion as well:

```ts
const verifiedNode = await savedResponseReady.promise;
const attemptedId = verifiedNode.id;
const verifiedRecord = getRecordFromRecordNode({ recordNode: verifiedNode });
if (priorAttach) {
  act(() => {
    result.current.createOneRecordInCache(verifiedRecord);
    result.current.upsertRecordsInStore({ partialRecords: [verifiedRecord] });
    for (let attach = 0; attach < 2; attach += 1) {
      triggerAttachRelationOptimisticEffect({
        cache, sourceObjectNameSingular: 'campaign', sourceRecordId: attemptedId,
        targetObjectMetadataItem: ownerMember, fieldNameOnTargetRecord: 'ownedCampaigns',
        targetRecordId: MEMBER_ID, objectMetadataItems: ownerMetadata,
        objectPermissionsByObjectMetadataId: ownerPermissions,
        upsertRecordsInStore: result.current.upsertRecordsInStore,
      });
    }
  });
}
await act(async () => {
  savedResponseGate.resolve();
  settled = await indexPromise; // captured {value?,error?}, never an uncaught test-owned promise
});
expect(settled.error).toBeUndefined();
expect(settled.value?.id).toBe(attemptedId);
expect(ownerInputs).toHaveLength(delivery === 'normal' ? 1 : 2);
for (const input of ownerInputs) {
  expect(input).toEqual({ id: attemptedId, ownerId: MEMBER_ID,
    name: 'Client Campaign', objective: 'Client objective', position: 'first' });
}
expect(readIds).toEqual(delivery === 'normal' ? [] : [attemptedId]);
expect(memberReadIds).toEqual([MEMBER_ID]);
expect(rows.size).toBe(2); // one prior Campaign plus exactly one new persisted ID
expect(updateIds).toEqual([]);
```

No extra mutation/query/UUID may be added by attach or completion: assert the full `requestLog` normal=`['FindOneWorkspaceMember','CreateOneCampaign']`, recovered=`['FindOneWorkspaceMember','CreateOneCampaign','CreateOneCampaign','FindOneCampaign']`. There is one dispatch group, no user resend in these cases; every payload includes the retained ownerId. This focused matrix retains ownerId in the canonical input; existing native filter/RLS propagation coverage in §8 remains unchanged. Do not add a separate defaults/filter framework.

Freeze observable assertions, not a spy on triggerCreateRecordsOptimisticEffect. `fragment` from §6 is extended **only in this variant** with `ownerId owner { id name { firstName lastName } avatarUrl }`:

```ts
const ownerFragment = gql`
  fragment VerifiedOwnedCampaign on Campaign {
    id name objective position createdAt updatedAt deletedAt ownerId
    owner { id name { firstName lastName } avatarUrl }
  }
`;
const inverseFragment = gql`
  fragment MemberOwnedCampaigns on WorkspaceMember {
    id ownedCampaigns { edges { node { id } } }
  }
`;
const expectedSaved = {
  id: attemptedId, name: 'Authoritative owner Campaign', objective: 'Owner test',
  position: 15, createdAt: now, updatedAt: now, deletedAt: null,
  ownerId: MEMBER_ID, owner: { id: MEMBER_ID,
    name: { firstName: 'Campaign', lastName: 'Owner' }, avatarUrl: null },
};
expect(cache.readFragment({ id: `Campaign:${attemptedId}`, fragment: ownerFragment })).toMatchObject(expectedSaved);
expect(store.get(recordStoreFamilyState.atomFamily(attemptedId))).toMatchObject(expectedSaved);
const inverse = z.object({ id: z.literal(MEMBER_ID), ownedCampaigns: z.object({
  edges: z.array(z.object({ node: z.object({ id: z.string().uuid() }) })),
}) }).parse(cache.readFragment({ id: `WorkspaceMember:${MEMBER_ID}`, fragment: inverseFragment }));
const storedMember = z.object({ id: z.literal(MEMBER_ID),
  ownedCampaigns: z.array(z.object({ id: z.string().uuid() })),
}).parse(store.get(recordStoreFamilyState.atomFamily(MEMBER_ID)));
expect(inverse.ownedCampaigns.edges.map((edge) => edge.node.id)).toEqual([existingCampaign.id, attemptedId]);
expect(storedMember.ownedCampaigns.map((record) => record.id)).toEqual([existingCampaign.id, attemptedId]);
expect(events.filter((event) => event.objectMetadataItem.id === CAMPAIGN_METADATA_ID &&
  event.operation.type === 'create-one')).toHaveLength(1);
expect(mockNavigate).toHaveBeenCalledTimes(1);
expect(mockNavigate).toHaveBeenCalledWith(AppPath.RecordShowPage,
  { objectNameSingular: 'campaign', objectRecordId: attemptedId }, undefined,
  expect.objectContaining({ state: expect.objectContaining({ objectRecordId: attemptedId, isNewRecord: true }) }));
```

Assert the same inverse arrays immediately after prior attach, and after completion/draining the bounded retry window. No eviction/detachment of existing or new ID, no duplicate inverse edge/store member, no second create event/navigation, no refresh warning from this valid sequence. The arrays prove exactly-once ID inclusion, not simply `.toContain`. Native inverse connection totalCount is not maintained by attach; do not invent a count guarantee for it. Campaign root/list/aggregate counts remain §6's absolute count contract. Add the selected nested-field-missing ambiguity case for owner.name (from existing §5 completeness matrix): no verification/completion on incomplete selected relation. Default Person relation compatibility remains unchanged in §8.

## 7. Task: real commands, origins and truthful notification/control evidence

**Integration test remains distinct from captured native-hook causal RED.** Same file, `describe('real command')`, real `CreateNewIndexRecordNoSelectionRecordCommand` and `HeadlessEngineCommandWrapperEffect`/unmount hook. Run with `--testNamePattern='real command'` as a separate process gate. On baseline, a genuine unhandled private `run()` rejection is expected to fail Jest; record that failed process plus assertions/fixture counts. Do not install process handlers, suppress Jest errors or catch-and-resolve execute. After implementation it must pass cleanly. The safe native-hook regression already provides deterministic primary RED.

Seed real headless map/progress. The host below mimics native command-map ownership, not execute implementation; it unmounts only when native unmount removes map entry. No conditional assertion inside catch:

```tsx
const COMMAND_ID = 'campaign-create-command';
const api: HeadlessEngineCommandContextApi = {
  engineComponentKey: EngineComponentKey.CREATE_NEW_RECORD,
  contextStoreInstanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
  objectMetadataItem: campaign, currentViewId: VIEW_ID, recordIndexId: INDEX_ID,
  targetedRecordsRule: { mode: 'selection', selectedRecordIds: [] },
  selectedRecords: [], graphqlFilter: null, payload: null,
};
store.set(headlessCommandContextApisState.atom, new Map([[COMMAND_ID, api]]));
store.set(commandMenuItemProgressFamilyState.atomFamily(COMMAND_ID), 0);
const CommandHost = () => {
  const map = useAtomStateValue(headlessCommandContextApisState);
  return map.has(COMMAND_ID) ? (
    <CommandComponentInstanceContext.Provider value={{ instanceId: COMMAND_ID }}>
      <CreateNewIndexRecordNoSelectionRecordCommand />
    </CommandComponentInstanceContext.Provider>
  ) : null;
};
render(<CommandHost />, { wrapper: Wrapper });
await waitFor(() => expect(store.get(headlessCommandContextApisState.atom).has(COMMAND_ID)).toBe(false),
  { timeout: 15000 });
expect(store.get(commandMenuItemProgressFamilyState.atomFamily(COMMAND_ID))).toBeUndefined();
```

Run post-save loss success and genuine validation failure cases. Success: saved ID/native route once, no duplicate/error snackbar; failure: friendly real error once, map/progress clear, controls usable. Remount a newly keyed command after handled unconfirmed failure: same retained ID, read-before-resend policy. After completed success, returning to index/remounting New creates a different intentional ID. While toolbar pending click table hook action and vice versa: one owner, no extra UUID/request/completion/virtualization. Assert real snackbar queue through `snackBarInternalComponentState.atomFamily({instanceId:'campaign-test-snacks'})`; match message/variant/dedupe key, not an uninitialized array. Pending queue entry must appear before request resolution and disappear afterward.

Origin cases: originating surface unmount while command promise active; leave to another path; same-path different index; reopen original mounted origin; original workspace→another→back within continuous same actor; logout/login same actor. Check request count, immutable input, no stale cache/event, absence of surprise navigation, Return-to-origin action path and **action does not itself resend**. `buttonOnClick` uses current identity guard; stale snackbar cannot navigate a new session. Full reload continuity is explicitly not asserted as a feature; new provider/store has no retained state by design.

Table/empty-state suites: change visual stubs to forward onClick and reuse stable jest.fn spies defined outside mocks. Example:

```tsx
RecordTableActionRow: ({ text, onClick }: { text: string; onClick: () => void }) =>
  <button onClick={onClick}>{text}</button>
```

For table seed totalNumberOfRecordsToVirtualize=3 in the component-state stub by matching the actual state object, not returning false for all calls. Click Add New with `fireEvent.click`. With resolved `{id,...}` assert store upsert once and `loadRecordsToVirtualRows({records:[record],startingRealIndex:3})` once. With resolved undefined assert neither spy called. With pending cross-control result likewise never virtualize undefined. Both empty-state `RecordTableEmptyStateDisplay` stubs forward actual `onClick` and stable create spy; click and assert invocation, preserving hidden-control existing cases.

Unrelated error presentation regression is separate and non-vacuous:

```tsx
render(<PromiseRejectionEffect />, { wrapper: snackBarAndStoreWrapper });
const error = new CombinedGraphQLErrors({ errors: [{ message: 'Unrelated validation', extensions: { code: 'BAD_USER_INPUT' } }] });
const event = new Event('unhandledrejection');
Object.defineProperty(event, 'reason', { value: error });
act(() => window.dispatchEvent(event));
expect(store.get(snackBarInternalComponentState.atomFamily({ instanceId: 'campaign-test-snacks' })).queue)
  .toEqual(expect.arrayContaining([expect.objectContaining({ message: 'Unrelated validation' })]));
```

This controlled event tests the real effect, not actual browser unhandled-promise generation. Jest command clean completion provides process-level regression evidence; separate local UAT observes actual browser `unhandledrejection` and toast. Do not claim an empty window array after catching all promises proves this browser property.

## 8. Task: compatibility without widening recovery scope

- [ ] Preserve four existing Creator index tests unchanged. Their fourth Workflow-labeled case uses Creator metadata; add a new case obtaining actual `workflow` from `getTestEnrichedObjectMetadataItemsMock`, with explicit headless instanceId and no RecordIndexContext. Assert passed objectName and normal ID/default path; no Campaign options/read. No Workflow activation.
- [ ] Existing index mocked-shared-hook seam tests for board/group/calendar default propagation: caller position first/last, group value, start/end date inputs survive merge with RLS/filter in the existing precedence. For Campaign ownership test add attacker IDs from all three sources and assert ID assigned last; **do not alter non-Campaign ID semantics incidentally**.
- [ ] Shared create suite default Person success (existing baseline), ordinary first-response validation rejection, transport rejection, skipPostOptimisticEffect true, explicit recordGqlFields and sanitizer/cache preparation throw all preserve original return/reject/optimistic semantics and finally loading=false. Call without second argument, then with `{}`; no `FindOnePerson`/Campaign context in either. Test rejects with `await expect(...)`, never catch-only assertions.
- [ ] Relation/junction/target picker contract is explicitly bounded at the default shared create seam: input with existing native relation `connect.where` and join-column ID passes native sanitize unchanged, explicit selection honored, skip option preserved, errors reject, no readback. Use native Person relation metadata from standard fixture for this default opt-out seam. This does **not** establish the changed Campaign deferred inverse-attachment behavior; the bounded Campaign.owner variant in the same integration file (§§3e/6a) is mandatory. Do not add a separate relation recovery suite/framework or perform relationship deletion. Existing actual `useCreateActivityInDB.test.tsx` exercises native create with MockedProvider; `useOpenCreateActivityDrawer.test.tsx` is a mocked control compatibility case, not equivalent evidence. Run both exact paths in §9.
- [ ] Existing `useRefetchAggregateQueries`, `apollo.factory`, `useApolloFactory` suites remain green; new factory count assertions supplement their conditional-catch weakness. No global auth/toast policy change; only the scoped local BoundaryError callback bypass frozen in §4b.

## 9. Full targeted commands and evidence protocol (NOT run in this docs-only revision)

Run from exact cwd; save command stdout/stderr/status in `.myah347-local/` without request headers/tokens. No rerun install unless dependency state changed; immutable install already passed. Stop on setup failure, including build/module paths, and report rather than borrow modules.

```bash
export PATH=/home/zachary/.local/share/nodejs/node-v24.16.0-linux-x64/bin:$PATH
node --version
test "$PWD" = /home/zachary/development/myah-v4/.worktrees/zeno/myah-347-campaign-creation-recover-a-successful-save-after-response
test -d node_modules && test ! -L node_modules
test "$(realpath node_modules)" = "$PWD/node_modules"
node .yarn/releases/yarn-4.13.0.cjs nx build twenty-shared
```

Complete baseline command:

```bash
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath \
 packages/twenty-front/src/modules/object-record/hooks/__tests__/useCreateOneRecord.test.tsx \
 packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.test.tsx
```

Causal native-hook RED then unchanged GREEN; separate real-command regression process (do not catch the command's execute):

```bash
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx --testNamePattern='native hook recovers'
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx --testNamePattern='real command'
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/apollo/services/__tests__/apollo.factory.campaignCreation.test.ts
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/apollo/services/__tests__/apollo.factory.campaignCreation.test.ts --testNamePattern='deferred error'
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx --testNamePattern='deferred error'
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx --testNamePattern='Campaign owner inverse'
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath packages/twenty-front/src/modules/object-record/record-index/states/__tests__/campaignCreationState.test.ts
```

Each added behavior above gets smallest failing name/file command, saved expected failure then unchanged passing rerun. Fixture setup/import/translation failures are infrastructure failures, not RED evidence. All integration cleanup uses `finally`/afterEach: unmount hooks/components, unsubscribe watched queries/events/store listeners, stop client, reset fetch to saved implementation, restore timers/history/token storage/spies. Assert no scheduled retries/extra requests after cleanup; do not use unbounded runAllTimers loops.

Full final targeted group:

```bash
node node_modules/jest/bin/jest.js --config=packages/twenty-front/jest.config.mjs --runInBand --runTestsByPath \
 packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx \
 packages/twenty-front/src/modules/object-record/record-index/states/__tests__/campaignCreationState.test.ts \
 packages/twenty-front/src/modules/apollo/optimistic-effect/utils/__tests__/triggerCreateRecordsOptimisticEffect.test.ts \
 packages/twenty-front/src/modules/apollo/services/__tests__/apollo.factory.campaignCreation.test.ts \
 packages/twenty-front/src/modules/error-handler/components/__tests__/PromiseRejectionEffect.campaignCreation.test.tsx \
 packages/twenty-front/src/modules/object-record/hooks/__tests__/useCreateOneRecord.test.tsx \
 packages/twenty-front/src/modules/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.test.tsx \
 packages/twenty-front/src/modules/object-record/record-table/components/__tests__/RecordTableNoRecordGroupAddNew.test.tsx \
 packages/twenty-front/src/modules/object-record/record-table/empty-state/components/__tests__/RecordTableEmptyStateNoRecordFoundForFilter.test.tsx \
 packages/twenty-front/src/modules/object-record/record-table/empty-state/components/__tests__/RecordTableEmptyStateNoGroupNoRecordAtAll.test.tsx \
 packages/twenty-front/src/modules/object-record/hooks/__tests__/useRefetchAggregateQueries.test.tsx \
 packages/twenty-front/src/modules/apollo/services/__tests__/apollo.factory.test.ts \
 packages/twenty-front/src/modules/apollo/hooks/__tests__/useApolloFactory.test.tsx \
 packages/twenty-front/src/modules/activities/hooks/__tests__/useCreateActivityInDB.test.tsx \
 packages/twenty-front/src/modules/activities/hooks/__tests__/useOpenCreateActivityDrawer.test.tsx
node .yarn/releases/yarn-4.13.0.cjs nx build twenty-oxlint-rules
node .yarn/releases/yarn-4.13.0.cjs nx typecheck twenty-front
```

No-commit lint must include working tracked **and untracked** files; main...HEAD would falsely check nothing:

```bash
cd packages/twenty-front
mapfile -d '' files < <(
  { git diff --name-only --relative --diff-filter=ACMR -z HEAD -- src/;
    git ls-files --others --exclude-standard -z -- src/; } |
  sort -zu | grep -zE '\.(ts|tsx)$'
)
if ((${#files[@]})); then
  node ../../node_modules/oxlint/bin/oxlint --type-aware -c .oxlintrc.json "${files[@]}" &&
  node ../../node_modules/oxfmt/bin/oxfmt --check "${files[@]}"
fi
cd ../..
git diff --check
git status --short
git diff --cached --name-only
sha256sum docs/specs/MYAH-347-campaign-create-response-loss.md docs/plans/MYAH-347-campaign-create-response-loss.md
```

Report actual observed evidence: request/input identity sequence, inserted Map delta, null/error read shape, actual normalized fragment/store/list/group/count values, event count, command progress/map/snackbar state and saved/error destination. Test names/counts are inventory, not proof. Distinguish baseline diagnostics from introduced ones. No schema/server changes ⇒ no generation/migration required. Parent gets exact changed JS/TS paths for optional LSP. Required independent implementation reviewer checks evidence against spec transitions and source, not merely green suite names.

## 10. Later separate local UAT and ignored-document durability

Not authorized by this plan's existence. Parent delegates only after automated gates and independent implementation review. Dedicated isolated local runtime/workspace/data only, never original MYAH-323 or production; stop on setup failure, no fallback browser/protocol. Parent-owned worker reads prior setup lessons first, obtains explicit local interception authorization, records exact owned PIDs/services and restores all hooks/observers afterward. No activation, sends or deletion.

UAT observations: normal toolbar/table create (no speculative row while pending, controls show pending), correct current Outreach route rather than historical Overview, native Name/Objective edit/save/no-cache reload persistence; one-shot request-body-aware create response loss **after real successful response/persistence**, actual automatic same-ID retry, exact authorized read, one row/count delta and no duplicate toast/unhandled rejection; pre-dispatch failure control; user retry after two no-save failures (read null then same ID write), forbidden/offline read does not write; toolbar/table repeated actions/origin return; aggregate failure truthful saved warning where separately authorized. Capture safe operation/ID/status/timing only, never auth/body secrets. Restore browser fetch/listeners and report exact cleanup; no deleting records/volumes without separate authorization.

Before implementation, parent snapshots both **approved** ignored files to a durable run artifact directory, records exact original path/revision/SHA256 and snapshot path in an artifact manifest and links it from Linear/wiki as authorized. After any audit amendment recompute hashes and snapshot a new revision. Do not force-stage, change ignore or rely on Git clean status to preserve docs. Revision receipt at the run's authoritative output path records current hashes and all unexecuted gates.

## 11. Audit disposition and current receipt

Spec §7 maps every finding in both full recovered reports and both revision-2 structured re-audit receipts to a revision. Revision 2 substantially addressed the original findings but remained blocked: design P1 identified missing inbound error guarding (stale HTTP413 native snackbar); plan/test P1 identified fragment-first `checkForRecordInCache:true` suppressing Campaign inverse attachment. Revision 3 changes §4b/§4d to guard error before uncertainty and bypass only scoped BoundaryError callbacks, and §§3e/5/6a to use native create/attach false plus an owner/inverse fixture and parameterized real cache/store proof. Both corrections are documented, not audit-certified closed or tested. No further redesign. Unsupported earlier statements are corrected with source evidence: auth does renew/re-forward GraphQL failures; Creator callback resolution does not certify membership; no-cache read alone does not normalize; empty caught-rejection arrays do not establish browser toast behavior; Workflow-labeled old test is Creator. No audit finding requires a server ledger or broader recovery framework.

This revision changed only spec/plan and the required findings artifact. Read-only inspection confirmed exact cwd/branch/HEAD and installed Apollo semantics; no application/test/build/runtime command ran. `git diff` does not show ignored docs. Final independent planning re-audits remain required; readiness here means **documents ready for re-audit**, never completed implementation or UAT acceptance.
