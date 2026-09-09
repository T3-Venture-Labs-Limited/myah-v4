# MYAH-347 native retry correction — additive execution plan

> **Sequential writer, gated execution only:** use executing-plans/test-driven-development discipline after parent release. No child subagents, stage or commit. Parent owns review fanout, Linear/wiki and final LSP. **This stage writes documents only; none of the unchecked implementation/runtime steps below is authorized to execute yet.**

**Goal:** make a genuinely no-save Campaign attempt progress on explicit original-origin New using the same ID/input, without treating native NOT_FOUND as absence or success.

**Architecture:** extend the existing Campaign operation utility and local create-hook finite branches; retain native primary FindOne, strict Apollo policy, existing state/guards and insert-only create. No new framework or backend behavior.

**Tech stack:** pinned Node v24.16.0; worktree-owned Yarn4 4.13.0, Apollo4/RxJS, React/Jotai, Lingui, native generated GraphQL, existing Jest/Nx/Oxlint/Oxfmt; built-in Node assertions for the task-local observer checker. No dependencies added.

## 0. Authority, preservation and progress

Normative [additive spec](../specs/MYAH-347-native-retry-correction.md), `.myah347-local/native-retry-approval.md`, root `AGENTS.md`, and unchanged r4 requirements in [original spec](../specs/MYAH-347-campaign-create-response-loss.md) / [original plan](MYAH-347-campaign-create-response-loss.md). The addendum supersedes only native missing-read classification/continuation/copy/fixtures and adds approved test/observer gates. Do not execute r4's old null-based recipe or modify its approval history.

On **2026-09-08 Zachary approved “Implement and retest (Recommended)”**: audited Option A, corrected tests, observer safeguards and bounded isolated retesting. Full proposal plus **both recovered** audits are at `/home/zachary/.pi/agent/sessions/--home-zachary-development-myah-v4--/subagent-artifacts/outputs/a681f627-979d-47f7-bd74-1b727ef60665/`:

- `myah-347-native-retry-proposal.md`
- `myah-347-native-retry-security-audit.recovered.md`
- `myah-347-native-retry-test-audit.recovered.md`

The approval receipt supersedes their historical pending-human-approval status, not their remaining verification gates. Empty non-recovered audit Markdown and old pre-UAT implementation approval are not correction acceptance. Owner accepts ephemeral session/UUID/hard-deletion limits; no hard-delete, live hidden/deleted/RLS fixture mutation or competing SQL transaction orchestration is authorized. Unit/source interleavings are required; live limits must remain explicit.

- [x] Read exact owner receipt first; verified cwd/branch/HEAD and inherited inventory.
- [x] Read proposal, both recovered audits, complete frozen r4 docs, named current seams and applicable planning skills. Settled options remain settled; root paths/no-commit override generic skill suggestions.
- [x] Additive spec/plan drafted; self-audit coverage and observer/native-loopback prerequisites included (Task 7).
- [ ] Parent obtains independent spec/security and plan/test fidelity passes, archives approved additive docs/checksums externally and releases implementation gate.
- [ ] Task 1 native-envelope causal progression RED and separate copy RED archived before product edits.
- [ ] Task 2 minimal correction and unchanged GREEN.
- [ ] Task 3 negative/security/finite-retry/native-ID characterization complete.
- [ ] Task 4 observer source checker RED/GREEN complete.
- [ ] Task 5 all 15 frontend suites + focused server unit + actual checker + complete lint/format/typecheck + parent LSP pass; independent complete-diff review passes (one bounded fix/review round if needed).
- [ ] Task 6 fresh native-loopback UAT, owned cleanup and preservation complete.
- [ ] Parent receives final evidence/Linear/wiki handoff. No commit/deploy/activation/send.

Preserve inherited 22 uncommitted TS/TSX files during docs stage, every previous evidence file, r4 originals/snapshots/manifest, previous `myah347_e6f0b41d` DB and all MYAH-323 data/volumes. Later correction edits only allowed seams below. Record new evidence under a fresh task-local `.myah347-local/native-retry/` directory; never overwrite old logs or UAT data. Parent declares final artifacts through native output, not repo root. `/docs/` is ignored: Git status is not durability evidence; never force-stage/change ignore.

## 1. Exact file map and command context

F = `packages/twenty-front/src/modules/`; S = `packages/twenty-server/src/`.

