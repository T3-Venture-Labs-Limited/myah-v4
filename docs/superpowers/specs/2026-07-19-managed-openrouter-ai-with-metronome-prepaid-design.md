# Managed OpenRouter AI with Metronome Prepaid Billing

**Status:** Approved design  
**Linear owner:** [MYAH-216 — Implement managed OpenRouter AI with Metronome prepaid billing](https://linear.app/t3labs/issue/MYAH-216/implement-managed-openrouter-ai-with-metronome-prepaid-billing)  
**Project / milestone:** `myah` / Stage 1 — Ready for paid design partners  
**Canonical branch:** `daryll/myah-216-implement-managed-openrouter-ai-with-metronome-prepaid`

## 1. Decision summary

Myah will make Twenty's existing AI assistant, workflow AI actions, and every other server-side OpenRouter generation path available through one Myah-owned OpenRouter credential. Eligible workspace members select from a small Myah-managed model catalogue and never configure a provider key.

Every OpenRouter generation is authorized against the workspace's shared Metronome balance before provider I/O. MYAH-149 remains the reservation, completion, durable usage-delivery, and recovery foundation. MYAH-216 adds only the provider-specific catalogue, AI SDK model wrapper, OpenRouter request/receipt adapter, bounded reconciliation, and sponsored-credit operation needed by the first managed service.

Metronome remains authoritative for contracts, prepaid commitments, approved test credits, accepted usage, customer balances, settlement, and correction history. Myah does not add a wallet or customer balance ledger.

The commercial target is at least 30% gross margin, not a 30% markup. Customer usage is billed in whole USD cents with a one-cent minimum per OpenRouter generation. Because Metronome's public documentation does not define a cross-dimensional per-event minimum, the provider adapter deterministically emits integer `charge_cent_unit` usage and Metronome rates each unit at $0.01. This topology remains disabled until the Metronome sandbox proves preview, reservation, completion, delivery, settlement, and duplicate suppression.

Myah's owner manually tops up the shared OpenRouter vendor account and records the measured cash-to-credit multiplier before activation. The first customer rollout uses operator-granted Metronome sponsored credits. Customer Stripe top-ups and automatic recharge remain in MYAH-147; general availability waits for that self-service funding path.

## 2. Two-person-team design constraints

This design deliberately chooses the smallest system that closes the financial and security contracts:

- one OpenRouter provider;
- one source-controlled launch catalogue;
- one context-bound AI SDK wrapper;
- one OpenRouter-specific `fetch` extension;
- one Metronome event and product;
- MYAH-149's existing operation state machine and recovery cron;
- one small sponsored-grant operation record;
- one authoritative admin GraphQL/API surface;
- no new microservice, reverse proxy, billing daemon, customer wallet, generic provider plugin framework, or customer funding UI.

Complexity is retained only where omitting it could duplicate provider cost, leak credentials or content, overspend a prepaid workspace, misstate funding, or hold customer funds indefinitely.

## 3. Existing platform seams

Twenty already supplies the user-facing and execution architecture:

- `AiModelRegistryService` resolves registered provider models;
- `ProviderConfigService` resolves provider configuration;
- `SdkProviderFactoryService` creates AI SDK models;
- assistant chat uses `streamText`;
- workflow/agent execution uses `generateText`;
- the AI SDK can invoke the same model repeatedly for tool-follow-up generations;
- direct generation, title generation, evaluation, and other internal AI callers resolve the same model registry through separate call sites;
- the frontend already persists a selected assistant model and presents model choices.

The installed server uses `ai` 6.0.97, `@ai-sdk/openai-compatible` 2.0.x, and the AI SDK Language Model V3 provider contract. `wrapGenerate` and `wrapStream` middleware see each low-level generation. Generate results expose usage, finish reason, response headers, response data, and provider metadata. Stream results expose initial response headers and finish/usage stream parts. Call options expose abort signals, headers, and provider options.

The OpenAI-compatible provider accepts `user`, but its current option schema strips OpenRouter-only `max_price` and `require_parameters`. MYAH-216 therefore uses one OpenRouter-only custom `fetch` wrapper to inject those reviewed request fields and capture `X-Generation-Id`. It does not fork or patch the dependency.

## 4. Scope

### 4.1 Included

1. A server-owned OpenRouter provider configuration and credential.
2. Four reviewed launch model records and a managed default.
3. Managed-only server authorization for eligible Myah workspaces.
4. Existing model-selector integration without a new chat or workflow UI.
5. A per-request AI SDK model wrapper covering streaming, non-streaming, tool-follow-up, title, direct generation, evaluation, and every other server OpenRouter generation path.
6. A custom OpenRouter `fetch` extension for routing guards and early generation-ID capture.
7. One MYAH-149 reservation and receipt per low-level OpenRouter generation.
8. Fixed, versioned model tariffs targeting at least 30% gross margin.
9. Integer-cent Metronome usage with a one-cent minimum per generation.
10. Immutable OpenRouter inference-credit, reviewed reference-cost, tariff, and billed-cent receipt facts with derived cash margin.
11. No-retry unknown-outcome reconciliation through OpenRouter's generation lookup.
12. A 24-hour automatic-reconciliation window and seven-day maximum reservation hold.
13. Metronome-native sponsored credits only.
14. One grant-operator permission and server-only grant mutation.
15. Focused contract tests, Metronome sandbox proof, real free-route and minimal paid OpenRouter proofs, and assistant/workflow smoke tests.
16. Workspace-by-workspace rollout, model quarantine, and safe rollback.
17. One durable, non-financial provider-pool admission fence that makes tariff pause/drain/activation race-proof.

### 4.2 Explicit non-goals

- Stripe checkout, customer top-ups, or automatic recharge; MYAH-147 owns them.
- OpenRouter credit-purchase automation; Myah's owner manually funds the shared vendor account.
- Offline customer-payment recording or prepaid-commitment creation without Stripe.
- Automated sponsored-grant correction.
- Customer-facing balance, usage, or billing settings; MYAH-150 owns them.
- Production-wide provider dashboards and escalation tooling; MYAH-172 owns them.
- Icemail execution or mailbox provisioning; MYAH-189 remains a separate Stage 6 design and future PR.
- Per-member balances, budgets, or allowances.
- Customer-supplied AI provider keys in managed Myah workspaces.
- OpenRouter OAuth.
- OpenRouter-native web search.
- A new AI assistant, workflow engine, model selector, reverse proxy, gateway service, or generic provider SDK.
- Dynamic provider-price lookup during customer requests.
- A local customer wallet, balance table, fractional-charge accumulator, pricing ledger, invoice system, or payment ledger.
- A catalogue polling daemon or broad admin funding console.
- A separate activation command or public mutation; source-controlled desired state is reconciled against one internal provider-pool admission fence, and existing focused tests, the grant API, provider contracts, and application smoke produce activation evidence.

## 5. Workspace and model policy

### 5.1 Balance ownership and attribution

One Myah workspace maps to one Metronome customer and owns one shared eligible balance. Every managed generation records both:

- the workspace billing identity; and
- the initiating `userWorkspaceId` when a member initiated the operation.

Background operations may have a null initiating member but still require a workspace billing identity. Per-member caps are deferred.

### 5.2 Managed-only provider policy

A managed Myah workspace may execute only Myah's approved OpenRouter models. This is enforced in server-side provider/model resolution using the durable workspace profile or feature state. Hiding settings in the browser is not authorization.

The server rejects stale or crafted requests that select:

- a custom provider;
- a BYOK provider;
- a disabled model;
- an unknown tariff version;
- a test-only model outside its approved audience; or
- a model whose price or maximum-usage contract is not verified.

Non-Myah upstream Twenty profiles retain their existing provider behavior.

### 5.3 Managed default

`deepseek/deepseek-v4-flash` is the managed default for an eligible workspace, agent, or AI action that has not selected a model. This preserves the zero-provider-configuration experience while choosing the lowest-cost paid launch model.

### 5.4 User-facing launch catalogue

| OpenRouter ID | Myah label | Audience |
| --- | --- | --- |
| `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash | funded eligible workspaces; default |
| `x-ai/grok-4.5` | Grok 4.5 | funded eligible workspaces |
| `openai/gpt-5.6-luna` | GPT-5.6 Luna | funded eligible workspaces |
| `google/gemma-4-31b-it:free` | Gemma 4 31B — Temporary Test Tariff | Myah team and explicitly approved test/design-partner workspaces only |

The `:free` suffix is never shown as a customer price. It describes the upstream OpenRouter route, not the Myah tariff.

## 6. Dated OpenRouter catalogue baseline

The implementation revalidates this source-controlled baseline before activation. Historical receipts retain the selected tariff version even after a later catalogue update.

| Model | Canonical slug | Context | Advertised max completion | Modalities | Tool / structured-output support |
| --- | --- | ---: | ---: | --- | --- |
| `deepseek/deepseek-v4-flash` | `deepseek/deepseek-v4-flash-20260423` | 1,048,576 | catalogue `null`; Myah cap 128,000 | text to text | yes |
| `x-ai/grok-4.5` | `x-ai/grok-4.5-20260708` | 500,000 | catalogue `null`; Myah cap 128,000 | text, image, file to text | yes |
| `openai/gpt-5.6-luna` | `openai/gpt-5.6-luna-20260709` | 1,050,000 | 128,000 | text, image, file to text | yes |
| `google/gemma-4-31b-it:free` | `google/gemma-4-31b-it-20260402` | 262,144 | 32,768 | text, image, video to text | yes |
| paid reference `google/gemma-4-31b-it` | `google/gemma-4-31b-it-20260402` | 262,144 | 262,144 | text, image, video to text | yes |

`null` remains an explicit live-catalogue fact, not an inferred upstream maximum. DeepSeek and Grok instead use the approved 128,000-token Myah safety cap, further bounded by remaining context. Each remains disabled until a minimal paid live call proves OpenRouter accepts the enforced bound; this does not claim an undocumented upstream maximum.

### 6.1 Current upstream cost baseline

All rates below are USD per one million units as retrieved from OpenRouter on 2026-07-19.

| Model / tier | Input | Output | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: |
| DeepSeek V4 Flash | $0.098 | $0.196 | $0.0196 | not listed |
| Grok 4.5 below 200k input | $2.00 | $6.00 | $0.30 | not listed |
| Grok 4.5 at or above 200k input | $4.00 | $12.00 | $0.60 | not listed |
| GPT-5.6 Luna below 272k input | $1.00 | $6.00 | $0.10 | $1.25 |
| GPT-5.6 Luna at or above 272k input | $2.00 | $9.00 | $0.20 | $2.50 |
| Gemma 4 31B free route | $0 | $0 | not listed | not listed |
| Gemma 4 31B paid reference | $0.22 | $0.55 | $0.12 | not listed |

OpenRouter-native web search is disabled. Its separately listed search rates do not enter the launch tariff. Normal AI SDK tool/function calling remains enabled. Reasoning tokens are recorded when reported but are not billed a second time when already included in completion pricing.

## 7. Pricing and Metronome contract

### 7.1 Commercial formula and OpenRouter credit acquisition

The target is at least 30% gross margin after the cash cost of acquiring OpenRouter credits, not merely after the catalogue inference deduction.

Myah's owner manually tops up the OpenRouter account. MYAH-216 adds no vendor-funding automation. Before paid-model activation, retain safe evidence of:

- actual cash paid, including OpenRouter purchase fee and any charged tax/FX cost;
- usable OpenRouter credits received; and
- payment timestamp/rail.

Derive one versioned exact rational multiplier from that real purchase:

```text
creditAcquisitionMultiplier =
  actualCashPaidMicrousd / usableCreditsReceivedMicrousd

preciseRetailMicrousd =
  reviewedInferenceCreditCostMicrousd
  * creditAcquisitionMultiplier
  / 0.70
```

All intermediate values remain exact rationals. Round upward only once when converting the final aggregate retail amount to whole cents.

OpenRouter documents a 5.5% fee with a $0.80 minimum for Stripe purchases and 5% for Coinbase/crypto, but does not document whether the entered amount is gross or net. The measured multiplier avoids guessing. Paid models remain disabled without a valid reviewed multiplier.

OpenRouter credits are pooled, so every later top-up computes its own measured multiplier and updates:

```text
activeCreditAcquisitionMultiplier =
  max(
    currentPoolMultiplier,
    newTopUpMultiplier
  )
```

Before every top-up, publish source-controlled `DRAINING` state with a strictly higher monotonic desired-state epoch and a digest of the complete desired-state/tariff/evidence manifest, then deploy it. Startup reconciliation must lock and durably set the provider-pool admission fence before the deployment is considered healthy. Every reservation admission locks the same row inside its transaction and requires `ACTIVE` plus an exact active tariff/evidence-version match, so old and new application instances reject while draining.

The fence applies desired state only when its epoch is greater than the persisted applied epoch. A lower epoch is a stale no-op and cannot mutate the row; the process must use the persisted row for admission. Equal epoch with a different digest is a hard configuration conflict. Equal epoch with the same digest is exact replay. These rules prevent a restarted old `ACTIVE` binary from reopening after `DRAINING`, and prevent a restarted old `DRAINING` binary from closing a newer `ACTIVE` fence.

After the fence is durably `DRAINING`, wait until no `RESERVED` or unknown/reconciliation provider operation remains bound to the active tariff anywhere in the shared OpenRouter pool. Then record the purchase, compute the conservative multiplier, and publish a new immutable tariff/evidence version with desired `ACTIVE`, another strictly higher epoch, and its exact manifest digest. Startup reconciliation locks the fence row, rechecks provider-wide quiescence and immutable evidence in the same transaction, then atomically switches the active versions/state/epoch/digest. Any missing evidence, version mismatch, stale/conflicting epoch, or unresolved prior-version operation leaves the fence closed. Only after this transaction commits may rollout admit traffic.

The fence stores only provider key, `DISABLED | DRAINING | ACTIVE`, active tariff/evidence versions, applied desired-state epoch/digest, a monotonic row version, and timestamps. It is not a wallet, price catalogue, balance, funding record, or customer ledger, and there is no public mutation or separate activation command. Prices and acquisition evidence remain immutable and source-controlled.

Every reservation and receipt immutably binds that tariff version and its multiplier-evidence version. Never lower or reset the multiplier while any prior credits or provider outcomes may remain. A lower multiplier may begin a new pool only after managed generation is paused, no provider operations are pending, and OpenRouter's authoritative balance is confirmed zero.

A completed operation whose receipt and canonical event are already durable does not block the transition: its exact charge, tariff, multiplier evidence, and deterministic transaction ID are immutable, so pending delivery/settlement never consults the newly active tariff. Tests prove that old-version delivery remains unchanged after a new version activates.

Expired or otherwise unused OpenRouter credits are recorded as a separate Myah loss. They never rewrite historical tariffs or customer charges. This conservative maximum avoids a credit-lot ledger while ensuring a mixed pool cannot understate the cash-margin target.

For Gemma's test tariff, apply the same multiplier to the paid-reference inference cost even though the actual free-route inference deduction is $0.

This is a 30% cash gross-margin target, not a 30% markup.

### 7.2 Versioned tariff records

Each source-controlled model tariff contains only the fields required by the four launch models:

- exact model ID and canonical slug;
- audience and enabled state;
- reviewed standard input/output/cache rates in integer micro-USD per million tokens;
- long-context threshold and override costs when applicable;
- reviewed context and completion bounds;
- upstream prompt and completion price ceilings;
- measured credit-acquisition multiplier and safe top-up evidence version;
- tariff version and review timestamp; and
- source URL.

This is data for one provider, not a generic pricing-expression framework.

### 7.3 Token normalization and one-cent charge unit

OpenRouter cache counts are subsets of total prompt tokens, not additional prompt tokens. Normalize mutually exclusive integer dimensions before pricing:

```text
totalPromptTokens = usage.prompt_tokens
cacheReadTokens = usage.prompt_tokens_details.cached_tokens ?? 0
cacheWriteTokens = usage.prompt_tokens_details.cache_write_tokens ?? 0
uncachedInputTokens =
  totalPromptTokens - cacheReadTokens - cacheWriteTokens
outputTokens = usage.completion_tokens
```

Require every value to be a non-negative safe integer and:

```text
cacheReadTokens + cacheWriteTokens <= totalPromptTokens
```

Select standard versus long-context tariff using `totalPromptTokens` before subtracting cache dimensions. Reasoning tokens remain a subset/detail of completion usage and are not charged again.

Use the listed cache rate when present; otherwise use the ordinary input rate for that mutually exclusive prompt portion. Invalid or overlapping provider usage is not guessed: retain the reservation, reconcile from OpenRouter generation metadata, and quarantine the tariff if authoritative facts remain inconsistent.

Calculate the reviewed inference-credit cost:

```text
referenceCostScaledNumerator =
  uncachedInputTokens * inputRateMicrousdPerMillion
  + cacheReadTokens * cacheReadRateMicrousdPerMillion
  + cacheWriteTokens * cacheWriteRateMicrousdPerMillion
  + outputTokens * outputRateMicrousdPerMillion

referenceCostMicrousd =
  referenceCostScaledNumerator / 1_000_000

retailMicrousd =
  (
    referenceCostScaledNumerator
    * actualCashPaidMicrousd
    * 100
  )
  /
  (
    1_000_000
    * usableCreditsReceivedMicrousd
    * 70
  )

chargeCentUnit =
  max(
    ceilDiv(
      referenceCostScaledNumerator
        * actualCashPaidMicrousd
        * 100,
      1_000_000
        * usableCreditsReceivedMicrousd
        * 70
        * 10_000
    ),
    1
  )
```

Implementation uses non-negative `BigInt`, exact integer products, and one final `ceilDiv`; it never uses floating point. Token/rate components are aggregated before the whole-cent ceiling.

For reservation, use the conservative maximum total prompt and output bounds. Price every maximum prompt token at the highest applicable input/cache-write/cache-read rate for the selected tier, then apply the acquisition multiplier, gross-margin formula, and whole-cent ceiling. The reserved `charge_cent_unit` is therefore an upper bound.

Myah does not accumulate sub-cent fractions across generations. Each generation has at least one billable cent unit.

### 7.4 Metronome topology

Use one event type:

```text
managed_openrouter_generation
```

Use one streaming SUM billable metric over:

```text
charge_cent_unit
```

Use one OpenRouter-generation product with a $0.01 price for one charge-cent unit. Model and tariff version remain event dimensions for reporting, reconciliation, and audit.

This design is conditional until the Metronome sandbox proves:

1. maximum-event preview returns the expected integer-cent charge;
2. the resulting amount can be reserved through MYAH-149;
3. actual usage at or below the maximum prices correctly;
4. event ingestion and settlement draw down the expected balance once;
5. duplicate delivery and the 34-day retry boundary behave as documented;
6. sponsored-credit eligibility is narrow; and
7. the model ID and tariff version survive event search and reconciliation.

A failed contract gate stops activation. It never triggers a local-wallet fallback.

### 7.5 Canonical event properties

One completed generation emits four canonical decimal-string properties:

```text
charge_cent_unit
model_id
tariff_version
operation_id
```

The Metronome customer supplies the workspace billing identity. Initiating member, token dimensions, surface, and provider route remain in the MYAH-149 receipt instead of creating a second telemetry copy.

Prompts, completions, tool payloads, credentials, headers, raw request/response bodies, and raw error strings are forbidden.

### 7.6 Provider cost and margin facts

Persist only immutable base financial facts:

- actual OpenRouter inference credits consumed;
- reviewed reference-cost numerator with fixed `1_000_000` denominator;
- measured credit-acquisition multiplier/evidence version;
- billed whole-cent quantity; and
- tariff version.

Derive cash provider cost, precise retail amount, realized cash margin, and Gemma simulated margin on read from those base facts. OpenRouter upstream-inference cost is not required for billing and is not persisted.

### 7.7 Gemma test tariff

The free and paid Gemma records share the same canonical model version. Approved test workspaces invoke `google/gemma-4-31b-it:free`, but pricing uses the paid counterpart's reviewed $0.22/M input, $0.55/M output, and $0.12/M cache-read inference-credit costs multiplied by the measured credit-acquisition multiplier.

Gemma calls:

- require sufficient manually granted eligible Metronome funds;
- make real customer-balance deductions;
- record actual OpenRouter inference-credit consumption as $0;
- record paid-reference inference-credit cost separately;
- validate the full cash-margin path; and
- remain test-only until removed or explicitly repriced before general availability.

### 7.8 Overrun loss policy

The normalized request, enforced model maximum, and price ceiling should prevent actual customer usage from exceeding the reservation. If provider evidence still implies a larger charge:

1. never submit a Metronome quantity above the authorized reservation;
2. cap customer billing at the reserved cent units;
3. preserve actual provider usage and cost as immutable facts;
4. quarantine the model/tariff before another call;
5. emit an operator alert and absorbed-cost metric;
6. record the excess as Myah loss; and
7. require reviewed correction and activation validation before re-enabling the model.

The workspace is never charged a second amount beyond its authorization.

## 8. OpenRouter provider request policy

### 8.1 Authentication

Use one server-only `OPENROUTER_API_KEY` with base URL `https://openrouter.ai/api/v1`. The key is sensitive configuration and never crosses a server response boundary.

The deployment configures OpenRouter account/key budgets as an external safety limit. Application authorization continues to use Metronome and MYAH-149.

### 8.2 Default routing with commercial and capability guards

Retain OpenRouter's normal provider ordering and fallback behavior. Every request injects:

- `require_parameters: true`;
- prompt and completion `max_price` values equal to the reviewed upstream tariff ceilings; and
- stable, non-PII `user` attribution.

The server preflight verifies the selected tariff contains both price ceilings before reservation. A contract test proves the outgoing OpenRouter request body contains the expected guard shape.

Do not require ZDR or deny provider data collection. Product terms/privacy policy must accurately disclose that OpenRouter may route to model providers with varying logging and retention policies. The AI UI links to the policy but adds no separate workspace acknowledgement gate.

Myah itself does not log or persist raw AI content in billing or provider telemetry. Any future debug sampling requires a separately approved retention and access design.

### 8.3 Native web search

OpenRouter-native web search is disabled. Existing Twenty/Myah tools and ordinary function calling remain available.

### 8.4 Automatic retries

Managed OpenRouter generation POST requests use no AI SDK automatic retry. OpenRouter does not document a generation idempotency key. A user or workflow may start a later, explicit new operation only after the prior outcome is resolved according to the error policy.

Metronome event delivery retains MYAH-149's deterministic transaction-ID retries only within Metronome's documented 34-day duplicate-suppression period. Retry scheduling stops before that boundary; unresolved delivery moves to operator reconciliation rather than risking a later duplicate charge.

## 9. Context-bound AI SDK wrapper

### 9.1 Raw-model caching and request context

`AiModelRegistryService` may continue caching raw provider models. Workspace/member billing context must never be attached to a cached shared model.

Each caller obtains a per-execution wrapped model with immutable closure context:

```text
workspaceId
userWorkspaceId | null
surface
parentExecutionId
approvedModelId
approvedTariffVersion
```

No global mutable or asynchronous singleton context is used.

### 9.2 Complete call-site coverage

Every server call site that can execute an OpenRouter model must request the managed wrapper. This includes at least:

- assistant chat streaming;
- workflow/agent execution;
- direct generation;
- title generation;
- agent monitoring/evaluation; and
- any other registry-backed OpenRouter call discovered through symbol references during implementation.

This is financial completeness, not feature expansion. An unwrapped OpenRouter call would spend the Myah provider account without a reservation or receipt.

Non-OpenRouter behavior outside the managed Myah profile remains unchanged.

### 9.3 One operation per provider generation

Each low-level `doGenerate` or `doStream` invocation creates one operation, including tool-follow-up model calls.

The operation identity combines the caller's stable parent execution identity with a deterministic invocation ordinal. Exact replay returns the existing journal fact but never automatically repeats provider work. A conflicting replay fails explicitly.

### 9.4 Immutable normalized request

Before reservation, the wrapper builds and freezes the exact provider request:

- model;
- messages;
- tool schemas;
- effective provider options;
- effective output bound;
- price/capability guards; and
- non-PII user attribution.

The same normalized request is sent to OpenRouter. A later-mutated stream or tool payload cannot change the authorized request.

### 9.5 Conservative input and output bounds

First calculate a conservative input bound over the complete serialized request, including messages, tool schemas, provider options, and protocol overhead.

Then:

```text
remainingContextTokens =
  reviewedContextWindow - conservativeInputBound

effectiveOutputBound =
  min(
    explicitRequestedMaximum ?? unlimited,
    reviewedModelMaximum,
    remainingContextTokens
  )
```

Reject before reservation when `remainingContextTokens <= 0` or the effective bound is non-positive.

Use a model tokenizer when an exact supported tokenizer is already available. Otherwise use a conservative, tested upper bound and enforce a hard serialized-request-size limit. A naive `bytes / 4` estimate is not accepted as a safety proof.

OpenRouter's live catalogue currently returns no completion maximum for DeepSeek V4 Flash or Grok 4.5. Their reviewed Myah maximum is therefore 128,000 output tokens. Each remains disabled until a minimal paid live contract call proves OpenRouter accepts that enforced bound. This is a Myah safety cap, not a claim about an undocumented upstream maximum.

The same normalized request and bounds drive the maximum tariff calculation and provider request.

### 9.6 Reservation

Before provider I/O, the wrapper calls MYAH-149 `reserveOperation` with:

- workspace and initiating member identities;
- provider key `openrouter`;
- stable configuration/tariff identity;
- stable operation/request identity;
- expected Metronome product;
- maximum `charge_cent_unit`;
- model and tariff event properties.

No OpenRouter request begins unless reservation succeeds.

### 9.7 Custom fetch extension

The OpenRouter-only `fetch` wrapper:

1. receives the already normalized AI SDK request;
2. injects the reviewed OpenRouter provider guard object;
3. forwards the abort signal and request;
4. captures `X-Generation-Id` from response headers; and
5. passes the original response through without buffering content.

OpenRouter documents `X-Generation-Id` for all endpoints. The implementation still handles a missing header as an unknown outcome rather than fabricating an ID.

### 9.8 Early provider identity persistence

MYAH-149 gains one narrow idempotent, conflict-checked operation method that attaches `providerExecutionId` while the operation is still `RESERVED`.

The fetch wrapper calls it as soon as the response header is available. This closes the crash window between provider response headers and stream completion. The method does not change customer balance, outcome, usage, or state.

### 9.9 Non-streaming completion

On normal non-streaming completion:

1. require and persist generation identity;
2. validate finish reason and numeric usage;
3. compute actual charge-cent units;
4. retain immutable inference-credit, tariff, and safe provider facts;
5. enforce the reservation ceiling;
6. durably complete the MYAH-149 operation before acknowledging success; and
7. return the original AI SDK result.

### 9.10 Streaming completion

The wrapper forwards chunks without buffering generated content. It observes finish/usage parts and final stream lifecycle.

Exactly one terminal path runs:

- normal finish with usage: billable completion;
- definite pre-execution/non-billable provider failure: release;
- abort, consumer cancellation, process interruption, or missing authoritative usage: unknown outcome and reconciliation.

Completion is idempotent. Cancellation does not imply that OpenRouter stopped billing.

## 10. Unknown-outcome reconciliation

### 10.1 No provider replay

OpenRouter generation POSTs are never automatically repeated while the outcome is unknown. Reconciliation queries:

```text
GET /api/v1/generation?id=<generation-id>
```

It uses the persisted generation ID, request/provider metadata, token usage, total account cost, streamed/cancelled facts, and provider identity.

OpenRouter's generation lookup does not expose cache-write tokens. When terminal usage was lost:

- a tariff with no distinct cache-write price may reconstruct its mutually exclusive dimensions from the documented totals and cached-token facts;
- a tariff with a distinct cache-write price must not guess or bill from incomplete dimensions;
- once the provider record conclusively shows the missing dimensions cannot be recovered, release the reservation, retain actual OpenRouter cost as absorbed Myah loss, quarantine the model/tariff, and alert an operator; and
- never re-debit the workspace if later evidence appears.

### 10.2 Reuse MYAH-149 recovery

Do not add another queue or scheduler. Reuse MYAH-149's recovery cron, operation state machine, safe error codes, and active reservation handling. Add one OpenRouter-specific branch for `providerKey = openrouter`.

### 10.3 Bounded timeline

- First 24 hours: automatic lookup with bounded exponential backoff.
- After 24 hours: lower-frequency reconciliation and an operator alert.
- At seven days: if the outcome remains unprovable, release the customer reservation.

After release:

- never re-debit the workspace for later evidence;
- preserve immutable authorization and reconciliation history;
- record any later OpenRouter cost as absorbed Myah loss; and
- emit an absorbed-cost metric so the deadline can be reviewed using evidence.

A missing generation ID follows the same deadline but requires operator/provider-account evidence rather than lookup by ID.


### 10.4 Metronome delivery deadline

Metronome suppresses duplicate transaction IDs for 34 days. Every canonical event retry reuses its original deterministic transaction ID, but automatic retries stop before 34 days from the first delivery attempt.

If delivery remains unresolved at that boundary:

- keep the receipt and delivery state unresolved;
- stop automatic event submission;
- alert an operator;
- reconcile with Metronome event/ledger evidence or support; and
- never create a fresh transaction ID for the same generation.

This deadline prevents a retry after duplicate suppression expires from charging the same generation twice.

## 11. User-visible behavior and stable errors

| Condition | Provider called? | Reservation behavior | User/workflow result |
| --- | ---: | --- | --- |
| Managed provider disabled/misconfigured | no | none | service unavailable; safe operator alert |
| Custom/BYOK provider requested | no | none | unsupported provider |
| Model disabled, stale, or audience-ineligible | no | none | model unavailable; refresh selector |
| Model maximum/rate contract unverified | no | none | model unavailable |
| Metronome preview or balance unavailable | no | none | temporary billing authorization failure |
| Insufficient available balance | no | none | preserve input; suggest cheaper eligible models/contact admin |
| Definite non-billable provider rejection | attempted | release | provider request rejected |
| Rate limit/transient error with no execution evidence | attempted | release only when definitively non-billable | manual retry allowed after resolution |
| Stream abort/disconnect with uncertain execution | yes/unknown | retain | generation interrupted; usage is being finalized |
| Unknown outcome without generation ID | unknown | retain | same pending message; operator reconciliation |
| Usage/cost overrun | yes | charge at most reservation | current result may complete; model quarantined |
| Metronome delivery delayed | yes | retain until settled | output remains successful; billing settles asynchronously |
| Seven-day unresolved deadline | unknown | release | no later customer re-debit |

Assistant and workflow paths map the same backend error codes. UI balance estimates are advisory because concurrent requests may consume funds before the locked reservation.

The UI may suggest cheaper eligible models, but it never switches automatically. Workflow actions never silently change models.

## 12. Sponsored test funding

### 12.1 Funding boundary

MYAH-216 supports one Metronome-native funding operation: a Myah-funded, expiring, product-limited sponsored credit for internal, test, goodwill, or approved design-partner use.

Customer-paid commitments, offline-payment recording, Stripe funding, automatic recharge, refunds, and funding corrections are not implemented here. MYAH-147 owns customer-funded Stripe commitments. Offline payment remains deferred until Metronome documents or contractually confirms a truthful customer-paid representation that does not create a second charge.

### 12.2 Metronome operation

Use documented:

```text
POST /v2/contracts/edit
```

with `add_credits` against the workspace's existing active contract. The credit has:

- the reviewed Myah sponsored-credit product/type identity;
- a required access schedule;
- explicit product applicability;
- a bounded expiry;
- safe reason/external-reference metadata; and
- a deterministic 1–128 character `uniqueness_key`.

Reusing a uniqueness key produces `409 Conflict` instead of a second credit. Contract editing must be enabled for the Myah Metronome tenant before activation.

### 12.3 Minimal grant-operation record

Metronome does not document lookup by uniqueness key after an ambiguous response. Keep one small operation record for grant request/outcome recovery, not a balance ledger.

Each row stores:

- immutable operation ID and workspace ID;
- grant-operator identity;
- deterministic external reference and Metronome uniqueness key;
- positive integer USD cents;
- reason, expiry, and product applicability;
- state: pending, succeeded, failed-definitive, or reconciliation-required;
- Metronome edit and credit IDs when returned;
- safe error code; and
- timestamps.

It never stores a balance, invoice, payment secret, raw Metronome response, or mutable accounting total.

### 12.4 Permission and controls

One Myah-team-only **grant operator** permission may create capped sponsored credits for allowlisted managed/test workspaces.

Backend controls require:

- target workspace eligibility and operator authorization for that target;
- configured per-grant and rate limits;
- positive integer USD cents;
- required reason, expiry, and unique external reference;
- exact replay or explicit conflict; and
- immutable audit facts.

Workspace admins cannot grant funds. MYAH-147 later gives them self-service Stripe funding.

### 12.5 Authoritative API surface

Add one Myah-team admin GraphQL/API mutation:

```text
grantManagedProviderCredit
```

Operational scripts call this same API. They do not implement separate authorization, idempotency, or Metronome logic.

Safe success output includes:

- grant-operation ID;
- workspace/customer/contract IDs;
- Metronome edit and credit IDs;
- amount/currency;
- state; and
- timestamps.

### 12.6 Ambiguous outcome

Persist `pending` before calling Metronome. On timeout or ambiguous transport failure:

1. mark reconciliation-required;
2. do not submit an uncorrelated retry;
3. use only the same uniqueness key and immutable input for any proven-safe replay;
4. treat `409` as duplicate evidence, not proof of the winning resource IDs;
5. reconcile through contract/resource reads and stored IDs when available; and
6. require operator/Metronome support review when the winning credit cannot be proven.

No local balance is granted during uncertainty.

MYAH-216 adds no automated grant-correction mutation. A mistaken grant uses a documented Metronome-native operator/support process and remains auditable; Myah never invents a negative local balance entry.

### 12.7 Eligible balance extension

MYAH-149 currently authorizes `PREPAID_COMMIT` only. MYAH-216 narrowly adds only the reviewed Myah sponsored-credit identity through explicit product/type/custom-field checks.

Arbitrary Metronome credits remain ineligible. Regression tests prove unrelated promotional or corrective credits cannot authorize OpenRouter work.

Where Metronome priority supports it, expiring sponsored credit is consumed before customer-funded commitment.

## 13. Security and privacy

- `OPENROUTER_API_KEY` and Metronome credentials are server-only sensitive configuration.
- Workspace profile and managed-provider eligibility are server-authorized.
- Model/provider IDs from clients are untrusted input.
- The OpenRouter `user` value is a stable, non-PII internal alias.
- Billing receipts, Metronome events, logs, metrics, and exceptions contain no prompts, completions, tool inputs/results, credentials, authorization headers, or raw provider payloads.
- Provider errors are mapped to bounded safe codes before persistence.
- Product terms/privacy policy is versioned and accurately describes OpenRouter routing and variable upstream retention. MYAH-216 adds no separate workspace acceptance record.
- Manual OpenRouter top-up evidence and sponsored-grant facts store safe references/amounts only, never payment secrets.
- The grant-operator permission is enforced in backend code, not only UI.
- The model price ceiling is checked server-side before reservation and injected into the outgoing OpenRouter request.
- Metronome is the only customer charge for managed OpenRouter. Managed calls bypass Twenty's native AI-credit authorization/decrement; non-managed Twenty provider behavior remains unchanged.
- The managed-provider module remains Community-safe and imports no Twenty Enterprise billing or resource-credit module. A static boundary test enforces this.

## 14. Verification strategy

Permanent tests defend observable financial, security, tenancy, lifecycle, or user contracts. Automated coverage is compact:

| Concern | Focused automated proof |
| --- | --- |
| Catalogue and tariff | Exact IDs/default/audiences; standard and long-context tiers; mutually exclusive cache dimensions; invalid usage rejection; measured top-up multiplier; paused/quiescent mixed-pool tariff transition; immutable reservation/receipt multiplier binding; exact `BigInt` arithmetic; at least 30% cash margin after final cent rounding; one-cent minimum; Gemma actual/reference separation; 128k and remaining-context bounds; no native web search; reservation never understates allowed usage. |
| Wrapper and call sites | AI SDK V3 `doGenerate`/`doStream`; tool follow-ups reserve independently; reserve-before-provider and zero calls on denial; no POST retry; early generation ID; exact-once completion; abort/cancel/error unknown paths; missing cache-write terminal usage releases, records loss, and quarantines without billing; immutable request; overrun quarantine; no raw content in billing; symbol-aware coverage of every registry-backed OpenRouter caller, including assistant and workflow. |
| Authorization and tenancy | Durable managed-workspace profile; approved models; crafted custom/BYOK/stale rejection; Gemma audience; workspace/member isolation; background workspace identity; no Twenty native-credit authorization/decrement; one Metronome charge; no platform credential exposure. |
| MYAH-149 lifecycle | Existing prepaid commitments plus only the reviewed sponsored credit remain eligible; arbitrary credits fail; early provider ID is idempotent/conflict-checked; seven-day provider-outcome release never re-debits; Metronome retries stop before 34 days; absorbed-cost evidence remains immutable. |
| Sponsored grant | Grant permission/allowlist; cap/expiry/reason/applicability; pending-before-Metronome; exact replay/conflict; deterministic uniqueness key; ambiguous `409`/timeout; returned resource IDs; no local balance or correction fallback. |

### 14.1 Metronome sandbox contract

Using isolated MYAH-216 fixture names:

1. create or verify the cent-unit product, streaming metric, rate card, and contract;
2. prove contract editing is enabled;
3. create one capped sponsored test credit;
4. preview minimum and maximum charge-unit events;
5. prove existing prepaid-commit eligibility remains unchanged, only the reviewed sponsored credit is added, and unrelated credits remain excluded;
6. ingest actual usage with model/tariff version;
7. prove deterministic duplicate suppression and the bounded retry policy;
8. prove event search, balance settlement, and reservation release; and
9. prove ambiguous sponsored-grant uniqueness-key replay behavior.

Failure stops activation and revises the design. It never produces a fallback wallet.

### 14.2 OpenRouter live contracts

Using the real managed key and `google/gemma-4-31b-it:free`:

1. perform one non-streaming wrapped generation;
2. perform one streaming wrapped generation;
3. capture and persist `X-Generation-Id`;
4. fetch generation metadata through `GET /generation`;
5. verify provider price/capability guard request shape;
6. verify normalized usage and actual inference-credit consumption;
7. deliver real Metronome cent-unit usage; and
8. prove actual cost $0, paid-reference tariff, and real balance deduction remain distinct.

Using the manually funded OpenRouter account, run one minimal non-streaming contract each for DeepSeek V4 Flash and Grok 4.5:

1. serialize the request with `max_tokens` (or the provider-equivalent field) equal to `128000`;
2. instruct the model to return exactly one token;
3. assert the captured outgoing request contains the enforced 128k bound;
4. prove OpenRouter accepts the request and returns a generation ID;
5. reconcile its real usage and inference-credit deduction; and
6. retain only bounded safe evidence.

These calls prove the reviewed cap is accepted without intentionally generating a large output. Each model remains disabled if its live contract fails.

### 14.3 User-facing smoke

Run the real application:

1. verify the published platform policy describes OpenRouter routing/upstream retention and the existing AI UI link resolves to that version;
2. grant a capped Metronome sponsored credit to the Myah-team workspace through the admin mutation;
3. sign in as a normal workspace member;
4. open the existing assistant panel;
5. verify only approved managed models appear;
6. select Gemma's temporary test tariff and receive a streamed answer;
7. execute one workflow AI action through the same wrapper;
8. verify workspace/member/model/tariff receipt attribution;
9. verify the expected rounded Metronome balance deduction and zero Twenty native-credit decrement;
10. exhaust/limit available funds and prove both surfaces block before OpenRouter;
11. submit a crafted custom-provider model ID and prove server rejection; and
12. verify no managed credential or content appears in client state, events, or logs.

This smoke path is the user-facing acceptance proof. Compilation alone is insufficient.

## 15. Rollout and rollback

### 15.1 Rollout

1. Deploy the fence-aware reservation code with Metronome and managed OpenRouter globally disabled.
2. Verify every serving instance reports the exact fence-aware revision before any `DRAINING` transition; an old instance that does not lock/read the fence is a rollout blocker.
3. Publish the versioned platform policy describing OpenRouter routing/upstream retention and verify the existing AI UI link resolves to it.
4. Configure the server-only OpenRouter key and external key budget.
5. Publish/deploy source-controlled `DRAINING` with the next desired-state epoch/digest; verify startup reconciliation durably closes the provider-pool admission fence before the deployment becomes healthy, and a restarted lower-epoch `ACTIVE` binary cannot reopen it.
6. Wait for no prior-tariff `RESERVED` or unknown/reconciliation operation across any model/workspace in the shared OpenRouter pool.
7. Manually top up OpenRouter and record measured cash/usable-credit/timestamp/rail evidence.
8. Publish/deploy the new immutable conservative multiplier/tariff/evidence version with desired `ACTIVE` and another higher epoch/digest; verify startup reconciliation atomically rechecks evidence/quiescence, opens the fence, and rejects a restarted lower-epoch `DRAINING` writer.
9. Apply and verify the source-controlled Metronome cent-unit catalogue and rate.
10. Complete the focused sandbox, provider, and static boundary contracts, including the DeepSeek/Grok 128k paid proofs.
11. Grant a capped sponsored credit to the Myah-team workspace.
12. Enable managed OpenRouter only for that workspace.
13. Run the free-Gemma assistant and workflow smoke paths.
14. Expand only to explicitly approved design-partner workspaces.
15. Keep Gemma labelled temporary test tariff.
16. Do not enable general customer rollout until MYAH-147 supplies self-service Stripe funding.
17. Remove or explicitly reprice Gemma before general availability.

### 15.2 Rollback

- publish/deploy `DISABLED` globally or disable one model/tariff;
- verify the durable admission fence closes and new reservation transactions reject immediately;
- remove disabled models from selectors;
- preserve and reconcile every existing operation;
- do not delete Metronome products, rates, events, funding entries, or receipts;
- retain quarantined tariff and absorbed-cost evidence; and
- restore only after reviewed activation validation passes.

## 16. Acceptance criteria

MYAH-216 is complete only when:

1. an eligible workspace needs no provider key or provider setup;
2. DeepSeek V4 Flash is the managed default;
3. approved managed models are selectable through Twenty's existing UI;
4. custom/BYOK providers are rejected server-side for managed workspaces;
5. every server OpenRouter generation path uses the shared wrapper;
6. every low-level generation reserves before provider I/O;
7. assistant, workflow, and tool-follow-up generations each produce one operation;
8. insufficient balance causes zero OpenRouter calls and one stable error contract;
9. the OpenRouter key and raw AI content never enter client or billing surfaces;
10. provider price/capability guards are present on every request;
11. automatic OpenRouter generation retry is disabled;
12. generation ID is durably attached before stream completion when provided;
13. successful usage stores immutable inference-credit, reference-cost, tariff, multiplier-evidence, billed-cent, and workspace/member facts;
14. every reservation and receipt binds one immutable tariff/multiplier version;
15. top-up tariff transitions publish a higher epoch/exact digest, durably pause all pool reservations, wait for no prior-tariff reserved/unknown operations, reject equal-epoch/different-digest conflicts, and make lower-epoch `ACTIVE`/`DRAINING` restarts stale no-ops;
16. derived tariffs prove at least 30% cash gross margin after conservative pooled OpenRouter credit-acquisition cost;
17. customer billing never exceeds the authorized reservation;
18. overrun quarantines the model and records absorbed Myah cost;
19. unknown provider outcomes never replay work and release no later than seven days;
20. incomplete terminal usage for a distinct cache-write tariff is never guessed or billed, and instead releases, records loss, and quarantines;
21. released unknown outcomes are never silently re-debited;
22. one Metronome cent-unit event draws down eligible balance exactly once;
23. automatic Metronome delivery retries stop before the 34-day duplicate-suppression boundary;
24. arbitrary Metronome credits cannot authorize usage;
25. an authorized grant operator can create one capped sponsored credit through the backend API;
26. ambiguous grants cannot duplicate value or create a local fallback;
27. Gemma makes real reference-priced deductions while preserving actual $0 OpenRouter inference cost;
28. DeepSeek and Grok each pass the minimal paid 128k-cap contract;
29. managed OpenRouter neither authorizes against nor decrements Twenty native AI credits;
30. the versioned platform policy contains the required OpenRouter disclosure and the existing AI UI link resolves to it;
31. OpenRouter-native web search remains disabled while normal tool calling works;
32. Metronome sandbox and real OpenRouter contracts pass;
33. real assistant and workflow smoke paths pass; and
34. rollout and rollback evidence is recorded before broader activation.

## 17. Official sources

### OpenRouter

- [Authentication](https://openrouter.ai/docs/api_reference/authentication.md)
- [Streaming](https://openrouter.ai/docs/api_reference/streaming.md)
- [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting.md)
- [Credit purchase fees](https://openrouter.ai/docs/faq.md)
- [Generation metadata lookup](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation.md)
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection.md)
- [User attribution](https://openrouter.ai/docs/cookbook/administration/user-tracking.md)
- [Live model catalogue](https://openrouter.ai/api/v1/models)
- [DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash)
- [Grok 4.5](https://openrouter.ai/x-ai/grok-4.5)
- [GPT-5.6 Luna](https://openrouter.ai/openai/gpt-5.6-luna)
- [Gemma 4 31B free route](https://openrouter.ai/google/gemma-4-31b-it:free)
- [Gemma 4 31B paid reference](https://openrouter.ai/google/gemma-4-31b-it)

### Metronome

- [Create and manage rate cards](https://docs.metronome.com/guides/implement-metronome/core-concepts/create-manage-rate-cards)
- [Create billable metrics](https://docs.metronome.com/guides/implement-metronome/core-concepts/create-billable-metrics)
- [Send usage events and 34-day transaction-ID deduplication](https://docs.metronome.com/guides/events/send-usage-events)
- [Get customer net balance](https://docs.metronome.com/api-reference/credits-and-commits/get-the-net-balance-of-a-customer)
- [List balances and ledgers](https://docs.metronome.com/api-reference/credits-and-commits/list-balances)
- [Edit an existing contract](https://docs.metronome.com/api-reference/contracts/edit-a-contract)
- [Create a customer credit](https://docs.metronome.com/api-reference/credits-and-commits/create-a-credit)
- [API idempotency and introduction](https://docs.metronome.com/api-reference/introduction)
