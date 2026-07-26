# Secure Workspace-Shared Mailbox Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for every behavior change and `verification-before-completion` before every completion claim. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement MYAH-184 as one secure, workspace-shared, standards-compliant SMTP/IMAP connection boundary using Twenty's encrypted `ConnectedAccount` and native `MessageChannel` models.

**Architecture:** Add one Myah-owned service and guarded resolver over Twenty's existing IMAP/SMTP validator, encrypted account upsert, metadata lifecycle, and channel models. Require both SMTP and IMAP with certificate-verified TLS, serialize the post-validation database upsert per workspace, and expose only a masked status projection with stable customer-safe errors. Do not add a second credential store, mailbox registry, provider framework, or any managed-email, warmup, readiness-policy, billing, or campaign behavior.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, GraphQL, Twenty workspace authentication and permissions, Twenty secret encryption, Nodemailer, ImapFlow, Jest, Nx, TypeScript.

**Design source:** `docs/superpowers/specs/2026-07-27-secure-workspace-shared-mailbox-connection-design.md`

---

## File map

### Existing files to modify

- `packages/twenty-server/src/modules/connected-account/services/imap-smtp-caldav-apis.service.ts` — add workspace visibility, workspace-shared lookup, short advisory transaction lock, channel result, and reconnection-safe persistence while preserving personal-account behavior.
- `packages/twenty-server/src/modules/connected-account/services/imap-smtp-caldav-apis.service.spec.ts` — protect encrypted persistence, user default, workspace replay, concurrent serialization, stable account/channel IDs, and cross-workspace keys.
- `packages/twenty-server/src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service.ts` — add strict MYAH validation mode and stable, redacted provider failure classification without weakening generic personal-account behavior.
- `packages/twenty-server/src/engine/core-modules/imap-smtp-caldav-connection/services/__tests__/imap-smtp-caldav-connection.service.spec.ts` — cover SMTP+IMAP validation, TLS certificate verification, plaintext rejection, and secret-free errors/logs.
- `packages/twenty-server/src/engine/core-modules/myah/myah.module.ts` — import existing connection/metadata modules and export the workspace mailbox service.
- `packages/twenty-server/src/__tests__/app.module.spec.ts` or a focused Myah production-DI spec beside the new service — verify production dependency injection resolves.

### New source files

- `packages/twenty-server/src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant.ts` — one stable native account marker.
- `packages/twenty-server/src/engine/core-modules/myah/types/workspace-mailbox-connection.type.ts` — server input/result, safe status, stable states, and stable error codes; contains no credential output type.
- `packages/twenty-server/src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception.ts` — stable internal code plus fixed customer-safe message; never accepts raw provider text as public output.
- `packages/twenty-server/src/engine/core-modules/myah/utils/mask-workspace-mailbox-handle.util.ts` — deterministic email masking.
- `packages/twenty-server/src/engine/core-modules/myah/services/workspace-mailbox-connection.service.ts` — connect/status/rotate/reconnect/revoke policy and workspace isolation.
- `packages/twenty-server/src/engine/core-modules/myah/services/__tests__/workspace-mailbox-connection.service.spec.ts` — primary behavioral contract.
- `packages/twenty-server/src/engine/core-modules/myah/dtos/workspace-mailbox-connection.input.ts` — customer credential submission input; accepted once and never returned.
- `packages/twenty-server/src/engine/core-modules/myah/dtos/workspace-mailbox-connection-status.dto.ts` — safe status only.
- `packages/twenty-server/src/engine/core-modules/myah/workspace-mailbox-connection.resolver.ts` — guarded customer connect/status/rotate/reconnect/revoke surface.
- `packages/twenty-server/src/engine/core-modules/myah/__tests__/workspace-mailbox-connection.resolver.spec.ts` — authenticated tenant derivation, permission delegation, safe error projection, and no secret output.

### Generated files

- `packages/twenty-client-sdk/src/metadata/generated/*` — regenerate only through `yarn nx generate-metadata-client twenty-client-sdk` if the server schema generation environment is available. Never hand-edit these files.

---

## Task 1: Rebuild workspace-visible encrypted upsert from a clean baseline

**Files:**

- Modify: `packages/twenty-server/src/modules/connected-account/services/imap-smtp-caldav-apis.service.ts`
- Test: `packages/twenty-server/src/modules/connected-account/services/imap-smtp-caldav-apis.service.spec.ts`

- [ ] **Step 1: Write the failing workspace-visibility test**

