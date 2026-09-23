# Myah codebase guidance

Myah is a creator/influencer outreach product built on TwentyCRM. This file describes the shared codebase, engineering principles, and repository-wide boundaries. It applies across contributors, machines, and agent harnesses; skills own procedures and extensions own runtime mechanics.

## Engineering principles

- Prefer existing Twenty data models, metadata, services, UI components, and extension points over parallel Myah-specific frameworks. Reuse installed dependencies before adding new ones.
- Identify the user-visible outcome, trace the real flow and shared callers, then deliver the smallest complete change. Avoid unrelated refactors and speculative scaffolding.
- Treat metadata definitions, physical schema, generated API contracts, and consuming UI as one connected change. Preserve stable universal metadata identifiers; regenerate derived files rather than hand-editing them.
- Preserve workspace isolation and native authorization. Establish the correct workspace context in background jobs as well as request handlers; do not bypass permission checks merely to make a test pass.
- Treat external effects as durable state transitions. Preserve idempotency, transaction boundaries, receipts, and retry semantics. An uncertain provider response is not proof that an email, message, or charge did not happen.
- Verify upgrades on existing workspaces, not just fresh seeds. Preserve applied migration identities, account for upgrade ordering, and do not silently coerce or discard unknown data.
- Use shared UI/theme tokens and existing interaction patterns instead of duplicating styles or inventing a separate design system. Check relevant product requirements before changing behavior.

## Technology stack

Versions and enabled features come from manifests and configuration, not this overview. An integration's presence in source does not prove it is enabled or deployed in a particular environment.

- **Language and build:** TypeScript, Node.js, Yarn workspaces, and Nx. Use `.nvmrc`, root `package.json`, `yarn.lock`, and package `project.json` files as the version/command authorities.
- **Frontend:** React, Apollo Client/GraphQL, Jotai state, Linaria styling, Lingui localization, and Vite tooling. Shared components and theme tokens live in `packages/twenty-ui`.
- **Backend:** NestJS with GraphQL and REST APIs; PostgreSQL through TypeORM and Twenty's workspace-aware ORM/metadata layer. Redis supports caching and BullMQ-backed background work; the API and queue worker are separate entry points.
- **AI:** AI SDK with provider adapters and Twenty's AI modules. Inspect `packages/twenty-server/src/engine/metadata-modules/ai` and current configuration rather than hardcoding a model/provider choice.
- **Validation:** Jest for ordinary unit/integration suites, Playwright for E2E, and Storybook/Vitest for component stories. Lint/format use Oxlint/Oxfmt; command-line typechecking uses native `tsgo`, not Node-based `tsc`.
- **Hosting and operations:** Docker images and Railway configuration; GitHub Actions CI. ClickHouse supports event/analytics infrastructure and Sentry provides application error monitoring.

### External integrations

Backend paths in this table are relative to `packages/twenty-server/src/` unless stated otherwise. These are implementation entry points, not deployment instructions or authorization to call a provider.

| Service | Role and starting points |
| --- | --- |
| **Unipile** | Instagram account connectivity, synchronization, and webhooks: `modules/myah-unipile`. Message operations and action budgeting also involve `engine/core-modules/instagram-message` and `engine/core-modules/instagram-action-budget`. |
| **Metronome** | Managed-provider metering/billing integration, customer/contract configuration, and usage delivery: `engine/core-modules/managed-provider-billing` (Metronome client/customer services). |
| **Stripe** | Payment and subscription billing, provider-funding flows, and billing webhooks: `engine/core-modules/billing`, `engine/core-modules/managed-provider-billing/stripe`, and `engine/core-modules/billing-webhook`. Keep Stripe collection/payment state distinct from Metronome usage/metering state. |
| **Email providers** | Gmail, Microsoft, and IMAP/SMTP adapters: `modules/messaging`; account metadata: `engine/metadata-modules/connected-account`; managed mailbox provisioning and warmup adapters: `engine/core-modules/managed-email`. Follow the actual channel's adapter, not an assumed universal email provider. |
| **Railway** | Repo-root `railway.toml` selects `packages/twenty-docker/twenty/Dockerfile`. Server and worker share an image but have distinct runtime roles. Service variables/start commands live in deployment configuration; do not infer live rollout settings or automatic deployment from a Git merge. |
| **Sentry / ClickHouse** | Sentry: `engine/core-modules/sentry`, server `app.module.ts`, and frontend `packages/twenty-front/src/instrument.ts` (repo-relative). ClickHouse: `database/clickHouse`. Do not confuse application observability with coding-agent telemetry. |

## Codebase navigation

Paths below are repository-relative. Read scoped guidance where present, then follow imports, callers, and nearby tests rather than assuming the first matching file owns the whole behavior.

