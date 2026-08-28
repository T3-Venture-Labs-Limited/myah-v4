# Prewarmed-Only Mailbox Acquisition and Approved Outreach Canary

**Issue:** MYAH-275
**Status:** Approved design; implementation has not started
**Baseline:** `origin/main` at `351f06ad73e0c5398ce88c541c750ded3927d64e`
**Product decision date:** 2026-08-28

## 1. Goal

Launch one honest managed-email product:

1. browse currently available Icemail prewarmed inventory;
2. buy one complete available bundle;
3. connect its mailbox credentials as native Twenty sending identities;
4. prove one human-approved creator-agent outreach email end to end.

Keep Twenty's existing **Connect email account** path unchanged.

If Icemail has no stock, show an honest empty state. Users may connect an account they already own and manage warmup with another provider. Myah does not fall back to creating a domain, creating a mailbox, importing a domain, or selling managed warmup.

## 2. Why the Scope Changed

Current production managed email is too broad for the launch goal. It combines:

- ordinary domain and mailbox ordering;
- prewarmed inventory;
- Stripe payment-method setup;
- Metronome subscription and invoice proof;
- Icemail provider ordering and recovery;
- Warmup Inbox enrollment and readiness;
- DNS, credentials, Twenty activation, lifecycle, and campaign eligibility;
- a composable dashboard and multi-mode acquisition UI.

The combined UI is user-reported as janky and has not provided usable customer acceptance evidence. Time to market requires a hard cutline.

The broader customer-owned-domain implementation is preserved on branch `daryll/myah-273-support-customer-owned-domain-import-with-initial-managed` at commit `be4667d5`. It is not merged or deployed.

Linear cleanup records the product decision:

- MYAH-265 composable managed email: Canceled
- MYAH-269 optional managed warmup: Canceled
- MYAH-273 customer-owned domain: Backlog and parked
- MYAH-270 linked-mailbox approval/send: Backlog and separate
- MYAH-237, MYAH-258, and MYAH-266: completed historical foundations

## 3. Audited Current State

Current `main` contains substantial reusable infrastructure:

- guarded prewarmed inventory query;
- opaque actor/workspace-bound bundle selections;
- provider inventory revalidation;
- immutable proposal and quote offers;
- Stripe SetupIntent/default-payment-method handling;
- Metronome customer, contract, subscription, and exact invoice correlation;
- independent Stripe invoice/PaymentIntent proof;
- `ManagedEmailAcquisitionOperationEntity` as a durable workspace purchase journal;
- provider intent before Icemail write;
- Icemail prewarm purchase and exact/partial receipt projection;
- uncertain provider-write reconciliation;
- credential retrieval;
- deterministic encrypted Twenty `ConnectedAccount` and `MessageChannel` creation/reuse;
- activation, readiness, lifecycle, and creator-agent eligibility jobs.

Current `main` also has verified launch blockers:

1. The UI exposes prewarmed and ordinary create-and-warm acquisition together.
2. Direct GraphQL clients can invoke ordinary proposal and purchase operations.
3. Empty inventory recommends ordinary new provisioning.
4. Prewarmed quotes still include managed warmup.
5. Prewarmed activation still enrolls and depends on Warmup Inbox.
6. Contract recovery requires fiat credit type `USD`, while payment proof requires `USD (cents)`.
7. Purchase-time stock revalidation checks only the first Icemail inventory page.
8. Creator-agent approval and receipt projection compute different sending fingerprints.
9. Generic workspace-visible email send can bypass managed-mailbox eligibility.
10. Managed service cancellation leaves the native Twenty account/channel behind.
11. Bulk Campaign sending uses a separate emailing-domain driver and is not connected to managed mailboxes.
12. Existing frontend tests rely on mocked provider/GraphQL data and do not prove a live purchase/send.

Production currently has managed email enabled in production mode for one allowlisted workspace on both server and worker. This is controlled exposure, not proof of readiness.

## 4. Launch Product Contract

### 4.1 Email settings surface

Workspace Email exposes exactly two customer actions:

- **Browse prewarmed mailboxes**
- **Connect an email account**

The existing generic connection action continues to Twenty's native account connection route.

Remove from the launch surface:

- Set up managed email
- Create and warm new mailboxes
- Buy domain
- Use a domain I own
- Add domain
- Add managed mailbox
- Start/resume/pause/cancel managed warmup
- empty-stock fallback to ordinary provisioning
- the multi-mode acquisition chooser