| Later file delta | Responsibility |
| --- | --- |
| F `apollo/utils/campaignCreationOperation.ts` | Add `isCampaignCreationRecordNotConfirmed(error:unknown):boolean`; leave existing duplicate/transport/identity helpers unchanged. |
| F `object-record/hooks/useCreateOneRecord.ts` | Hook-local discriminated strict read result; query-only catch; explicit finite initial/retry/open-saved branches. |
| F `object-record/record-table/hooks/useCreateNewIndexRecord.ts` | Exact Lingui uncertainty copy only. |
| F `object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx` | Native ordinary-missing fixture, causal RED/GREEN and security/UI/interleaving matrix in existing real-factory fixture. |
| F `apollo/services/__tests__/apollo.factory.campaignCreation.test.ts` | Real none/error.data proof and narrow classifier/opt-out controls; retain auth/count tests. |
| S `modules/myah-campaign/services/__tests__/campaign-lifecycle.service.spec.ts` | Repeated explicit UUID/owner/DRAFT input prepare and upsert/no-write unit characterization only. |
| NEW `.myah347-local/native-retry/browser-harness.js` | Corrected copy of preserved `.myah347-local/uat/browser-harness.js`, mandatory observer safeguards. |
| NEW `.myah347-local/native-retry/check-browser-harness.cjs` | Offline built-in Node checker evaluating that actual source; not alternate browser protocol. |

Runtime/preflight/evidence/temporary credentials remain task-local. No production server/API/schema/migration/generated GraphQL, query-hook, auth/session/cache policy, command/table controls, global listener or new fixture framework. All inherited regression requirements still apply to the complete diff.

Run each later command from this verified shell context; archive command, exit status and safe output separately for each gate. Stop on failure, never install/borrow/switch mode:

```bash
cd /home/zachary/development/myah-v4/.worktrees/zeno/myah-347-campaign-creation-recover-a-successful-save-after-response
export PATH=/home/zachary/.local/share/nodejs/node-v24.16.0-linux-x64/bin:$PATH
WT=$PWD
F=packages/twenty-front/src/modules
S=packages/twenty-server/src
INDEX_TEST=$F/object-record/record-table/hooks/__tests__/useCreateNewIndexRecord.responseLoss.test.tsx
FACTORY_TEST=$F/apollo/services/__tests__/apollo.factory.campaignCreation.test.ts
LIFECYCLE_TEST=$S/modules/myah-campaign/services/__tests__/campaign-lifecycle.service.spec.ts
JEST=node_modules/jest/bin/jest.js
FRONT_CONFIG=packages/twenty-front/jest.config.mjs
SERVER_CONFIG=packages/twenty-server/jest.config.mjs
YARN=.yarn/releases/yarn-4.13.0.cjs
test "$WT" = /home/zachary/development/myah-v4/.worktrees/zeno/myah-347-campaign-creation-recover-a-successful-save-after-response
test "$(git branch --show-current)" = zeno/myah-347-campaign-creation-recover-a-successful-save-after-response
test "$(git rev-parse HEAD)" = 63b0549479aa375001d1f12a1abda98d6cbcab2f
test "$(node --version)" = v24.16.0
test "$(node "$YARN" --version)" = 4.13.0
test -d node_modules && test ! -L node_modules
test "$(realpath node_modules)" = "$WT/node_modules"
sha256sum -c .myah347-local/approved-plan/SHA256SUMS
git diff --check
test -z "$(git diff --cached --name-only)"
```

Also inspect internal module realpaths to reject links to another worktree/ancestor dependency tree (local package links within this worktree are expected). Before edits hash complete inherited source plus `.myah347-local/` and r4 originals to a fresh external preservation manifest; retain original inventories. Missing setup/build dependency is infrastructure failure, not test RED. Report run/cwd/branch/ref, exact failed command/status and partial diff; no protocol/port/runtime fallback.

## Task 1 — causal native-envelope RED, before product edits

**File:** `$INDEX_TEST`; reuse actual nearest ApolloFactory, native hooks/generated documents, stateful storage and finite delivery fixture. Current source anchors: default missing response ~882–897; explicit retry test ~1141; ordinary missing overrides ~2216,3070,3290–3314 and delayed-commit reads.

- [ ] Add a file-local ordinary-missing value and use it when the exact stored row is not visible. Do not change parser/query/permission selection or uniqueness to manufacture success:

```ts
const campaignNotConfirmedResponse = {
  data: { campaign: null },
  errors: [{
    message: 'Record not found',
    extensions: {
      code: 'NOT_FOUND', subCode: 'RECORD_NOT_FOUND',
      userFriendlyMessage: 'This record does not exist or has been deleted.',
    },
  }],
};
```

