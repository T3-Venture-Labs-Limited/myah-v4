# Fixed AI Prepaid Top-Ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an allowlisted workspace billing admin buy a tax-correct `$25`, `$50`, or `$100` payment-gated Metronome prepaid commitment collected by Stripe and consume its principal through managed OpenRouter.

**Architecture:** Reuse the existing workspace installation, Metronome customer/contract services, Stripe proof service, `ManagedProviderFundingActionEntity`, recovery cron, Billing page, and managed-AI reservation/settlement. Task 1 first migrates every existing caller to one shared customer/config/environment/unit contract; later tasks add the paid funding lifecycle without a second balance ledger.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, GraphQL, React, Stripe Elements/SDK, `@metronome/sdk` 3.9.0, Jest, Nx, Oxfmt/Oxlint.

---

## Delivery order

Tasks are sequential. Task 1 must be reviewed and committed before MYAH-275 consumes the shared interface. Do not deploy or mutate production variables during implementation.

### Task 1: Establish the shared Metronome/Stripe billing seam

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts`
- Modify: `packages/twenty-server/.env.example`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-provider-billing/stripe/managed-provider-stripe.service.ts`
- Modify: all LSP-reported managed-email callers of `ManagedProviderStripeService`
- Test: existing co-located specs for those services and callers

- [ ] **Step 1: Use LSP references to enumerate every caller**

Record every call to `ManagedProviderStripeService` and `ensureStripeBillingConfiguration`. Do not text-rename cross-file symbols.

- [ ] **Step 2: Write failing shared-boundary tests**

Tests must require:

```ts
type MetronomeEnvironment = 'PRODUCTION' | 'SANDBOX';

type ExactStripeBillingContext = {
  environment: MetronomeEnvironment;
  metronomeCustomerId: string;
  metronomeContractId: string;
  stripeCustomerId: string;
  deliveryMethodId: string;
  fiatCreditTypeId: string;
  fiatCreditTypeName: 'USD (cents)';
};
```

They must fail when:

- server/worker environment differs;
- Stripe `livemode` disagrees with environment;
- Metronome credit type is plain `USD`;
- either contract references another Stripe customer/configuration;
- a caller omits explicit environment.

- [ ] **Step 3: Add one shared configuration key**

Add `METRONOME_STRIPE_DELIVERY_METHOD_ID` as a required UUID when paid billing is enabled. Remove managed-email runtime dependence on `MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID`; migrate every caller/config test cleanly with no alias.

- [ ] **Step 4: Make workspace customer/config ownership explicit**

Implement one shared method shaped like:

```ts
async ensureWorkspaceStripeBillingContext({
  contractId,
  environment,
  workspaceId,
}: {
  contractId: string;
  environment: MetronomeEnvironment;
  workspaceId: string;
}): Promise<ExactStripeBillingContext>;
```

It reuses one workspace installation, one Metronome customer, one Stripe Customer, and one customer billing-provider configuration while verifying the supplied contract's direct-billing schedule. AI and email contracts remain separate.

- [ ] **Step 5: Pass explicit environment to Stripe proof methods**

Replace internal `MANAGED_EMAIL_EXECUTION_MODE` inference with an explicit `environment` argument. Map `PRODUCTION` to `livemode=true`, `SANDBOX` to `false`, and fail closed on mismatch.

- [ ] **Step 6: Run the narrow shared tests**

Run the exact changed service specs through the canonical server Jest target. Expected: all pass and existing managed-email payment behavior remains unchanged.

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(billing): share exact Metronome Stripe context"
```

### Task 2: Extend the existing funding journal for customer payment lifecycle

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/managed-provider-billing/entities/managed-provider-funding-action.entity.ts`
- Modify: `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/managed-provider-funding-journal.service.ts`
- Create: one canonical core migration in the existing managed-provider migration directory
- Test: entity and journal specs

- [ ] **Step 1: Write failing entity/state tests**

Require exact states:

```ts
type ManagedProviderFundingActionState =
  | 'PENDING'
  | 'METRONOME_EDIT_RECORDED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_ACTION_REQUIRED'
  | 'RECONCILIATION_REQUIRED'
  | 'SUCCEEDED'
  | 'FAILED_DEFINITIVE'
  | 'REFUND_INTENT_RECORDED'
  | 'REFUND_RECONCILIATION_REQUIRED'
  | 'REFUNDED';
```