Existing acquired prewarmed resources may still show bounded status, invoice, paid-through, and service-stop controls.

### 4.2 Empty inventory

Reserve the approved empty copy for a complete successful inventory read that proves zero valid bundles:

> No prewarmed mailboxes are available right now. You can connect an existing email account and manage warmup with a provider of your choice.

Icemail timeout, authentication failure, malformed inventory, duplicate/conflicting inventory, or pagination-bound exhaustion renders a distinct **Prewarmed inventory is temporarily unavailable** state and safe retry. It never masquerades as zero stock.

Do not fabricate stock, queue a speculative order, collect payment, reserve a domain, or promise availability alerts in this slice.

### 4.3 Inventory unit

Icemail inventory is a complete domain bundle. The customer selects exactly one whole fixed bundle exposed by the provider. The launch does not split a provider bundle, combine multiple bundles, or let the customer edit addresses/personas.

New admission permits at most one active prewarmed bundle per workspace. This keeps provider lifecycle, contract-specific rates, cancellation, and sending authority exact. Historical multi-bundle durable rows may replay through internal recovery only; no new UI or GraphQL request can create them.

The browser receives only customer-safe identities and an opaque offer ID. Raw provider inventory IDs, costs, provider payloads, and credentials remain server-side.

## 5. Commercial Contract

### 5.1 Exact Icemail billing shape

The launch supports the current Icemail prewarmed inventory fields already mapped by the provider adapter:

- `per_domain_price` → safe integer `domainPriceCents`, USD cents for one domain-year;
- `per_mailbox_price` → safe integer `mailboxPriceCents`, USD cents per mailbox-month;
- `mailbox_count` → exact positive mailbox quantity;
- purchase `total_cost` → safe integer USD cents.

The domain-year and mailbox-month cadence is bound to the 2026-07-26 controlled Icemail purchase evidence and must be reconfirmed against one current provider/partner billing artifact before the production canary. A contradictory provider contract blocks admission; the application does not reinterpret the fields.

For each component:

```text
domainSellCents = ceil(domainPriceCents / 0.70)
mailboxSellCents = ceil(mailboxPriceCents / 0.70)
```

Expected provider purchase cost is:

```text
domainPriceCents + mailboxPriceCents * mailboxCount
```

The purchase receipt `total_cost` must equal that snapshotted expected provider cost. Any mismatch is reconciliation-required and cannot become fulfilled.

This guarantees at least 30% gross margin against each Icemail provider component:

```text
grossMargin = (customerPrice - providerCost) / customerPrice
```

A 30% markup is not equivalent and is not accepted. Payment-processing fees remain outside this provider-cost margin guarantee unless the commercial policy is explicitly changed later.

### 5.2 Ponytail pricing boundary

Do not build an arbitrary pricing language. Support only:

- USD safe integer cents;
- one annual domain component;
- one monthly per-mailbox component;
- exactly one active bundle per workspace.

If Icemail returns:

- an unsupported currency;
- an unknown cadence;
- a missing or unsafe/non-integer cost;
- contradictory component or purchase totals;
- a changed cost after quote;
- a provider shape not represented by the exact two-product mapping;

then purchasing fails closed and requires a fresh/operator-reviewed commercial configuration. Myah does not guess, round down, or absorb an unknown cost.

### 5.3 Quote identity

The immutable quote binds:

- actor and workspace;
- opaque single-bundle selection;
- exact provider inventory identity;
- exact fixed domain/mailbox identities;
- provider domain-year cost, mailbox-month unit cost, quantity, expected purchase total, and source timestamp;
- domain and mailbox customer unit prices;
- USD currency and exact cadences;
- gross-margin calculation/version;
- Metronome customer, contract, rate-card, product, exact expected override rates, and deterministic expected override/subscription keys;
- quote version, hash, and expiry;
- provider and readiness policy identity.

Provider-generated contract edit, override, and subscription IDs do not exist during quoting. Persist them only in `ManagedEmailAcquisitionOperationEntity` after each Metronome write, then correlate them back to the quote's deterministic expected keys, products, rates, cadence, and quantities. The immutable quote is never mutated after creation.

Revalidate provider inventory and cost before billing admission. If stock or cost changed, expire the quote before charging and require a new review.

### 5.4 Exact Metronome and Stripe mapping