| Area | Start here |
| --- | --- |
| Frontend boot and shell | `packages/twenty-front/src/index.tsx`, `packages/twenty-front/src/modules/app/components/App.tsx` |
| Records, metadata-driven screens, layouts | `packages/twenty-front/src/modules/object-record`, `packages/twenty-front/src/modules/object-metadata`, `packages/twenty-front/src/modules/page-layout` |
| Inbox | `packages/twenty-front/src/modules/myah/inbox`, `packages/twenty-server/src/engine/core-modules/myah-inbox` |
| Campaign execution | `packages/twenty-server/src/modules/campaign-execution` |
| Backend boot and worker | `packages/twenty-server/src/main.ts`, `packages/twenty-server/src/app.module.ts`, `packages/twenty-server/src/queue-worker/queue-worker.ts` |
| Metadata, tenancy, ORM | `packages/twenty-server/src/engine/metadata-modules`, `packages/twenty-server/src/engine/workspace-manager`, `packages/twenty-server/src/engine/twenty-orm` |
| Upgrades and runtime configuration | `packages/twenty-server/src/database/commands/upgrade-version-command`, `packages/twenty-server/src/engine/core-modules/twenty-config` |
| Shared contracts and UI | `packages/twenty-shared`, `packages/twenty-ui/src/theme` |
| Generated clients and app SDKs | `packages/twenty-client-sdk`, `packages/twenty-sdk`; inspect generator targets before changing API outputs. |
| End-to-end tests | `packages/twenty-e2e-testing` |

## Development and verification

Run from the repository/worktree root unless the package configuration says otherwise. Use the declared Node and Yarn versions; npm is unsupported. Inspect the affected package's `project.json`, Jest configuration, and CLI help before choosing other targets or flags.

For the server, these are the supported focused recipes. Substitute the affected package and test/config path for frontend or shared work:

```bash
yarn nx test twenty-server --testFile=<repo-relative-test-file> --coverage=false
yarn nx lint twenty-server
yarn workspace twenty-shared exec tsgo --noEmit -p ../../packages/twenty-server/tsconfig.json
```

- Verify the changed behavior at its closest meaningful boundary; add a regression test when practical. A unit test, browser flow, and provider delivery prove different things.
- Keep Nx caching enabled unless investigating cache behavior. Report commands, scope, results, and cache use; do not claim whole-repository health from scoped checks.
- Format and regenerate before final validation. Revalidate when a hook, generator, formatter, or another writer changes the candidate. Front/server `lint:diff-with-main` uses committed ranges and misses uncommitted changes.
- Database resets, migrations, and integration/E2E setup require verified isolated resources. Never assume a local port or inherited environment points to a disposable database. Detailed setup and operational procedures belong in the relevant skills/runbooks.

## Sources of truth and on-demand context

- **Linear** owns the problem, priority, outcome, acceptance, ownership, and work relationships. Use `myah-linear` for issue/branch/PR procedures rather than reproducing them here.
- **OpenSpec** owns maintained behavioral specifications and active change artifacts (proposal, delta specs, design, tasks). `openspec/config.yaml` declares the private `myah-kb` store. Use the OpenSpec workflows; do not create a parallel canonical spec/plan system in worktrees or the retired wiki.
- **Skills** own reusable planning, debugging, verification, review, and coordination procedures. **Harness configuration/extensions** own roles, models, tools, delegation lifecycle, and enforcement. Consult installed runtime help rather than assuming one founder's setup or copying APIs into this file.
- For third-party API/library research, use the shared `researching-myah-stack` skill at `.agents/skills/researching-myah-stack/SKILL.md`. It routes both listed and unfamiliar technologies to version-aware documentation; it does not replace implementation or deployment procedures.
- **Code and evidence** establish observed implementation behavior. If implementation, a spec, or a procedure conflicts, surface the discrepancy rather than silently changing requirements. Task completion does not prove merge, deployment, or customer acceptance.

Business context lives in the separate **`myah-kb` repository**. The references below are logical repository/document references, not paths relative to the current worktree. Resolve the checkout through the declared store/configured knowledge location; do not assume a username, home directory, or `../myah-kb` layout. If required context is unavailable, report it rather than inventing or copying private material into this repository.

| Need | Reference in `myah-kb` |
| --- | --- |
| Knowledge navigation and writing conventions | `README.md`, `index.md`, `SCHEMA.md` |
| Business direction | `general/Myah Strategy.md` |
| Positioning and launch scope | `general/Product Positioning and Launch Scope.md` |
| ICP research and evidence | `research/ICP Market Evidence and Validation.md` |
| Maintained behavior and active delivery plans | `openspec/specs/`, `openspec/changes/` |

Read only context relevant to the task. Check document status/date: a research hypothesis, proposed offer, or vision is not an approved requirement or proof of availability. Find approved brand guidance through the KB index when needed; use the implemented UI/theme tokens for code. Archived wikis are historical evidence, not active planning destinations.

## Shared safety and privacy boundaries

- Inspect Git state before editing or publishing. Preserve existing staged, unstaged, ignored, and untracked work; coordinate ownership and never discard, stash, reset, clean, or include another owner's changes without approval.
- Obtain explicit authorization before commits, pushes, PR creation/merge, deployment, production mutation, real sends, charges, or destructive cleanup. Before publication, inspect the exact staged content and obtain authorization for the explicit file list. Neither a skill nor a delegated agent expands that authority.
- Keep private plans, session evidence, exports, and internal documentation out of the public repository unless explicitly approved. Documentation outside `packages/` remains private/unpublished by default; preserve existing upstream documentation and licenses. Internal material inside a package is not automatically public.
- Never put credentials, customer data, private URLs, or sensitive payloads into source, logs, Linear, or PRs. Git ignore rules do not protect information sent to tools or telemetry. Preserve private archives and handoffs; historical remediation/deletion requires a separately approved plan.
- Resolve private OpenSpec paths with `openspec store list --json` and `openspec context --json`; edit code only in the assigned, authorized worktree. OpenSpec status edit-root metadata is not rewritten by this guidance; report contradictory required instructions before mutation.
