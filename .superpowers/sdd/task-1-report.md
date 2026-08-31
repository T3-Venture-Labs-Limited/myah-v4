# Task 1 implementation report

## Status
Complete.

## Commit
`feat(myah): support direct Inbox send bindings` (this Task 1 commit).

## Files changed
- `packages/twenty-server/src/engine/core-modules/action-approval/types/action-approval.type.ts`
- `packages/twenty-server/src/engine/core-modules/action-approval/utils/action-binding-digest.util.ts`
- `packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts`
- `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.ts`
- `packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts`

## RED evidence
1. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-binding-digest.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - Failed as expected: both new Inbox digest assertions reached `assertUnreachable`, because `send_inbox_reply` had no logical-key branch.
2. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - Failed as expected: the direct-binding, receipt-lookup, and execution-lock methods did not exist; Inbox approved-binding reconstruction was rejected.

## GREEN evidence
- Digest command above: 1 suite passed, 16 tests passed.
- Service command above: 1 suite passed, 21 tests passed.
- Final focused run of both exact commands: both suites passed; existing Instagram and outreach assertions remained green.

## Self-review
- `MyahInboxReplyExpectedActionBinding` is a distinct discriminated binding and direct creation accepts only that type.
- Inbox logical keys include the revision context fingerprint while Instagram key construction is unchanged.
- Direct creation persists approved state, a shared decision/expiry timestamp base, null Instagram-only fields, and evidence links.
- Invalidation acquires a pessimistic row lock, verifies workspace/actor/thread/action/state, and refuses a binding once any receipt exists.
- Receipt polling filters by workspace, receipt, action, draft/thread, and initiator; draft locks only cover unexpired receipt-free approvals or non-terminal consumed receipts.

## Concerns
None known. Focused tests only, per Task 1 scope.

## Follow-up invalidation scope fix
- Commit: `fix(myah): scope Inbox binding invalidation`.
- RED: `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/services/action-approval.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` failed as expected: a different-draft Inbox binding was invalidated instead of rejected.
- GREEN: the same focused command passed: 1 suite, 21 tests.
- Self-review: invalidation now requires the request's exact `draftId` in addition to workspace, actor, thread, action, approved state, and receipt absence; every existing call in scope supplies the new field.