Metronome owns recurring products/subscriptions and invoice calculation. Stripe collects the Metronome-synced invoice.

Use the existing server-owned products:

| Provider component | Metronome product | Override | Subscription |
| --- | --- | --- | --- |
| One domain-year | `managed_sending_domain_year` | `OVERWRITE` with `overwrite_rate.rate_type: FLAT` and `price: domainSellCents` | Annual, quantity 1 |
| Each mailbox-month | `managed_mailbox_month` | `OVERWRITE` with `overwrite_rate.rate_type: FLAT` and `price: mailboxSellCents` | Monthly, quantity `mailboxCount` |

Create the two contract-specific overrides with `POST /v2/contracts/edit`, exact product IDs, an hour-aligned `starting_at`, service-period `ending_before`, deterministic expected override keys, and deterministic `Idempotency-Key`. Persist returned edit/override IDs in the acquisition operation before adding subscriptions. Add subscriptions with deterministic `<operationId>:<productKey>` keys, persist returned IDs, and verify every returned override/subscription against the quote before payment correlation.

Every override, subscription, and invoice uses the rate card's exact non-empty fiat credit type ID whose canonical name is `USD (cents)`. All prices and totals are integer cents. The one-active-bundle rule prevents a later purchase from changing rates under an active bundle. No shared rate card is mutated. The subscription API receives product, cadence, quantity, schedules, proration, and uniqueness identity only; it does not receive a fabricated unit-price field.

The customer sell rates are tax-exclusive. The initial invoice subtotal is:

```text
domainSellCents + mailboxSellCents * mailboxCount
```

The quote stores this tax-exclusive subtotal. After Stripe Tax calculation, the acquisition operation separately persists and correlates:

- Metronome subscription subtotal cents;
- Stripe tax cents;
- Stripe tax-inclusive invoice total cents;
- succeeded PaymentIntent amount equal to the tax-inclusive total.

Only the two subscription components are provider-service revenue. Tax is never included in gross-margin math or treated as a managed-email product.

This work consumes the shared migration defined by MYAH-147 before feature-specific billing changes:

- one workspace installation, Metronome customer, and Stripe Customer;
- shared customer billing-provider configuration and `METRONOME_STRIPE_DELIVERY_METHOD_ID`;
- explicit `METRONOME_BASE_URL_ENVIRONMENT` argument in every `ManagedProviderStripeService` call;
- Metronome credit type `USD (cents)` with one exact ID and integer cents;
- Stripe currency `usd` and integer cents;
- separate managed-AI and managed-email contracts and rate cards;
- the managed-email contract's own direct-billing schedule referencing the shared customer configuration.

The shared migration must update all existing managed-email callers/tests and become the reviewed base of this branch before override, subscription, tax, or payment-failure implementation begins.

Do not:

- create or bill `managed_warmup_month`;
- mutate a shared rate card for one quote;
- create a Stripe subscription catalog;
- use AI prepaid balance;
- add zero-value lines;
- create a generic combination engine.

## 6. Architecture to Reuse

Reuse the existing:

- `ManagedEmailOfferEntity` for bundle/proposal/quote snapshots;
- `ManagedEmailAcquisitionOperationEntity` as the sole durable purchase journal;
- `ManagedEmailSubscriptionService` payment-gated subscription and invoice correlation;
- `ManagedProviderStripeService` SetupIntent and exact external invoice proof;
- `ManagedEmailAcquisitionService` provider-intent protocol;
- `ManagedEmailReconciliationService` exact uncertain-write recovery;
- `IcemailClient` prewarm inventory, buy, credential, and deletion boundaries;
- `ManagedEmailMailboxActivationService` credential-to-Twenty activation;
- `WorkspaceMailboxConnectionService` deterministic encrypted account/channel upsert;
- existing cron/queue claims for subscription/payment, acquisition recovery, activation, readiness, and lifecycle;
- `ManagedEmailCampaignEligibilityService` as the managed sending gate.

Do not add another workflow engine, purchase table, provider adapter hierarchy, or sending identity model.

## 7. Clean Cutover

The broader paths are preserved in Git history and the parked branch. Production code should make a clean launch cutover.

### 7.1 Frontend

Remove ordinary flow entry points and state transitions from the production coordinator. The page must not route users into ordinary proposal/review/payment/progress states.

Keep only:

