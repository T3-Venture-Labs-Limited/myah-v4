# Task 7 report

## Composite Inbox reply-draft hydration

- Added `normalizeMyahInboxReplyDraft`, which prefers a defined composite RICH_TEXT hydration (including `null`) and otherwise falls back to flattened physical fields.
- Applied the normalizer to canonical authority construction and readable draft snapshots. Raw Markdown and BlockNote values are retained unchanged.
- Updated thread-record typing for optional composite and flattened repository shapes.
- Added regression coverage for composite-only hydration, composite-null precedence, and flattened fallback.
- Removed the temporary `MYAH169_READINESS_DEBUG` diagnostic.

## Verification

- `node .yarn/releases/yarn-4.13.0.cjs nx jest twenty-server --runInBand src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts` — 29 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx jest twenty-server --runInBand src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts` — 26 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx typecheck twenty-server` — passed

## Final review remediation

- Canonical Inbox reply subjects now derive from the latest parent `Message`; empty or null parent subjects remain empty, and only non-empty subjects receive one `Re:` prefix.
- The approved channel sender is represented once as a connected-account clone with the approved handle, so provider sends and sent-message persistence retain the account identity while using the approved alias.
- Reply-send readiness refetches once when the same thread receives a new confirmed draft revision; `MyahInboxReplySendAction` supplies that revision.

## Final verification

- `node .yarn/releases/yarn-4.13.0.cjs nx jest twenty-server --runInBand src/engine/core-modules/action-approval/definitions/__tests__/myah-inbox-reply-action.definition.spec.ts` — 33 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx jest twenty-server --runInBand src/engine/core-modules/action-approval/__tests__/myah-inbox-reply-receipt-projection.service.spec.ts` — 13 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx jest twenty-server --runInBand src/modules/messaging/message-outbound-manager/services/__tests__/sent-message-persistence.service.spec.ts` — 1 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx jest twenty-server --runInBand src/engine/core-modules/myah-inbox/services/__tests__/myah-inbox-reply-send.service.spec.ts` — 27 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx test twenty-front --runInBand=true --coverage=false --testFile=src/modules/myah/inbox/hooks/__tests__/useMyahInboxReplySend.test.tsx` — 15 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx test twenty-front --runInBand=true --coverage=false --testFile=src/modules/myah/inbox/components/__tests__/MyahInboxReplySendAction.test.tsx` — 22 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx test twenty-front --runInBand=true --coverage=false --testFile=src/modules/myah/inbox/components/__tests__/MyahInboxReplyWorkspace.test.tsx` — 12 passed
- `node .yarn/releases/yarn-4.13.0.cjs nx typecheck twenty-server --excludeTaskDependencies --skip-nx-cache` — passed
- `node .yarn/releases/yarn-4.13.0.cjs nx typecheck twenty-front --excludeTaskDependencies --skip-nx-cache` — passed

## Consolidated branch verification

- Rebased all implementation commits onto `origin/main` at merge base `97ba998d`; regenerated Lingui catalogs after resolving generated-file conflicts.
- Focused server regression: 11 suites / 194 tests passed.
- Focused frontend regression: 6 suites / 76 tests passed.
- Uncached `twenty-server` and `twenty-front` typechecks passed with `--excludeTaskDependencies --skip-nx-cache`.
- Server and frontend diff lint/type-aware checks passed with zero warnings/errors; Oxfmt checks passed after formatting cleanup.
- Current GraphQL generation passed against the isolated current-worktree API and produced zero drift.
- Current `twenty-server` build and final uncached production `twenty-front` build passed.
- Whole-branch independent review approved Spec Compliance and Code Quality & Security after final remediation, with no Critical, Important, or Minor findings.

## Authenticated isolated UAT

- Used isolated PostgreSQL/Redis/API/worker/static frontend services on ports `15691`, `16691`, `3069`, and `3070`; no production/customer data or credentials were used.
- Signed into the disposable Apple development workspace and verified the composer visually and through the accessibility tree:
  - **Generate Reply** precedes primary/rightmost **Send**;
  - no visible **Shared reply draft** label, while the editor accessible name remains **Shared reply draft**;
  - no modal, duplicate From/To/subject preview, **Approve & send**, sender picker, or second action.
- Reproduced and repaired three runtime-only defects missed by unit fakes: missing `PermissionsModule`, projection-writer concrete injection metadata, and forbidden WorkspaceEntityManager raw SQL for the autosave advisory lock.
- Added an isolated native Email Group fixture to exercise the provider-neutral common path. Readiness initially exposed the missing Email Group allow-list; the TDD repair enabled the common channel/provider path.
- Typed and persisted one revision-protected draft, then clicked **Send** exactly once against the local LOGGER-only Email Group configuration.
- The local email subsystem could not establish a real delivery and returned `UNKNOWN`, which exercised the safe terminal boundary:
  - exactly one `send_inbox_reply` binding became `CONSUMED`;
  - exactly one receipt became `UNKNOWN`;
  - zero native outbound Messages contained the draft body;
  - the exact body and revision remained persisted;
  - the UI displayed `Delivery outcome is unknown. This draft is locked to prevent a duplicate send.`;
  - **Send** remained disabled and no second receipt/provider attempt occurred.
- Closed the exact named browser session and removed only the MYAH-169 frontend/API/worker/Compose containers, volumes, network, local storage, fixture SQL, and screenshots.

## Remaining release gate

- A real `SENT` provider/recipient proof is not claimed. It requires a separately authorized healthy external test mailbox and dedicated recipient, followed by received-header, one-receipt, one-native-Message, and cleared-draft verification.
- No push, PR, deployment, production mailbox, external email, or customer-data action occurred.