- [ ] Rename the existing explicit retry test to `explicit New progresses after native not-confirmation with immutable original ID and input`. Deliver two fail-before-save creates. Assert initial C,C,R, same two inputs, rows0, retained ID/input/unconfirmed, pending/loading settled, no completion/navigation/cache/store/count row. Then set one deliver and invoke original-origin New with conflicting new caller defaults. Assert retained third input, desired C,C,R,R,C, exact read IDs, row delta1, one event/completion/navigation. Drain `advanceTimersByTimeAsync(7000)` and assert no later requests. Keep copy in a separate test named `native not-confirmation shows actionable uncertainty` so it cannot short-circuit progression RED.
- [ ] Execute both commands **before product edits**, save output plus test/source diff. Expected progression failure: actual C,C,R,R, creates2 not3, rows0, undefined retry result. Expected copy failure: native `This record does not exist or has been deleted.` instead of approved copy. Neither setup error nor a copy-only failure closes causal RED.

```bash
node "$JEST" --config="$FRONT_CONFIG" --runInBand --runTestsByPath "$INDEX_TEST" --testNamePattern='explicit New progresses after native not-confirmation'
node "$JEST" --config="$FRONT_CONFIG" --runInBand --runTestsByPath "$INDEX_TEST" --testNamePattern='native not-confirmation shows actionable uncertainty'
```

- [ ] Audit entire file using `rg -n 'campaign: null|\?\? null|authoritative null|readResponse' "$INDEX_TEST"`. Convert all ordinary native missing responses, including command remount, permission restoration, cache-only shell, offline restoration, origin progression, delayed commit and saved retention. Keep error-free null **only** as an expressly named unsupported negative control. Existing null+FORBIDDEN test is not native missing evidence. Preserve owner/composite source-faithful fixtures and group baseline characterization.

## Task 2 — minimal strict result and finite branches, then unchanged GREEN

**Interfaces:** existing `CampaignCreationRequest.intent = 'create'|'retry'|'open-saved'` and r4 context/state remain unchanged. Add utility below (using already installed CombinedGraphQLErrors); import it into existing create hook:

```ts
export const isCampaignCreationRecordNotConfirmed = (error: unknown): boolean => {
  if (!CombinedGraphQLErrors.is(error) || error.errors.length !== 1) return false;
  const item = error.errors[0];
  const data = error.data;
  return item.message === 'Record not found' &&
    item.extensions?.code === 'NOT_FOUND' &&
    item.extensions?.subCode === 'RECORD_NOT_FOUND' &&
    typeof data === 'object' && data !== null && !Array.isArray(data) &&
    Object.keys(data).length === 1 && Object.hasOwn(data, 'campaign') &&
    (data as Record<string, unknown>).campaign === null &&
    (!Object.hasOwn(item, 'path') ||
      (Array.isArray(item.path) && item.path.length === 1 && item.path[0] === 'campaign'));
};

type CampaignCreationReadResult =
  | { kind: 'found'; node: RecordGqlNode }
  | { kind: 'not-confirmed' };
```

- [ ] In the existing hook-local `readRetainedCampaign`, retain derived read context/current assertion and checking phase only when not saved. Change return type to `Promise<CampaignCreationReadResult>`. Assign the strict query promise to `readPromise`, type local `let result: Awaited<typeof readPromise>`, then use a query-only catch:

```ts
try {
  result = await readPromise;
} catch (error) {
  assertCampaignCreationCurrent(readContext);
  if (isCampaignCreationRecordNotConfirmed(error)) return { kind: 'not-confirmed' };
  throw error;
}
assertCampaignCreationCurrent(readContext);
if (!result.data || !Object.hasOwn(result.data, 'campaign') || result.data.campaign === null) {
  throw new CampaignCreationUnconfirmedError();
}
return {
  kind: 'found',
  node: validateCampaignNode(result.data.campaign, readContext, findOneRecordQuery),
};
```

`readPromise` is exactly the current `apolloCoreClient.query<Record<string, RecordGqlNode|null>>` call with generated query, `{objectRecordId:attempt.recordId}`, no-cache/none and current `campaignCreation`/dedup false context. Do not include validation, cache/completion or a mutation in this catch; unsupported fulfilled null cannot become non-confirmation.

- [ ] In existing eligible uncertainty recovery inside `mutateCampaign`, replace truthiness with `if (recovered.kind === 'found') return recovered.node;` otherwise throw UnconfirmedError. Keep current native create permission/identity check immediately before mutation, JSON.parse retained input and native duplicate/transport eligibility. Initial non-confirmation stops; mutation helper does not recurse.
- [ ] Replace only intent result handling with explicit branches; same-boundary saved reuse must still use the existing current read guard at invocation, never create authority:

```ts
let node: RecordGqlNode;
if (intent === 'open-saved') {
  if (attempt.savedBoundaryGeneration === context.boundaryGeneration) {
    if (!attempt.savedNode) throw new CampaignCreationUnconfirmedError();
    node = attempt.savedNode;
  } else {
    const saved = await readRetainedCampaign();
    if (saved.kind !== 'found') throw new CampaignCreationUnconfirmedError();
    node = saved.node;
  }
} else if (intent === 'retry') {
  const checked = await readRetainedCampaign();
  if (checked.kind === 'found') node = checked.node;
  else {
    if (getAttempt()?.phase === 'saved') throw new CampaignCreationUnconfirmedError();
    node = await mutateCampaign();
  }
} else {
  node = await mutateCampaign();
}
```

No `?? mutateCampaign()`, state type migration, new hook, relaxed errorPolicy or ErrorLink/toast change. Existing current-boundary checks, saved-before-completion and completionAttempted sequence stay intact.

- [ ] Replace the existing Lingui uncertainty message only with `Could not confirm whether the Campaign was saved. Choose New to check again and retry the same creation. If this keeps happening, check your Campaign access.` Preserve exact error classes, native error envelopes and all other copy from spec §3.
- [ ] Rerun both Task 1 commands without weakening assertions. Require C,C,R,R,C/three equal inputs/one row/one completion and actionable settled UI. Run entire index/factory files; implementation stops if source reveals a need outside the three-file production ceiling.

## Task 3 — executable negative, security and native-pipeline characterization

**Files:** `$INDEX_TEST`, `$FACTORY_TEST`, `$LIFECYCLE_TEST`. Add assertions before any needed correction, archive behavioral RED/GREEN or label an already-passing characterization honestly. All request/result/state assertions are unconditional (never only in catch); fixtures reset store/cache/rows/storage, restore timers/history/listeners/fetch/client in finally and drain bounded timers without runAllTimers loops.

- [ ] `$FACTORY_TEST`: use actual ApolloFactory and generated FindOneCampaign, strict no-cache/none, opted-in current read context. Deliver exact native envelope via fetch. Attach rejection capture immediately; assert `CombinedGraphQLErrors.is(error)`, error.data equals `{campaign:null}`, classifier true, no normalized fragment. Test absent path and exact `['campaign']`. This must cross actual QueryManager, not just construct the error.
- [ ] Parameterize classifier/direct+hook controls: code-only NOT_FOUND, wrong subCode/message, missing data/root, extra/unrelated/inherited root, wrong/nested/null path, multiple duplicate/forbidden errors, null+FORBIDDEN, nonnull partial+NOT_FOUND, arbitrary object, HTTP404, malformed JSON, error-free null. Assert no resend/success/cache/store/event/navigation, genuine rejection or local ambiguity retained, controls settled. Default Person and non-opted Campaign preserve strict native behavior (no classifier recovery).
- [ ] Hidden/soft-deleted fixture: keep full row in storage Map, filter only read visibility to native envelope; uniqueness checks **all** stored rows. Snapshot full original fields/deletedAt, run explicit same-ID INSERT→duplicate or current RLS failure, then assert unchanged snapshot, row delta0, no update/restore/new UUID/conflict-ID lookup/navigation/cache/store/event. Do not delete fixture row on response loss.
- [ ] Delayed original commit: gate after explicit not-confirmed read and before third create, insert original retained ID into fixture Map, then first resend response is duplicate and final exact read succeeds. Require C,C,R,R,C,R, identical input, unchanged original fields, one completion. Final-read NOT_FOUND variant ends unconfirmed with same finite sequence and no second mutation. Model original rollback by leaving Map unoccupied; timeout remains genuine failure, not success/absence. Label these **frontend interleaving/source proofs, not PostgreSQL unique-wait/commit/rollback tests**.
- [ ] Authorization: local create deny before resend→no create; stale client permissions with native server FORBIDDEN/field-write/RLS BAD_USER_INPUT/invalid owner-connect/revoked relation access→genuine error before uniqueness, no automatic read/success. Restored explicit retry keeps JSON/UUID. Object/id/deletedAt read denial→no query/normalization. Workspace/actor/member/impersonation/token/permissions change during read and immediately before resend→no wrong-context forwarding or stale callbacks; lease settles, old finally cannot clear new lease.
- [ ] Genuine failures: fresh duplicate C1/R0 even with exact existing row; different-ID conflict metadata never followed; known validation/auth/413 while uncertain causes no automatic read in that invocation; saved missing/denied/unsupported-null recheck retains saved and creates0. Preserve native auth renewal counts, current-session 413 callback text and awaited-false/deferred-error guards, not a false absolute two-HTTP ceiling.
- [ ] Original-input/UI controls: generated ID once after attacker caller/RLS/filter IDs, unchanged original owner/group/calendar/default JSON across retries; generated AST only data:$input/no upsert. Actual command remount/table consuming undefined, cross-control lease/pending during initial read and resend holds, Return action navigation-only, no speculative cache/store/list/count/virtualization, native owner inverse/dedup, saved warnings/aggregate scopes, completion once. Preserve non-Campaign Person/Creator/Workflow/activity/related-record default suites and existing identical-scope group baseline.

