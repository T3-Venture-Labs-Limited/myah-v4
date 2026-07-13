# Codex Plugin Guide Repair

- **Red:** `yarn workspace twenty-codex-plugin test` failed as expected while `AGENTS.md` was absent. The focused test failed with `AssertionError: package manifest declares missing AGENTS.md`; existing `assertTestingGuidance` checks also reported the same missing artifact (`ENOENT`), confirming the failure was the missing document rather than a test typo.
- **Green:** `yarn workspace twenty-codex-plugin test` — `ℹ tests 32`, `ℹ pass 32`, `ℹ fail 0`.
- **Validation:** `yarn workspace twenty-codex-plugin validate` — `Twenty Codex plugin validation passed.`
- **Commit:** `fix(codex-plugin): restore package test guidance` (final commit SHA is reported with this repair)
- **Changed files:** `packages/twenty-codex-plugin/AGENTS.md` restored byte-for-byte from `dcdab303b`; `packages/twenty-codex-plugin/scripts/__tests__/validate.spec.js` adds the focused manifest/guidance regression test; this report.
- **Self-review:** Confirmed the restored guide hash matches `git rev-parse dcdab303b:packages/twenty-codex-plugin/AGENTS.md`; no CI, runner, validator implementation, package version, or unrelated files changed. No broad suites, formatters, or linters run.
