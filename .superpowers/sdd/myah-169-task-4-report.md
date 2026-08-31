# MYAH-169 Task 4 projection hardening report

## RED evidence

1. The focused workspace-projection writer suite failed after the persistence-order regression was added. It observed `row-lock, persist, draft-cas, row-lock`; the required order was `persist, draft-cas`.
2. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
   - Failed as expected: a provider-free rebuild rejected `THREAD_UNAVAILABLE` when the managed mailbox disappeared after acceptance.

## GREEN evidence

1. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
2. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
3. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`
4. `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand`

## Self-review

- The projection input restores the common action-name union and forwards the Inbox binding identifiers.
- Cleared replays resolve and verify the exact two evidence links against workspace MessageThread and Message metadata, reject extra links, and use provider header or non-null provider external identity to locate a unique native Message.
- Candidate SQL uses correlated participant aggregates, so multiple participants cannot duplicate one Message candidate; exact one sender and recipient are required.
- The shared advisory lock remains held across reconciliation, but no draft row is locked before sent-message persistence; the final revision/body CAS clears only the approved draft.
- Projection and replay do not read live managed-mailbox rows. Projection authority retains immutable binding checks while allowing only its managed-mailbox-derived sending fingerprint to differ after acceptance; execution remains strict.

## Concerns

None known.