**Focused lifecycle unit**, within existing `describe('create')` and its native service/mock setup; add `describe('native retry preparation')`, retain default-owner/upsert tests. Repeatedly prepare fresh copies of identical explicit valid ID/owner with DRAFT or omitted status. Example assertion core:

```ts
const original = { data: {
  id: '34700000-0000-4000-8000-000000000401',
  ownerId: '34700000-0000-4000-8000-000000000402',
  name: 'Retry preparation', lifecycleStatus: 'DRAFT',
} };
for (let run = 0; run < 2; run += 1) {
  const payload = structuredClone(original);
  await expect(service.prepareCreateOne(userAuthContext, 'campaign', payload)).resolves.toBe(payload);
  expect(payload).toEqual(original);
}
const upsert = { ...structuredClone(original), upsert: true };
await expectLifecycleError(
  service.prepareCreateOne(userAuthContext, 'campaign', upsert),
  'Campaign upsert is not supported; use create or update.',
);
expect(upsert).toEqual({ ...original, upsert: true });
expect(getRepository).not.toHaveBeenCalled();
expect(campaignCreatorRepository.update).not.toHaveBeenCalled();
expect(campaignCreatorRepository.delete).not.toHaveBeenCalled();
expect(campaignCreatorRepository.softDelete).not.toHaveBeenCalled();
```

For omitted status require DRAFT added while exact ID/explicit owner remain; no repository path means no write/activation service invoked. Do not invoke ACTIVE preparation, activation/send, or add backend behavior. Source trace remains necessary: native UUID validators/formatting preserve value; non-upsert create-many uses repository.insert; table id is primary; prehooks/position/relations/files preparation precede SQL, post-insert file writes/events follow SQL, no encompassing lifecycle transaction. Confirm primary routing has not changed. Unit prepare is not PK proof.

```bash
node "$JEST" --config="$FRONT_CONFIG" --runInBand --runTestsByPath "$FACTORY_TEST" "$INDEX_TEST"
node "$JEST" --config="$SERVER_CONFIG" --runInBand --runTestsByPath "$LIFECYCLE_TEST" --testNamePattern='native retry preparation'
node "$JEST" --config="$SERVER_CONFIG" --runInBand --runTestsByPath "$LIFECYCLE_TEST"
```

## Task 4 — mandatory observer RED/GREEN before runtime

Preserve `.myah347-local/uat/browser-harness.js`. Copy its source to `.myah347-local/native-retry/browser-harness.js`; write checker `.myah347-local/native-retry/check-browser-harness.cjs` using only `node:assert/strict`, `node:fs`, `node:path`, `node:vm` and Node Response. Resolve harness via `__dirname`; do not duplicate observer logic in a test implementation.

- [ ] Checker evaluates actual source via `vm.runInNewContext` with controlled window.fetch, window event listener registry, document.body/querySelectorAll, location.pathname, no-op MutationObserver with observable disconnect, Date/Response/Error/TypeError and console. Capture exact forwarded this/argument references and original Response. Obtain `window.__myah347`; arm `mode='after', remaining=1`. Each case has a fresh sandbox and always invokes probe.restore, then verifies original fetch/listeners/observer restored. No actual network/browser/services involved.
- [ ] Run checker against the unchanged copy first. Required RED: malformed/non-JSON/clone errors replace the original response; wrong-ID or partial+errors incorrectly consume armed after fault. Failure from unavailable Node/source/stub setup is infrastructure, not observer RED.
- [ ] In copied harness keep `await original.apply(this,args)` **outside** observation catch. In a narrow try/catch observe clone/json and validate safe result shape; on any observation error record safe diagnostic class/status (no raw body/credentials) and return same response, no fault decrement. Do not consume response body or throw a replacement error. Avoid error logging of raw thrown objects.
- [ ] Eligibility is conjunction: armed after mode/count, actual `response.ok`, request operation CreateOneCampaign, expected createCampaign result root, no GraphQL errors (absent or empty array; malformed errors ineligible), submitted ID nonempty string, result ID strictly equal to it. Wrong/extra result roots, malformed/non-JSON/partial/error-bearing responses and other operations pass unchanged. Capture status/resultId/eligibility/equality before decrement and designated `TypeError('MYAH347 local committed response loss')`; throw **outside** observation catch. Underlying rejected fetch passes unchanged and does not decrement fault.
- [ ] Parameterize malformed JSON, text/non-JSON, clone throw, null/malformed body, partial+errors, wrong ID/root/operation, unsuccessful HTTP, exact error-free same-ID success, underlying fetch rejection. Ineligible cases use `assert.strictEqual(returned,response)`, `assert.equal(await returned.text(), originalBody)`, `assert.equal(h.remaining,1)`, exact args/this and no synthetic rejection. Underlying rejection uses reference equality via `assert.rejects(..., error => error === underlyingError)`. Eligible uses designated error assertion, captured eligibility/equality before rejection, remaining0; next original response returns unchanged and is readable. Malformed observations must not hide genuine window errors.
- [ ] Rerun the same actual-source checker GREEN; archive safe case results. Verify fresh per-scenario browser probes or explicit notice/entry boundaries; existing cumulative text dedup is not proof a subsequent retry showed/cleared pending/error UI. Retain role=status **and** role=alert plus native error/unhandledrejection listeners without preventDefault/suppression.

