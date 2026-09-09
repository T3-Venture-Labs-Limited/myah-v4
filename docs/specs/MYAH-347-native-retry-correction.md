# MYAH-347 — native same-ID retry correction

Issue: https://linear.app/t3labs/issue/MYAH-347

[Executable additive plan](../plans/MYAH-347-native-retry-correction.md)

## 1. Authority, status and precedence

On **2026-09-08 Zachary selected “Implement and retest (Recommended)”** for “Approve the audited same-ID retry design, including corrected tests, browser observer safeguards, and isolated local retesting?” The exact owner receipt is `.myah347-local/native-retry-approval.md`. **Option A and the mandatory observer prerequisites are approved; do not reopen options. This delivery is DOCS ONLY. Application/test/observer implementation is not authorized in this stage.** Fresh independent spec/security and plan/test fidelity audits must pass before the parent releases the next execution gate. Automated-ready plus fresh independent complete-diff implementation review must precede new runtime/browser UAT.

Read the complete approved design and **both recovered** audits under this external artifact base:

`/home/zachary/.pi/agent/sessions/--home-zachary-development-myah-v4--/subagent-artifacts/outputs/a681f627-979d-47f7-bd74-1b727ef60665/`

- `myah-347-native-retry-proposal.md` — Option A, causal trace, native source proof, exact tests/copy.
- `myah-347-native-retry-security-audit.recovered.md` — READY for design approval, no findings.
- `myah-347-native-retry-test-audit.recovered.md` — READY with mandatory P2 observer repairs; incorporated in §7 and plan Task 4.

The non-recovered audit Markdown files are empty. Recovered JSON siblings preserve actual receipts. Proposal/audit wording that approval is pending is historical: the later owner receipt settles it. Prior implementation review predates failed native no-save UAT and **does not approve this correction**. Historical 190 tests/15 suites and lint/typecheck/LSP are not new verification.

This addendum supersedes **only** r4's error-free “authoritative null” resend premise, its uncertainty copy and affected fixtures, and adds the approved pipeline/observer verification. [Frozen r4 spec](MYAH-347-campaign-create-response-loss.md) and [frozen r4 plan](../plans/MYAH-347-campaign-create-response-loss.md), `.myah347-local/approved-plan/{spec-revision4.md,plan-revision4.md,SHA256SUMS}`, inherited 22 TS/TSX changes, prior evidence and all DB volumes remain immutable during this docs stage. All other r4 requirements and regression gates remain binding; do not rebuild its framework.

Ownership: cwd `/home/zachary/development/myah-v4/.worktrees/zeno/myah-347-campaign-creation-recover-a-successful-save-after-response`; branch `zeno/myah-347-campaign-creation-recover-a-successful-save-after-response`; HEAD `63b0549479aa375001d1f12a1abda98d6cbcab2f`. Root `AGENTS.md` governs. One writer, no child subagents. Parent owns independent reviews, ignored-doc durable snapshots/checksums, Linear/wiki and final LSP.

## 2. Observed defect and native primitive decision

`.myah347-local/uat/{no-save-unconfirmed.json,explicit-retry-not-found.json}` records attempt `52134da6-e327-4d0c-ac86-9ade68d400aa`: two locally rejected before-fetch creates, initial exact read, explicit New exact read, **no resend**. `db-final.txt` records count0 for this attempt and count1 for four saved controls. Both native reads return HTTP200, without an error `path`:

```json
{"data":{"campaign":null},"errors":[{"message":"Record not found","extensions":{"code":"NOT_FOUND","subCode":"RECORD_NOT_FOUND","userFriendlyMessage":"This record does not exist or has been deleted."}}]}
```

C = CreateOneCampaign wrapper/fixture attempt; R = index FindOneCampaign (not record-page reads). Actual causal RED is **C,C,R,R**, rows0/retained attempt; desired **C,C,R,R,C**, three identical inputs/UUID, rows delta1, one completion/native navigation. Progression and copy assertions must run separately so the copy mismatch cannot mask RED. Import/build/setup failure is not RED.