Add a test that calls `upsertConnectedAccount` with `visibility: 'workspace'` and expects the encrypted transactional save to contain `visibility: 'workspace'`. Also assert the password fields contain the encryption service output rather than the plaintext fixture.

- [ ] **Step 2: Run the test and verify RED**

Run on the approved Linux host under Node 24:

```bash
yarn nx test twenty-server --runInBand --testPathPatterns='imap-smtp-caldav-apis.service.spec.ts'
```

Expected failure: the persisted payload lacks `visibility: 'workspace'`.

- [ ] **Step 3: Add the minimal typed input**

Add:

```ts
visibility?: ConnectedAccountEntity['visibility'];
```

Default it to `'user'` and persist it in the existing encrypted transaction. Do not change the personal resolver caller.

- [ ] **Step 4: Update exact legacy expectations**

Existing personal-account tests that assert the full save payload must explicitly expect:

```ts
visibility: 'user'
```

- [ ] **Step 5: Run the test and verify GREEN**

Expected: the workspace case persists `workspace`; legacy cases persist `user`; encryption and channel creation assertions pass.

---

## Task 2: Make shared replay tenant-safe and concurrent-safe

**Files:**

- Modify: `packages/twenty-server/src/modules/connected-account/services/imap-smtp-caldav-apis.service.ts`
- Test: `packages/twenty-server/src/modules/connected-account/services/imap-smtp-caldav-apis.service.spec.ts`

- [ ] **Step 1: Write failing replay tests**

Cover these separate behaviors:

1. a second `userWorkspaceId` in the same workspace reuses the shared account by `{ workspaceId, provider, visibility, handle }`;
2. the same handle in a different workspace does not reuse the first workspace's account;
3. two simulated concurrent workspace-shared upserts both execute this transaction statement before the final account read:

```sql
SELECT pg_advisory_xact_lock(hashtext($1))
```

with a stable non-secret key derived from the workspace mailbox boundary;
4. replay returns the existing `connectedAccountId` and `messageChannelId` and does not create a second channel.

- [ ] **Step 2: Run tests and verify RED**

Expected failures: the lookup includes `userWorkspaceId`, no advisory transaction lock is taken, and the method returns only the account ID.

- [ ] **Step 3: Refactor the database portion into one transaction**

Keep SMTP/IMAP network validation outside this service. For `visibility: 'workspace'`, acquire the advisory transaction lock, re-read the shared account and channel through the transaction manager, then create or reuse them in the same transaction. Preserve the old user-visible lookup and behavior.

Use a result type equivalent to:

```ts
type UpsertConnectedAccountResult = {
  connectedAccountId: string;
  messageChannelId: string | null;
};
```

Update the existing personal resolver to read `.connectedAccountId`; do not alter its GraphQL contract.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: same-workspace replay and concurrent serialization pass; cross-workspace isolation remains explicit; personal account behavior remains green.

---

## Task 3: Add strict SMTP/IMAP validation and redacted failures

**Files:**

- Modify: `packages/twenty-server/src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service.ts`
- Test: `packages/twenty-server/src/engine/core-modules/imap-smtp-caldav-connection/services/__tests__/imap-smtp-caldav-connection.service.spec.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/types/workspace-mailbox-connection.type.ts`

- [ ] **Step 1: Define stable error codes and fixed messages**

Create the exact code union:

```ts
type WorkspaceMailboxConnectionErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INSECURE_CONNECTION'
  | 'AUTHENTICATION_FAILED'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_UNAVAILABLE'
  | 'MAILBOX_ALREADY_CONNECTED'
  | 'MAILBOX_NOT_FOUND'
  | 'RECONNECT_REQUIRED'
  | 'UNKNOWN';
```

The exception constructor accepts a code and optional internal cause, but its public message comes only from a fixed code-to-message map. It must not interpolate `cause.message`.

- [ ] **Step 2: Write failing validation tests**

Add separate tests proving:

- missing SMTP is rejected before any connection attempt;
- missing IMAP is rejected before any connection attempt;
- CALDAV is rejected for this account type;
- `NONE` security is rejected for either protocol;
- SMTP and IMAP are both tested for a valid request;
- SMTP transport and ImapFlow use certificate verification rather than `rejectUnauthorized: false`;
- an error whose message/stack contains a sentinel password and raw provider body does not place either sentinel in the thrown customer message or logger arguments;
- authentication failure, connection refused, and generic unavailable errors map to stable codes.

