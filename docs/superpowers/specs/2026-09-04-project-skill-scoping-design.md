# Project Skill Scoping

## Goal

Stop Pi from automatically loading the broad personal skill collection in this repository while preserving those skills for selective, visible, project-local use. Hermes must retain its existing default skills.

## Design

1. Move the Pi global skill source from `~/.agents/skills/` to `~/.skills/`.
   - `~/.skills/` is a source library, not a Pi discovery location.
   - Preserve the full directory tree and file contents.
   - Verify every migrated `SKILL.md` against the source before removing the old location.

2. Do not modify `~/.hermes/skills/` or `~/.hermes/profiles/*/skills/`.
   - Hermes loads its skills from those directories, independently of Pi's `~/.agents/skills/` discovery location.

3. Keep independent copies—not symlinks—of selected skills under this repository's `.agents/skills/` directory. The local set is:
   - `metronome-best-practices`
   - `metronome-create-contract`
   - `systematic-debugging`
   - `test-driven-development`
   - `verification-before-completion`
   - `e2e-testing-patterns`
   - `sentry-workflow`
   - `sentry-sdk-setup`
   - `stripe-best-practices`
   - `stripe-docs`
   - `use-railway`

4. Remove the following currently local, out-of-scope Metronome skills and their `skills-lock.json` records:
   - `metronome-create-customer`
   - `metronome-setup-catalog`
   - `metronome-plg-billing`
   - `metronome-csm-reviews`

5. Add a project-local inventory document recording the local skill names and their source path (`~/.skills/<name>`). This makes the intended scope reviewable without relying on a global configuration.

## Safety and verification

- Record global skill count and checksums before migration.
- Copy rather than move first; compare source and destination hashes.
- Rename the old global directory only after verification succeeds, preserving a rollback location until Pi and Hermes checks pass.
- Verify Pi no longer lists global `~/.agents/skills` skills when launched from this project.
- Verify Hermes still lists its existing skills and its skill directory is unchanged.
- Verify the project-local skill set exactly matches the approved inventory.

## Non-goals

- Do not alter Hermes configuration, profiles, or skills.
- Do not create symlinks.
- Do not modify unrelated repository files.