```bash
node .myah347-local/native-retry/check-browser-harness.cjs
```

This is a task-local observer unit check, not runtime or alternate browser protocol. Do not reuse the old flawed observer for UAT even if product tests pass.

## Task 5 — complete automated-ready and independent implementation review

- [ ] Run existing owned build gates (no install), all inherited 15 suites via inspected unchanged runner, separate real-command process, focused full lifecycle and actual observer checker. Preserve r4 behavioral assertions, including deferred/awaited-false errors, real owner/inverse/cache/count and native default controls. Historical 190/15 is not this run's result.

```bash
node "$YARN" nx build twenty-shared
bash .myah347-local/complete-matrix-tests.sh
node "$JEST" --config="$FRONT_CONFIG" --runInBand --runTestsByPath "$INDEX_TEST" --testNamePattern='real command'
node "$JEST" --config="$SERVER_CONFIG" --runInBand --runTestsByPath "$LIFECYCLE_TEST"
node .myah347-local/native-retry/check-browser-harness.cjs
node "$YARN" nx build twenty-oxlint-rules
node "$YARN" nx typecheck twenty-front
node "$YARN" nx typecheck twenty-server
```

The 15-suite runner explicitly contains responseLoss, campaignCreationState, triggerCreateRecordsOptimisticEffect, campaign factory, PromiseRejectionEffect Campaign, shared useCreateOneRecord, shared index, table AddNew, both empty states, useRefetchAggregateQueries, default apollo.factory, useApolloFactory, useCreateActivityInDB and useOpenCreateActivityDrawer. Audit it before execution; no integration deletion suites. No production schema change → no generation/migration delta.

- [ ] Lint/format all tracked **and untracked** changed TS/TSX in each package, not main...HEAD. Use existing per-package configs; report diagnostics as introduced vs baseline, never silently waive failures. Task-local JS is checked by the actual-source checker and independent review.

```bash
for package in twenty-front twenty-server; do
  (
    cd "$WT/packages/$package" || exit 1
    mapfile -d '' files < <(
      { git diff --name-only --relative --diff-filter=ACMR -z HEAD -- src/;
        git ls-files --others --exclude-standard -z -- src/; } |
      sort -zu | grep -zE '\.(ts|tsx)$'
    )
    if ((${#files[@]})); then
      node ../../node_modules/oxlint/bin/oxlint --type-aware -c .oxlintrc.json "${files[@]}" &&
      node ../../node_modules/oxfmt/bin/oxfmt --check "${files[@]}"
    fi
  ) || exit 1
done
git diff --check
git diff --cached --name-only
sha256sum -c .myah347-local/approved-plan/SHA256SUMS
```

- [ ] Send parent exact changed JS/TS paths and logs for final LSP. Independent review must examine **complete inherited+correction diff**, source-native invariants and evidence, not green test counts alone. Include request/input IDs, row deltas, native envelopes, cache/store/list/group/count outputs, events, controls/snackbars and retained saved/unconfirmed state. One bounded fix/review round if needed; further scope needs owner decision. Only automated-ready and review pass release fresh runtime gate.

## Task 6 — conditional fresh isolated native-loopback UAT and cleanup

