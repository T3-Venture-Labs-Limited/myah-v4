# Project agent guidance

## Ship the smallest useful outcome

- Identify the user problem and an observable success signal before changing code.
- Deliver the smallest complete usable slice. Reuse existing code, platform features, and installed dependencies before adding abstractions or foundations.
- Trace the real flow and shared callers before editing. Avoid unrelated refactors and speculative scaffolding.

## Boundaries and ownership

- Current user instructions, scoped package guidance, code, and verified evidence take precedence over stale plans or templates. A package `AGENTS.md` adds rules for its subtree but cannot relax safety or approval gates.
- Project policy belongs here; project skills own reusable procedures; runtime documentation owns tool mechanics. Do not copy extension APIs, model lists, machine paths, or personal configuration into project guidance.
- Bounded work may be done directly. Substantial or risky work should have one writer and an appropriately independent review. Do not add identical review cycles without relevant changes.
- Get explicit authorization before committing, pushing, opening or merging a PR, deploying, changing production, sending to real customers, charging accounts, or performing destructive cleanup.

## Preserve work in progress

- Inspect Git status before and after work. Treat every pre-existing modified, staged, ignored, or untracked file as someone else's unless ownership is explicit.
- Never discard, overwrite, reformat, stage, stash, reset, clean, rename, or include unrelated work. Stop if safe isolation or preservation is uncertain.
- Review the actual candidate: staged, unstaged, and owned untracked files. `git diff main...HEAD` does not include uncommitted changes.

## Find the code

- `packages/twenty-front`: frontend application.
- `packages/twenty-server`: backend application and workers.
- `packages/twenty-shared`: code shared across packages.
- Other packages own SDKs, apps, UI, documentation, and tooling; inspect their local configuration and guidance before editing.
- Prefer available indexed or semantic search, then focused text search. Follow imports and callers rather than assuming the reported file is the root cause.

## Verified development recipes

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

Select only the affected package and test files. Inspect the package's `project.json`, Jest configuration, and CLI help before using other flags. `lint:diff-with-main` is not proof for an uncommitted candidate because package variants may compare only `main...HEAD`.

## Linear, worktrees, and PRs

- Search Linear before creating an issue. Keep its why, user story, scope, and acceptance concise; set the correct project, milestone, dependencies, and relationships. Do not paste private plans into issues.
- Use the issue's exact live `branchName` for its branch/worktree, not an inferred identifier. Prefer the existing correct issue workspace and coordinate with its owner.
- One implementation issue maps to one PR by default. Do not automatically merge, delete branches, or remove worktrees; retain dirty, active, or unknown-owned work.
- Before publication, inspect the exact staged content and obtain authorization for the explicit file list.

## Validation and evidence

- Validate observable behavior at the closest relevant boundary, then run the affected package's formatting/lint and `tsgo --noEmit` checks. Add a regression test for behavior changes when practical.
- Run expensive required CI at the end; do not weaken checks or assume a draft PR skips CI.
- Cache hits are valid evidence only when inputs, command, environment, and scope match. Record exact commands, result, relevant output, and whether a result was cached. Never claim whole-repository health from scoped checks.
- Format before final tests and review. Revalidate if formatting, hooks, generators, or another writer changes the candidate afterward.

## Privacy and publication

- Plans, session evidence, exports, and internal project documentation are private by default. Documentation outside `packages/` must remain ignored/unpublished unless explicitly approved; this file is not a blanket exception for other root documents.
- Preserve upstream Twenty documentation inside packages. Internal project documents inside packages are still private unless explicitly approved.
- Never put credentials, customer data, private URLs, or sensitive output in source, logs, Linear, or PRs. Git ignore rules do not prevent tools or telemetry from receiving content; evaluate telemetry separately.
- Preserve provenance, licenses, private archive copies, and active handoffs. History remediation or deletion requires a separately approved plan.
