# Fixed AI Prepaid Top-Ups Through Metronome and Stripe

**Issue:** MYAH-147
**Status:** Approved design; implementation has not started
**Baseline:** `origin/main` at `351f06ad73e0c5398ce88c541c750ded3927d64e`
**Product decision date:** 2026-08-28

## 1. Goal

Let a workspace billing admin buy fixed AI prepaid balance and use it through Myah's existing managed OpenRouter path.

The launch offers exactly three one-time USD top-ups:

| Preset | Server amount |
| --- | ---: |
| $25 | 2,500 cents |
| $50 | 5,000 cents |
| $100 | 10,000 cents |

Metronome owns the prepaid commitment, balance ledger, invoice calculation, and usage drawdown. Stripe collects the Metronome-synced invoice. Myah records one durable funding operation for idempotency and recovery, but never stores or increments a second balance.

## 2. Why This Work Exists

Current `main` contains a substantial managed-AI billing foundation:

- `ManagedOpenRouterModelService` reserves before provider I/O and settles authoritative usage.
- `ManagedProviderOperationService` validates Metronome previews, subtracts active reservations, and blocks insufficient balance.
- `ManagedProviderUsageDeliveryService` sends deterministic usage identities and reconciles delivery.
- `ManagedProviderBillingStatusService` reads Metronome prepaid balance.
- `ManagedProviderFundingActionEntity` and `ManagedProviderFundingJournalService` already journal sponsored credits and define a dormant `PREPAID_COMMIT` action type.
- Production has Metronome and managed OpenRouter enabled for one allowlisted workspace.

Customer funding does not exist:

- Workspace Billing hard-disables **Add funds** and displays **Online top-ups coming soon**.
- The frontend does not query the existing managed-provider billing-status API.
- No workspace mutation creates a customer-paid prepaid commitment.
- No AI funding path creates or correlates a Metronome invoice with Stripe payment.
- Existing funding writes are Myah-team sponsored credits.
- The generic managed-AI contract does not establish the Stripe direct-billing configuration used by managed email.
- No customer refund/payment-failure lifecycle exists.

The Billing UI is therefore a visual contract, not a working top-up product.

## 3. Product Contract

### 3.1 Customer flow

1. A workspace billing admin opens **Settings → Billing**.
2. The page loads the real Metronome available balance and funding history.
3. The admin chooses `$25`, `$50`, or `$100`; this amount is prepaid principal, excludes applicable tax, and expires 12 months after payment.
4. Myah collects or refreshes the Stripe Customer billing address and optional business tax ID through bounded Stripe Elements fields.
5. If no reusable Stripe payment method exists, Myah uses the existing SetupIntent-based payment-method flow.
6. The confirmation states the selected principal, **plus applicable tax**, and that balance expires 12 months after successful payment.
7. Myah durably records the funding intent before any Metronome financial write.
8. Myah creates one payment-gated Metronome prepaid commitment for the exact server-owned principal cents and the approved paid-at-derived 12-month customer term.
9. Metronome creates and syncs the immediate invoice to Stripe; Stripe Tax calculates any registered-jurisdiction tax.
10. Stripe collects the tax-inclusive invoice total.
11. Myah reconciles the exact Metronome commitment/invoice and exact Stripe invoice/payment, separating principal, tax, and collected total.
12. Metronome makes only the prepaid principal available for AI use until its fixed expiration.
13. The Billing page shows the updated balance, funding status, exact paid-at-derived expiration, tax-inclusive invoice total, and invoice document.
14. Existing managed OpenRouter reservations and usage settlement draw down the purchased principal.

### 3.2 Customer-visible states

The funding operation exposes only bounded customer-safe states:

- **Preparing payment**
- **Awaiting payment**
- **Payment failed**
- **Balance active**
- **Needs support**
- **Refunded**

Raw Stripe, Metronome, database, and provider errors never reach the browser.

### 3.3 Explicitly excluded

- Automatic top-up
- Customer-entered amounts
- SaaS subscription packaging
- Coupons, discounts, or promotion codes
- Multiple currencies
- Customer self-service refund UI
- Offline commitments
- Per-member balances or budgets
- A local wallet or second balance ledger
- A new checkout framework
- A second webhook framework