- [ ] **Step 3: Run tests and verify RED**

Expected failures: the existing generic flow permits incomplete protocol sets, disables certificate verification, and logs raw provider text.

- [ ] **Step 4: Implement strict validation as an explicit mode**

Add a dedicated strict method or explicit option used only by MYAH-184, for example:

```ts
validateAndTestWorkspaceMailboxConnection({
  handle,
  connectionParameters,
  existingConnectionParameters,
})
```

It must require SMTP+IMAP, forbid CALDAV and plaintext security, validate hosts, test both protocols with certificate verification, and throw stable redacted exceptions. Preserve generic personal-account behavior unless a shared security correction is proven compatible by its existing tests.

- [ ] **Step 5: Replace raw protocol logging at the MYAH boundary**

Log only stable event/category data, such as:

```ts
this.logger.warn('workspace_mailbox_smtp_validation_failed', {
  errorCode,
});
```

Do not log provider messages, stacks, response bodies, usernames, passwords, or full connection parameters.

- [ ] **Step 6: Run tests and verify GREEN**

Expected: strict-mode tests pass and all existing generic connection tests remain green.

---

## Task 4: Implement connect and safe status service contracts

**Files:**

- Create: `packages/twenty-server/src/engine/core-modules/myah/constants/workspace-mailbox-connected-account-name.constant.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/utils/mask-workspace-mailbox-handle.util.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/services/workspace-mailbox-connection.service.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/services/__tests__/workspace-mailbox-connection.service.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/myah/types/workspace-mailbox-connection.type.ts`

- [ ] **Step 1: Write the handle-mask tests**

Cover a normal handle, a one-character local part, malformed input rejection, and deterministic output such as:

```ts
maskWorkspaceMailboxHandle('outreach@example.com') === 'o***h@example.com';
```

- [ ] **Step 2: Implement the smallest deterministic mask helper**

Use string operations only; do not add a dependency.

- [ ] **Step 3: Write failing connect tests**

Cover:

- input uses authenticated `workspaceId` and a valid technical `userWorkspaceId`;
- a trusted server call may omit `userWorkspaceId` and selects a membership from the same workspace only;
- the idempotency key must be non-empty but is never persisted as credentials or logged;
- a different active shared handle returns `MAILBOX_ALREADY_CONNECTED` before persistence;
- strict validation occurs before encrypted upsert;
- successful connect calls the upsert with `visibility: 'workspace'` and the stable Myah account marker;
- success requires a non-null message channel ID;
- output includes only IDs and safe status fields;
- the serialized result does not contain fixture password, username, connection parameters, raw provider error, billing, warmup, readiness-policy, capacity, or campaign fields.

- [ ] **Step 4: Run tests and verify RED**

Expected: the service does not exist.

- [ ] **Step 5: Implement connect and status lookup**

The service must:

1. normalize the handle;
2. verify/derive a technical member in the same workspace;
3. enforce the one-active-shared-mailbox rule;
4. call strict validation;
5. delegate encrypted transactional upsert;
6. read the native channel;
7. return the safe masked projection.

Every repository/metadata lookup includes `workspaceId`.

- [ ] **Step 6: Run tests and verify GREEN**

Expected: connect/status contracts pass without exposing credentials.

---

## Task 5: Implement validate-then-replace rotation and reconnection

**Files:**

- Modify: `packages/twenty-server/src/engine/core-modules/myah/services/workspace-mailbox-connection.service.ts`
- Test: `packages/twenty-server/src/engine/core-modules/myah/services/__tests__/workspace-mailbox-connection.service.spec.ts`

- [ ] **Step 1: Write failing rotation tests**

Cover:

- lookup includes account ID, workspace ID, provider, visibility, and Myah marker;
- another workspace receives `MAILBOX_NOT_FOUND` and no validation/decryption call occurs;
- strict validation receives decrypted old parameters only to support omitted unchanged fields;
- validation failure does not call upsert or replace encrypted credentials;
- success reuses account/channel IDs, clears `authFailedAt`, and reports `ROTATED`;
- returned/logged values contain neither old nor new password.

- [ ] **Step 2: Run rotation tests and verify RED**

Expected: rotation method does not exist.

- [ ] **Step 3: Implement validate-then-replace rotation**

Do not clear or overwrite stored credentials before strict validation succeeds. Delegate replacement to the existing encrypted upsert with the exact existing account.

- [ ] **Step 4: Write failing reconnection tests**

Cover:

- reconnection uses the rotation path;
- successful reconnect removes the account from `AccountsToReconnectService` through existing upsert behavior;
- native message sync is reset/requeued only through the existing connection service behavior;
- account/channel IDs remain stable;
- another workspace cannot reconnect the account.

- [ ] **Step 5: Implement reconnection as the rotation path plus safe operation state**

Do not introduce a second credential-update implementation.

- [ ] **Step 6: Run tests and verify GREEN**

Expected: rotation and reconnection contracts pass; failed validation preserves old state.

---

## Task 6: Implement native revocation and cross-workspace denial

**Files:**

- Modify: `packages/twenty-server/src/engine/core-modules/myah/services/workspace-mailbox-connection.service.ts`
- Test: `packages/twenty-server/src/engine/core-modules/myah/services/__tests__/workspace-mailbox-connection.service.spec.ts`

- [ ] **Step 1: Write failing revocation tests**

Cover:

- the account is found by account ID plus authenticated workspace ID;
- provider, `visibility: 'workspace'`, and Myah marker are verified before deletion;
- native `ConnectedAccountMetadataService.delete({ id, workspaceId })` is called exactly once;
- another workspace receives the same safe not-found outcome and delete is not called;
- repeated revoke returns a deterministic safe revoked/not-found result;
- revoke output contains no credential or raw provider data;
- deleted account/channel IDs are no longer returned by workspace status or replay.

- [ ] **Step 2: Run tests and verify RED**

Expected: revoke method does not exist.

- [ ] **Step 3: Implement revocation with the native deletion path**

Catch native not-found details and translate them to the stable customer-safe contract. Do not manually delete channel rows or emit duplicate lifecycle events.

- [ ] **Step 4: Add a two-workspace table-driven isolation test**

For status, rotate, reconnect, and revoke, assert that Workspace A cannot act on Workspace B's account ID and no mutation dependency is called.

- [ ] **Step 5: Run tests and verify GREEN**

Expected: native deletion and all tenant-boundary tests pass.

---

## Task 7: Add the guarded customer GraphQL surface

**Files:**

- Create: `packages/twenty-server/src/engine/core-modules/myah/dtos/workspace-mailbox-connection.input.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/dtos/workspace-mailbox-connection-status.dto.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/workspace-mailbox-connection.resolver.ts`
- Create: `packages/twenty-server/src/engine/core-modules/myah/__tests__/workspace-mailbox-connection.resolver.spec.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/myah/myah.module.ts`

- [ ] **Step 1: Write failing resolver tests**

Cover:

- every operation uses `WorkspaceAuthGuard` and connected-account settings permission;
- connect/rotate/reconnect derive `workspaceId` and `userWorkspaceId` from auth decorators, never GraphQL input;
- status/revoke derive `workspaceId` from auth context;
- credentials are passed once to the service and absent from returned DTOs;
- stable service exceptions map to stable customer-safe GraphQL errors without `cause`, provider text, stack, username, or password;
- the resolver exposes no method for retrieving connection parameters.

- [ ] **Step 2: Run tests and verify RED**

Expected: resolver and DTOs do not exist.

- [ ] **Step 3: Implement minimal DTOs and resolver methods**

Expose only:

- connect shared mailbox;
- get shared mailbox status;
- rotate/reconnect credentials;
- revoke shared mailbox.

Do not add readiness, billing, warmup, campaign assignment, inbound reply, or send methods.

- [ ] **Step 4: Wire `MyahModule`**

Import only the existing modules required by the service/resolver and export `WorkspaceMailboxConnectionService` for trusted server consumers. Do not add another global module.

- [ ] **Step 5: Run resolver/service tests and verify GREEN**

Expected: guards, authenticated tenant derivation, safe DTOs, and error mapping pass.

---

## Task 8: Verify production dependency injection and generated schema discipline

**Files:**

- Test: focused Myah production-DI spec or `packages/twenty-server/src/__tests__/app.module.spec.ts`
- Generate through: `packages/twenty-client-sdk/src/metadata/generated/*`

- [ ] **Step 1: Write a failing production-DI test**

Compile the real `MyahModule` dependency graph and resolve `WorkspaceMailboxConnectionService` and resolver without overriding their production dependencies.

- [ ] **Step 2: Run the DI test and verify RED if wiring is incomplete**

Expected: missing imports/providers are named by Nest.

- [ ] **Step 3: Make the smallest module-wiring correction**

