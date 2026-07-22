# MYAH-212 Global Inbox and communications workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the email-only, three-panel `/myah/inbox` workspace using native Twenty email data, thread-level Myah triage fields, one revision-protected local reply draft, and proposal-only AI assistance.

**Architecture:** Extend the installed source-controlled Myah app onto native `MessageThread` and `WorkspaceMember` metadata; do not introduce a mailbox, message payload store, or sidecar Inbox object. A narrow core `myah-inbox` module owns the workspace-global cursor projection, state/draft mutations, and reply proposal service. The Myah route registry changes only the existing `inbox` destination from its initial native adapter to the already-supported `myah-page` destination; the drawer, route ID, path, and shell remain MYAH-209-owned.

**Tech Stack:** TypeScript, NestJS, TypeORM workspace repositories, GraphQL, Twenty metadata/workspace commands, React 19, Jotai, Apollo, `twenty-ui`, Vercel AI SDK, Zod, Jest, Vitest, Nx, Yarn 4.

## Global Constraints

- Begin implementation only after rebasing this branch on a `main` containing merged MYAH-209 and MYAH-210. Current source evidence shows MYAH-210 reserves 2.20 workspace-command timestamps `1784266302003` and `1784266302004`; MYAH-212 therefore uses `1784266302005` and never edits or replays another committed command.
- Preserve MYAH-209’s route ID `inbox`, entry path `/myah/inbox`, drawer hierarchy, labels, active-state semantics, responsive drawer, and existing dispatcher. Changing its existing destination to `kind: 'myah-page'` is the feature-body registration mechanism explicitly provided by that contract.
- Use one native `MessageThread` per Inbox row. Native `Message`, `MessageParticipant`, `MessageChannelMessageAssociation`, Task, and Note records remain source of truth.
- Add Myah fields only through the existing `myah-creator-ops` app manifest and source-controlled standard-metadata/workspace-command path. Do not use raw SQL, TypeORM migrations, direct database writes, a sidecar Inbox object, or a second email table.
- The `MessageThread` extension contract is exact: `creator`, `myahCampaign`, `inboxOwner`, `inboxState`, `snoozedUntil`, `myahReplyDraftBody`, and `myahReplyDraftRevision`.
- `creator = null` means Unmatched. Do not use `MessageParticipant.person`; the Myah metadata replacement removes that standard CRM relation.
- A reply draft lives in `MessageThread.myahReplyDraftBody`; `MessageThread.myahReplyDraftRevision` starts at `0` and increments atomically on every save or clear. Native `Message.isDraft` is provider-synced and is never repurposed.
- State values are exactly `NEEDS_REPLY`, `WAITING_ON_CREATOR`, `SNOOZED`, and `CLOSED`. Snoozing requires a future `snoozedUntil`; every non-snoozed state clears it.
- Every mutation is server-owned and enforces workspace membership, object permission, current thread existence, target relation validity, draft ownership, expected revision, reply-only eligibility, and bounded payload size.
- Browser code never receives provider credentials and never performs provider I/O. MYAH-184, MYAH-168, and MYAH-169 retain mailbox connection, send/receipt, inbound sync/reopen, and follow-up scheduling.
- AI returns a schema-validated proposal only. It neither persists a draft nor sends. The current Inbox owner explicitly applies a proposal through the same draft mutation.
- MYAH-224 and MYAH-225 own future sidebar-agent triage and draft mutations. MYAH-212’s sidebar agent may read Inbox context and request a reply proposal only.
- Use Yarn 4. Do not commit, push, deploy, mutate Railway, or create a pull request unless separately instructed.

---

## File structure and ownership