## 4. Financial Invariants

The following invariants are load-bearing:

1. Monetary input is a server-owned safe integer number of cents.
2. The browser sends a preset identity, never an authoritative amount.
3. The preset is prepaid principal; tax is a separate invoice amount and never becomes AI balance.
4. Metronome is the only balance and invoice authority.
5. Stripe is the downstream payment collector, not a second price or balance catalog.
6. No balance becomes spendable before exact paid-invoice proof.
7. One workspace/idempotency/preset request creates at most one commitment, invoice, payment, and balance release.
8. Replaying the same request returns the same operation.
9. Reusing an idempotency key with a different workspace, actor, preset, currency, principal, billing identity, or expected tax configuration fails.
10. Failed, pending, expired, incomplete, mismatched, refunded, disputed, or reversed payment cannot authorize new balance.
11. Refund/reversal cannot leave duplicated spendable balance.
12. Existing sponsored credits remain distinct from purchased prepaid commitments.
13. Managed AI continues to bypass Twenty's native credit authorization/decrement path; `billingCustomer.creditBalanceMicro` does not change.

## 5. Existing Architecture to Reuse

### 5.1 Funding journal

Reuse `ManagedProviderFundingActionEntity` and `ManagedProviderFundingJournalService`.

The entity already provides:

- `PREPAID_COMMIT` action type;
- workspace/idempotency uniqueness;
- Metronome uniqueness identity;
- immutable amount/currency/reason/applicability facts;
- `commitmentId`;
- durable pending, success, definitive failure, and reconciliation-required states.

Do not create a second funding table.

The current row does not hold enough late-bound invoice/payment correlation. Extend this existing entity with the minimum fields required for exact recovery:

- Metronome customer ID;
- contract ID;
- contract edit ID;
- commitment ID;
- Metronome invoice ID;
- Stripe billing-configuration/delivery-method ID;
- Stripe customer ID;
- Stripe invoice ID;
- Stripe PaymentIntent ID;
- prepaid principal cents;
- tax cents;
- tax-inclusive collected total cents;
- exact payment receipt JSON containing customer-safe immutable identifiers and totals;
- durable funding phase/state;
- next reconciliation time, bounded attempt count, and atomic claim time;
- refund/credit-note identifiers and exact terminal refund evidence.

Exact columns must follow existing entity/migration conventions. Do not add generic workflow JSON or an event-sourcing layer.

### 5.2 Metronome customer, contract, and payment-gated commit

Reuse `MetronomeWorkspaceCustomerService` to ensure the workspace installation, Metronome customer, and managed-AI contract.

The AI contract must have one exact active Stripe direct-billing configuration owned by the Metronome customer/contract mapping:

- billing provider `stripe`;
- delivery method `direct_to_billing_provider`;
- configured delivery-method ID from shared `METRONOME_STRIPE_DELIVERY_METHOD_ID`;
- the exact persisted Stripe customer;
- `charge_automatically`;
- the payment-gated commit product mapped to one Stripe Product through Metronome's documented `stripe_product_id` mapping.

Persist and re-check that configuration identity during every funding correlation. A changed Stripe customer or delivery method fails closed.

Create the top-up with `POST /v2/contracts/edit` and a deterministic `Idempotency-Key` header. The request contains the exact `customer_id`, `contract_id`, and one `add_commits` item:

```json
{
  "product_id": "MANAGED_OPENROUTER_CREDIT_PRODUCT_ID",
  "type": "PREPAID",
  "invoice_schedule": {
    "schedule_items": [{ "timestamp": "purchase hour T0", "amount": 2500 }]
  },
  "access_schedule": {
    "schedule_items": [
      {
        "amount": 2500,
        "starting_at": "purchase hour T0",
        "ending_before": "T0 plus exactly 13 calendar months (provisional)"
      }
    ]
  },
  "payment_gate_config": {
    "payment_gate_type": "STRIPE",
    "tax_type": "STRIPE"
  },
  "priority": 100,
  "applicable_product_ids": ["MANAGED_OPENROUTER_CHARGE_PRODUCT_ID"],
  "custom_fields": {
    "myah_funding_action_id": "the persisted funding action UUID",
    "myah_funding_identity": "the deterministic immutable funding hash"
  }
}
```