- dashboard/status for acquired prewarmed resources;
- inventory browser;
- bundle details;
- quote review;
- payment-method setup;
- purchase progress/recovery;
- service-stop status/actions;
- native Connect email navigation.

### 7.2 Server API

Ordinary managed-email proposal and purchase must be unavailable server-side, not merely hidden. Direct GraphQL callers must not be able to start `NEW_MANAGED` admission.

Every prewarmed new-admission boundary accepts exactly one opaque bundle offer. Reject zero or multiple bundle IDs before quote reservation, Metronome edits, payment, or provider spend. Historical multi-bundle operation replay remains internal and cannot be created through the launch API.

Prefer removing the launch-unreachable resolver/mutation exposure and callers. If shared historical replay still requires code for already-durable ordinary or multi-bundle operations, retain only the internal recovery path needed to complete/stop those rows. Do not expose a compatibility alias or browser-accessible hidden mode.

Before deletion, use LSP references and migrate every remaining caller. Historical durable operations must remain readable/recoverable.

### 7.3 Admission configuration

Keep workspace allowlisting for new prewarmed admission and enforce the one-active-bundle invariant under a workspace lock. Reads, payment/provider recovery, activation, and lifecycle for existing resources remain available when new admission is paused.

Do not use a single kill switch that disables financial/provider recovery for in-flight operations.

## 8. Inventory and Provider Protocol

### 8.1 Listing

Use one shared `listAllPrewarmedBundles` provider/service method for both proposal creation and purchase-time revalidation. It:

- requests pages with the same explicit page size;
- accepts at most 100 pages;
- requires stable, non-negative page/limit/total metadata;
- rejects duplicate inventory IDs or domains across pages;
- terminates only when the accumulated unique count equals the declared total;
- reports zero inventory only after a complete successful traversal.

Validate each bundle and mailbox:

- unique non-empty provider IDs;
- normalized domain/address;
- exact mailbox-domain association;
- unique addresses;
- supported provider type;
- exact first/last/display identity as exposed;
- safe integer domain-year and mailbox-month costs;
- USD and expected cadences;
- complete fixed bundle.

Persist only the opaque customer selection and server snapshot.

### 8.2 Purchase-time revalidation

Purchase-time revalidation calls the same `listAllPrewarmedBundles` method. The selected bundle must still exist exactly once with the same:

- provider inventory ID;
- domain and complete mailbox set;
- domain-year and mailbox-month costs;
- mailbox count;
- provider type;
- identities;
- USD/cadence contract.

Any difference invalidates the quote before payment/provider purchase.

### 8.3 Provider write, recovery, activation dispatch, and compensation

Commit `PROVIDER_INTENT_RECORDED` before `POST /prewarm/buy`.

For new one-bundle admission:

- one exact complete success with matching receipt total is persisted and projected;
- any definitively proven zero fulfillment, incomplete domain/mailbox set, extra/conflicting same-domain resource, or purchase-total mismatch enters `COMPENSATION_REQUIRED`;
- genuinely ambiguous provider outcome remains reconciliation-required and is never blindly retried.

Authoritative reconciliation partitions provider resources by the selected normalized domain and provider domain identity. It requires exactly one matching domain and the complete expected mailbox address/provider-ID/domain-ID set, with no duplicate or extra mailbox on that domain. Proven unrelated domains remain outside the partition and do not cause a false conflict. A subset, extra same-domain resource, duplicate, stale bundle, or ambiguous association is not exact.

Provider receipt projection must make activation dispatch durable. Before terminal `PROVIDER_SUCCEEDED`, every projected mailbox has a due activation claim. Both direct continuation and receipt-based reconciliation idempotently enqueue missing activation jobs; the existing activation cron remains the fallback. A crash after receipt persistence or row projection cannot strand a `WAITING_FOR_CREDENTIALS` mailbox in a terminal operation.

For every definitively non-fulfillable paid outcome, Myah must not leave the customer charged or renewing:

1. persist `COMPENSATION_REQUIRED` and block activation/sending/renewal before external writes;
2. if any residual provider domain/mailbox exists, delete the whole selected domain bundle idempotently and prove exact absence;
3. set both Metronome subscription quantities to zero from the acquisition boundary and prove the edit;
4. void/credit the exact Metronome invoice through its supported Stripe integration;
5. issue and prove a full Stripe credit note/refund for the collected invoice, including tax reversal;
6. record `COMPENSATED` only after provider absence and both financial systems agree.