Reuse `ImapSmtpCaldavModule`, `IMAPAPIsModule`, metadata modules, and existing TypeORM feature registration. Do not duplicate providers already exported by those modules.

- [ ] **Step 4: Run the DI test and verify GREEN**

Expected: production graph compiles and resolves.

- [ ] **Step 5: Regenerate metadata client artifacts**

Run the canonical generator only after the server schema is available:

```bash
yarn nx generate-metadata-client twenty-client-sdk
```

If generation requires a running local server or unavailable service, record the exact prerequisite and do not hand-edit generated output. Confirm generated artifacts are not stale before delivery.

---

## Task 9: Focused verification and smoke scenario

- [ ] **Step 1: Run focused tests on the approved Linux host under Node 24**

Use the narrowest project-supported invocation covering:

```text
workspace-mailbox-connection.service.spec.ts
workspace-mailbox-connection.resolver.spec.ts
imap-smtp-caldav-connection.service.spec.ts
imap-smtp-caldav-apis.service.spec.ts
production DI spec
```

Record the exact command, Linux host, container/runtime if used, test counts, and outcome.

- [ ] **Step 2: Run server typecheck**

```bash
yarn nx typecheck twenty-server
```

Expected: exit 0.

- [ ] **Step 3: Run affected lint/format checks through repository commands**

Run only the established checks for changed files/projects. Do not manually restyle generated output.

- [ ] **Step 4: Run the broader server test gate**

Because `ImapSmtpCalDavAPIService` and protocol validation are shared infrastructure, run the broader `twenty-server` test target once after focused checks pass.

- [ ] **Step 5: Run a no-customer-credential smoke scenario**

Use synthetic local/fake SMTP and IMAP endpoints or the existing test doubles to exercise:

1. connect Workspace A;
2. replay from a second member of Workspace A;
3. reject Workspace B status/rotation/revoke;
4. rotate/reconnect Workspace A while preserving IDs;
5. revoke Workspace A;
6. confirm safe output contains no synthetic password or raw provider sentinel.

Do not use or record customer credentials.

---

## Task 10: Independent review, coherent commit, and Linear handoff

- [ ] **Step 1: Request independent code review**

Provide the reviewer:

- MYAH-184 requirements;
- the approved design spec;
- the implementation plan;
- the branch diff range;
- focused verification evidence;
- explicit security questions covering workspace isolation, secret leakage, TLS, idempotency, rotation, and revocation;
- explicit scope check excluding Icemail, billing, warmup/readiness, and campaign assignment.

- [ ] **Step 2: Resolve review findings test-first**

Fix every Critical and Important finding. For a disputed finding, document the code/test evidence rather than accepting or rejecting it performatively. Re-run every verification invalidated by a correction.

- [ ] **Step 3: Verify delivery state freshly**

Run the final focused tests, typecheck, and applicable generated-artifact check after review corrections. Record fresh output before any completion claim.

- [ ] **Step 4: Create one coherent commit**

Commit only MYAH-184 production code, behavioral tests, approved planning documents, and required generated artifacts. Exclude `.omp/RULES.md`, dependency caches, temporary files, logs, credentials, and unrelated changes.

Suggested message:

```text
feat(email): add secure workspace mailbox connection
```

- [ ] **Step 5: Add the complete Linear handoff comment**

The MYAH-184 comment must include:

- summary of implemented customer/server behavior;
- exact branch and worktree;
- files/components changed;
- encryption, TLS, workspace-isolation, replay, rotation, reconnect, revoke, and safe-error evidence;
- exact Linux verification commands, runtime, test counts, and outcomes;
- independent review result and resolved findings;
- commit SHA;
- explicit non-goals left untouched;
- generated-schema status and any deployment/runtime follow-up that is factual rather than speculative.

Do not mark the issue complete unless every design acceptance criterion is met.

---

## Plan self-review checklist

- [ ] Every design acceptance criterion maps to a task above.
- [ ] Every behavior change starts with a failing test.
- [ ] The plan supports any standards-compliant SMTP/IMAP provider and requires secure TLS.
- [ ] No task adds Icemail provisioning, billing, warmup/readiness policy, campaign assignment, inbound automation, or sending.
- [ ] Credentials never appear in output, logs, jobs, events, fixtures committed to source, or Linear comments.
- [ ] Workspace scoping is present in every lookup and mutation.
- [ ] Personal connected-account behavior remains backward compatible.
- [ ] Generated artifacts are changed only through the canonical generator.
- [ ] Independent review, coherent commit, and complete Linear handoff are required before completion.
