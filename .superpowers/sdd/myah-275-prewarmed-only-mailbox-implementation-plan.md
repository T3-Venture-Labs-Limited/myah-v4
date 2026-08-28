# Prewarmed-Only Mailbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one allowlisted prewarmed Icemail bundle per workspace, billed at exact provider cost plus 30% gross margin, activated as native Twenty sending identities, and usable only for human-approved creator-agent outreach.

**Architecture:** Reuse `ManagedEmailOfferEntity`, `ManagedEmailAcquisitionOperationEntity`, Metronome subscriptions, shared Stripe proof, Icemail prewarm purchase/reconciliation, native mailbox connection, and managed eligibility. Delete ordinary acquisition and Warmup Inbox from the launch path; preserve historical recovery internally.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, GraphQL, React, Icemail HTTP API, Metronome, Stripe, Gmail IMAP/SMTP, Jest, Nx, Oxfmt/Oxlint.

---

## Prerequisite

The reviewed shared billing commit from MYAH-147 Task 1 must be the base of this branch before Task 2. Do not independently reimplement or fork the shared customer/config/environment/unit seam.

### Task 1: Contain the launch surface and enforce one-bundle admission

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/managed-email/managed-email.resolver.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-email/services/managed-email-customer.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-email/services/managed-email-acquisition.service.ts`
- Modify: managed-email resolver/customer/acquisition specs
- Modify later frontend coordinator/UI files in Task 8

- [ ] **Step 1: Write failing server API tests**

Require ordinary proposal/purchase GraphQL operations to be absent or unavailable, exactly one opaque prewarmed offer at every admission boundary, one active bundle per workspace under lock, and internal replay of historical ordinary/multi-bundle rows.

- [ ] **Step 2: Use LSP references before removing exported resolver symbols**

Migrate every frontend/generated caller. Do not keep aliases.

- [ ] **Step 3: Implement the minimal server cutover**

Expose only bundle list, one-bundle proposal/quote/payment/purchase/status/lifecycle contracts. Keep historical recovery methods internal.

- [ ] **Step 4: Run focused resolver/customer/acquisition specs and commit**

```bash
git commit -m "feat(email): restrict managed acquisition to one prewarmed bundle"
```

### Task 2: Consume the shared billing seam

**Files:**
- Rebase/cherry-pick the reviewed MYAH-147 Task 1 commit after it is approved
- Update managed-email callers/tests only where branch rebasing requires conflict resolution

- [ ] **Step 1: Integrate the shared commit without reimplementing it**
- [ ] **Step 2: Run every managed-email caller spec affected by explicit environment/config/unit arguments**
- [ ] **Step 3: Commit only conflict-resolution or feature-specific adaptation**

```bash
git commit -m "refactor(email): consume shared Metronome Stripe context"
```

### Task 3: Implement exact Icemail inventory and pricing

**Files:**
- Modify: `providers/icemail/icemail.client.ts`
- Modify: `providers/icemail/icemail-response.mapper.ts`
- Modify: `providers/icemail/icemail.types.ts`
- Modify: `services/managed-email-proposal.service.ts`
- Modify: `services/managed-email-quote.service.ts`
- Modify: `types/managed-email-catalog.type.ts`
- Modify: `constants/managed-email-catalog.constant.ts`
- Test: provider mapper/client/proposal/quote specs

- [ ] **Step 1: Write failing all-page inventory tests**

Implement one shared method:

```ts
async listAllPrewarmedBundles(): Promise<IcemailPrewarmedBundle[]>;
```

It uses one page size, at most 100 pages, stable metadata, duplicate rejection, and completes only when unique count equals provider total. Empty is returned only after a complete valid traversal.

- [ ] **Step 2: Write failing exact cost tests**

Require USD safe integer `per_domain_price`, `per_mailbox_price`, positive mailbox count, and purchase `total_cost` equality:

```ts
const expectedProviderCostCents =
  bundle.domainPriceCents + bundle.mailboxPriceCents * bundle.mailboxCount;