Any provider-cleanup, subscription, invoice, credit-note, refund, or tax one-leg success/ambiguity remains `COMPENSATION_RECONCILIATION_REQUIRED`, blocks activation/sending and future renewal, and reconciles authoritative Icemail/Metronome/Stripe state. Ongoing acquisition reconciliation is reserved for genuinely ambiguous provider outcomes; once non-fulfillment is definitive, the operation moves to cleanup/compensation.

## 9. Payment Gate and Failed-Payment Cleanup

Before creating overrides/subscriptions, Myah collects or refreshes the exact Stripe Customer billing address and optional business tax ID through the shared bounded Stripe Elements/server flow. Invalid or indeterminate tax location creates no Metronome write.

The durable payment lifecycle is:

```text
CREATING_SUBSCRIPTIONS
  → PAYMENT_PENDING
  → PAYMENT_ACTION_REQUIRED | PAYMENT_PAID | PAYMENT_FAILED_CLEANUP_REQUIRED

PAYMENT_PENDING | PAYMENT_ACTION_REQUIRED
  → PAYMENT_RECONCILIATION_REQUIRED
  → PAYMENT_PENDING | PAYMENT_ACTION_REQUIRED | PAYMENT_PAID | PAYMENT_FAILED_CLEANUP_REQUIRED

PAYMENT_FAILED_CLEANUP_REQUIRED
  → PAYMENT_FAILED_CLEANED | PAYMENT_CLEANUP_RECONCILIATION_REQUIRED
```

`PAYMENT_ACTION_REQUIRED` exposes the shared exact Stripe PaymentIntent authentication action for seven days. The browser may confirm the intended PaymentIntent but never mark it paid. Server reconciliation alone transitions payment state.

No Icemail purchase occurs until `PAYMENT_PAID`, which requires:

- expected workspace, actor, operation, and quote;
- expected Metronome customer, separate managed-email contract, rate card, exact `USD (cents)` fiat credit type ID, overrides, and subscriptions;
- exact override/subscription key, component, cadence, quantity, integer-cent rate, and tax-exclusive subtotal correlation;
- exact finalized/paid Metronome invoice subtotal in `USD (cents)`;
- exact shared Stripe customer, delivery-method configuration, environment, and livemode;
- exact paid Stripe invoice in `usd`;
- Stripe invoice subtotal equal to the two-line Metronome subtotal;
- separately persisted Stripe tax cents;
- Stripe invoice total equal to subtotal plus tax;
- exactly one accepted invoice payment;
- succeeded PaymentIntent with exact customer and tax-inclusive total;
- no void, credit note, refund, dispute, reversal, or failed payment that invalidates proof.

`METRONOME_USD_CREDIT_TYPE_NAME` remains exactly `USD (cents)`. Its non-empty rate-card credit type ID is persisted and required at contract recovery, override creation/read-back, subscription creation/read-back, invoice matching, and Stripe cent-amount correlation. Plain `USD` is not an accepted Metronome credit type name for this flow.

If Metronome/Stripe definitively reports failed, expired, unpaid, or voided payment—or the seven-day action window closes unpaid—no provider write occurs. Before terminal failure, Myah:

1. persists `PAYMENT_FAILED_CLEANUP_REQUIRED`;
2. sets both domain and mailbox subscription quantities to zero from the acquisition start and proves the edit;
3. voids/terminates the unpaid Metronome/Stripe invoice and proves no successful PaymentIntent;
4. records `PAYMENT_FAILED_CLEANED`;
5. requires a fresh inventory selection and quote for retry.

Any ambiguous subscription, invoice, authentication, or cleanup outcome remains in the corresponding reconciliation-required state, keeps provider spend and activation blocked, and uses authoritative Metronome/Stripe reads. It never silently terminalizes or creates a new financial write.

## 10. Activation

For each purchased mailbox:

1. retrieve the exact Icemail app-password credential;
2. require username/address match;
3. require supported Gmail IMAP/SMTP endpoints and secure transport;
4. call `WorkspaceMailboxConnectionService.connectManagedWorkspaceMailbox` with deterministic key `managed-mailbox:<id>`;
5. encrypt connection parameters using existing Twenty services;
6. create or reuse exactly one workspace-visible `ConnectedAccount` and one `MessageChannel`;
7. queue initial folder/message synchronization;
8. persist exact account/channel IDs on the managed mailbox;
9. keep campaign eligibility blocked until readiness passes.