The amount is the selected principal cents; `$50` and `$100` substitute `5000` or `10000`. `T0` is one server-derived hour-aligned timestamp used by both initial schedules. The provisional access end is 13 months after `T0`, while payment must resolve within seven days. After exact paid proof, update the commitment through `POST /v2/contracts/edit` so `ending_before` is exactly 12 calendar months after Stripe's authoritative paid timestamp; persist and verify that edit before `SUCCEEDED`. This guarantees the customer never receives less than 12 months after payment during a crash or delayed reconciliation. Purchased commits use priority `100`; existing sponsored credits retain priority `0` and burn first. The configured credit and charge product IDs are resolved server-side and must belong to the expected Metronome environment.

The response returns the contract edit ID and complete added-commit details, including the commitment ID. Persist both before polling payment.

Metronome's official payment-gate contract is authoritative:

- it attempts payment immediately;
- successful payment releases the commit;
- failed payment voids the invoice/resource and creates no commit;
- action-required and paid/failed notifications may wake reconciliation;
- failed payment is not automatically retried; the customer starts a new funding operation.

Metronome retains POST idempotency keys for at least 24 hours. Reuse the same key and identical payload inside that window. After it expires, never blindly repeat an ambiguous edit: query contract edit history and customer commits, including archived commits, for the exact customer/contract, custom fields, product, principal, schedules, and payment-gate configuration. Zero, multiple, or conflicting matches remain reconciliation-required.

Use Contracts and Contract Edits, never legacy Plans or Amendments.

### 5.3 Shared environment authority

`METRONOME_BASE_URL_ENVIRONMENT` is the shared environment authority. `PRODUCTION` requires every Stripe object to have `livemode=true`; `SANDBOX` requires `livemode=false`. The Metronome base URL, payment-gate environment, server and worker settings, Stripe Customer, SetupIntent, invoice, PaymentIntent, credit note, and refund must all agree.

Pass this explicit environment identity into `ManagedProviderStripeService`; remove inference from `MANAGED_EMAIL_EXECUTION_MODE`. Any mismatch fails before a financial write or success transition.

### 5.4 Shared Metronome and Stripe ownership and migration order

Both launch workstreams share one workspace billing identity but not one commercial contract:

- one `MyahWorkspaceInstallationEntity` per workspace;
- one persisted Metronome customer ID per installation;
- one Stripe Customer per Metronome customer/workspace;
- one shared Metronome customer billing-provider configuration and `METRONOME_STRIPE_DELIVERY_METHOD_ID`;
- a separate managed-AI contract using `METRONOME_RATE_CARD_ALIAS`;
- a separate managed-email contract using `MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS`;
- each contract has its own direct-billing schedule referencing the same customer billing configuration and Stripe Customer.

The shared unit contract is:

- Metronome fiat credit type name exactly `USD (cents)`;
- the exact non-empty fiat credit type ID persisted/read from the applicable rate card;
- all Metronome monetary values are integer cents;
- Stripe currency is lowercase `usd`;
- Stripe amounts are integer cents;
- `METRONOME_BASE_URL_ENVIRONMENT` is passed explicitly into every shared Stripe proof call.

The first implementation task must migrate the shared seam before either feature-specific path changes behavior:

1. introduce `METRONOME_STRIPE_DELIVERY_METHOD_ID` on server and worker using the existing production delivery-method value;
2. migrate managed email from `MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID`;
3. make `MetronomeWorkspaceCustomerService` own the shared customer/Stripe configuration verification and separate contract schedule verification;
4. require an explicit environment argument in every `ManagedProviderStripeService` caller;
5. update all existing managed-email callers/tests and prove unchanged payment behavior;
6. merge or otherwise make this reviewed shared commit the base of both feature lanes before AI top-up or prewarmed feature code proceeds.

Do not merge the AI and managed-email contracts, catalogs, subscriptions, balances, or operation journals.

### 5.5 Stripe payment proof

