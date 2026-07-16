# Metronome-First Managed Provider Billing Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task by task. Steps use explicit test-first behavior and verification commands.  
> **Linear owner:** [MYAH-149 — Implement managed provider billing foundation](https://linear.app/t3labs/issue/MYAH-149/implement-managed-provider-billing-foundation)  
> **Branch / worktree:** `daryll/myah-149-implement-managed-provider-billing-foundation` / `.worktrees/daryll/myah-149-implement-managed-provider-billing-foundation`  
> **Design:** `docs/superpowers/specs/2026-07-15-metronome-managed-provider-billing-foundation-design.md`  
> **Status:** Ready for implementation after revised plan review

**Goal:** Implement strict prepaid USD managed-provider billing with concurrency-safe local reservations and repeat-safe Metronome settlement.

**Architecture:** Metronome owns customer balances, USD rate cards, Stripe payment gating, invoices, and billing history. Myah owns one durable operation journal that temporarily reserves previewed USD cents before provider work, records the outcome, and releases the reservation only after Metronome delivery and delayed settlement are verified.

**Tech stack:** TypeScript, NestJS, TypeORM, PostgreSQL, BullMQ-compatible message queues, Jest, and the official Metronome Node SDK.

## 1. Goal and fixed boundary

Implement a Community-safe Metronome billing foundation that:

- maps each Myah workspace to one Metronome customer;
- asks Metronome to price worst-case and actual usage in USD cents;
- reads only payment-backed `PREPAID_COMMIT` balance for authorization;
- prevents concurrent provider operations from claiming the same available prepaid USD;
- durably records provider outcomes;
- delivers usage to Metronome with a repeat-safe transaction ID;
- retries lost billing delivery without retrying provider work.

Metronome remains the system of record for prepaid balances, USD rate cards, Stripe payments, invoices, and billing history.

Every later managed provider service uses a fixed reviewed price that provides at least 30% gross margin:

```text
customerPriceCents = ceil(providerCostMicrousd / 7000)
```

The provider-specific catalog entry and matching Metronome rate belong to the later provider integration issue. MYAH-149 adds neither an empty generic catalog nor a runtime provider-price lookup.

MYAH-149 does not call OpenRouter or Icemail and adds no public GraphQL/REST operation. The exported services are consumed only by later provider-specific issues.

This is intentionally public, Community-safe source. Its operational safety mechanisms and fixed reviewed-price policy may be visible in the repository. API keys, customer and payment data, provider credentials, and deployment-specific Metronome or Stripe identifiers remain private through environment configuration and external control planes; server-only code is not treated as a source-code privacy boundary.

## Global constraints

- Customer balances and charges use Metronome's built-in USD-cents unit.
- Authorization includes only `PREPAID_COMMIT`; promotional credits and postpaid commitments cannot fund provider work.
- Omit `credit_type_id` from net-balance requests so the documented USD-cents default applies.
- Persist and compare customer monetary amounts as lossless integer cents with `bigint`.
- Persist provider-reported USD cost, when available, as integer micro-USD.
- Never use `invoice.total` for reservation; sum validated matching usage-line totals before balance application.
- Never release a reservation on ingest acceptance alone.
- Never import Twenty Enterprise billing or add a Myah wallet, balance ledger, pricing table, Stripe flow, invoice model, or provider-specific catalog entry.
- Use test-driven development: observe each focused test fail for the intended missing behavior before implementing it.

## 2. Required implementation order

The tasks are intentionally ordered:

1. prove the Metronome configuration/client boundary;
2. add the database model and migration;
3. add recoverable customer/contract provisioning;
4. add price preview, balance read, and reservation;
5. add outcome recording and usage delivery;
6. add queue recovery;
7. run the real sandbox contract proof;
8. complete full verification and record the recovery decision.

Use test-driven development for every behavior-changing task: write the focused failing test, run it to observe the expected failure, implement the smallest production change, rerun the focused test, then continue.

Do not begin a later task while an earlier task's targeted tests fail.

## 3. Task 1 — Add the official Metronome client and validated configuration

### Files to modify

- `packages/twenty-server/package.json`
- `yarn.lock`
- `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts`
- `packages/twenty-server/src/engine/core-modules/twenty-config/enums/config-variables-group.enum.ts`
- `packages/twenty-server/src/engine/core-modules/twenty-config/constants/config-variables-group-metadata.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/metronome-client.service.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/types/safe-metronome-event-properties.type.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/utils/validate-safe-metronome-event-properties.util.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/metronome-client.service.spec.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/validate-safe-metronome-event-properties.util.spec.ts`

### Test-first behavior

1. Add tests for a disabled configuration:
   - no SDK client is created;
   - customer provisioning, preview, balance, and ingest calls fail closed with a specific configuration error.
2. Add tests for enabled but incomplete configuration:
   - missing API key fails validation;
   - missing rate-card alias fails validation.
3. Add safe-property validation tests:
   - accepts a bounded map of primitive string, finite number, and boolean values;
   - rejects nested objects, arrays, non-finite numbers, excessive keys, oversized values, and sensitive/content-style property names;
   - returns a fresh normalized object so callers cannot mutate persisted data after validation.
4. Mock the official SDK at the service boundary and prove the wrapper:
   - uses the bearer token only server-side;
   - exposes only the exact customer, contract, preview, USD balance, event-ingest, and event-search calls needed by this module;
   - omits `credit_type_id`, requests `FINALIZED_AND_DRAFT`, and filters balance to `PREPAID_COMMIT`;
   - maps SDK failures to safe internal error codes without logging tokens or raw payloads;
   - does not add a configurable arbitrary API base URL.

### Minimal implementation

1. Add `@metronome/sdk` to `twenty-server` with Yarn so the workspace manifest and root lockfile change together.
2. Add `ConfigVariablesGroup.MANAGED_PROVIDER_BILLING_CONFIG` with a clear description that distinguishes it from Twenty Enterprise billing.
3. Add:
   - `METRONOME_ENABLED`, default `false`;
   - `METRONOME_API_KEY`, sensitive and environment-only, required when enabled;
   - `METRONOME_RATE_CARD_ALIAS`, environment-only, required when enabled;
   - `METRONOME_USAGE_SETTLEMENT_DELAY_MS`, default `30000`, minimum `10000`.
4. Construct the official SDK lazily only when enabled.
5. Keep SDK request/response types inside `MetronomeClientService`; do not leak the vendor SDK through the module's public contract.
6. Normalize event-search responses to one internal shape. Accept the sandbox-observed `billable_metrics` and the OpenAPI-documented `matched_billable_metrics` behind focused tests; remove the compatibility branch once Metronome aligns them.
7. Export the client service only to the other services in this focused module.

### Verification

```bash
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/validate-safe-metronome-event-properties.util.spec.ts --runInBand
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/metronome-client.service.spec.ts --runInBand
```

## 4. Task 2 — Add the operation journal and workspace mapping migration

### Files to modify

- `packages/twenty-server/src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity.ts`
- `packages/twenty-server/src/database/commands/upgrade-version-command/instance-commands.constant.ts`
- `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-upgrade-version-command.module.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/entities/managed-provider-operation.entity.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/enums/managed-provider-operation-state.enum.ts`
- `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-create-managed-provider-billing-foundation.ts`
- `packages/twenty-server/src/database/commands/upgrade-version-command/2-19/__tests__/create-managed-provider-billing-foundation.instance-command.spec.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-operation.entity.spec.ts`

If a newer `2-19` command reaches `origin/main` before implementation begins, rebase first and change `1784112963056` once to a unique value later than the new maximum. Use the final value consistently in the filename, decorator, module, constants, and test.

### Test-first behavior

1. Write the migration command test before the command:
   - `up()` adds nullable `metronomeCustomerId` to `core.myahWorkspaceInstallation`;
   - adds a unique partial index for non-null Metronome customer IDs;
   - creates `core.managedProviderOperation`;
   - creates the workspace foreign key with `ON DELETE CASCADE`, matching the existing installation lifecycle;
   - creates named replay/provider-completion uniqueness constraints;
   - creates pending-delivery and stale-reservation indexes;
   - creates non-negative amount and valid-state check constraints;
   - `down()` drops only the new table, index, and installation column in safe reverse order.
2. Add entity metadata tests for exact database names, nullability, integer/numeric mapping, indexes, and enum values.
3. Prove timestamps and delivery metadata are nullable only in the lifecycle states where they are not yet known.

### Data model

`MyahWorkspaceInstallationEntity` gains:

```ts
metronomeCustomerId: string | null;
```

`ManagedProviderOperationEntity` contains:

- UUID `id`;
- `workspaceId`;
- nullable `actorUserWorkspaceId`;
- `requestId`;
- `providerKey`;
- `providerConfigurationKey`;
- `operationKey`;
- `metronomeEventType`;
- JSONB `maximumUsageProperties`;
- nullable JSONB `actualUsageProperties`;
- integer USD-cent `reservedAmountCents`;
- nullable integer USD-cent `quotedActualAmountCents`;
- nullable `providerExecutionId`;
- nullable integer `providerCostMicrousd`;
- `state`;
- `deliveryAttemptCount`;
- `settlementAttemptCount`;
- nullable `nextDeliveryAttemptAt`;
- nullable `settleAfter`;
- nullable safe `lastDeliveryErrorCode`;
- `createdAt`, `updatedAt`, and nullable `completedAt`, `metronomeAcceptedAt`, `settledAt`, `releasedAt`.

Use PostgreSQL `bigint` for USD-cent and provider-cost integers and map them through TypeORM as strings or a tested lossless transformer. Do not expose values as an unsafe JavaScript `number`.

### Verification

```bash
yarn workspace twenty-server jest src/database/commands/upgrade-version-command/2-19/__tests__/create-managed-provider-billing-foundation.instance-command.spec.ts --runInBand
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-operation.entity.spec.ts --runInBand
```

## 5. Task 3 — Add recoverable Metronome customer and contract provisioning

### Files to modify

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/constants/metronome-workspace-alias-prefix.constant.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/metronome-workspace-customer.service.spec.ts`

### Test-first behavior

Cover:

1. a stored `metronomeCustomerId` returns without a remote create;
2. an exact `myah-workspace:<workspaceId>` alias lookup reuses the existing customer;
3. an absent alias creates one customer with the workspace's safe display name and deterministic alias;
4. an HTTP/SDK conflict after a concurrent create triggers alias lookup and reuses the winner;
5. an uncertain create result triggers alias recovery before another create is attempted;
6. two local callers converge on one stored customer ID;
7. a conflicting stored customer ID fails explicitly rather than being overwritten;
8. an archived or multiply matched alias requires reconciliation;
9. missing workspace installation or disabled Metronome fails closed;
10. contract creation uses deterministic uniqueness key `myah-workspace-contract:<workspaceId>` and configured rate-card alias;
11. an observed `409 Conflict` uniqueness replay calls `/v2/contracts/list`, then succeeds only when exactly one current contract uses the expected rate card;
12. a generic conflict, missing contract, multiple current contracts, or mismatched rate card requires reconciliation;
13. tests prove the disabled legacy `/v1/contracts/list` endpoint is never called.

### Minimal implementation

1. Register `MyahWorkspaceInstallationEntity`, `WorkspaceEntity`, and `ManagedProviderOperationEntity` with `TypeOrmModule.forFeature`.
2. Implement `ensureWorkspaceCustomer(workspaceId)` using stored ID → exact ingest-alias lookup → create → 409/uncertain recovery. Metronome sandbox alias uniqueness is the external guard.
3. Persist the customer ID with a conditional update and reload; never replace a different ID silently.
4. Implement `ensureWorkspaceContract` as a separate repeat-safe step using v2 recovery. Do not use the composite endpoint whose availability is tenant dependent.
5. Do not create a provider-account table or store Stripe/customer payment details.

### Verification

```bash
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/metronome-workspace-customer.service.spec.ts --runInBand
```

## 6. Task 4 — Add Metronome USD quote, prepaid balance, and concurrent reservation

### Files to modify

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/managed-provider-operation.service.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/types/reserve-managed-provider-operation.input.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/types/complete-managed-provider-operation.input.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.exception.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-operation.service.spec.ts`

### Test-first reservation behavior

1. Metronome preview receives one worst-case event with `mode: "replace"`.
2. The returned draft invoices:
   - must belong to the workspace customer and current contract;
   - may have post-balance `invoice.total === 0` and must never use it as the reservation;
   - must contain only the reviewed service's expected billable usage products;
   - must sum matching pre-balance usage-line totals into one positive lossless integer USD-cent reservation;
   - must fail closed on unexpected products, invoices, billable line types, fractional cents, negative values, or unsafe numbers.
3. A sandbox-shaped fixture proves quantity 7, usage-line total 7, and invoice total 0 reserves 7 cents.
4. Multiple preview events aggregated into one line and multiple matching usage lines both calculate correctly.
5. Balance lookup omits `credit_type_id`, uses `FINALIZED_AND_DRAFT`, filters to `PREPAID_COMMIT`, and requires a finite non-negative safe-integer cent result.
6. Promotional `CREDIT` and `POSTPAID_COMMIT` balances are not included in authorization.
7. A transaction locks the workspace installation with `pessimistic_write`.
8. Available prepaid USD cents equal remote balance minus local reservations in:
   - `RESERVED`;
   - `USAGE_PENDING`;
   - `USAGE_ACCEPTED`;
   - `RECONCILIATION_REQUIRED`.
9. Sufficient prepaid balance creates one `RESERVED` row.
10. Insufficient prepaid balance creates no row and returns a specific insufficient-prepaid-balance error.
11. Two concurrent requests that each fit alone but not together result in one reservation and one rejection.
12. Exact `(workspaceId, requestId)` replay returns the original row without another preview, balance decision, or reservation.
13. The same request ID with changed provider, operation, event type, maximum properties, expected product mapping, configuration identity, or actor fails as a conflict.
14. Missing/ambiguous preview data, remote failure, malformed amount, or missing customer mapping fails closed.

### Minimal implementation

1. Keep Metronome preview and balance calls outside the short database transaction.
2. Recheck the exact replay under the transaction lock.
3. Sum active `reservedAmountCents` using a database aggregate, not JavaScript iteration over all rows.
4. Compare `bigint` cent values only.
5. Export `reserveOperation` for future internal provider adapters.
6. Add no resolver, controller, public DTO, generic service catalog, or dynamic pricing client.

### Test-first completion behavior

Cover:

1. a billable completion locks the operation, validates its immutable identity, saves only safe provider/usage facts, and enters `USAGE_PENDING`;
2. provider-reported actual cost is accepted only as a non-negative integer `providerCostMicrousd`;
3. an exact completion replay is a no-op;
4. conflicting completion facts fail without altering the first receipt;
5. a known non-billable failure enters `RELEASED` and sets `releasedAt`;
6. an unknown outcome enters `RECONCILIATION_REQUIRED` and retains the reservation;
7. completion cannot move a terminal row backward;
8. no prompt, output, mailbox content, API key, header, or raw response can enter persisted properties.

### Verification

```bash
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-operation.service.spec.ts --runInBand
```

## 7. Task 5 — Add repeat-safe Metronome usage delivery

### Files to modify

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/managed-provider-usage-delivery.service.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/jobs/deliver-managed-provider-usage.job.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/types/deliver-managed-provider-usage-job-data.type.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-usage-delivery.service.spec.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/deliver-managed-provider-usage.job.spec.ts`

### Test-first behavior

1. The delivery service loads only `USAGE_PENDING` rows and handles terminal rows as no-ops.
2. It previews actual usage through Metronome before ingest.
3. It validates customer, contract, expected usage products, and the lossless sum of pre-balance USD-cent usage-line totals.
4. If `quotedActualAmountCents` exceeds `reservedAmountCents` or contains unexpected billable lines, it enters `RECONCILIATION_REQUIRED`, retains the reservation, emits an operational alert, and sends no usage.
5. Otherwise it submits one event containing:
   - deterministic transaction ID derived from operation UUID;
   - deterministic workspace customer alias;
   - original Metronome event type;
   - exact persisted, normalized actual usage properties;
   - safe operation/provider attribution.
6. A successful ingest locks and moves the row to `USAGE_ACCEPTED`, sets `metronomeAcceptedAt` and `settleAfter`, and keeps the reservation active.
7. A timeout or retryable failure leaves `USAGE_PENDING`, increments attempts, stores only a safe error code, and schedules the next attempt.
8. A retry sends the identical transaction ID and canonical payload; local payload drift fails before calling Metronome.
9. Tests reproduce the observed Metronome behavior where exact and conflicting duplicate events both return 200 but charge only the first event.
10. A first delivery older than Metronome's 34-day window moves to `RECONCILIATION_REQUIRED`.
11. The queue job accepts only an operation ID, delegates once, and uses the existing workspace queue.
12. The completion service enqueues after its database commit with a deterministic queue job ID and bounded retry limit.

### Minimal implementation

1. Use the official SDK's event-ingest method; do not add a custom HTTP client.
2. Use `MessageQueue.workspaceQueue`, `@Processor`, and `@Process` following existing queue jobs.
3. Pass `{ id: "managed-provider-usage:<operationId>", retryLimit: 3 }` when enqueuing immediate delivery.
4. Keep retry and settlement timing in the operation row so database recovery does not depend on queue history.
5. Treat ingest 200 as acceptance, not balance settlement; never release on preview or ingest success.

### Verification

```bash
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-usage-delivery.service.spec.ts --runInBand
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/deliver-managed-provider-usage.job.spec.ts --runInBand
```

## 8. Task 6 — Add database-backed recovery and stale-reservation alerting

### Files to modify

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/crons/managed-provider-billing-recovery.cron.job.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/crons/commands/managed-provider-billing-recovery.cron.command.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/constants/managed-provider-billing-recovery-cron-pattern.constant.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/services/managed-provider-billing-recovery.service.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-billing-recovery.service.spec.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-billing-recovery.cron.job.spec.ts`

### Test-first behavior

1. The recovery query selects due `USAGE_PENDING` and `USAGE_ACCEPTED` rows in bounded batches.
2. It re-enqueues deterministic delivery jobs without changing billing facts.
3. After `settleAfter`, it batch-searches accepted transaction IDs with backoff.
4. Settlement requires exactly one non-duplicate event matched to the expected customer and billable metric, semantically equal normalized properties, and a successful fresh `FINALIZED_AND_DRAFT` balance read.
5. Event-search properties returned as strings normalize safely before comparison.
6. A valid settled event moves to `USAGE_SETTLED`, sets `settledAt`, and only then removes `reservedAmountCents` from available-prepaid-balance subtraction.
7. Missing, conflicting, unmatched, or over-age events retain the reservation and retry or enter `RECONCILIATION_REQUIRED`.
8. A 429 event-search response honors backoff and does not release any reservation.
9. Stale `RESERVED` rows move nowhere automatically; the service alerts for future provider reconciliation.
10. `RECONCILIATION_REQUIRED` rows are reported without queueing provider work.
11. Concurrent recovery runs are safe because queue IDs are deterministic and row transitions are locked.
12. Disabled Metronome skips remote work but still reports pending/stale counts.
13. Pagination prevents an unbounded scan or memory allocation.

### Minimal implementation

1. Follow the existing cron command/job registration pattern.
2. Use one conservative recurring schedule constant and bounded batch size.
3. Batch event-search transaction IDs; do not poll one accepted operation in a tight loop.
4. Register the cron job, command, recovery service, delivery processor, and settlement transition as module providers.
5. Never delete operation rows or release unverified reservations.

### Verification

```bash
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-billing-recovery.service.spec.ts --runInBand
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-billing-recovery.cron.job.spec.ts --runInBand
```

## 9. Task 7 — Register the Community-safe module and prove its boundary

### Files to modify

- `packages/twenty-server/src/engine/core-modules/myah/myah.module.ts`
- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/managed-provider-billing.module.ts`

### Files to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-billing.module.spec.ts`

### Test-first behavior

1. Build a focused Nest testing module with the explicit managed-provider-billing imports and mocked external SDK.
2. Assert the module can instantiate with no Enterprise key.
3. Recursively inspect resolved Nest imports and fail on Enterprise:
   - `BillingModule`;
   - `AiBillingModule`;
   - Stripe billing modules;
   - resource-credit modules.
4. Separately scan production source imports under `managed-provider-billing/` and fail on:
   - `src/engine/core-modules/billing/`;
   - `src/engine/metadata-modules/ai/ai-billing/`.
5. Assert there is no resolver or controller metadata in the module.
6. Assert exactly one `ManagedProviderBillingModule` instance is reachable through `MyahModule`, rather than importing it directly from `CoreEngineModule`.

### Verification

```bash
yarn workspace twenty-server jest src/engine/core-modules/managed-provider-billing/__tests__/managed-provider-billing.module.spec.ts --runInBand
```

## 10. Task 8 — Complete and automate the Metronome prepaid-USD sandbox contract proof

### File to create

- `packages/twenty-server/src/engine/core-modules/managed-provider-billing/__tests__/metronome-sandbox.contract.spec.ts`

This test is excluded from ordinary deterministic unit runs and executes only when an explicit sandbox-test environment flag and sandbox credentials are present. It must never accept production credentials.

### Evidence already observed on 2026-07-15

Using an isolated MYAH-149 USD-cents fixture:

- deterministic customer alias create/recovery succeeded; a duplicate alias returned 409;
- rate-card alias provisioning succeeded; rate start required an exact hour boundary;
- contract uniqueness replay returned 409 and `/v2/contracts/list` recovered one current contract;
- temporary test credit produced balance 100 solely for the earlier API-mechanics proof;
- previewing seven units produced usage-line total 7, post-balance invoice total 0, and no balance mutation;
- same-product events of two and three units aggregated to one five-unit usage line;
- first ingest charged seven units and exact replay charged nothing again;
- a conflicting duplicate also returned 200 and preserved the first charge;
- event search returned one original and two duplicate audit rows, including the conflicting payload;
- event-search properties were strings and the response used `billable_metrics` instead of OpenAPI's `matched_billable_metrics`;
- measured event matching was about 6.0 seconds and net-balance projection about 6.3–7.0 seconds after ingest acceptance;
- aggressive event-search polling returned 429.

The existing temporary credit is not accepted as evidence for the revised prepaid policy. No credential or object ID belongs in source control.

### Remaining sandbox setup

Prepare:

- a production-shaped USD-cents rate card addressable by `METRONOME_RATE_CARD_ALIAS`;
- one controlled provider-service fixture with a documented provider cost in micro-USD and a customer unit price equal to `ceil(providerCostMicrousd / 7000)`;
- Stripe test-mode integration and a payment-gated `PREPAID_COMMIT` top-up path.

Store all configured IDs only in the secure sandbox environment.

### Automated contract scenarios

1. Recover the existing customer by exact deterministic alias.
2. Replay contract creation with one uniqueness key and recover one current contract through `/v2/contracts/list`.
3. Preview one billing unit for the controlled service and assert the matching USD-cent usage-line price equals `ceil(providerCostMicrousd / 7000)` and provides at least 30% gross margin.
4. Preview a worst-case event with `mode: "replace"` and assert matching pre-balance usage-line totals rather than invoice total.
5. Call net balance without `credit_type_id`, with `FINALIZED_AND_DRAFT`, and with `PREPAID_COMMIT` as the only balance type.
6. Prove promotional credits and postpaid commitments do not increase the amount eligible for managed provider execution.
7. Ingest one actual event; record acceptance, event-match, and balance-settlement latency.
8. Submit the same transaction ID twice and confirm one billed event plus duplicate audit evidence.
9. Submit the same transaction ID with conflicting properties and confirm Myah's local immutable-payload guard rejects it before ingest.
10. Batch event-search reconciliation and exercise 429 backoff.
11. Simulate a delayed retry within the 34-day window.
12. Complete a Stripe test-mode payment-gated top-up and confirm its prepaid USD commitment becomes spendable only after successful payment.
13. Fail a Stripe test-mode payment and confirm no spendable prepaid balance is released.
14. Exercise the documented correction mechanism or record it as unresolved and keep automated correction disabled.

### Production gate

Do not enable `METRONOME_ENABLED` in production unless:

- every enabled service's reviewed fixed price and Metronome preview satisfy the 30% gross-margin formula;
- pre-balance USD-cent usage-line extraction is unambiguous and lossless;
- authorization uses only payment-backed `PREPAID_COMMIT` balance;
- settlement delay is conservatively above measured event and balance projection latency;
- duplicate, conflicting, and event-search response behavior matches the decoder;
- the tenant's plan includes every endpoint;
- payment success/failure behavior is proven;
- unresolved correction behavior remains fail-closed.

### Verification

Run only against the sandbox environment:

```bash
RUN_METRONOME_SANDBOX_CONTRACT_TESTS=true \
  yarn workspace twenty-server jest \
  src/engine/core-modules/managed-provider-billing/__tests__/metronome-sandbox.contract.spec.ts \
  --runInBand
```

Record the reviewed provider cost, expected customer price, exact timestamps, safe transaction IDs, response statuses, before/after prepaid balances, and dashboard evidence in MYAH-149 or the pull request. Record no token, customer PII, internal customer ID, or raw credential.

## 11. Task 9 — Full verification and delivery record

### Targeted suite

```bash
yarn workspace twenty-server jest \
  src/engine/core-modules/managed-provider-billing/__tests__ \
  src/database/commands/upgrade-version-command/2-19/__tests__/create-managed-provider-billing-foundation.instance-command.spec.ts \
  --runInBand
```

Exclude the real sandbox contract test unless its explicit sandbox flag is set.

### Package verification

Run the package's actual focused lint/typecheck/build commands. Use the repository's remote Linux workflow for CPU/RAM-heavy commands:

```bash
omp-myah-remote-test -- <portable yarn nx test|typecheck|build command>
```

If remote execution is unavailable, use one targeted local command at a time with `--runInBand` or the package's lowest safe worker count. Do not terminate OMP processes to recover memory.

### Smoke verification

With a local database and mocked Metronome boundary:

1. reserve one operation;
2. replay the same request and observe the same operation ID;
3. complete it with billable usage;
4. simulate one ingest timeout;
5. run the delivery job again;
6. confirm one deterministic canonical payload and `USAGE_ACCEPTED`;
7. confirm the accepted reservation remains counted before `settleAfter`;
8. run settlement recovery with one matched original event and fresh balance, then confirm `USAGE_SETTLED`;
9. confirm the settled reservation is no longer counted;
10. replay a conflicting payload and confirm it fails before Metronome;
11. create an unknown outcome and confirm its reservation remains active;
12. run the recovery cron and confirm it queues only Metronome delivery/settlement, never provider work.

With the real sandbox, run Task 8 separately and preserve its evidence.

### Static boundary review

Confirm:

- no production import references either prohibited Enterprise billing path;
- no GraphQL resolver or REST controller exposes the module;
- no OpenRouter or Icemail SDK/client is added;
- no table represents a workspace balance, credit, payment, invoice, or rate card;
- no API key, prompt, completion, email content, or raw provider payload appears in fixtures, logs, events, or entities;
- migration `down()` is symmetric;
- the module is registered once.

### Prior-work recovery record

Record that no prior spike commit was cherry-picked:

- `aded80dc618828a4e1ea1939e6b83371ffd23a83` mixes a 48-file provider-ledger base with OpenRouter, Icemail, admin/configuration, and broader policy work;
- `5fe7ef5fb4de8debde403098c1f85bb5258258d0`, `8ea3dfe785dd3fc656321c9a325269fb146b230c`, `a2e82a81c18a2e044084bea58b8b783aff0729748`, `dc9551ff44d2ed7cf4e449b6feec74042d12460d`, `63c0f9f076101c669b6e369a0c8921216c6faebd`, `a1188bb08f8e4e17c09a96c0ef1f4825008abda5`, and `8a8ef813af68e4550523cfbe9aefe7f9e6d3ddf5` depend on that mixed base;
- `4a426cf900ee5975050ea5192bcdcb6e80f888c0` depends on the prior provider entities and introduces a competing debit/outbox model.

State that the new implementation reuses only the reviewed invariants and current repository patterns.

## 12. Final acceptance checklist

- [ ] Metronome configuration is server-only, validated, and disabled by default.
- [ ] One workspace maps recoverably to one Metronome customer.
- [ ] Contract creation is repeat-safe through a deterministic uniqueness key.
- [ ] Customer charges and balances use Metronome's built-in USD-cents unit.
- [ ] Net-balance authorization includes only `PREPAID_COMMIT`, not promotional credits or postpaid commitments.
- [ ] Every enabled provider service has a reviewed fixed price equal to `ceil(providerCostMicrousd / 7000)` and at least 30% gross margin.
- [ ] Metronome—not caller-supplied pricing—prices maximum and actual usage.
- [ ] Concurrent requests cannot claim the same remaining prepaid USD.
- [ ] Exact replays are idempotent and conflicting replays fail.
- [ ] Billable outcomes are durable before acknowledgment.
- [ ] Known no-cost failures release reservations.
- [ ] Unknown outcomes and over-reservation quotes retain reservations.
- [ ] Usage delivery survives queue/process failure and reuses one transaction ID.
- [ ] Metronome acceptance retains the reservation until delayed event/balance settlement.
- [ ] The 34-day delivery boundary is enforced.
- [ ] Recovery re-enqueues only billing delivery, never provider work.
- [ ] Fixed-price, prepaid-payment, settlement-latency, duplicate, endpoint-entitlement, and correction gates pass.
- [ ] No Myah balance, Stripe, invoice, database rate card, generic pricing engine, or provider-specific catalog entry exists in this issue.
- [ ] No OpenRouter or Icemail execution exists in this issue.
- [ ] No Enterprise billing import or key is required.
- [ ] Focused tests, migration checks, smoke flow, typecheck/lint/build, and sandbox evidence are recorded.

## 13. Official implementation references

- [Metronome OpenAPI](https://api.metronome.com/v1/docs/openapi)
- [Metronome Node SDK](https://github.com/Metronome-Industries/metronome-node)
- [Metronome API idempotency](https://docs.metronome.com/api-reference/idempotency)
- [Metronome event ingestion](https://docs.metronome.com/api-reference/usage/ingest-events)
- [Metronome event-cost preview](https://docs.metronome.com/guides/customers-billing/optimize-customer-experience/preview-event-cost)
- [Metronome net balance](https://docs.metronome.com/api-reference/credits-and-commits/get-the-net-balance-of-a-customer)
- [Metronome zero overages](https://docs.metronome.com/guides/pricing-packaging/apply-credits-and-commits/guarantee-zero-overages)
- [Metronome payment-gated commits](https://docs.metronome.com/guides/pricing-packaging/apply-credits-and-commits/manual-payment-gated-commits)
- [OpenRouter OpenAPI](https://openrouter.ai/openapi.json)