**Decision / deviation rationale:** retain native primary-backed exact FindOne, strict `errorPolicy:'none'`, permission-shaped selection and insert-only CreateOne. The read can positively confirm an exact readable nondeleted node. The narrow missing-root error means **not-confirmed**, never global absence or success. Explicit original-origin user intent, retained input/UUID, current native create authorization and table-wide PK uniqueness permit a bounded insert-only continuation. No FindMany switch, new endpoint, bypass, upsert, ledger or generic recovery framework.

## 3. Exact local contract

Only opted-in Campaign index creation uses this policy. Keep the existing `createOneRecord(recordInput, {campaignCreation:{context,intent}})` signature and r4 state/context types. Add one utility and one hook-local result type:

```ts
export const isCampaignCreationRecordNotConfirmed:
  (error: unknown) => boolean;

type CampaignCreationReadResult =
  | { kind: 'found'; node: RecordGqlNode }
  | { kind: 'not-confirmed' };
// Existing hook-local readRetainedCampaign(): Promise<CampaignCreationReadResult>
```

Classifier requires all of: `CombinedGraphQLErrors.is(error)`; exactly one error; message `Record not found`; code `NOT_FOUND`; subCode `RECORD_NOT_FOUND`; error.data is a non-array object whose own sole root is `campaign`, value strictly null. Absent path is accepted (actual wire); if path exists it must equal `['campaign']`. Friendly localized text is not classification authority. Reject code-only/wrong message/subcode, missing/extra/unrelated roots, inherited root, nested/wrong/null path, multiple/mixed errors, partial nonnull node+errors, arbitrary thrown objects, HTTP404 and malformed JSON.

Catch **only the native query rejection** in `readRetainedCampaign`, reassert current read boundary before classification, and rethrow every other error unchanged. Keep generated exact `$objectRecordId: UUID!` query, `fetchPolicy:'no-cache'`, `errorPolicy:'none'`, context `queryDeduplication:false` and `campaignCreation`. Successful query validation remains outside this catch. **Unexpected error-free null is `CampaignCreationUnconfirmedError`, never a resend permit.** Positive data must still satisfy current authorization and existing exact ID, `__typename:'Campaign'`, `deletedAt:null`, complete actual selected scalar/composite/relation fields and metadata nullability validation. Do not require unselected fields, relax permissions or follow a conflict ID.

| Intent / result | Exact behavior |
| --- | --- |
| Initial native mutate, eligible uncertainty | One recovery read only. Found → saved; not-confirmed → UnconfirmedError, retain original attempt, no extra mutation. |
| Explicit New from original origin, retained non-saved | Read first. Found → saved; strict not-confirmed → recheck current native read/create authorization, one native mutation group using original serialized input/UUID. Preserve prior uncertainty. |
| Resend terminal eligible transport/duplicate failure while uncertain | One final exact read. Found → saved; not-confirmed → unconfirmed and end invocation; never recursive mutation. |
| Read denied/offline/unrelated/malformed, including unsupported null | No resend/success. Preserve native rejection or local ambiguity, retained attempt and settled controls. |
| Genuine current mutation validation/auth/permission/413, including RLS/connect rejection before uniqueness | Native error unchanged, no automatic recovery read or speculative mutation in that invocation. |
| Fresh duplicate without uncertainty | C1/R0, genuine friendly error, no success/eviction/conflict-target following. |
| Open-saved | Existing guarded same-boundary saved-node reuse or one authorized recheck. Missing/ambiguous/denied retains saved, **zero mutations**, no completion replay. |

Native RetryLink max2/delay/jitter and native renewal bounds remain unchanged. A mutation/query **group** is not an absolute two-HTTP-request ceiling across GraphQL auth renewal. Preserve r4 factory counts: ordinary transport core2/auth-forward1/renew0; HTTP401 or 413 core1/renew0 (413 callback1); HTTP403 native core2/no uncertainty; GraphQL UNAUTHENTICATED or message Unauthorized then success core2/auth-forward2/renew1; failed renewal transport invokes renew four times with 1000/2000/3000ms backoffs; repeat auth error after renewal does not loop.

### Errors and user-visible copy

Keep `CampaignCreationBoundaryError` / `CAMPAIGN_CREATION_BOUNDARY_CHANGED` (silent stale-context handling) and `CampaignCreationUnconfirmedError` / `CAMPAIGN_CREATION_UNCONFIRMED`. Replace only the Lingui uncertainty message in the index catch with:

> Could not confirm whether the Campaign was saved. Choose New to check again and retry the same creation. If this keeps happening, check your Campaign access.

All other errors retain `enqueueErrorSnackBar({apolloError})`. Preserve `You no longer have permission to confirm this Campaign creation.` and `You no longer have permission to create Campaigns.` Native FORBIDDEN/PERMISSION_DENIED friendly text remains `User does not have permission.` Native RLS rejection `Record does not satisfy row-level security constraints of your current role` is BAD_USER_INPUT, **not duplicate**. Duplicate remains narrow subCode DUPLICATE_ENTRY_DETECTED or exact BAD_USER_INPUT / `A duplicate entry was detected`, never every BAD_USER_INPUT; mixed errors are ineligible. Do not persist/normalize/open conflicting-record metadata.

Preserve `Creating Campaign…`, `Campaign creation is already in progress.`, original-origin Return action/copy, `Uploaded content is too large.`, and all saved warnings: `Campaign saved, but counts could not refresh.`, `Campaign saved, but some data could not refresh. Reopen the Campaign or refresh this view.`, `Campaign saved, but could not open. Choose New in the original view to open it.` No global toast/error suppression.

## 4. Source-backed invariants and honest limits

F = `packages/twenty-front/src/modules/`; S = `packages/twenty-server/src/`. Anchors refer to inherited source at the pinned HEAD plus preserved working changes; complete pipeline evidence is in proposal §2 and recovered security audit.

| Invariant | Native source anchors / boundary |
| --- | --- |
| Strict missing query rejects but retains data | Installed `node_modules/@apollo/client/core/QueryManager.js:629–642` and `errors/CombinedGraphQLErrors.js:79–98`; F `object-record/hooks/useCreateOneRecord.ts:212–239,318–320` explains current failing null assumption. Real-factory test must establish this, not only a manually constructed error. |
| Primary, authorized read; no global absence | S `engine/api/common/common-query-runners/common-base-query-runner.service.ts:99,313–347` selects primary for inherited `isReadOnly=false`; find-one does not override, find-many sets true. `common-find-one-query-runner.service.ts:53–89` throws for no visible row. `engine/twenty-orm/repository/workspace-select-query-builder.ts:365–417` applies native permissions/RLS; deletedAt filtering excludes soft deletion. Do not opt into withDeleted or bypass. |
| Identity and field security | Native token hydration/workspace auth context and role-aware common runner/ORM remain authoritative. F `apollo/utils/campaignCreationOperation.ts:98–200`, `apollo/services/apollo.factory.ts:118–219,333–348,423–432`: current storage/header/native atoms, permissions, session/boundary/lease checked at auth, each forward, next/error, ErrorLink entry and before completion. Preserve awaited-false race guard. |
| Plain insert, supplied UUID retained | F `object-metadata/utils/generateCreateOneRecordMutation.ts:39–65` sends only `data:$input`. S create-one resolver/common runner → `common-create-many-query-runner/common-create-many-query-runner.service.ts:191–228` non-upsert `repository.insert` → `engine/twenty-orm/entity-manager/workspace-entity-manager.ts:237–258` plain insert/values/returning, no update/ignore. UUID validation/formatting and Campaign prehook preserve supplied ID. |
| Global same-table uniqueness | S `engine/twenty-orm/factories/entity-schema-column.factory.ts:89–101` marks id primary/deletedAt deleteDate; native migration column builder emits PRIMARY KEY; workspace table manager declares UUID PRIMARY KEY DEFAULT gen_random_uuid(). Workspace schema mapping isolates tables. Supplied UUID overrides default; RLS-hidden/soft-deleted rows still occupy PK. Actual fresh UAT PK/triggers must be inspected. |
| Pre-insert checks can genuinely fail | Common base coercion/prehooks run before SQL. Position preparation reads min/max and changes proposed position only. S `modules/myah-campaign/services/campaign-lifecycle.service.ts:116–137,315–353` rejects upsert, defaults DRAFT/omitted owner, does not replace ID or write/activate/send. Relation connect preparation reads targets and changes proposed join columns; files enrichment reads/validates before insert. Preserve permission/field/RLS/owner/connect failures. |
| No full-lifecycle transaction | `executeInWorkspaceContext` is AsyncLocalStorage, not transaction; installed TypeORM QueryExpressionMap defaults useTransaction=false. Atomic INSERT/PK does not wrap hooks, enrichment/events/response. `workspace-insert-query-builder.ts:222–275` awaits SQL before file updates and CREATED/UPSERTED emissions; rejected PK does not reach these, but post-insert failure may leave committed row. No completion-side-effect replay or exactly-once subscriber receipt. Current datasource has no configured subscribers/entity listeners; arbitrary future triggers/subscribers require renewed review. |