**Bounds:** approved new source-seeded disposable DB only; preserve previous `myah347_e6f0b41d` and all MYAH-323 records/volumes. Existing `.myah347-local/uat/compose.yml` is redacted/historical, **not restartable unchanged**. New task-owned credentials/config must never be printed or put in source/global env; no borrowed services/deps. No worker/provider, activation/send, hard-delete, live hidden/deleted/RLS fixture mutation or SQL competing-transaction orchestration. Read-only PK/triggers/readback are authorized later; frontend interleavings remain explicitly non-live. No reset/cleanup integration suites (create-one permissions integration suite deletes in afterEach).

- [ ] Reconfirm exact ownership, approved source diff/hashes and all automated/review gates. Capture `ss -ltnp` for all IPv4/IPv6 task ports **before** runtime; must be clear. Inventory new Compose project/PIDs/volumes and initially empty DB identity, with no credentials in evidence. Use a fresh task-local runtime recipe/credentials derived from source, not redacted historical credentials. Inspect every source seed command before executing; initialize/seed only the new empty target, never `database:reset`/truncate against preserved DB. Source primitives are `twenty-server:database:init` and `workspace:seed:dev`, not a new SQL seed framework. Record the exact selected source-seeding command/target in the runtime receipt before execution.
- [ ] Build only owned source after readiness/review, use native API/frontend runtimes. API launch must use the already reviewed port-specific preload; hash and listener checks are mandatory:

```bash
printf '%s  %s\n' a685fa0f79319ef59686df5988290ade290bfd4de13a4e3f9bb9fcb703458bc4 .myah347-local/uat/loopback-only.cjs | sha256sum -c -
ss -ltnp '( sport = :3347 or sport = :5347 or sport = :5647 or sport = :6647 )'
# API process, with only the approved task-local runtime environment:
(cd "$WT/packages/twenty-server" && node --require "$WT/.myah347-local/uat/loopback-only.cjs" dist/main.js)
# Separate owned frontend process, with task-local API URL and no config edit:
(cd "$WT/packages/twenty-front" && node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5347 --strictPort)
```

These are separate foreground process commands, not a serial launch script; runtime worker records their owned PID/cwd/cmdline. Bare `node dist/main.js` is forbidden: native API main omits host. Existing preload changes only omitted-host listen on3347 and rejects unsupported target overloads; it does not sandbox other listeners. Do not edit global main.ts/firewall/environment. Set API port3347, frontend API URL127.0.0.1:3347, DB/Redis publishes127.0.0.1:5647/6647 only in task-local process/Compose environment.

- [ ] Use a bounded 120-second readiness check (once per intended startup), no fallback/repeated alternate startup. Then inspect **all** IPv4/IPv6 listeners and owned Docker port bindings; API must be exclusively127.0.0.1:3347, frontend127.0.0.1:5347, DB/Redis127.0.0.1:5647/6647. Reject `*`, `0.0.0.0`, `::`, `[::]`, extra/nonloopback or unowned listeners. Record `/proc` cwd/cmdline for the exact owned PIDs without reading/printing environment. Health200 alone never releases browser.

```bash
ready=0
for attempt in $(seq 1 60); do
  if curl --max-time 1 -fsS http://127.0.0.1:3347/healthz >/dev/null; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
ss -ltnp '( sport = :3347 or sport = :5347 or sport = :5647 or sport = :6647 )'
```

Loop worst-case bounded by 60 one-second requests plus sleeps. Use owned Docker inspect `.NetworkSettings.Ports`/project-label output only, no secret-bearing full config dumps. On startup/ownership/binding failure stop/report run/cwd/branch/ref, exact status and partial diff, stop only confirmed owned processes; no public probe/elevation/firewall/port/runtime/browser-protocol fallback.

- [ ] Run native **agent_browser** managed session only after checker GREEN and preflight. Install actual corrected task-local harness. Use fresh probe/scenario boundaries; record safe operation/ID/status/equality/timing and role=status/alert, actual error/unhandledrejection without suppression. Semantic gestures only, actual forwarded args unchanged.
- [ ] **No-save control first:** arm before mode remaining2; New produces wrapper C,C,R, creates not forwarded to server, actual native NOT_FOUND, rows0, retained same ID, actionable copy and controls settle. One explicit original-origin toolbar/table action produces R then same-input successful C: total C,C,R,R,C, returned/submitted/SQL UUID equal, row delta1/count1, native route, one completion, no speculative row while held, no late requests after bounded wait. Separate wrapper attempts, forwarded HTTP and record-page reads in evidence.
- [ ] **Persisted-loss toolbar and table:** arm exactly one after-success fault, capture error-free matching-ID native success before loss. Native unchanged retry duplicate→exact authorized saved read, one persisted row/no overwrite, one completion/native route and no observed error/unhandledrejection. Repeat pending AddNew/New controls to prove shared ownership/no virtualized shell. Observe native counts and original fields/deletedAt; count event exactly where observable, not subscriber receipts.
- [ ] **Controls:** normal toolbar/table create, native Name/Objective edits and save/reload on normal and recovered rows, correct current Outreach route, no create during update; offline exact read uses bounded native attempts and no resend/navigation, restored explicit retry retains UUID/input. Capture per-scenario pending/error appearance/settlement rather than cumulative dedup text. Do not invoke lifecycle ACTIVE/send.
- [ ] **Read-only SQL evidence** on the new DB: resolve workspace schema from fresh runtime identity and query actual PK plus noninternal triggers; do not assume historical schema names. Execute within a read-only transaction; these catalog queries enumerate actual Campaign tables safely:

```sql
BEGIN READ ONLY;
SELECT n.nspname AS workspace_schema, c.relname, p.conname,
       pg_get_constraintdef(p.oid) AS definition
FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='campaign' AND n.nspname LIKE 'workspace_%' AND p.contype='p';
SELECT n.nspname AS workspace_schema, c.relname, t.tgname,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='campaign' AND n.nspname LIKE 'workspace_%' AND NOT t.tgisinternal;
COMMIT;
```

Use exact captured submitted IDs and resolved schema for read-only count/name/objective/owner/status/position/deletedAt readback before/after each scenario; bind IDs, quote schema through native SQL tooling, never use conflict metadata as authorization. Require id PRIMARY KEY covering hidden/deleted occupants and record actual triggers (including none). Unexpected mutating pre-insert trigger behavior blocks the safety claim. Source/unit prepare plus native conflict/row evidence establish only observed no pre-conflict Campaign/workflow/related write and no duplicate successful insert event where observable. **No live locking/rollback/RLS/hard-deletion claim**: those controls are not authorized; request specific authority only if independently required for acceptance.

- [ ] Finally restore exact probe fetch/listeners/observer, close only exact managed task browser, stop only owned PIDs and Compose services, retain rows/volumes/evidence. Never `down -v`, record deletion, broad kill or pruning. Remove only newly authorized temporary credentials/config as agreed, retain safe redacted receipt. Prove all four ports clear, r4/source/evidence preservation manifest, staged inventory empty. Infrastructure failure cleanup has the same ownership bounds.

## Task 7 — docs self-audit and final readiness receipt

This stage's self-audit maps every additive spec requirement to executable steps without modifying implementation:

| Spec requirement | Plan gate |
| --- | --- |
| §1 approval/history/scope and immutable r4 | §§0–1; parent fidelity review and external checksum snapshot before implementation |
| §2 exact native C,C,R,R defect / desired continuation | Task 1 progression RED separate from copy; Task 2 unchanged GREEN; Task 6 real browser |
| §3 strict classifier/type/query-only catch, finite transitions, saved-never-resend, copy/native errors | Task 2 exact signatures/branches; Task 3 direct+real-factory+hook negatives/counts |
| §4 primary/insert/UUID/PK/prehook/transaction/security/ephemeral limits and inherited completion guards | Task 3 source/unit/interleavings, full inherited regression Task 5, actual PK/triggers Task 6 with live limits |
| §5 three production seams/test-only lifecycle/task-local observer | §1 file ceiling; complete-diff review Task 5 |
| §6 all inherited gates, source-faithful missing mocks/no new framework | Tasks 1,3,5; inspected full 15-suite runner; parent LSP |
| §7 mandatory observer checker, exact-ID/error-free injection, native-loopback/ownership/UAT/cleanup | Task 4 actual-source RED/GREEN and Task 6 prebrowser/SQL/readback/cleanup |

- [x] Self-review: names `isCampaignCreationRecordNotConfirmed`, `CampaignCreationReadResult` and `not-confirmed` consistent; no error-free-null resend permit, global absence, saved resend, global suppression or broadened API in either doc.
- [x] Self-review: recovered audit P2 observer defect is a mandatory gate, not an optional note; runtime is gated and native-loopback only, hard-delete/live-RLS/SQL-race authority absent.
- [x] Self-review: all inherited regression/security/completion/default/ownership gates remain required; separate identical-scope group-array issue not silently repaired.
- [ ] Independent reviewer confirms spec-plan fidelity; parent records outcome. Self-audit is not independent approval.

**Readiness:** additive documents ready for independent fidelity review only. No correction source/test/observer implementation, application test/build, runtime/browser, LSP or fresh live proof was performed in this docs stage. Parent owns remaining gates and final handoff; no staged files or commit/deploy authority.