Reuse `ManagedProviderStripeService` for:


- Stripe Customer creation/recovery;
- bounded billing-address and optional tax-ID update;
- SetupIntent creation and completion;
- setting the default payment method;
- exact paid external invoice proof;
- exact credit-note/refund proof for the restricted refund path.

Refactor only the minimum shared environment/configuration and amount-breakdown seams required to make the service safe for both AI funding and managed-email billing.

Do not create a separate direct PaymentIntent charge. Metronome must originate the invoice that Stripe collects.

### 5.6 Balance and usage

Wire the existing `managedProviderBillingStatus` query into Workspace Billing. Use Metronome's computed balance; do not sum local funding rows.

Existing managed OpenRouter reservation, provider execution, usage delivery, and settlement remain unchanged except for focused fixes independently required by their current contracts. Customer funding must not weaken reservation caps, tariff binding, privacy rules, or insufficient-balance behavior.

## 6. API Design

### 6.1 Read model

Workspace Billing needs one authenticated, billing-permission read model containing:

- new-purchase availability from the server admission gate;
- available Metronome balance cents;
- pending reserved cents if already exposed safely;
- bounded purchased/sponsored funding history;
- operation state;
- preset identity and principal amount;
- tax and tax-inclusive collected total when invoiced;
- exact 12-month expiration;
- created/updated time;
- customer-safe invoice document URL when available;
- saved payment-method and billing-address summary through existing safe fields.

Reuse existing billing resolver/page boundaries. Do not expose provider raw objects.

### 6.2 Mutations

The minimum mutation surface is:

1. prepare or reuse payment method and authoritative Stripe billing address/tax ID;
2. request a fixed prepaid top-up with preset identity plus idempotency key;
3. query operation status through the existing operation read/poll pattern;
4. one Myah-team/operator-only full-unspent refund operation.

A separate "mark paid" browser mutation is prohibited. The server independently proves payment.

### 6.3 Authorization and admission

- Workspace authentication is mandatory.
- The actor must have the existing billing permission.
- The operation is bound to workspace and actor.
- Impersonated/admin contexts follow existing financial-action prohibitions.
- Another workspace cannot read, replay, or correlate the operation.
- One explicit `MANAGED_PROVIDER_CUSTOMER_FUNDING_ENABLED` setting and exact workspace allowlist gate new purchase before local intent creation.
- The read-model availability uses the same server gate.
- The gate defaults disabled/empty and is enforced by the mutation, not only the UI.
- Reconciliation, refunds, existing balance reads, and existing AI balance consumption deliberately ignore the new-purchase gate so rollback cannot strand money.

## 7. State and Recovery

The funding journal must use explicit durable states so a retry never repeats an uncertain financial write:

```text
PENDING
  → METRONOME_EDIT_RECORDED
  → PAYMENT_PENDING
  → PAYMENT_ACTION_REQUIRED | SUCCEEDED | FAILED_DEFINITIVE

PAYMENT_ACTION_REQUIRED
  → PAYMENT_PENDING | PAYMENT_ACTION_REQUIRED | RECONCILIATION_REQUIRED | FAILED_DEFINITIVE

PENDING | METRONOME_EDIT_RECORDED | PAYMENT_PENDING
  → RECONCILIATION_REQUIRED
  → PAYMENT_PENDING | PAYMENT_ACTION_REQUIRED | SUCCEEDED | FAILED_DEFINITIVE

SUCCEEDED
  → REFUND_INTENT_RECORDED
  → REFUND_RECONCILIATION_REQUIRED
  → REFUNDED | SUCCEEDED
```


`PAYMENT_ACTION_REQUIRED` exposes one bounded **Authenticate payment** action for seven days. After exact workspace/customer/invoice proof, the server returns the intended Stripe PaymentIntent client secret without persisting it in browser recovery state. Stripe Elements confirms that PaymentIntent; the operation returns to `PAYMENT_PENDING`, and only authoritative reconciliation may transition it to `SUCCEEDED` or `FAILED_DEFINITIVE`. It may remain `PAYMENT_ACTION_REQUIRED` when Stripe still requires action. At the seven-day deadline, Myah verifies Metronome/Stripe terminal state; an unpaid/voided gate fails definitively and creates no balance, while an ambiguous state remains reconciliation-required.
`METRONOME_EDIT_RECORDED` requires persisted edit and commitment IDs. `PAYMENT_PENDING` requires the exact invoice correlation. `SUCCEEDED` requires paid Metronome and Stripe proof plus released commit balance. A payment-gate failure is definitive and cannot reuse the same purchase operation; it creates no commit/balance.