Preserve one unresolved attempt per workspace+actor in continuous in-memory session, original mounted origin and relative return path, lease before awaits, compare-by-run cleanup, synchronous invalidation, ID assigned once last after RLS/filter/caller sanitization, canonical input JSON parsed afresh without rebuilding defaults. Identical input means identical wire JSON, **not** server-derived timestamps/position/defaults. Return-to-origin only navigates, never reads/resends. Same actor SPA workspace switch retains attempts but invalidates active work; logout/actor/impersonation/provider teardown clears the session; stale work cannot act after ABA restoration.

No optimistic shell/list/store/count or virtualization before positive proof. Saved is recorded before completion; completionAttempted prevents replay. Preserve native fragment-first normalization, create/attach `checkForRecordInCache:false`, owner inverse dedup, authoritative numeric fields, filter-aware lists/group IDs, explicit-sort precedence, guarded exact active aggregate scopes, bounded best-effort events/navigation, truthful saved warnings, saved retention on navigation failure and owner-only control cleanup. No non-Campaign return/rejection/default/optimistic behavior changes or generic callback/membership guarantee.

**Accepted limits:** UUID collision assumption is not mathematical insertion ownership; positive exact authorized read cannot prove which client inserted. Hidden/conflicting states can remain unresolved. Primary snapshot misses do not prevent concurrent commit; PK arbitrates (commit→conflict, rollback→possible insert, timeout→error). Soft deletion retains PK; **hard deletion of an unconfirmed saved row can permit reinsertion**. No tombstones/durable idempotency across hard deletion, reload, new login, tab/device or storage reset. Saved-phase attempts never resend even if missing. Frontend Map/source interleavings do not certify PostgreSQL locking or live RLS behavior.

The existing identical-scope group-array replacement, characterized by `documents native identical-scope group aggregate replacement before any Campaign creation`, remains a separate native baseline issue. Preserve its test and legitimate orderByForRecords scope distinction; no silent cache merge/sort repair.

## 5. Allowed later implementation slice

Production only: F `apollo/utils/campaignCreationOperation.ts`, `object-record/hooks/useCreateOneRecord.ts`, `object-record/record-table/hooks/useCreateNewIndexRecord.ts`.

Tests only: existing F `apollo/services/__tests__/apollo.factory.campaignCreation.test.ts` and `object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx`; narrowly extend S `modules/myah-campaign/services/__tests__/campaign-lifecycle.service.spec.ts` for repeated explicit UUID/owner/DRAFT prepare and upsert/no-write characterization. No new fixture framework. Observer/checker/preflight stay task-local; preserve old evidence by creating corrected copies under `.myah347-local/native-retry/` later.

No production server/API/schema/migration/generated GraphQL, query-hook, auth/session/cache policy, command runner, table control, global listener or dependency change. Inherited 22-file complete diff still requires review and lint, not merely these three production files.

## 6. Required automated evidence

Plan Tasks 1–3 implement exact-envelope RED/GREEN, real-factory none/error.data proof, all classifier negatives through direct and opted-in hook paths, native default opt-out controls, all missing-fixture corrections, hidden/soft-deleted storage-wide uniqueness, delayed commit/final-not-confirmed finite outcomes, authorization/session/origin transitions, saved-never-resend, immutable input/ID and genuine failures. Keep real command/table pending ownership and no speculative UI evidence; never install error suppression or replace native RetryLink. Use fresh stores/cache/rows/storage and bounded delivery/timer counts; assert requests/state/UI unconditionally.

