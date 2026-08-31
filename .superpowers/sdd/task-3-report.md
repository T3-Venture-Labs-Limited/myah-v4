# Task 3 implementation report

## Status

Complete.

## RED evidence

1. The new resolver suite failed because `myah-inbox-reply-send.resolver` did not exist.
2. The new direct-send service suite failed because `myah-inbox-reply-send.service` did not exist.
3. The autosave-lock cases failed as expected: drafts saved while `isDraftExecutionLocked` returned true.
4. The resolver boundary regression failed as expected when caller-supplied `body`, sender, and provider fields reached the service through input spreading.

## GREEN evidence

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Result: 3 suites passed, 50 tests passed.

## Self-review

- The dedicated resolver has workspace, user, custom-permission, and `SEND_EMAIL_TOOL` settings guards; it forwards only `threadId`, revision, and receipt ID plus independently authenticated workspace/user-workspace/member context.
- Direct send builds then re-proves authority, reserves before the single provider call, invalidates only the newly created no-receipt binding on stale/replay paths, and scopes status by workspace, initiator, action, thread, and receipt.
- Definitive provider rejection records `FAILED`, saves the same authoritative body through draft CAS to advance once, and leaves stale/failed/sent drafts writable. Ambiguous and record-accepted failures report `UNKNOWN` without draft mutation or another send.
- Projection errors after provider acceptance remain `SENDING`/provider-accepted for provider-free reconciliation; no receipt projector behavior was implemented here.
- The authority method's draft-revision argument is optional solely so readiness can inspect an already-authenticated thread without inventing a client revision.

## Concerns

None known. Task 4 receipt projection remains intentionally deferred.

## Review-fix completion

### RED evidence

The required combined focused command failed after the new regressions were added: the send path did not acquire the shared advisory lock, continued to call logical rather than exact-binding reservation, and returned `STALE` for the duplicate-reservation regression. The failure-CAS and invalidation-containment expectations were also absent from the prior orchestration.

### GREEN evidence

```bash
npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand
```

Result: 4 suites passed, 84 tests passed.

### Self-review

- Autosave and send use the same workspace-plus-thread transaction advisory key. Send holds it through authority build, exact binding creation, authority recheck, and reservation, and releases it before the only provider call.
- Exact-binding reservation converges a matching prior logical receipt by moving the newly created receipt-free binding to `CHANGES_REQUESTED`; it does not invalidate a duplicate path or alter a binding with a receipt.
- A provider rejection CAS-preserves the authoritative draft under the advisory lock before terminal receipt transition. A CAS conflict/write failure becomes `UNKNOWN`; provider send remains exactly once.
- Readiness distinguishes pending and unknown scoped receipt state. Status rebuilds current authority before receipt lookup and returns current body/revision only for the current readable thread.
- Cleanup failures are contained as `STALE`, with no provider I/O. Task 4 receipt projection remains deferred.