Provider passwords never enter DTOs, browser storage, logs, queue payloads, operation receipts, or unbounded errors.

## 11. Provider-Prewarmed Readiness

Prewarmed inventory does not use Warmup Inbox.

A mailbox becomes `ELIGIBLE` only when:

- the paid entitlement is current;
- infrastructure is active;
- Icemail assignment and provider-prewarmed status are exact;
- provider credential lookup succeeds;
- DNS/provider health checks pass;
- live IMAP and SMTP checks pass;
- the managed Twenty account/channel identity matches;
- account/channel are not archived;
- message synchronization is active and not failed;
- no provider, payment, reconciliation, or lifecycle failure blocks use;
- campaign capacity is positive.

The implementation must branch explicitly on provider-prewarmed mode. `NOT_APPLICABLE` copy alone is not a readiness rule.

Remove for provider-prewarmed mailboxes:

- managed warmup paid-through requirement;
- Warmup Inbox enrollment;
- policy update/start/pause/resume/delete;
- metrics and placement gate;
- warmup subscription ID;
- warmup renewal/cancellation UI;
- warmup provider credentials as an acquisition prerequisite.

## 12. Sending Boundary

### 12.1 Honest launch claim

This issue proves one prewarmed mailbox through the creator-agent registered-action path:

1. campaign creator has the exact managed mailbox assignment;
2. `prepare_outreach_email_draft` re-proves workspace/account/channel/recipient authority and readiness;
3. provider draft is created;
4. the exact send action is displayed for human approval;
5. approval is one-use;
6. execution rebuilds authority and eligibility;
7. `send_outreach_email` sends through the native connected account;
8. receipt and workspace projection persist exact delivery evidence.

### 12.2 Fingerprint correction

The action-definition sending fingerprint and workspace projection verification must include the same canonical fields, including nullable/present managed mailbox identity. A provider send must not succeed while receipt projection rejects a different digest.

Correct the shared fingerprint root once and migrate every caller/test. Do not patch only the projection symptom.

### 12.3 Launch send boundary

At launch, managed prewarmed accounts may send only through the creator-agent registered-action path described above. Generic composer/API sends detect authoritative managed-mailbox ownership and reject the managed account even when it is technically eligible. Ordinary user-connected accounts remain unchanged.

The creator-agent path calls the shared managed eligibility gate immediately before provider execution. The boundary is server-derived, not a browser flag.

Future generic managed sending or bulk Campaign integration requires a separate approved issue and canary.

### 12.4 Bulk Campaign exclusion

The current bulk Campaign path uses `EmailingDomainSenderService`, not the connected managed mailbox. This issue does not change that architecture and must not claim bulk Campaign support.

## 13. Cancellation and Teardown

Service-stop scheduling remains Metronome-paid-through aware and idempotent. Because Icemail exposes domain-level `deleteDomainMailboxes` rather than mailbox-level deletion, the launch cancellation unit is the whole fixed domain bundle and all sibling mailboxes. The UI must say **Stop prewarmed bundle at paid-through**; it cannot promise mailbox-only cancellation.

At the paid boundary:

1. under the workspace/bundle lock, persist local stop intent and atomically set every sibling managed mailbox infrastructure/campaign eligibility to blocked before any external write;
2. keep all siblings blocked through every retry;
3. apply the exact Metronome domain and mailbox subscription quantity changes;
4. delete/stop the exact Icemail domain bundle using domain-level provider semantics;
5. verify provider domain/mailbox absence;
6. call a new idempotent `deactivateManagedWorkspaceMailbox` boundary for every sibling;
7. set `ConnectedAccount.archivedAt`, stop MessageChannel synchronization with an existing non-active sync state, remove usable managed credentials through the encrypted connection service, and preserve account/channel IDs, messages, associations, and receipts;
8. mark managed mailbox rows inactive while retaining immutable acquisition/payment/provider history.

Do not call the existing `revokeWorkspaceMailbox` hard-delete path: it deletes the account and cascades the channel. Do not raw-delete database rows or destroy evidence.

A legacy mailbox-level stop request is interpreted only through explicit historical bundle rules; it cannot silently delete sibling mailboxes without showing the whole-bundle effect.

## 14. UI Design

### 14.1 Empty and unavailable states

Show the approved empty message only after a complete valid all-page response proves zero bundles. Provider/auth/pagination/validation failure shows **Prewarmed inventory is temporarily unavailable**, a safe retry, and no ordinary fallback.

