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

## Identity-binding follow-up

### RED evidence

The Task 2 authority suite failed after its expected action-context digest was extended with the connected account, channel, sender email, and sender display name: the prior binding omitted all four identities.

### GREEN evidence

- `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` — 1 suite, 25 tests passed.
- `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` — 1 suite, 12 tests passed.

### Self-review

- `actionContextFingerprint` now binds immutable connected-account, message-channel, sender-email, and sender-display identities in addition to the reply context.
- Projection continues to tolerate only managed-mailbox lifecycle changes: the pre-send sending fingerprint remains strict, while projection replay checks the strengthened immutable context from native Message data.
- Candidate SQL de-duplicates a Message before ambiguity evaluation and still requires one sender and recipient.

### Concerns

None known.

## Sender-association follow-up

### RED evidence

The authority suite failed after expected action context was extended to include immutable account, channel, sender email, and sender display identities.

### GREEN evidence

- Writer focused suite: 1 suite, 12 tests passed.

### Self-review

- Projection reads sender display identity from the connected account rather than the formatter-owned FROM display value, while preserving the exact FROM handle check.
- Candidate participant values remain correlated per Message; replay evaluates matching receipt identity and context before clearing.

### Concerns

None known.

## Candidate SQL repair

### GREEN evidence

- Writer focused suite: 1 suite, 12 tests passed after restoring the parent Message join and normalizing connected-account sender display names.

## Grouped Message association regressions

### RED evidence

- Coverage-only: the new regressions passed on their first run because committed projection code already grouped matching raw association rows by Message ID. No production change was appropriate.

### GREEN evidence

- `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` — 1 suite, 16 tests passed.
- `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` — 5 suites, 94 tests passed.

### Self-review

- Active projection and cleared-draft replay each accept exactly one matching association row for a native Message while ignoring a sibling nonmatching association.
- Active projection rejects two matching associations for the same Message; cleared replay rejects two matching Message IDs.
- The candidate-query assertions prohibit a SQL `LIMIT`, so the second distinct Message cannot be hidden before grouped ambiguity evaluation.

### Concerns

None known.

## Provider-candidate grouping correction

### RED evidence

- The writer suite failed as expected with 2 new regressions: a duplicate matching association on Message A plus matching Message B, and a matching Message A plus content-mismatched provider candidate Message B, both resolved instead of rejecting.

### GREEN evidence

- `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-workspace-projection-writer.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` — 1 suite, 18 tests passed.
- `npx -y node@24.16.0 .yarn/releases/yarn-4.13.0.cjs exec jest packages/twenty-server/src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts packages/twenty-server/src/engine/core-modules/action-approval/__tests__/action-receipt-projector.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/resolvers/__tests__/myah-inbox-reply-send.resolver.spec.ts packages/twenty-server/src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-mutation.service.spec.ts --config=packages/twenty-server/jest.config.mjs --runInBand` — 5 suites, 94 tests passed.

### Self-review

- Candidate ambiguity is now determined from all raw provider-identity rows before immutable association matching.
- Exactly one distinct Message must remain, and it must have exactly one matching association; active projection and cleared replay continue through the same matcher.

### Concerns

None known.
