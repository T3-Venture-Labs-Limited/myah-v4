# Myah codebase guide

Myah is a creator/influencer outreach product for Shopify DTC brands, built on a fork of TwentyCRM. Much of the repository is inherited Twenty code; Myah-specific code is mostly under `myah*`, `campaign*` and `instagram*` paths.

## Specs and business context

Specs and business documents live in the private OpenSpec store `myah-kb` (declared in `openspec/config.yaml`). Find its checkout with `openspec store list --json`.

| Need | Location in `myah-kb` |
| --- | --- |
| Customer, launch scope, pricing | `business/README.md` and the documents it links |
| Maintained behavior | `openspec/specs/` |
| Active changes (proposal, design, tasks, UI prototypes) | `openspec/changes/<change>/` |

## Technology stack

Versions come from `.nvmrc`, root `package.json` (`packageManager`), `yarn.lock` and package `project.json` files.

- **Build:** TypeScript, Node.js, Yarn workspaces, Nx. npm is not used.
- **Frontend:** React, Apollo Client/GraphQL, Jotai, Linaria, Lingui, Vite. Shared components and theme tokens: `packages/twenty-ui`.
- **Backend:** NestJS (GraphQL and REST), PostgreSQL via TypeORM and Twenty's workspace-aware ORM/metadata layer, Redis with BullMQ for background jobs. The API and queue worker are separate processes.
- **AI:** AI SDK with provider adapters: `packages/twenty-server/src/engine/metadata-modules/ai`.
- **Tests and checks:** Jest, Vitest; Oxlint/Oxfmt; native `tsgo` for typechecking.
- **Hosting:** Docker image (`packages/twenty-docker/twenty/Dockerfile`) deployed on Railway (`railway.toml`); GitHub Actions CI.

## Where things are

Paths are repository-relative.

| Area | Start here |
| --- | --- |
| Campaigns: sequences, outreach, execution | `packages/twenty-server/src/modules/myah-outreach`, `packages/twenty-server/src/modules/campaign-execution`, `packages/twenty-server/src/modules/myah-campaign`, `packages/twenty-server/src/engine/core-modules/campaign-*`; UI `packages/twenty-front/src/modules/myah/campaign`, `packages/twenty-front/src/modules/myah/campaign-messages` |
| Creators | `packages/twenty-front/src/modules/myah/creator-crm`; server metadata in `packages/twenty-server/src/engine/workspace-manager` |
| Inbox and replies | `packages/twenty-front/src/modules/myah/inbox`, `packages/twenty-server/src/engine/core-modules/myah-inbox`, `packages/twenty-server/src/engine/core-modules/instagram-reply` |
| Instagram (Unipile) | `packages/twenty-server/src/modules/myah-unipile`, `packages/twenty-server/src/engine/core-modules/instagram-message`, `packages/twenty-server/src/engine/core-modules/instagram-action-budget` |
| Email | Gmail/Microsoft/IMAP adapters `packages/twenty-server/src/modules/messaging`; accounts `packages/twenty-server/src/engine/metadata-modules/connected-account`; managed mailboxes `packages/twenty-server/src/engine/core-modules/managed-email` |
| AI agents and chat | `packages/twenty-server/src/engine/metadata-modules/ai` |
| Billing | Stripe `packages/twenty-server/src/engine/core-modules/billing`, `packages/twenty-server/src/engine/core-modules/billing-webhook`; Metronome usage metering `packages/twenty-server/src/engine/core-modules/managed-provider-billing` |
| Frontend boot and shell | `packages/twenty-front/src/index.tsx`, `packages/twenty-front/src/modules/app/components/App.tsx` |
| Records, metadata-driven screens, layouts | `packages/twenty-front/src/modules/object-record`, `packages/twenty-front/src/modules/object-metadata`, `packages/twenty-front/src/modules/page-layout` |
| Backend boot and worker | `packages/twenty-server/src/main.ts`, `packages/twenty-server/src/app.module.ts`, `packages/twenty-server/src/queue-worker/queue-worker.ts` |
| Metadata, tenancy, ORM | `packages/twenty-server/src/engine/metadata-modules`, `packages/twenty-server/src/engine/workspace-manager`, `packages/twenty-server/src/engine/twenty-orm` |
| Database setup and upgrade commands | `packages/twenty-server/src/database/commands` |
| Runtime configuration | `packages/twenty-server/src/engine/core-modules/twenty-config`, `packages/twenty-server/.env.example`, `packages/twenty-front/.env.example` |
| Shared types and constants | `packages/twenty-shared` |
| Generated clients and SDKs | `packages/twenty-client-sdk`, `packages/twenty-sdk` (regenerate, do not hand-edit) |
| Error monitoring / analytics | Sentry `packages/twenty-server/src/engine/core-modules/sentry`, `packages/twenty-front/src/instrument.ts`; ClickHouse `packages/twenty-server/src/database/clickHouse` |

## Local development

Run commands from the repository root with the Node version in `.nvmrc` and the Yarn version in `package.json`.

`scripts/myah-dev` runs a complete, isolated environment for the current worktree (its own Postgres and Redis containers, API, worker and frontend on worktree-specific ports):

```bash
scripts/myah-dev up           # start; the first run creates the schema and seeds a demo workspace
scripts/myah-dev up --reset   # recreate the database and reseed
scripts/myah-dev up --from-prod  # copy production (read-only), run the startup upgrade; sign in at app.localhost with a production email / myah-dev
scripts/myah-dev status       # URLs, login and process state
scripts/myah-dev logs api     # follow api, worker or front logs
scripts/myah-dev down         # stop everything and delete this environment's data
```

Login: `tim@apple.dev` / `tim@apple.dev`. Use `--from-prod` to reproduce production bugs and to run pending upgrade steps against real data before deploying; it holds real customer data, sends stay off, and `down` deletes it. Each process runs in its own memory-capped systemd scope (API 7G, worker 2G, front 6G; override with `MYAH_DEV_MEM_API/WORKER/FRONT`), so hitting a cap restarts nothing else. Instagram, Gmail and Microsoft providers are disabled and email goes to the logger driver, so nothing is sent. Optional extra server variables (for example AI provider keys) go in `~/.config/myah-dev/env`. Local data is disposable.

## Tests and checks

```bash
yarn nx test twenty-server --testFile=<repo-relative test file> --coverage=false
yarn nx lint twenty-server
yarn workspace twenty-shared exec tsgo --noEmit -p ../../packages/twenty-server/tsconfig.json
```

Use the same commands with `twenty-front` or `twenty-shared` for those packages. Lint includes formatting. `lint:diff-with-main` only checks committed changes.

For fast type feedback while editing, the language server `scripts/tsgo-lsp` (native `tsgo --lsp`, memory-capped; used by pi-lens through `.pi-lens.json`) checks an open file in seconds. Server and front code import `twenty-shared` from its build output, so if type errors mention missing `twenty-shared` exports, run `yarn nx build twenty-shared` (`scripts/myah-dev up` does this).