### 14.2 Bundle list

Show only customer-relevant provider facts:

- domain;
- fixed mailbox addresses/display identities;
- provider type;
- exact sell price and cadence;
- availability expiry where useful.

Do not expose raw inventory IDs or provider costs.

### 14.3 Quote and payment

Show the exact server quote and explain:

- the complete bundle is fixed;
- pricing cadence;
- due now and recurring amount;
- no managed warmup is included;
- provider availability is rechecked;
- payment precedes provider assignment.

### 14.4 Progress and recovery

Render durable states from the server operation:

- awaiting payment;
- payment confirmed;
- assigning provider resources;
- connecting mailbox;
- checking readiness;
- ready;
- action required.

Refresh/browser restart resumes by operation identity. Browser local storage may retain only bounded operation/intent identity, never provider credentials or authoritative completion.

### 14.5 Resource status

For acquired resources, show:

- domain and mailbox identity;
- paid-through/service status;
- connection/readiness status;
- provider-safe actionable failure;
- stop-at-boundary action.

Do not show warmup controls or annual/new-domain purchase actions unrelated to the purchased provider bundle.

## 15. Security and Privacy

- Workspace and billing permission guard every financial query/mutation.
- Offer, quote, operation, account, and channel reads are workspace-scoped.
- Provider IDs and costs stay server-side unless explicitly customer-safe.
- Provider passwords never leave transient server memory needed for connection.
- Stripe/Metronome/Icemail credentials remain in the platform secret store.
- No raw provider errors or payloads reach customers, logs, analytics, or AI context.
- Payment/provider writes are never initiated by agents; human billing admins purchase.
- Human approval is required for the launch outreach send.
- Direct GraphQL callers cannot invoke deferred ordinary acquisition.

## 16. Production Containment

Before implementation/deployment:

1. inspect the one allowlisted production workspace for managed-email operations in payment, provider-intent, reconciliation, activation, readiness, or scheduled-stop states;
2. preserve every in-flight recovery path;
3. pause new managed-email admission for the workspace if no required admission must finish;
4. keep existing resource reads, financial recovery, provider reconciliation, activation, and lifecycle jobs operational;
5. record exact configuration and rollback values.

Do not change operation state manually or delete provider/database resources as containment.

## 17. Verification

### 17.1 Focused automated contracts

- only prewarmed acquisition is exposed;
- direct ordinary proposal/purchase is unavailable;
- exactly one bundle and one active workspace bundle are enforced server-side;
- true empty inventory is distinct from provider unavailable/invalid inventory;
- shared bounded all-page listing and purchase revalidation, including selected page greater than one;
- opaque actor/workspace ownership and expiry;
- exact provider domain-year/mailbox-month cost and USD cadence validation;
- exact two-product Metronome override/subscription mapping;
- integer-cent 30% gross-margin calculation without rounding down;
- provider receipt total equals snapshotted expected provider cost;
- quote invalidation on stock/cost change;
- no warmup line/subscription/provider call;
- exact Metronome and Stripe payment gate;
- tax-exclusive two-line subtotal, Stripe tax, invoice total, and PaymentIntent total correlation;
- shared customer/config/environment migration precedes both feature lanes;
- payment action-required completion and seven-day deadline;
- definitive unpaid failure zeros subscriptions and terminates the invoice before terminal state;
- ambiguous payment/cleanup remains blocked and reconciles;
- idempotent quote consumption and purchase operation;
- no provider call before payment;
- exact success, zero failure, timeout, incomplete, extra/conflicting, receipt-total-mismatch, and ambiguous provider outcomes;
- exact same-domain provider resource partition with extra/duplicate rejection;
- residual provider teardown and full financial compensation for every definitively non-fulfillable paid outcome;
- compensation ambiguity remains blocked and reconciles;
- receipt-replay crash still dispatches activation idempotently;
- deterministic native account/channel creation and replay;
- provider-prewarmed readiness without Warmup Inbox;
- generic managed send rejection and creator-agent eligibility enforcement;
- fingerprint parity before/after provider send;
- whole-bundle cancellation blocks sends before writes;
- evidence-preserving native account/channel deactivation, never hard delete;
- historical durable operation replay remains safe;
- generic user-owned connection/sending remains unchanged.

### 17.2 Browser proof