Every remote write follows intent-before-write:

1. commit the local phase and immutable expected facts;
2. perform the idempotent remote write;
3. record returned remote IDs before the next boundary;
4. on ambiguity, move to reconciliation-required instead of issuing a new write;
5. reconcile authoritative Metronome and Stripe state;
6. transition with a compare-and-set from the expected prior state.

Extend the existing `ManagedProviderBillingRecoveryCronCommand` rather than adding another scheduler. It scans due `ManagedProviderFundingActionEntity` rows, atomically claims each row, increments bounded attempts, re-reads it under the workspace financial lock, and runs phase-specific read/recovery. Store `nextReconciliationAt` and claim time; use bounded exponential backoff. Do not terminalize while Metronome reports payment/action pending. Escalate conflicting or unresolved post-idempotency-window outcomes to `RECONCILIATION_REQUIRED` for operator review.

Verified Metronome payment-gate notifications may enqueue the same reconciliation operation, but notifications are hints. Polling/read-after-write remains correctness authority.

## 8. Exact Payment Correlation

Success requires all of the following:

- expected workspace installation;
- expected Metronome customer and contract;
- expected funding action ID and deterministic identity in commit custom fields;
- exact contract edit and commitment IDs;
- exact payment-gated `PREPAID_COMMIT` product, schedules, applicability, and status;
- exact principal cents and USD currency;
- exact released commit balance;
- exact finalized/paid Metronome invoice linked to the commitment schedule;
- expected Stripe direct-billing configuration and delivery-method ID;
- exact Stripe customer;
- exact paid Stripe invoice;
- Stripe invoice subtotal equal to principal cents;
- Stripe tax breakdown equal to persisted tax cents;
- Stripe invoice total equal to principal plus tax;
- exactly one accepted invoice payment for this correlation;
- succeeded PaymentIntent with exact customer, tax-inclusive total, currency, and livemode;
- no refund, credit note, dispute, reversal, or void that invalidates the paid proof.

The Metronome adapter must preserve the edit, commit, invoice, and schedule relationships needed for this proof. The Stripe `metronome_id` metadata must equal the exact correlated Metronome invoice ID. A draft Metronome invoice, a Stripe invoice URL, client success callback, or paid invoice with a refund/dispute is not spendable-balance proof.

## 9. Refund and Failure Boundary

Launch does not add customer self-service refunds. It supports one operator-only policy: **full refund only while the purchased commitment is completely unspent and unapplied**. Partial refunds and refunds after any commit application are unavailable in the launch product and require finance review.

The refund operation:

1. acquires the workspace financial lock and atomically blocks new AI reservations for the whole workspace;
2. drains and reconciles every active or uncertain managed-provider reservation and pending usage delivery for the workspace;
3. proves there are zero `RESERVED`, provider-unknown, delivery-pending, or otherwise later-settleable managed-provider operations before any refund write;
4. proves the exact funding action, commitment, payment invoice, Stripe payment, original principal/tax/total, full remaining commitment balance, and zero usage-invoice applications;
5. persists `REFUND_INTENT_RECORDED` before external writes;
6. uses the documented Stripe credit-note/refund flow for the exact tax-inclusive invoice and records tax reversal evidence;
7. voids the corresponding finalized Metronome commit-payment invoice;
8. archives the exact commitment with `POST /v2/contracts/edit` using `archive_commits: [{ "id": "the persisted commitment UUID" }]` and a deterministic uniqueness/idempotency identity;
9. proves the archived commit has null ledger and zero remaining balance;
10. records terminal `REFUNDED` evidence and unblocks the workspace only after unrelated valid funding and every prior operation remain consistent.

