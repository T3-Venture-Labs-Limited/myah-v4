# Project agent guidance

## Ship the smallest useful outcome

- Identify the user problem and an observable success signal before changing code.
- Deliver the smallest complete usable slice. Reuse existing code, platform features, and installed dependencies before adding abstractions or foundations.
- Trace the real flow and shared callers before editing. Avoid unrelated refactors and speculative scaffolding.
- Finish one coupled delivery slice before opening another writer lane. Internal work must name the user outcome it unblocks or the measurable operational/security risk it reduces; not all useful work needs a screen.

## Communicate in product terms

- Lead progress and completion updates with **What changed for the user**, **Ready to test / not ready**, **URL + click path + expected result**, and **What still does not work**. Include a decision only when needed, with a recommendation and plain-language tradeoff. Do not print an empty template after every tool call.
- Explain a technical blocker through its user impact before giving implementation details. Keep code paths, test commands and review evidence available as a concise technical appendix.
- Distinguish implemented, verified, ready for owner acceptance, merged and deployed. Passing unit tests or a child report does not prove a working browser flow. Never invent a URL, progress percentage or completion claim.

## Sources of truth

- **Linear:** problem, priority, user outcome, boundaries, acceptance and work relationships—not a premature technical plan. Use the project `myah-linear` skill for issue creation/refinement and parent/subissue decisions.
- **Spec:** agreed behavior and design decisions. **Plan:** implementation order, real files/tests and evidence. Use `myah-development-docs` for canonical dated notes in the shared Obsidian vault's `llm-wiki/myahdev/Engineering/specs/` and `plans/`, each with `archive/`; do not write new canonical specs/plans into worktrees.
- **This file:** shared project policy. **Skills:** reusable procedures. **Pi configuration:** role models, tools and limits. **Memory:** potentially stale background, never the current backlog or authorization.
- Keep private skill procedures discoverable from the assigned worktree. If unavailable, report the missing skill and locate the canonical project copy; do not silently substitute an unrelated global workflow.

## Boundaries and ownership

- Current user instructions, scoped package guidance, code, and verified evidence take precedence over stale plans or templates. A package `AGENTS.md` adds rules for its subtree but cannot relax safety or approval gates.
- Project policy belongs here; project skills own reusable procedures; runtime documentation owns tool mechanics. Do not copy extension APIs, model lists, machine paths, or personal configuration into project guidance.
- The parent may choose direct implementation only before assigning a writer, and only for a genuinely small, isolated task. Once implementation is delegated, the parent remains the supervisor and must not take over or repair that candidate, even after the worker terminates.
- Substantial or risky work has one worker as its sole implementation writer and an appropriately independent reviewer. When review finds a blocker, the parent turns accepted findings into one bounded repair assignment for that same worker; the parent adjudicates and verifies but does not implement the findings.
- Allow at most one worker repair cycle for a delivery. If blocking findings remain, or the repair needs broader paths, behavior, migrations, schemas, generated artifacts, or cross-package changes, stop and request a scope/design decision or create a separate delivery. A worker ending, timing out, or returning incomplete evidence never transfers write ownership to the parent.
- Do not add identical review cycles without relevant changes.
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
- During implementation, run the closest relevant regression test and active file diagnostics; do not repeatedly run the whole repository.
- Before requesting commit/PR publication or claiming readiness, identify the stable candidate, including owned staged, unstaged, and selected untracked files. Format first, then run affected-package lint, native `tsgo --noEmit`, and relevant tests; configuration/docs-only changes use appropriate syntax or contract checks instead of unrelated package tests.
- A worker handoff must name the candidate/file scope, exact commands and results, known cache state, failures or checks not run, and hosted-only residuals. The parent must inspect the actual candidate and evidence; the report alone is insufficient.
- A failed or unavailable required local check blocks verified-readiness claims. Publishing for hosted diagnosis requires explicit owner approval and disclosure of the missing or failed evidence.
- Run expensive required CI at the end; do not weaken checks or assume a draft PR skips CI.
- Cache hits are valid evidence only when inputs, command, environment, and scope match. Record exact commands, result, relevant output, and whether a result was cached. Never claim whole-repository health from scoped checks.
- Format before final tests and review. Revalidate if formatting, hooks, generators, or another writer changes the candidate afterward.

## Privacy and publication

- Plans, session evidence, exports, and internal project documentation are private by default. Documentation outside `packages/` must remain ignored/unpublished unless explicitly approved; this file is not a blanket exception for other root documents.
- Preserve upstream Twenty documentation inside packages. Internal project documents inside packages are still private unless explicitly approved.
- Never put credentials, customer data, private URLs, or sensitive output in source, logs, Linear, or PRs. Git ignore rules do not prevent tools or telemetry from receiving content; evaluate telemetry separately.
- Preserve provenance, licenses, private archive copies, and active handoffs. History remediation or deletion requires a separately approved plan.