const domainSellCents = Math.ceil(bundle.domainPriceCents / 0.7);
const mailboxSellCents = Math.ceil(bundle.mailboxPriceCents / 0.7);
```

- [ ] **Step 3: Remove warmup from prewarmed quote**

Create exactly two expected lines: annual domain quantity 1 and monthly mailbox quantity count. Remove zero/phantom warmup assumptions while preserving historical three-line replay.

- [ ] **Step 4: Run focused tests and commit**

```bash
git commit -m "feat(email): price exact prewarmed Icemail bundles"
```

### Task 4: Add Metronome overrides, tax correlation, and payment cleanup

**Files:**
- Modify: `services/managed-email-subscription.service.ts`
- Modify: `managed-provider-billing/services/metronome-client.service.ts` only for missing generic override/edit reads not supplied by shared commit
- Modify: `managed-provider-billing/stripe/managed-provider-stripe.service.ts` only through shared interfaces
- Modify: acquisition operation entity/migration only for required returned override IDs and subtotal/tax/total/payment-cleanup phases
- Test: subscription/payment/recovery specs

- [ ] **Step 1: Write failing override tests**

Use two contract-specific `OVERWRITE` flat rates, deterministic expected keys, returned edit/override IDs persisted in the operation, and deterministic subscription keys `<operationId>:<productKey>`. Never mutate the shared rate card.

- [ ] **Step 2: Write failing amount-correlation tests**

Persist and prove:

```ts
subtotalCents = domainSellCents + mailboxSellCents * mailboxCount;
totalCents = subtotalCents + taxCents;
```

Metronome uses `USD (cents)` and Stripe uses `usd`. PaymentIntent amount equals tax-inclusive total.

- [ ] **Step 3: Implement action-required and definitive failure cleanup**

Use seven-day authentication window. Definitive unpaid/voided failure sets both subscription quantities to zero from acquisition start, terminates the invoice, proves no successful PaymentIntent, and requires a fresh quote. Ambiguity remains blocked/reconciling.

- [ ] **Step 4: Run focused tests and commit**

```bash
git commit -m "feat(email): bill and reconcile prewarmed bundles"
```

### Task 5: Harden provider write, recovery, and activation dispatch

**Files:**
- Modify: `services/managed-email-acquisition.service.ts`
- Modify: `services/managed-email-reconciliation.service.ts`
- Modify: activation/reconciliation jobs and crons only as required
- Test: acquisition/reconciliation/job specs

- [ ] **Step 1: Write failing purchase-time page>1 and changed-cost tests**
- [ ] **Step 2: Write failing exact partition tests**

Require one matching domain and exact same-domain mailbox address/provider-ID/domain-ID set. Reject subset, extra same-domain resources, duplicates, stale identities, and receipt total mismatch while ignoring provably unrelated domains.

- [ ] **Step 3: Write crash-boundary activation tests**

A crash after receipt persistence or row projection must still create due activation claims and idempotently enqueue missing activation before terminal provider success.

- [ ] **Step 4: Implement definitive non-fulfillment states**

Zero/incomplete/conflicting/total-mismatch outcomes move to compensation; genuine ambiguity stays acquisition reconciliation.

- [ ] **Step 5: Run focused tests and commit**

```bash
git commit -m "fix(email): recover exact prewarmed provider outcomes"
```

### Task 6: Remove Warmup Inbox from prewarmed readiness

**Files:**
- Modify: `services/managed-email-warmup.service.ts`
- Modify: `services/managed-email-readiness.service.ts`
- Modify: `services/managed-email-campaign-eligibility.service.ts`
- Modify: readiness jobs/specs and DTO projections

- [ ] **Step 1: Write failing provider-prewarmed readiness tests**

Require paid entitlement, exact provider/prewarmed identity, credentials, DNS/provider health, IMAP/SMTP, active native account/channel/sync, no unsafe state, and positive cap. Assert zero Warmup Inbox calls.

- [ ] **Step 2: Implement explicit `PROVIDER_PREWARMED` branch**

Keep managed warmup behavior only for historical durable rows that require recovery. New prewarmed rows have no warmup subscription, enrollment, paid-through, or controls.

- [ ] **Step 3: Run readiness/eligibility specs and commit**

```bash
git commit -m "feat(email): activate prewarmed mailboxes without managed warmup"
```

### Task 7: Fix creator-agent sending and block generic managed sends

**Files:**
- Modify: `action-approval/definitions/outreach-email-action.definition.ts`
- Modify: `action-approval/services/action-receipt-workspace-projection-writer.service.ts`
- Modify: generic email send authority boundary identified by LSP from `EmailComposerService`/`SendEmailService`
- Modify: creator assignment validation where authoritative IDs are accepted
- Test: action definition/projection/send/generic email specs

- [ ] **Step 1: Write failing fingerprint parity test**

Extract/reuse one canonical sending fingerprint root including managed mailbox ID, account, channel, sender, recipient, subject/body, provider draft, and reply context.

- [ ] **Step 2: Write failing launch send-policy tests**

Managed accounts are rejected by generic composer/API even when eligible. Ordinary user-connected accounts remain unchanged. Creator-agent draft and execution re-prove eligibility and exact one-use approval.

- [ ] **Step 3: Implement root-cause shared authority fix and commit**

```bash
git commit -m "fix(outreach): enforce managed mailbox send authority"
```

### Task 8: Implement compensation and whole-bundle teardown

**Files:**
- Modify: `services/managed-email-lifecycle.service.ts`
- Modify: `engine/core-modules/myah/services/workspace-mailbox-connection.service.ts`
- Modify: managed email compensation/recovery service or acquisition service following existing ownership
- Modify: Stripe/Metronome calls only through shared exact interfaces
- Test: lifecycle/connection/compensation specs

- [ ] **Step 1: Write failing compensation tests**

For every definitive non-fulfillment: block activation/sending/renewal, delete residual bundle and prove absence, zero subscriptions, void/credit invoice, prove full Stripe credit-note/refund and tax reversal, then terminalize. One-leg ambiguity stays compensation reconciliation.

- [ ] **Step 2: Write failing whole-bundle stop tests**

Before any external write, atomically block every sibling. Icemail deletion is domain-level. The UI/API cannot promise mailbox-only stop.

- [ ] **Step 3: Implement evidence-preserving deactivation**

Add idempotent `deactivateManagedWorkspaceMailbox`: set `ConnectedAccount.archivedAt`, stop channel sync, remove usable encrypted credentials, preserve account/channel IDs/messages/receipts. Never call hard-delete `revokeWorkspaceMailbox`.

- [ ] **Step 4: Run lifecycle/connection specs and commit**

```bash
git commit -m "fix(email): compensate and deactivate prewarmed bundles"
```

### Task 9: Replace the janky UI with the two-action surface

**Files:**
- Modify: `ManagedEmailOverview.tsx`
- Modify: `ManagedEmailDashboard.tsx`
- Modify: `ManagedEmailPrewarmedFlow.tsx`
- Modify: `ManagedEmailReview.tsx`
- Modify: `ManagedEmailDetails.tsx`
- Remove launch-unreachable ordinary chooser/create components after LSP reference migration
- Modify GraphQL documents/generated clients/Lingui and focused frontend tests

- [ ] **Step 1: Write failing UI tests**

Require only Browse prewarmed and Connect email; true empty versus unavailable; one fixed bundle; exact tax-exclusive components plus applicable tax; no domain/new-mailbox/warmup/generic managed-send controls; whole-bundle stop copy.

- [ ] **Step 2: Implement minimal server-driven state flow**

Keep inventory, review/payment, durable progress, active/action-required/stopped status. Remove multi-mode state and ordinary fallback.

- [ ] **Step 3: Run focused frontend tests and commit**

```bash
git commit -m "feat(email): ship focused prewarmed mailbox UI"
```

### Task 10: Final verification and rollout evidence

- [ ] Run full focused managed-email server scope and sandbox specs on Linux
- [ ] Run affected frontend suites and real desktop/mobile browser flow
- [ ] Run server/frontend/client-SDK typechecks
- [ ] Run type-aware lint, pinned format, generated GraphQL/SDK/Lingui freshness
- [ ] Obtain spec-compliance, lifecycle/financial/security, and code-quality reviews
- [ ] Push coherent branch, open draft PR, ordinary CI, then final full E2E only when otherwise ready
- [ ] Keep prewarmed admission disabled until separately authorized real Icemail bundle/payment/recipient canary

---

## Plan self-review checklist

- Every MYAH-275 requirement maps to Tasks 1–10.
- Shared billing behavior is consumed, not forked.
- No ordinary provisioning, customer-owned import, Warmup Inbox, multiple active bundle, generic managed send, bulk Campaign integration, or hard-delete teardown is added.
- Historical durable recovery remains internal.
- Production spending/allowlist mutation remains a separate explicit gate.