The workspace reservation block remains in force from refund intent until terminal `REFUNDED` or a fully reconciled rollback to `SUCCEEDED`. If any active/unknown operation cannot be drained, no refund provider write occurs and the refund remains support-required. Any one-leg success, timeout, externally initiated refund, dispute, or reversal moves to `REFUND_RECONCILIATION_REQUIRED`, keeps new reservations blocked, and is reconciled from Stripe and Metronome authoritative reads. It never replays a write whose outcome is unknown.

No database balance edit, manual Metronome ledger edit, or spent-value refund is an accepted fallback. The sandbox must prove the exact credit-note/refund, invoice-void, commit-archive, tax-reversal, and ambiguous-outcome sequence before customer funding is enabled.

## 10. Global Billing and Tax

The product accepts global customers through one USD flow without custom regional pricing code.

Before creating the funding intent, the Billing page uses Stripe Elements to collect or confirm the complete billing address required by Stripe Tax and an optional business tax ID. The server validates bounded fields, updates the exact Stripe Customer, attaches/verifies the tax ID through Stripe, and reads the customer back. Missing, invalid, stale, or indeterminate location returns **Payment details required** and no Metronome edit occurs.

The preset is tax-exclusive prepaid principal. The confirmation says **$25/$50/$100 plus applicable tax**. The customer invoice separately shows principal, tax, and tax-inclusive total; only principal becomes AI balance.
The initial payment-gated commit uses a provisional 13-month access end and a seven-day payment-resolution deadline. After successful payment, Myah edits and verifies the access schedule so it expires exactly 12 calendar months after the authoritative paid timestamp. Funding history and balance detail show the final date; the launch does not add rollover or extension automation.

Myah must verify before launch:

- the Stripe account origin/address;
- active tax registrations already obtained by Myah;
- approved Stripe product tax code for AI/SaaS prepaid service;
- Metronome payment-gate `tax_type: STRIPE`;
- the commit product's Stripe Product mapping and tax behavior;
- registered, unregistered, reverse-charge, and action-required invoice behavior;
- full-refund tax reversal behavior.

Enabling automatic tax without active registrations is not proof of collection. Legal registration decisions remain with Myah and its tax advisor. The application does not invent tax rates or registration obligations.

## 11. UI Design

Delete weight from the current Billing prototype.

Keep:

- available balance;
- `$25`, `$50`, `$100` buttons;
- saved payment-method summary/action;
- operation status;
- funding history;
- invoice link;
- exact purchased-balance expiration;
- existing usage history if backed by real data.

Remove or keep unavailable:

- arbitrary amount input;
- automatic top-up toggle;
- threshold;
- monthly cap;
- "coming soon" copy once the real action is active.

The button stays unavailable until the backing read model and mutation are live. UI state is restored from the server operation, not browser-only state.

## 12. Security and Privacy

Never persist, log, return, or attach to analytics:

- Stripe secret keys or full payment objects;
- card numbers, CVC, or unbounded billing data;
- Metronome API keys;
- OpenRouter credentials;
- prompts, completions, tool payloads, or provider response bodies.

Persist only bounded identifiers, integer amounts, state, timestamps, safe failure codes, and customer-safe invoice links.

Webhook signatures remain verified for existing generic billing webhooks. This design does not route funding correctness through an unverified webhook.

## 13. Verification

### 13.1 Focused automated contracts

- exact preset-to-principal mapping;
- arbitrary/client-tampered amount rejection;
- tax-exclusive principal versus tax-inclusive total;
- authoritative Stripe billing-address/tax-ID update;
- workspace/actor/permission/idempotency binding;
- server admission/allowlist enforcement;
- conflicting replay rejection;
- one intent before remote write;
- exact `/v2/contracts/edit` payment-gated commit payload and response mapping;
- same-key retry inside the Metronome idempotency window;
- exact read recovery after the idempotency window;
- explicit phase compare-and-set and funding reconciliation claims;
- exact Metronome customer/contract/config/edit/commit/invoice proof;
- exact Stripe customer/invoice/tax/PaymentIntent proof;
- no balance before payment;
- ambiguous action-required deadline transitions atomically to reconciliation-required;
- one principal-only balance activation after payment;
- replay/concurrency does not duplicate funding;
- refund quiescence requires zero active/unknown reservations and pending usage deliveries;
- failed/action-required/expired payment and seven-day action deadline add no balance;
- full-unspent refund, tax reversal, invoice void, and commit archive;
- refund/dispute ambiguity blocks reservations and reconciles;
- real Billing read-model mapping;
- existing managed AI reservation/settlement consumes purchased balance;
- no Twenty local credit balance mutation;
- historical sponsored-credit behavior remains intact.