Run all inherited **15 frontend suites**, separate real-command gate, focused lifecycle unit, actual observer checker, complete tracked+untracked changed-file type-aware lint/format and relevant frontend/server typechecks; parent final LSP. No integration cleanup/reset suite containing record deletion. Independent complete-diff review follows (one bounded fix/review round if needed), then fresh UAT. Past GREEN does not replace these gates.

## 7. Mandatory observer and native-loopback UAT

Existing `.myah347-local/uat/browser-harness.js:27–34` unguarded clone/json can replace native response on observation failure; truthy ID alone can inject on partial/wrong-ID results. Correct only the task-local observer: catch clone/parse/observation failures, record safe diagnostics and return the **same original Response**, unconsumed, fault count unchanged. Underlying fetch rejection propagates unchanged; actual args/this forwarded unchanged. After-success injection requires armed fault, successful HTTP response, expected CreateOneCampaign/createCampaign, error-free data and returned ID exactly equal to submitted retained ID. Wrong operation/root/ID, malformed/non-JSON, partial/error-bearing data pass through. Capture safe eligibility/equality evidence **before** one designated loss/count decrement. Restore fetch/listeners/observer in finally; never suppress error/unhandledrejection. Per-scenario observation boundaries must prove each pending/error appearance/settlement, not cumulative deduplicated notice text.

Before runtime, run `node .myah347-local/native-retry/check-browser-harness.cjs` to evaluate the **actual corrected harness source** `.myah347-local/native-retry/browser-harness.js` with built-in Node assertions and controlled fetch/Response/window/MutationObserver stubs. Mandatory cases: malformed JSON, non-JSON, clone throw, partial+errors, wrong ID/root/operation, HTTP error, exact same-ID success, underlying rejection. Ineligible: response identity, body readable, exact forwarded args, fault unchanged, no synthetic error. Eligible: evidence before rejection, decrement once, next passes. Archive observer RED/GREEN independently from product RED/GREEN.

Runtime authority is conditional, not available in this docs stage: after automated-ready/review, use new isolated source-seeded disposable DB and task-owned credentials; prior redacted Compose is **not restartable unchanged**. Preserve previous `myah347_e6f0b41d` DB, every MYAH-323 datum and prior evidence/volumes. **No hard-delete, live hidden/deleted/RLS fixture mutation or competing SQL transaction orchestration authority.** Cover these through source/unit interleavings and label live limits; seek specific authority only if acceptance truly requires live controls.

Native **agent_browser only**, no protocol/runtime fallback. Pinned Node `/home/zachary/.local/share/nodejs/node-v24.16.0-linux-x64/bin` and owned Yarn4. Before browser verify ports initially free, exact runtime ownership, bounded readiness and **all IPv4/IPv6 listeners/publishes**: API exclusively127.0.0.1:3347 with reviewed `.myah347-local/uat/loopback-only.cjs` preload SHA256 `a685fa0f79319ef59686df5988290ade290bfd4de13a4e3f9bb9fcb703458bc4`; frontend127.0.0.1:5347 strictPort; DB/Redis127.0.0.1:5647/6647. Reject wildcard/nonloopback/extra listeners or uncertain ownership. Health200/localhost URL alone is not proof; preload is port-specific, not a network sandbox.

Fresh browser evidence must show absent no-save→explicit same-ID continuation, toolbar/table saved-loss recovery, pending repeated controls/no speculative row, native Name/Objective edit/reload, submitted/returned/SQL UUID equality, count1/row delta, original fields/deletedAt preservation on conflict, actual Campaign PK/noninternal trigger inspection, native route and no observed error/unhandledrejection without suppression. Distinguish wrapper attempts from actual forwarded HTTP and index vs record-page reads. No invented live lock/RLS or subscriber receipt claims.

Stop/report infrastructure failure with exact run/cwd/branch/ref, failed command/status and partial diff. No stage/commit/push/PR/deploy/production, activation/send/deletion, borrowed dependencies/services, global environment/firewall change, arbitrary ports or alternate execution/browser protocol. Cleanup restores exact probe, closes only managed task browser, stops only owned PIDs/services, retains rows/volumes/evidence, removes only newly authorized temporary credentials and proves all four ports clear. Parent receives final preservation evidence and Linear/wiki handoff.