Use the actual application at desktop and mobile widths. Verify:

- Email page exposes only Browse prewarmed and Connect email;
- empty state is honest and has no dead transition;
- fixed bundle list/details/quote are usable;
- payment/progress recovers after refresh;
- active/action-required/stopped states are clear;
- no clipping, overlap, horizontal scrolling, or inaccessible controls;
- deferred domain/new mailbox/warmup actions are absent.

Storybook may support component iteration but is not acceptance proof.

### 17.3 Controlled external proof

Icemail stock is intermittent. If a complete valid inventory read proves zero bundles, the product may launch the honest empty state plus native connection, but prewarmed purchasing remains admission-gated until a real bundle canary passes. A provider outage does not count as empty inventory.

When one real bundle is available and separately authorized:

1. enable admission for one exact internal workspace while creator-agent is the only managed send path;
2. browse the real bundle;
3. verify exact provider cost/cadence, Metronome overrides, and customer gross margin;
4. create exact two-line Metronome subscriptions/invoice and Stripe collection;
5. prove no Icemail buy before payment;
6. buy exactly one bundle;
7. restart/replay recovery after receipt persistence and before activation enqueue;
8. retrieve credentials;
9. create/sync the native account/channel;
10. prove blocked-before-ready and eligible-after-ready without Warmup Inbox;
11. prove generic composer/API managed sends remain blocked;
12. prepare one creator-agent draft to one controlled recipient;
13. approve once;
14. send once;
15. observe provider acceptance, recipient delivery, `SENT` receipt, `APPLIED` action, CRM Message/channel association, and timeline;
16. stop before any second approval;
17. in a controlled whole-bundle lifecycle test, prove sending blocks before teardown, provider resources stop, native account archives, channel sync stops, and evidence remains.

### 17.4 Repository gates

- focused behavior tests first;
- affected package typecheck;
- type-aware lint and pinned formatting;
- official GraphQL/SDK/Lingui generation only for changed public contracts;
- independent correctness, financial, lifecycle, security, and Ponytail review;
- ordinary hosted CI;
- final full E2E once after the PR is otherwise ready;
- protected merge;
- post-merge `main` CI;
- separate production deployment and canary.

## 18. Rollout and Rollback

Rollout:

1. production containment and in-flight operation audit;
2. current Icemail partner billing artifact confirms `per_domain_price`, `per_mailbox_price`, cadence, and `total_cost`;
3. exact Metronome two-product override/subscription and Stripe compensation contracts verified in sandbox;
4. source cutover and focused fixes;
5. sandbox/local deterministic lifecycle and crash-boundary proof;
6. actual browser proof;
7. independent review and ordinary CI;
8. protected merge after final full E2E;
9. deploy with prewarmed admission disabled;
10. enable one internal workspace and run the controlled real bundle/recipient canary;
11. explicitly expand workspace admission while retaining creator-agent-only managed sending.

Rollback blocks only new prewarmed admission. It leaves existing operation recovery, payment/compensation reconciliation, provider reconciliation, activation, status reads, and whole-bundle cancellation active.

If send safety is uncertain, atomically block managed eligibility. Do not delete evidence or manually mutate operation state.

## 19. Ponytail Decisions

The shortest correct product:

- two Email actions, not a composable dashboard;
- one provider inventory type;
- one existing acquisition journal;
- one existing payment path;
- one native Twenty sending identity;
- one shared managed eligibility gate;
- one human-approved outreach send;
- no managed warmup;
- no domain shopping/import;
- no new mailbox creation;
- no later append;
- no bulk Campaign integration;
- no generic provider, pricing, consent, workflow, or state-machine framework.

Future work returns only when customer demand and provider capability justify it.

## 20. Definition of Done

This work is done only when:

- production exposes prewarmed browse and native Connect email only;
- ordinary managed acquisition is unavailable in UI and API;
- the quote mirrors verified Icemail billing at a minimum 30% gross margin;
- no managed warmup is sold or called;
- Metronome and Stripe prove exact payment before Icemail purchase;
- provider assignment and recovery are idempotent;
- native account/channel activation and readiness are exact;
- every managed send is gated;
- one separately authorized real creator-agent email is delivered and projected correctly;
- cancellation disables the native sending identity;
- focused tests, browser proof, reviews, CI, full E2E, deployment, and controlled canary pass.

Implementation, merge, deployment, provider spending, and customer activation remain separate gates.