| Path | Responsibility |
| --- | --- |
| `packages/twenty-apps/internal/myah-creator-ops/src/fields/*.field.ts` | Source-controlled MessageThread/WorkspaceMember relation and scalar declarations. |
| `packages/twenty-apps/internal/myah-creator-ops/src/constants/universal-identifiers.ts` | Stable UUIDs for every MYAH-212 field and relation end. |
| `packages/twenty-apps/internal/myah-creator-ops/src/__tests__/inbox-schema.unit.test.ts` | Manifest contract for fields, inverse relations, state options, nullability, and defaults. |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/*myah*` | Fresh-workspace projection of Myah app fields into the Twenty standard metadata graph. |
| `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/myah-standard-metadata-contract.fixture.ts` | Fresh-workspace source-to-runtime metadata fixture. |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302005-synchronize-myah-inbox-metadata.command.ts` | Forward-only existing-workspace synchronization of the MYAH-212 metadata slice. |
| `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/__tests__/2-20-workspace-command-1784266302005-synchronize-myah-inbox-metadata.command.spec.ts` | Command selection, idempotency, and foreign-relation regression coverage. |
| `packages/twenty-server/src/engine/core-modules/myah-inbox/` | Nest module, typed GraphQL DTOs, cursor codec, query service, mutation service, proposal service, resolver, and unit/integration tests. |
| `packages/twenty-server/src/engine/core-modules/tool-provider/providers/myah-inbox-tool.provider.ts` | Read/propose-only sidebar-agent tool descriptors using the existing actor/role tool context. |
| `packages/twenty-server/src/engine/core-modules/tool-provider/tool-provider.module.ts` | Registers only the MYAH-212 proposal tool provider; no write tools. |
| `packages/twenty-front/src/modules/myah/inbox/` | Page composition, query/mutation hooks, thread-list state, panels, draft conflict UI, proposal preview, and focused tests. |
| `packages/twenty-front/src/modules/myah/navigation/myah-navigation-registry.ts` | One permitted feature-body change: `inbox` becomes a `myah-page` destination. |
| `packages/twenty-front/src/modules/myah/navigation/__tests__/myah-navigation-registry.test.ts` | Ensures `/myah/inbox` remains stable while rendering its real page component. |

## Task 1: Declare the MessageThread Inbox metadata contract

**Files:**
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/creator-on-message-thread.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/myah-campaign-on-message-thread.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/inbox-owner-on-message-thread.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/inbox-threads-on-creator.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/inbox-threads-on-campaign.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/owned-inbox-threads-on-workspace-member.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/inbox-state-on-message-thread.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/snoozed-until-on-message-thread.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/myah-reply-draft-body-on-message-thread.field.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/fields/myah-reply-draft-revision-on-message-thread.field.ts`
- Modify: `packages/twenty-apps/internal/myah-creator-ops/src/constants/universal-identifiers.ts`
- Modify: `packages/twenty-apps/internal/myah-creator-ops/src/objects/creator.object.ts`
- Modify: `packages/twenty-apps/internal/myah-creator-ops/src/objects/campaign.object.ts`
- Create: `packages/twenty-apps/internal/myah-creator-ops/src/__tests__/inbox-schema.unit.test.ts`

**Interfaces:**
- Consumes: `STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread` and `.workspaceMember`, plus MYAH-210’s stable Creator/Campaign object identifiers.
- Produces: exact field names, universal IDs, and relation pairs required by the server module and metadata command.

- [ ] **Step 1: Write the manifest-contract tests first**

  Assert every field’s object, type, nullability, default, and relation settings. The essential assertions are:

  ```ts
  expect(getField('inboxState')).toMatchObject({
    objectUniversalIdentifier:
      STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.messageThread.universalIdentifier,
    type: FieldType.SELECT,
    isNullable: false,
    defaultValue: "'NEEDS_REPLY'",
    options: expect.arrayContaining([
      expect.objectContaining({ value: 'NEEDS_REPLY' }),
      expect.objectContaining({ value: 'WAITING_ON_CREATOR' }),
      expect.objectContaining({ value: 'SNOOZED' }),
      expect.objectContaining({ value: 'CLOSED' }),
    ]),
  });

  expect(getField('myahReplyDraftRevision')).toMatchObject({
    type: FieldType.NUMBER,
    isNullable: false,
    defaultValue: 0,
  });

  expect(getField('creator')).toMatchObject({
    type: FieldType.RELATION,
    isNullable: true,
    universalSettings: {
      relationType: RelationType.MANY_TO_ONE,
      onDelete: OnDeleteAction.SET_NULL,
      joinColumnName: 'creatorId',
    },
  });
  ```

  Also prove the `myahReplyDraftBody` field is `FieldType.RICH_TEXT`, relation inverse ends are `ONE_TO_MANY`, and `inboxOwner` uses `SET_NULL` rather than cascade deletion.

- [ ] **Step 2: Run the new contract test and observe the expected RED failure**

  Run:

  ```bash
  cd packages/twenty-apps/internal/myah-creator-ops
  yarn test:unit src/__tests__/inbox-schema.unit.test.ts
  ```

  Expected: FAIL because the Inbox fields and universal identifiers do not exist.

- [ ] **Step 3: Add the minimal app declarations**

  Define the three `MANY_TO_ONE` relation ends on `MessageThread`; define their `ONE_TO_MANY` inverses on Creator, Campaign, and WorkspaceMember; define `inboxState`, `snoozedUntil`, `myahReplyDraftBody`, and `myahReplyDraftRevision` on MessageThread. Use stable UUIDs generated once with `uuidgen` and recorded in `universal-identifiers.ts`.

  `myahReplyDraftBody` must be nullable rich text (`{ markdown, blocknote }` at runtime). `myahReplyDraftRevision` must be non-null `NUMBER` with default `0`. No field is an index until Task 3’s `EXPLAIN` identifies a concrete predicate/order shape.

- [ ] **Step 4: Run the manifest-contract test and retain the green result**

  Run the Step 2 command. Expected: PASS, including all relation pair and state-option assertions.

## Task 2: Synchronize the metadata slice for fresh and existing workspaces

**Files:**
- Modify: `packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/myah-standard-metadata-contract.fixture.ts`
- Modify: the existing Myah standard-metadata field/view builders that MYAH-210 uses to make app-declared fields available to fresh workspaces
- Modify: `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command.ts`
- Modify: `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/__tests__/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command.spec.ts`
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1784266302005-synchronize-myah-inbox-metadata.command.ts`
- Modify: `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/2-20-upgrade-version-command.module.ts`
- Create: `packages/twenty-server/src/database/commands/upgrade-version-command/2-20/__tests__/2-20-workspace-command-1784266302005-synchronize-myah-inbox-metadata.command.spec.ts`

**Interfaces:**
- Consumes: Task 1 universal identifiers and MYAH-210’s merged 2.20 command module.
- Produces: the same MessageThread/WorkspaceMember/Creator/Campaign Inbox field graph for a new workspace and an existing workspace, with no duplicate entity or command replay.

- [ ] **Step 1: Write failing fresh- and existing-workspace metadata tests**

  Extend the Myah standard metadata fixture expectation to include all ten fields and three inverse relations. Add a regression to `1784266302001`’s test that injects the seven direct MessageThread fields and the WorkspaceMember inverse into the source flat maps, runs the standard synchronizer, and inspects the `fieldMetadata` create/update operation passed to `WorkspaceMigrationValidateBuildAndRunService`.

  It must contain the Inbox field IDs even though native MessageThread and WorkspaceMember object metadata are not selected for creation:

  ```ts
  expect(
    fieldMetadataOperations.flatEntityToCreate.map(
      ({ universalIdentifier }) => universalIdentifier,
    ),
  ).toEqual(
    expect.arrayContaining([
      MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
      MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.inboxOwner,
      MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahReplyDraftRevision,
    ]),
  );
  ```

  The `1784266302005` test follows the existing `1784266302003` wrapper pattern: it asserts that unchanged workspace runs delegate exactly once to `SynchronizeMyahStandardMetadataCommand` and that the registered timestamp is `1784266302005`. This is the idempotent forward trigger for preexisting workspaces; the standard synchronizer’s diff is the idempotency proof.

- [ ] **Step 2: Run focused metadata/command tests and observe RED**

  Run:

  ```bash
  npx jest packages/twenty-server/src/engine/workspace-manager/twenty-standard-application/utils/__tests__/myah-standard-metadata-contract.fixture.ts packages/twenty-server/src/database/commands/upgrade-version-command/2-20/__tests__/2-20-workspace-command-1784266302001-synchronize-myah-standard-metadata.command.spec.ts packages/twenty-server/src/database/commands/upgrade-version-command/2-20/__tests__/2-20-workspace-command-1784266302005-synchronize-myah-inbox-metadata.command.spec.ts --config=packages/twenty-server/jest.config.mjs
  ```

  Expected: FAIL because the Inbox field graph, core-object extension selector, and forward trigger are absent.

- [ ] **Step 3: Implement fresh-workspace projection, core-object extension selection, and forward trigger**

  Follow MYAH-210’s source-to-runtime mapping convention. In `SynchronizeMyahStandardMetadataCommand`, define a narrowly named set containing only native `MessageThread` and `WorkspaceMember` universal identifiers. Use the union of that set and `MYAH_STANDARD_OBJECTS` **only when filtering field metadata**. Keep `objectMetadata` selection restricted to `MYAH_STANDARD_OBJECTS`, so the command never attempts to create, replace, or delete the native core objects. The existing Creator inverse relationship establishes that selecting a field whose owner is native metadata is supported; this change extends that proven behavior to direct Inbox fields.

  Add `SynchronizeMyahInboxMetadataCommand` as the same thin delegation command used by `SynchronizeMyahCreatorCrmMetadataCommand`:

  ```ts
  @RegisteredWorkspaceCommand('2.20.0', 1784266302005)
  @Command({ name: 'upgrade:2-20:synchronize-myah-inbox-metadata' })
  export class SynchronizeMyahInboxMetadataCommand
    extends ActiveOrSuspendedWorkspaceCommandRunner {
    // Delegates runOnWorkspace(args) to SynchronizeMyahStandardMetadataCommand.
  }
  ```

  Register it in the 2.20 module. It causes the modified standard synchronizer to diff and add only absent Inbox field metadata in existing workspaces. Do not alter MYAH-210 commands `1784266302003` or `1784266302004`, and do not copy cache/version logic into the wrapper.

- [ ] **Step 4: Verify the metadata slice is green**

  Re-run both Step 2 tests. Then run:

  ```bash
  npx nx typecheck twenty-shared
  npx nx typecheck twenty-server
  ```

  Expected: all commands pass; `1784266302005` is registered once; the command diff adds Inbox fields without an operation against native MessageThread or WorkspaceMember object metadata.

## Task 3: Build the workspace-global Inbox read projection

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/constants/myah-inbox.constants.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-connection.dto.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/myah-inbox-query.service.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/myah-inbox.module.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-query.service.spec.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox.resolver.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/core-engine.module.ts`

**Interfaces:**
- Consumes: Task 2 MessageThread field names and `GlobalWorkspaceOrmManager` workspace repositories.
- Produces:

  ```ts
  type MyahInboxThreadConnection = {
    edges: Array<{ cursor: string; node: MyahInboxThreadSummary }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };

  type MyahInboxThreadFilter = {
    queue?: 'CREATOR_LINKED' | 'UNMATCHED';
    owner?: 'ME' | 'UNASSIGNED' | string;
    campaignId?: string;
    states?: MyahInboxState[];
    search?: string;
  };
  ```

- [ ] **Step 1: Write failing query-service tests**

  Use an in-memory/query-builder mock boundary that returns native MessageThread/Message rows. Cover:

  - order `latestMessage.receivedAt DESC, messageThread.id DESC`;
  - cursor round-trip and no duplicate/skip when timestamps tie;
  - Creator-linked versus `creatorId IS NULL` Unmatched filtering;
  - `ME` resolved from authenticated workspace-member ID, `UNASSIGNED` as `inboxOwnerId IS NULL`;
  - campaign/state/search filtering;
  - soft-deleted native rows excluded;
  - Creator/Campaign missing after a prior relation deletion represented as null context;
  - page-size clamp to the explicit `MYAH_INBOX_MAX_PAGE_SIZE` constant.

  Use exact expectation shape:

  ```ts
  await expect(service.listThreads(input)).resolves.toMatchObject({
    edges: [
      { node: { id: 'thread-2', lastActivityAt: '2026-07-21T10:00:00.000Z' } },
    ],
    pageInfo: { hasNextPage: true },
  });
  ```

- [ ] **Step 2: Run query/resolver tests and observe RED**

  Run:

  ```bash
  npx jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-query.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox.resolver.spec.ts --config=packages/twenty-server/jest.config.mjs
  ```

  Expected: FAIL because `MyahInboxQueryService` and `myahInboxThreads` do not exist.

- [ ] **Step 3: Implement the bounded query, GraphQL resolver, and module registration**

  Use the same authenticated custom-query shape as `TimelineCalendarEventResolver`: `WorkspaceAuthGuard`, `CustomPermissionGuard`, `@AuthWorkspace()`, and `@AuthWorkspaceMemberId()`. Query workspace-local repositories only. Derive last-message preview/sender/time with a grouped native Message subquery or lateral join; do not hydrate whole threads or issue per-row message queries. Encode both ordering keys in an opaque base64 cursor.

  Add `MyahInboxModule` to the static `imports` array in `CoreEngineModule` next to the other core modules; Nest has no module discovery, so this registration is required for `MyahInboxResolver` to enter the GraphQL schema.

  Resolver contract:

  ```ts
  @Query(() => MyahInboxThreadConnection)
  async myahInboxThreads(
    @Args() input: MyahInboxThreadsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxThreadConnection>
  ```

- [ ] **Step 4: Verify green behavior and prove the query shape**

  Re-run Step 2. Add an integration fixture with tied timestamps and at least two cursor pages. Run its focused test plus an `EXPLAIN (ANALYZE, BUFFERS)` against an isolated seeded workspace. Add an index only if that evidence identifies a repeated filter/order bottleneck; put that index in Task 2’s source-controlled metadata slice and assert it in the command test.

## Task 4: Implement triage and shared-draft mutations with optimistic concurrency

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-thread.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/save-myah-inbox-draft.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-draft-save-result.dto.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-mutation.resolver.spec.ts`

**Interfaces:**
- Consumes: Task 3 authentication context, Task 2 field graph, generic Creator/Campaign/WorkspaceMember read permission checks.
- Produces:

  ```ts
  type UpdateMyahInboxThreadInput = {
    threadId: string;
    creatorId?: string | null;
    campaignId?: string | null;
    inboxOwnerId?: string | null;
    inboxState?: MyahInboxState;
    snoozedUntil?: string | null;
  };

  type SaveMyahInboxDraftInput = {
    threadId: string;
    expectedRevision: number;
    body: { markdown: string; blocknote: string | null } | null;
  };

  type MyahInboxDraftSaveResult =
    | { status: 'SAVED'; revision: number; body: MyahRichText | null }
    | { status: 'CONFLICT'; revision: number; body: MyahRichText | null };
  ```

- [ ] **Step 1: Write failing mutation tests**

  Cover each invariant independently:

  - write actor must be the current `inboxOwner`;
  - assigning, reassigning, and clearing owner preserves body/revision and transfers or removes edit authority;
  - `SNOOZED` requires a future timestamp; other states clear it;
  - Creator/Campaign/owner must exist in the same workspace and be readable;
  - linking and clearing Creator respectively exits and enters the Unmatched queue;
  - linking and clearing Campaign write `campaignId` and `null` respectively, without changing Creator;
  - stale `expectedRevision` returns `CONFLICT` without write;
  - save/clear atomically increments exactly once;
  - no call is made to `SendEmailService`, messaging import, connected account, or provider client.

  The concurrency assertion must distinguish a failed update from a successful no-op:

  ```ts
  expect(secondSave).toEqual({
    status: 'CONFLICT',
    revision: 3,
    body: { markdown: 'newer copy', blocknote: null },
  });
  expect(repository.update).toHaveBeenCalledTimes(1);
  ```

- [ ] **Step 2: Run mutation tests and observe RED**

  Run:

  ```bash
  npx jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-mutation.resolver.spec.ts --config=packages/twenty-server/jest.config.mjs
  ```

  Expected: FAIL because the mutation service and GraphQL mutations are absent.

- [ ] **Step 3: Implement compare-and-set writes**

  Load the thread through the workspace repository in a transaction. For drafts, execute one conditional update scoped by `id`, `inboxOwnerId`, and `myahReplyDraftRevision`; set `myahReplyDraftBody`, increment revision, and return the persisted row. If it affects zero rows, re-read the current thread in the same workspace and return `CONFLICT` only when the thread still exists and the caller remains otherwise authorized; throw the established not-found/forbidden error for other cases.

  Keep triage and draft mutations separate:

  ```ts
  updateMyahInboxThread(input: UpdateMyahInboxThreadInput): Promise<MyahInboxThreadSummary>
  saveMyahInboxDraft(input: SaveMyahInboxDraftInput): Promise<MyahInboxDraftSaveResult>
  ```

  Neither mutation invokes a provider, creates `Message`, changes delivery state, or sends email.

- [ ] **Step 4: Verify green server behavior**

  Re-run Step 2, then run the Task 3 suite. Add repository-backed integration tests using two authenticated workspace members to prove stale revision, owner reassignment/clear, and Creator/Campaign link/unlink behavior against the real workspace schema.

## Task 5: Add the shared server reply-proposal capability and read-only sidebar tool

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-proposal.dto.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service.ts`
- Create: `packages/twenty-server/src/engine/core-modules/tool-provider/constants/myah-inbox-tool-service.token.ts`
- Create: `packages/twenty-server/src/engine/core-modules/tool-provider/providers/myah-inbox-tool.provider.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/tool-provider/tool-provider.module.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/myah-inbox/myah-inbox.module.ts`
- Create: focused service/provider/resolver test files beside each source file.

**Interfaces:**
- Consumes: Task 3 selected-thread summary/detail, Task 4 draft ownership semantics, `ChatExecutionService` actor/role/tool context, `BrandBrainPreflightService`, and the managed AI model/billing services.
- Produces: a reusable proposal service called by both a direct GraphQL mutation and the sidebar agent tool.

  ```ts
  type MyahInboxReplyProposal = {
    subject: string | null;
    body: { markdown: string; blocknote: string | null };
  };
  ```

- [ ] **Step 1: Write failing proposal and tool tests**

  Assert that the service loads only the selected workspace thread and its permitted Creator/Campaign/Brand Brain context, validates its output through a Zod schema, and returns a proposal without calling the draft mutation or any provider-send service.

  For the sidebar tool, assert `isAvailable` uses the same role/object permission decision as Inbox reading; the generated tool set exposes only `get_myah_inbox_thread_context` and `generate_myah_inbox_reply_proposal`; it exposes no state, ownership, campaign, snooze, draft-save, or send tool.

- [ ] **Step 2: Run proposal/tool tests and observe RED**

  Run the focused Jest files. Expected: FAIL because neither proposal service nor tool provider exists.

- [ ] **Step 3: Implement the common service and bounded tool set**

  Reuse the existing Vercel AI SDK server path and `BrandBrainPreflightService`; do not add an AI provider, browser API key, or second agent runtime. Use `generateText` with `Output.object({ schema })` and a Zod contract for `subject` plus rich-text `body`, consistent with the installed AI SDK’s structured-output support. Do not return model reasoning or raw provider response.

  Follow `DashboardToolProvider` for `ToolProvider` registration: inject a `MyahInboxToolWorkspaceService` through `MYAH_INBOX_TOOL_SERVICE_TOKEN`, use the existing `ToolRegistryService` actor/role context, and return `ToolOutput`. In `MyahInboxModule`, bind that token to `MyahInboxToolWorkspaceService` and export the token. In `ToolProviderModule`, import `MyahInboxModule`, add `MyahInboxToolProvider` to `providers`, and add its factory parameter, returned provider array entry, and `inject` array entry in `TOOL_PROVIDERS`. This makes the tool discoverable through the existing registry without a parallel agent or a hidden optional dependency. The tool service may call the proposal/read service only; Task 4 writes remain unavailable to agent chat.

- [ ] **Step 4: Verify proposal-only behavior**

  Re-run Step 2 and Task 4’s no-provider-I/O regression. Add a single integration test proving the direct GraphQL proposal and sidebar tool return the same schema-valid proposal for the same authenticated context, while the saved draft revision remains unchanged.

## Task 6: Build the real Myah Inbox route body and operator workflow

**Files:**
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxPage.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxThreadList.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxThreadPanel.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxContextPanel.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxDraftEditor.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/components/MyahInboxProposalPreview.tsx`
- Create: `packages/twenty-front/src/modules/myah/inbox/hooks/useMyahInboxThreads.ts`
- Create: `packages/twenty-front/src/modules/myah/inbox/hooks/useMyahInboxThreadMutations.ts`
- Create: `packages/twenty-front/src/modules/myah/inbox/states/myahInboxSelectionState.ts`
- Create: `packages/twenty-front/src/modules/myah/inbox/graphql/operations.ts`
- Create: focused Vitest/Jest files beside every hook/component whose behavior is nontrivial.
- Modify: `packages/twenty-front/src/modules/myah/navigation/myah-navigation-registry.ts`
- Modify: `packages/twenty-front/src/modules/myah/navigation/__tests__/myah-navigation-registry.test.ts`

**Interfaces:**
- Consumes: generated Task 3–5 GraphQL documents, native `useEmailThread` for active-thread message history, and existing Twenty Tasks/Notes/record mutation surfaces.
- Produces: a `MyahInboxPage` registered as the existing `inbox` route destination, with stable selection and error/conflict states.

- [ ] **Step 1: Write failing route and component behavior tests**

  Add a route-registry expectation:

  ```ts
  expect(getMyahNavigationRoute('inbox').destination).toMatchObject({
    kind: 'myah-page',
    Component: MyahInboxPage,
  });
  ```

  Add component tests for: first loaded row selection; URL/query-independent selected state; explicit list keyboard navigation; empty Inbox versus empty Unmatched copy; loading/error; triage save success/failure; draft conflict retaining local text and showing current server version; AI proposal remaining separate until the owner clicks Apply; disabled draft editor when unassigned or owned by another member.

- [ ] **Step 2: Run focused frontend tests and observe RED**

  Run the new Myah Inbox test files and `myah-navigation-registry.test.ts`. Expected: FAIL because the custom page and query hooks do not exist and Inbox still resolves to the native object adapter.

- [ ] **Step 3: Implement the smallest reusable page composition**

  Replace only the existing Inbox route’s destination with:

  ```ts
  destination: { kind: 'myah-page', Component: MyahInboxPage }
  ```

  Do not change drawer code, route ID, entry path, or other registry entries. Use Jotai only for selected thread/filter UI state; keep server data in Apollo. Reuse `useEmailThread`, `EmailThreadMessage`, existing record mutation controls, notes, Tasks, responsive layout primitives, theme tokens, and existing loading/error components. Do not copy email messages into a client store.

  The draft editor calls Task 4 only with the last confirmed revision. On `CONFLICT`, retain the operator’s unsaved local value, display the current saved version and revision, and provide an explicit reload/discard choice. The proposal preview calls Task 5; Apply transfers its rich-text value to the existing draft editor and requires the ordinary explicit Save action.

- [ ] **Step 4: Verify green frontend behavior and generate types**

  Re-run Step 2. After server schema changes, run:

  ```bash
  npx nx run twenty-front:graphql:generate
  npx nx typecheck twenty-front
  npx nx typecheck twenty-server
  ```

  Expected: generated documents/types compile and no view writes or provider calls are present in the browser path.

## Task 7: Integration, accessibility, and isolated browser evidence

**Files:**
- Modify or create: Task 3–6 integration fixtures and browser test helpers using the repository’s established Myah local-UAT harness.
- Modify: `docs/specs/MYAH-212-global-inbox-and-communications-workspace.md` only to record actual verification evidence after it has been observed.
- Modify: `docs/plans/MYAH-212-global-inbox-and-communications-workspace.md` checkboxes/results only after observed verification.

**Interfaces:**
- Consumes: all prior task contracts and a fresh isolated workspace seeded with MessageThreads, messages, Creator/Campaign relations, owners, Tasks, Notes, and competing draft editors.
- Produces: end-to-end evidence that the contract works without a send/provider mutation.

- [ ] **Step 1: Write failing integration/browser scenarios**

  Scenarios must prove: cursor pages with tied latest-message timestamps; Creator-linked/Unmatched filtering; same-workspace relation validation; owner reassignment; stale draft conflict from a second browser session; proposal generation/application; keyboard selection and focus transfer; narrow-layout context access; provider network mutation absence.

- [ ] **Step 2: Run scenarios and observe RED**

  Run the focused integration/browser suites against a fresh isolated runtime. Expected: FAIL because the Inbox feature is absent.

- [ ] **Step 3: Make only the already-tested production changes needed for green**

  Do not add behavior during this task. Fix only defects exposed by the scenarios, beginning with a focused regression test for each defect.

- [ ] **Step 4: Verify green and perform the smoke checklist**

  Run focused server/frontend tests, GraphQL generation, both relevant typechecks, and diff lint. Launch an isolated local runtime and browser-smoke:

  1. authenticate as the seeded operator and open `/myah/inbox`;
  2. paginate, search, and filter Creator-linked, Unmatched, My threads, Unassigned, Campaign, and state queues;
  3. select a real native email thread and inspect its history;
  4. link an Unmatched thread, set Campaign/owner/state/snooze, create a Task/Note, and confirm list/context update;
  5. save a draft as owner, create a stale conflict from a second session, and verify no overwrite;
  6. generate a proposal, apply it to the editor, explicitly save, and verify no send/provider network request;
  7. verify keyboard focus, labelled controls, announced save/conflict states, and responsive panel behavior.

## Plan self-review

- **Spec coverage:** Tasks 1–2 implement the field and workspace-upgrade contract; Task 3 implements global read behavior; Task 4 implements triage/draft safety; Task 5 implements shared proposal/agent read-propose boundaries; Task 6 implements the route/UI contract; Task 7 proves end-to-end acceptance.
- **TDD coverage:** Every task starts with a focused failing test, records the expected failure, makes the smallest implementation change, then reruns the exact focused suite. Task 7 forbids untested bug fixes.
- **No-send boundary:** Tasks 4–7 include no-provider-I/O regressions. No task creates a Message, invokes a send service, changes provider delivery state, or exposes credentials.
- **Cross-worktree safety:** Task 2 uses a new `1784266302005` command after the MYAH-210 command sequence and does not edit MYAH-209 shell behavior beyond the supported Inbox page-body destination.
