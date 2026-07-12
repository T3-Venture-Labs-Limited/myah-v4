# Brand Brain Record Wiki MVP

Record-backed Brand Brain pages for folders, content pages, internal Index/Log page types, and explicit Brand Brain Link records. Agents write knowledge directly to Brand Brain pages and append log-style history instead of creating human-approval proposal records by default. The old proposal object and its internal default view are retained only as migration-safe dormant schema in this local test workspace until a fresh workspace or explicitly approved destructive drop is available; they are not exposed in the sidebar or routine agent workflow.

## V1 runtime gates

Static manifest validation proves the app schema can be built, but local browser testing still needs to prove two Twenty runtime behaviors before this can be treated as fully feasible:

1. `brandBrainPage.parentPage` self-relation must let a Brand Brain Page select another Brand Brain Page as its parent. If that fails, V1 should fall back to a separate hierarchy edge object.
2. `brandBrainPage.body` uses `FieldType.RICH_TEXT`. If local create/edit/read does not persist rich text on custom app objects, V1 should fall back to a plain `bodyMarkdown` text field and defer the rich editor.
3. `brandBrainPage.canonicalPath` is indexed for lookup but not DB-unique. Runtime sync rejected a unique TEXT index, so V1 path uniqueness must be enforced by app/agent utilities before writes. V2 can revisit a dedicated path registry object if database-enforced uniqueness becomes necessary.

## V2 log direction

V1 uses a special `brandBrainPage` with `pageType = LOG`. V2 should evaluate a separate append-only `brandBrainLogEntry` object with one row per event, filterable by date, page, actor, action type, source, and reason. Knowledge should be updated/replaced rather than deleted unless the user explicitly requests deletion.

## Simplified agentic workflow

User-facing navigation should expose one Brand Brain entry through `Brand Brain`. Do not show separate `Brand Brain Index` or `Pending Brand Brain Proposals` sidebar items; they made the MVP feel like an admin database instead of agent memory.

Agents should directly update or replace Brand Brain knowledge records and append log-style history. They should not create approval proposals for routine knowledge writes. Deletion is not part of normal agent behavior; knowledge should be updated, replaced, archived, or superseded unless the user explicitly asks for deletion.

If an agent is about to make a surprising core-identity change during conversation, the agent should ask the user directly in chat rather than routing through a standing proposal table.

## Agent memory planner and executor

`src/utils/brand-brain-agent-memory.util.ts` defines the deterministic planning contract. It normalizes brand slugs, websites, and social channels; seeds business-context pages such as overview, products, offer, audience, positioning, social channels, content guidelines, source notes, Index, and Log; emits create/fill-missing/log/link operations; and rejects destructive operations.

`src/utils/brand-brain-agent-executor.util.ts` applies that plan through a store adapter. It creates missing pages in parent order, computes `idPath` after real IDs exist, fills missing scalar metadata only, refreshes Index as the one explicit body-write exception, upserts links, and appends Log after successful page/link operations. Existing pages use `fillMissingPage` with `preserveExistingBody: true` so seed placeholders cannot overwrite durable memory. Log appends refuse to overwrite existing BlockNote-only history when markdown is missing.

`src/utils/brand-brain-core-api-store.util.ts` is the Twenty Core API store adapter. It uses the generated `CoreApiClient` selection API for Brand Brain Page/Link list/create/update operations, writes rich text as `body.markdown` plus valid JSON-stringified `body.blocknote`, and paginates page/link list queries so duplicate-path and link-idempotency checks see all records.

`src/utils/brand-brain-agent-tools.util.ts` is the first agent-facing tool wrapper layer. It exposes `seedOrUpdateBrandBrainFromBrief()` for onboarding/updating a brand from a structured brief, `getBrandBrainContext()` for read-before-work context packs, `searchOrReadBrandBrain()` for targeted page/section recall, and `updateBrandBrainPageContent()` for non-destructive direct memory writes. These tools operate only on Twenty Brand Brain records; they do not create proposals, delete pages, create a `creators-affiliates` page, or introduce visual brand-kit defaults.

`src/logic-functions/*.function.ts` registers those wrappers as Twenty tool-triggered logic functions so the Twenty/Myah agent tool registry can discover them. A newly installed workspace starts with empty Brand Brain objects: the app manifest defines schema, views, navigation, roles, and tool functions only. Brand Brain pages are created only after an explicit seed/update tool invocation for that workspace.

The runtime store requires the server-injected `TWENTY_APP_ACCESS_TOKEN` from Twenty logic-function execution and instantiates `CoreApiClient` with an explicit `Authorization` header containing that app access token. It intentionally does not accept `TWENTY_API_KEY`, `TWENTY_ACCESS_TOKEN`, `BRAND_BRAIN_API_KEY`, or credentials from tool inputs, so Brand Brain tool execution stays scoped to the installed application/workspace runtime. The default `Brand Brain Admin` role is intentionally object-scoped to Brand Brain Page and Brand Brain Link records. It must not grant global all-object read/update/delete permissions.
