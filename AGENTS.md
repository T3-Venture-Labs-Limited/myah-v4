# Myah project guidance

Myah is a creator/influencer outreach product built on TwentyCRM. Prefer existing TwentyCRM data models, services, UI patterns, and extension points over parallel Myah-specific frameworks.

## Project sources of truth

- **Linear:** problem, priority, user outcome, boundaries, acceptance and work relationships—not a premature technical plan. Use the project `myah-linear` skill for issue creation/refinement and parent/subissue decisions.
- **Spec:** agreed behavior and design decisions. **Plan:** implementation order, real files/tests and evidence. Use `myah-development-docs` for canonical dated notes in the shared Obsidian vault's `llm-wiki/myahdev/Engineering/specs/` and `plans/`, each with `archive/`; do not write new canonical specs/plans into worktrees.
- **OpenSpec:** `openspec/config.yaml` points to the private registered `myah-kb` store. Keep private planning artifacts in that store; do not copy them into this public repository.
- **Repository guidance:** this file and any package-level `AGENTS.md` files describe project facts and commands. Pi role configuration and project skills live under the gitignored `.pi/` directory; installed extension help is authoritative for runtime mechanics.

## Repository map

- `packages/twenty-front`: frontend application.
- `packages/twenty-server`: backend application and workers.
- `packages/twenty-shared`: code shared across packages.
- Other packages own SDKs, apps, UI, documentation, and tooling; inspect their local configuration and guidance before editing.

## Development commands

Use the repository root as the working directory unless a command says otherwise. Use the Node version in `.nvmrc` and the Yarn release declared by `packageManager`; npm is unsupported.

Nx test, lint, and typecheck targets are cached. Keep the cache enabled unless diagnosing cache behavior. These Jest recipes select one repository-relative test file; replace the placeholder with an existing test path:

```bash
yarn nx test twenty-front --testFile=<packages/twenty-front/.../file.spec.ts> --coverage=false
yarn nx test twenty-server --testFile=<packages/twenty-server/.../file.spec.ts> --coverage=false
yarn nx test twenty-shared --testFile=<packages/twenty-shared/.../file.spec.ts> --coverage=false
```

Run package-scoped lint plus its formatting check with:

```bash
yarn nx lint twenty-front
yarn nx lint twenty-server
yarn nx lint twenty-shared
```

For TypeScript command-line checks, use native TypeScript with no emit; never fall back to Node-based `tsc`:

```bash
yarn workspace twenty-shared exec tsgo --noEmit -p ../../packages/twenty-front/tsconfig.json
yarn workspace twenty-shared exec tsgo --noEmit -p ../../packages/twenty-server/tsconfig.json
yarn workspace twenty-shared exec tsgo --noEmit -p ../../packages/twenty-shared/tsconfig.json
```

Inspect the affected package's `project.json`, Jest configuration, and CLI help before using other flags. `lint:diff-with-main` compares committed ranges and does not include an uncommitted candidate.

## Linear, worktrees, and PRs

- Search Linear before creating an issue. Keep its why, user story, scope, and acceptance concise; set the correct project, milestone, dependencies, and relationships. Do not paste private plans into issues.
- Use the issue's exact live `branchName` for its branch/worktree, not an inferred identifier.
- One implementation issue maps to one PR by default. Parent/subissue relationships describe product outcomes and acceptance checkpoints; they do not require matching branches or PRs.
- Before publication, inspect the exact staged content and obtain authorization for the explicit file list.
- Get explicit authorization before committing, pushing, opening or merging a PR, deploying, changing production, sending to real customers, charging accounts, or performing destructive cleanup.
- Preserve dirty or active worktrees and unrelated changes. Do not automatically merge, delete branches, remove worktrees, reset, clean, or stash another owner's work.

## Privacy and publication

- Plans, session evidence, exports, and internal project documentation are private by default. Documentation outside `packages/` must remain ignored/unpublished unless explicitly approved; this file is not a blanket exception for other root documents.
- Preserve upstream Twenty documentation inside packages. Internal project documents inside packages are still private unless explicitly approved.
- Never put credentials, customer data, private URLs, or sensitive output in source, logs, Linear, or PRs. Git ignore rules do not prevent tools or telemetry from receiving content; evaluate telemetry separately.
- Preserve provenance, licenses, private archive copies, and active handoffs. History remediation or deletion requires a separately approved plan.