Add the minimum typed columns from the spec for customer/contract/edit/commit/invoice/Stripe IDs, principal/tax/total, expiration, payment/refund receipts, reconciliation due/claim/attempts. Preserve existing sponsored-credit rows.

- [ ] **Step 2: Add compare-and-set transitions**

Implement explicit transition methods that update only from the expected prior state and exact workspace/action ID. A zero-row update rereads and accepts only an exact already-completed replay.

- [ ] **Step 3: Add atomic reconciliation claims**

Claim due rows under transaction/advisory lock, increment attempts, and set claim/due timestamps. Do not add another workflow table.

- [ ] **Step 4: Add and verify migration**

Use nullable columns/backfill-safe defaults for historical rows. Compile the migration through the canonical server typecheck later; do not manually mutate a database.

- [ ] **Step 5: Run entity/journal specs and commit**

```bash
git commit -m "feat(billing): journal paid AI funding lifecycle"
```

### Task 3: Add exact Metronome payment-gated commit APIs

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/metronome-client.service.ts`
- Modify: its co-located spec
- Add bounded types beside the client, following existing conventions

- [ ] **Step 1: Write failing payload/response tests**

Require pinned SDK request:

```ts
{
  customer_id: customerId,
  contract_id: contractId,
  uniqueness_key: deterministicKey,
  add_commits: [{
    product_id: creditProductId,
    type: 'PREPAID',
    invoice_schedule: { schedule_items: [{ timestamp: t0, amount: principalCents }] },
    access_schedule: { schedule_items: [{ starting_at: t0, ending_before: provisionalEnd, amount: principalCents }] },
    payment_gate_config: { payment_gate_type: 'STRIPE', tax_type: 'STRIPE' },
    priority: 100,
    applicable_product_ids: [chargeProductId],
    custom_fields: { myah_funding_action_id: actionId, myah_funding_identity: identityHash },
  }],
}
```

- [ ] **Step 2: Implement create/read/update/archive methods**

Use `v2.contracts.edit`; persist returned edit/commit IDs. Add exact reads for edit history, commits including archived, invoice/commit relationship, access-schedule correction to paid-at plus 12 months, and archive via `archive_commits: [{ id }]`.

- [ ] **Step 3: Preserve idempotency boundaries**

Reuse identical request/header inside 24 hours. Afterward recover by customer/contract/custom fields/product/principal/schedules; never blind-repeat ambiguous writes.

- [ ] **Step 4: Run client specs and commit**

```bash
git commit -m "feat(billing): support payment-gated AI commits"
```

### Task 4: Implement customer funding admission and reconciliation

**Files:**
- Create: `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/managed-provider-customer-funding.service.ts`
- Modify: `managed-provider-billing.module.ts`
- Modify: existing billing recovery cron/service to scan funding actions
- Modify: config variables for disabled-by-default funding allowlist
- Test: new service/recovery specs

- [ ] **Step 1: Write failing preset/admission tests**

Server presets:

```ts
const AI_TOP_UP_PRESETS = {
  AI_25_USD: 2_500,
  AI_50_USD: 5_000,
  AI_100_USD: 10_000,
} as const;
```

Require workspace auth, BILLING permission, no impersonation, enabled flag, exact workspace allowlist, and stable idempotency. Client cents are never accepted.

- [ ] **Step 2: Implement intent-before-write purchase**

Ensure shared context, validate address/payment method, create pending journal row, create payment-gated commit, persist edit/commit/invoice boundaries, and transition only by compare-and-set.

- [ ] **Step 3: Implement payment reconciliation**

Separate principal/subtotal, tax, and collected total. Require exact Metronome and Stripe customer/config/environment/invoice/PaymentIntent facts. Correct provisional expiration to paid-at plus 12 months before `SUCCEEDED`.

- [ ] **Step 4: Implement action-required flow**

Return the exact PaymentIntent client secret only after workspace/customer/invoice proof. Stripe Elements may confirm it; server reconciliation remains authority. Enforce seven-day deadline.

- [ ] **Step 5: Extend existing recovery cron**

Atomically claim due funding rows and call phase-specific authoritative reads. Notifications may enqueue the same recovery, never set terminal state.

- [ ] **Step 6: Run service/recovery specs and commit**

```bash
git commit -m "feat(billing): reconcile customer AI top-ups"
```

### Task 5: Expose the bounded GraphQL contract

**Files:**
- Modify: `packages/twenty-server/src/engine/core-modules/billing/billing.resolver.ts`
- Add DTO/input types beside existing billing GraphQL contracts
- Modify: resolver/status specs
- Regenerate official frontend/SDK metadata after server behavior passes

- [ ] **Step 1: Write failing authorization and DTO tests**

Expose read status/history plus request top-up and payment-action preparation. Never expose raw provider objects or browser `markPaid`.

- [ ] **Step 2: Wire resolver to customer funding service**

Map only customer-safe states, cents, expiration, safe card/address summary, and invoice link.

- [ ] **Step 3: Run focused resolver tests and commit**

```bash
git commit -m "feat(billing): expose fixed AI top-up API"
```

### Task 6: Wire the real Billing UI

**Files:**
- Modify: `packages/twenty-front/src/pages/settings/billing/SettingsBilling.tsx`
- Modify: `packages/twenty-front/src/modules/settings/billing/components/SettingsWorkspaceBillingContent.tsx`
- Add/update billing GraphQL documents in the existing settings billing module
- Modify: existing Billing component/page tests and stories

- [ ] **Step 1: Write failing behavior tests**

Require real balance/history, three preset buttons, tax/expiry disclosure, pending/action-required/failed/active/refunded states, invoice link, and no automatic/custom controls.

- [ ] **Step 2: Implement minimal data wiring**

Replace `NOT_CONNECTED_BILLING_VIEW_MODEL` with the real query. Keep the action disabled when server availability is false. Use Stripe Elements for bounded address/payment/authentication.

- [ ] **Step 3: Verify desktop/mobile behavior in focused tests and commit**

```bash
git commit -m "feat(billing): enable fixed AI balance top-ups"
```

### Task 7: Implement full-unspent refund safety

**Files:**
- Modify customer funding service and recovery
- Modify Stripe service for exact credit-note/refund proof
- Modify Metronome client for invoice void/archive reads
- Add operator-only resolver/admin boundary following existing Myah-team patterns
- Test: refund/quiescence/recovery specs

- [ ] **Step 1: Write failing quiescence tests**

Block the workspace, drain/reconcile every active/unknown reservation and pending usage delivery, and prove zero later-settleable operations before provider writes.

- [ ] **Step 2: Implement intent-before-write refund**

Allow only full unspent/unapplied commitment. Persist refund intent, prove credit note/refund/tax reversal, void Metronome payment invoice, archive commit via `archive_commits`, and hold the block through terminal resolution.

- [ ] **Step 3: Test one-leg ambiguity and commit**

```bash
git commit -m "feat(billing): safely refund unused AI balance"
```

### Task 8: Final verification and rollout evidence

**Files:**
- Add only behavior tests needed for uncovered observable contracts
- Update generated metadata/Lingui outputs required by changed GraphQL/UI copy
- No production configuration mutation in the implementation PR

- [ ] **Step 1: Run focused server and frontend suites on Linux**
- [ ] **Step 2: Run affected server/frontend/client-SDK typechecks**
- [ ] **Step 3: Run canonical type-aware lint and pinned format checks**
- [ ] **Step 4: Launch the real Billing page and browser-verify desktop/mobile**
- [ ] **Step 5: Obtain independent financial/security/spec and code-quality reviews**
- [ ] **Step 6: Push one coherent branch, open draft PR, run ordinary CI, then final full E2E only when ready**
- [ ] **Step 7: Keep production funding disabled until separately authorized sandbox and real `$25` canary evidence passes**

---

## Plan self-review checklist

- Every AI spec requirement maps to Tasks 1–8.
- No custom amount, automatic top-up, local wallet, second ledger, new checkout framework, or new recovery scheduler is introduced.
- Shared migration precedes both feature lanes.
- All financial writes use intent-before-write and exact authoritative reconciliation.
- Production payment/configuration changes remain separate explicit gates.