### 13.2 Sandbox proof

In Metronome sandbox and Stripe test mode:

1. configure the exact AI Stripe direct-billing method and mapped commit product;
2. collect a valid Stripe Customer address and request `$25`;
3. observe one payment-gated prepaid commitment and one immediate Metronome invoice;
4. observe one matching Stripe invoice with principal and tax separated;
5. prove no balance before payment;
6. pay with a Stripe test method;
7. prove exactly `$25.00` principal becomes available, never the tax amount;
8. replay browser request and worker reconciliation inside and after the idempotency window;
9. prove action-required completion returns to server reconciliation and prove the seven-day deadline;
10. prove no duplicate commitment, invoice, payment, or balance;
11. run one small managed AI request;
12. prove one usage settlement and exact principal-balance deduction;
13. prove failed payment adds no balance;
14. prove a full-unspent credit-note/refund, Metronome invoice void, contract-edit commit archive, and tax reversal;
15. force one-leg refund ambiguity and prove reservations stay blocked until reconciliation.

### 13.3 Production canary

After merge, deployment, active tax/configuration review, and separate explicit payment authorization:

- customer funding enabled for one exact internal workspace only;
- one real `$25` principal top-up plus applicable tax;
- one minimal managed AI request;
- exact comparison across Myah operation, Metronome edit/commit/invoice/ledger, Stripe invoice principal/tax/payment, and resulting principal balance;
- accessible customer invoice document;
- no local-credit delta;
- no sensitive content in logs or receipts.

Broader customer funding remains disabled until the canary passes.

## 14. Rollout and Rollback

Rollout sequence:

1. official Metronome/Stripe contract and custom-field configuration verified in sandbox;
2. exact direct-billing method, mapped commit product, tax code, environment, and registration checklist recorded;
3. focused implementation and tests;
4. typecheck, type-aware lint, pinned format, generated client freshness;
5. actual Billing browser smoke at desktop and mobile widths;
6. independent financial/security/correctness review;
7. ordinary hosted CI;
8. final full E2E once;
9. protected merge;
10. post-merge `main` CI;
11. production deployment with customer-funding admission disabled;
12. enable one internal workspace and run the controlled `$25` canary;
13. explicit allowlist expansion.

Rollback disables only new funding admission. It leaves purchased balance, AI usage settlement, Metronome funding/payment recovery, refund reconciliation, and Stripe reconciliation active. Financial recovery must not be disabled merely because new purchases are paused.

## 15. Ponytail Decisions

The shortest correct implementation:

- reuses `PREPAID_COMMIT` and the existing funding journal;
- extends one row instead of adding a ledger;
- reuses Metronome Contracts/Edits;
- reuses the existing Stripe SetupIntent and invoice-proof service;
- reuses durable polling/reconciliation instead of adding a funding webhook framework;
- wires the existing balance query into the existing Billing page;
- supports three constants, not a packaging engine;
- uses Stripe Tax, not a custom tax calculator.

Add automatic top-up, custom amounts, multiple currencies, or richer packaging only after real customer evidence makes one of them a bottleneck.

## 16. Definition of Done

This work is done only when:

- the customer can buy one approved preset through the real Billing page;
- Metronome creates the exact prepaid commitment/invoice;
- Stripe collects the exact invoice;
- balance activates exactly once only after payment;
- the customer can consume it through managed AI;
- failure, replay, reconciliation, and refund behavior are proven;
- sandbox evidence passes;
- code/review/CI/full-E2E gates pass;
- one separately authorized real `$25` production canary passes.

Implementation, merge, deployment, and customer activation remain separate gates.