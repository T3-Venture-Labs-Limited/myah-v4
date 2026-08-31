# Task 4 implementation report

## Status

Complete.

## RED evidence

1. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - Failed as expected: the projector forwarded `send_inbox_reply` without `actionVersion`, `threadId`, or `initiatorUserWorkspaceId`.
2. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - Failed as expected with `Unsupported action receipt projection` for Inbox inputs.
3. The writer suite then failed as expected when a provider-imported sent Message had a different sender; the projection incorrectly cleared the draft.

## GREEN evidence

1. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - 1 suite passed, 2 tests passed.
2. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - 1 suite passed, 10 tests passed.
3. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - 3 suites passed, 67 tests passed.

## Self-review

- The projector forwards the reviewed action binding version, thread, and initiator and uses the common `ExpectedActionBinding` action-name union.
- Inbox projection takes the workspace/thread transaction advisory lock, accepts only one provider-header candidate, validates its thread, channel, sender, content, recipient, context, and parent evidence, and persists at most one native Message.
- A cleared approved draft replays from the exact native Message without reconstructing mutable delivery authority. A still-present draft is reconstructed through projection authority only; mutable sync, paid, managed, and permission eligibility are not re-run.
- The draft clear is a revision/body CAS and increments exactly once. A changed revision, different content/evidence, or mismatched native Message refuses projection without clearing a newer draft.
- No provider client is injected or called by the projection writer.

## Concerns

None known. Focused Task 4 and direct-send suites only, as required.
