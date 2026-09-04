# Project Skill Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `~/.skills/` the non-discovered personal skill library, give this repository an explicit local skill set, retain Hermes’s non-cmux skills independently, and remove cmux skills everywhere.

**Architecture:** Preserve the complete Pi global library by copying it to `~/.skills/` and validating every file hash before retiring `~/.agents/skills/`. Maintain this repository’s independently editable skill copies in `.agents/skills/`, and record the approved local inventory in `.agents/SKILLS.md`. Hermes remains isolated because it loads from `~/.hermes/skills/` and `~/.hermes/profiles/*/skills/`.

**Tech Stack:** POSIX shell, `rsync`, `sha256sum`, Node.js, Pi CLI, Hermes CLI.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `~/.skills/` | Complete personal source library; intentionally outside Pi discovery paths. |
| `~/.agents/skills.pre-project-scoping/` | Temporary rollback copy of Pi’s former global discovery directory. |
| `.agents/skills/` | Project-local, independently editable skill copies loaded by Pi in this repository. |
| `.agents/SKILLS.md` | Human-readable list of the approved project-local skills and their source library paths. |
| `skills-lock.json` | Lock records for only the retained Metronome skills. |

### Task 1: Snapshot Pi and Hermes skill state

**Files:**
- Create: `/tmp/project-skill-scoping-before.sha256`
- Create: `/tmp/project-skill-scoping-hermes-before.txt`
- Read: `~/.agents/skills/`
- Read: `~/.hermes/skills/`

- [ ] **Step 1: Assert that the global Pi source exists and the target library is unused**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
test -d "$HOME/.agents/skills"
test ! -e "$HOME/.skills"
test ! -e "$HOME/.agents/skills.pre-project-scoping"
```

Expected: exit status `0`. Stop if either the destination library or rollback path already exists; do not merge, overwrite, or nest unknown directories.

- [ ] **Step 2: Record hashes for every global Pi skill file**

Run:
```bash
set -euo pipefail
(
  cd "$HOME/.agents/skills"
  find . -type f ! -path './cmux*' -print0 | sort -z | xargs -0 sha256sum
) > /tmp/project-skill-scoping-before.sha256
wc -l /tmp/project-skill-scoping-before.sha256
```

Expected: a non-zero file count, including one `SKILL.md` entry per global skill.

- [ ] **Step 3: Record the global skill count**

Run:
```bash
set -euo pipefail
find "$HOME/.agents/skills" -name SKILL.md -type f ! -path "$HOME/.agents/skills/cmux*" | sort > /tmp/project-skill-scoping-before-skill-paths.txt
wc -l /tmp/project-skill-scoping-before-skill-paths.txt
```

Expected: a recorded, non-zero discovered-skill count. The count is evidence for the migration; it is not a fixed precondition because the personal library can legitimately change.

- [ ] **Step 4: Record Hermes’s pre-migration skill inventory and filesystem hashes**

Run:
```bash
set -euo pipefail
hermes skills list > /tmp/project-skill-scoping-hermes-before.txt
(
  cd "$HOME/.hermes"
  {
    test -f config.yaml && printf '%s\0' config.yaml
    find skills -type f -print0
    find profiles -mindepth 2 -maxdepth 2 -type f -name config.yaml -print0
    find profiles -type d -name sandboxes -prune -o -path '*/skills/*' -type f -print0
  } | sort -z | xargs -0 sha256sum
) > /tmp/project-skill-scoping-hermes-before.sha256
wc -l /tmp/project-skill-scoping-hermes-before.txt /tmp/project-skill-scoping-hermes-before.sha256
```

Expected: both files are non-empty. The hash snapshot covers Hermes’s active `config.yaml`, default skill tree, and each profile’s `config.yaml` and `skills/` tree. It intentionally excludes `profiles/*/sandboxes/` and other mutable runtime data.

### Task 2: Migrate Pi’s global library without losing content

**Rollback rule:** Run Tasks 2–4 in one shell session. Before Task 2 Step 1, execute this guard; it restores Pi’s former global discovery directory if any migration, local-copy, inventory, or final-verification command fails after the directory has been retired:

```bash
set -euo pipefail
rollback_on_failure() {
  if test ! -e "$HOME/.agents/skills" && test -d "$HOME/.agents/skills.pre-project-scoping"; then
    mv "$HOME/.agents/skills.pre-project-scoping" "$HOME/.agents/skills"
  fi
}
trap rollback_on_failure ERR
```

Expected: if any command in Tasks 2–4 fails after the retirement step, `~/.agents/skills/` is restored before the shell exits non-zero. Do not commit project-local changes after a failed command.

**Files:**
- Create: `~/.skills/`
- Create: `~/.agents/skills.pre-project-scoping/`
- Remove: `~/.agents/skills/`
- Test: `/tmp/project-skill-scoping-before.sha256`

- [ ] **Step 1: Create the source library by copying the current global skill tree**

Run:
```bash
set -euo pipefail
mkdir -p "$HOME/.skills"
rsync -a --checksum --exclude='cmux*' "$HOME/.agents/skills/" "$HOME/.skills/"
```

Expected: `~/.skills/` contains the complete skill directory tree while `~/.agents/skills/` remains unchanged.

- [ ] **Step 2: Verify the new library byte-for-byte**

Run:
```bash
set -euo pipefail
(
  cd "$HOME/.skills"
  sha256sum -c /tmp/project-skill-scoping-before.sha256
) | tee /tmp/project-skill-scoping-hash-check.txt
test "$(grep -c ': OK$' /tmp/project-skill-scoping-hash-check.txt)" -eq "$(wc -l < /tmp/project-skill-scoping-before.sha256)"
```

Expected: every line ends in `OK`; the two counts match exactly.

- [ ] **Step 3: Verify the complete source and destination trees are identical**

Run:
```bash
set -euo pipefail
rsync -nrc --delete --exclude='cmux*' "$HOME/.agents/skills/" "$HOME/.skills/"
```

Expected: no output and exit status `0`. This compares the post-copy source and destination trees while excluding intentionally deleted `cmux*` skills.

- [ ] **Step 4: Preserve real secondary Pi skills, delete cmux, and clear secondary discovery**

Run:
```bash
set -euo pipefail
for skill_dir in "$HOME/.pi/agent/skills"/*; do
  test -e "$skill_dir" || test -L "$skill_dir" || continue
  skill_name="$(basename "$skill_dir")"
  case "$skill_name" in
    cmux*) ;;
    *)
      if test -d "$skill_dir" && test ! -L "$skill_dir"; then
        test ! -e "$HOME/.skills/$skill_name"
        cp -a "$skill_dir" "$HOME/.skills/"
      fi
      ;;
  esac
done
find "$HOME/.agents/skills" -mindepth 1 -maxdepth 1 -type d -name 'cmux*' -exec rm -rf {} +
find "$HOME/.pi/agent/skills" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
test -z "$(find "$HOME/.agents/skills" -mindepth 1 -maxdepth 1 -type d -name 'cmux*' -print -quit)"
test -z "$(find "$HOME/.pi/agent/skills" -mindepth 1 -maxdepth 1 -print -quit)"
```

Expected: real non-cmux secondary skills are preserved in `~/.skills/`, no `cmux*` directory is archived, and `~/.pi/agent/skills/` is empty.

- [ ] **Step 5: Materialize Hermes aliases and disable package-supplied Pi skills**

Before retiring `~/.agents/skills`, replace each non-cmux symlink in `~/.hermes/skills/` with an independent copy from the source library. Leave an existing real Hermes directory unchanged when its name collides. Remove `cmux*` aliases. Preserve package-only skills in `~/.skills/`, then convert every package entry in `~/.pi/agent/settings.json` to object form with `"skills": []`; omitted resource keys keep extensions and other package resources enabled. Back up the settings file before editing it. Copy the two retained project-only Metronome skills into `~/.skills/` so every inventory entry has a source-library copy.

Expected: Hermes no longer depends on `~/.agents/skills/`, cmux aliases are absent, all packages are prevented from exposing global skills, and both Metronome source copies exist.

- [ ] **Step 6: Preserve a rollback copy and retire the Pi global discovery directory**

Run:
```bash
set -euo pipefail
test ! -e "$HOME/.agents/skills.pre-project-scoping"
mv "$HOME/.agents/skills" "$HOME/.agents/skills.pre-project-scoping"
test ! -e "$HOME/.agents/skills"
test -d "$HOME/.agents/skills.pre-project-scoping"
test -d "$HOME/.skills"
```

Expected: Pi can no longer auto-discover the former global path, while the rollback copy and non-discovered source library both remain available.

- [ ] **Step 7: Verify the rollback copy has the original non-cmux hashes**

Run:
```bash
set -euo pipefail
(
  cd "$HOME/.agents/skills.pre-project-scoping"
  sha256sum -c /tmp/project-skill-scoping-before.sha256
) > /tmp/project-skill-scoping-rollback-hash-check.txt
test "$(grep -c ': OK$' /tmp/project-skill-scoping-rollback-hash-check.txt)" -eq "$(wc -l < /tmp/project-skill-scoping-before.sha256)"
```

Expected: every original file is reported as `OK` and the counts match exactly.

### Task 3: Curate the project-local skills

**Files:**
- Create: `.agents/SKILLS.md`
- Create: `.agents/skills/{systematic-debugging,test-driven-development,verification-before-completion,e2e-testing-patterns,sentry-workflow,sentry-sdk-setup,stripe-best-practices,stripe-docs,use-railway}/`
- Remove: `.agents/skills/{metronome-create-customer,metronome-setup-catalog,metronome-plg-billing,metronome-csm-reviews}/`
- Modify: `skills-lock.json`

- [ ] **Step 1: Remove the four rejected local Metronome skills**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
rm -rf \
  .agents/skills/metronome-create-customer \
  .agents/skills/metronome-setup-catalog \
  .agents/skills/metronome-plg-billing \
  .agents/skills/metronome-csm-reviews
```

Expected: only `metronome-best-practices` and `metronome-create-contract` remain from the original local Metronome set.

- [ ] **Step 2: Copy the approved general-purpose skills from the source library**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
for skill in \
  systematic-debugging \
  test-driven-development \
  verification-before-completion \
  e2e-testing-patterns \
  sentry-workflow \
  sentry-sdk-setup \
  stripe-best-practices \
  stripe-docs \
  use-railway
do
  test -d "$HOME/.skills/$skill"
  test ! -e ".agents/skills/$skill"
  cp -a "$HOME/.skills/$skill" .agents/skills/
done
```

Expected: each copied directory exists locally and is not a symbolic link.

- [ ] **Step 3: Remove obsolete lock entries without changing the retained records**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node <<'NODE'
const fs = require('node:fs');
const path = 'skills-lock.json';
const lock = JSON.parse(fs.readFileSync(path, 'utf8'));
for (const name of [
  'metronome-create-customer',
  'metronome-setup-catalog',
  'metronome-plg-billing',
  'metronome-csm-reviews',
]) {
  delete lock.skills[name];
}
fs.writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
NODE
```

Expected: obsolete lock records are removed while the retained records are unchanged.

- [ ] **Step 4: Assert the final lock-file keys**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node <<'NODE'
const fs = require('node:fs');
const lock = JSON.parse(fs.readFileSync('skills-lock.json', 'utf8'));
const actual = Object.keys(lock.skills).sort();
const expected = [
  'metronome-best-practices',
  'metronome-create-contract',
];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected skills-lock.json keys: ${actual.join(', ')}`);
}
NODE
```

Expected: exit status `0` and exactly the two retained Metronome lock records.

- [ ] **Step 5: Create the local skill inventory**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
cat > .agents/SKILLS.md <<'EOF'
# Project Skill Inventory

These are independent, project-local copies. Their canonical personal-library source is `~/.skills/<skill-name>/`; project edits do not update that source.

- `metronome-best-practices` — retained local Metronome integration guidance.
- `metronome-create-contract` — retained local Metronome contract guidance.
- `systematic-debugging`
- `test-driven-development`
- `verification-before-completion`
- `e2e-testing-patterns`
- `sentry-workflow`
- `sentry-sdk-setup`
- `stripe-best-practices`
- `stripe-docs`
- `use-railway`
EOF
```

Expected: `.agents/SKILLS.md` is created at the repository root and lists all and only the approved local skills.

Reference content written by the command above:
```markdown
# Project Skill Inventory

These are independent, project-local copies. Their canonical personal-library source is `~/.skills/<skill-name>/`; project edits do not update that source.

- `metronome-best-practices` — retained local Metronome integration guidance.
- `metronome-create-contract` — retained local Metronome contract guidance.
- `systematic-debugging`
- `test-driven-development`
- `verification-before-completion`
- `e2e-testing-patterns`
- `sentry-workflow`
- `sentry-sdk-setup`
- `stripe-best-practices`
- `stripe-docs`
- `use-railway`
```

Expected: the inventory lists all and only the approved local skills.

### Task 4: Verify isolation and the final inventory

**Rollback rule:** Continue in the shell session initialized before Task 2. Its error trap remains active for all final verification steps. Do not run Step 5 after a failed check.

**Files:**
- Read: `~/.skills/`
- Read: `~/.agents/skills.pre-project-scoping/`
- Read: `~/.hermes/skills/`
- Read: `.agents/skills/`
- Read: `.agents/SKILLS.md`
- Read: `skills-lock.json`

- [ ] **Step 1: Verify the project skill directory exactly matches the approved inventory**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
expected=$'e2e-testing-patterns\nmetronome-best-practices\nmetronome-create-contract\nsentry-sdk-setup\nsentry-workflow\nstripe-best-practices\nstripe-docs\nsystematic-debugging\ntest-driven-development\nuse-railway\nverification-before-completion'
actual="$(find .agents/skills -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
test "$actual" = "$expected"
test -z "$(find .agents/skills -mindepth 1 -maxdepth 1 -type l -print -quit)"
```

Expected: exit status `0`; there are exactly eleven ordinary directories and no symbolic links.

- [ ] **Step 2: Verify every copied global skill is identical to its source library version**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
for skill in \
  systematic-debugging \
  test-driven-development \
  verification-before-completion \
  e2e-testing-patterns \
  sentry-workflow \
  sentry-sdk-setup \
  stripe-best-practices \
  stripe-docs
do
  diff -qr "$HOME/.skills/$skill" ".agents/skills/$skill"
done
(
  cd .agents/skills/use-railway/scripts
  python -m unittest -v test_skill_scripts.py
  python -m py_compile pg-extensions.py enable-pg-stats.py
)
```

Expected: the unchanged copied skills match their source, and the locally reviewed Railway script fixes pass both regression tests and compilation.

- [ ] **Step 3: Verify normal Pi discovery is project-local via RPC metadata**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
test ! -e "$HOME/.agents/skills"
test -d "$HOME/.skills"
test -z "$(find "$HOME/.pi/agent/skills" -mindepth 1 -maxdepth 1 -print -quit)"
printf '%s\n' '{"id":"skills","type":"get_commands"}' \
  | pi --mode rpc --approve --no-session \
  > /tmp/project-skill-scoping-pi-commands.jsonl
REPO_ROOT="$REPO_ROOT" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = process.env.REPO_ROOT;
const expected = [
  'e2e-testing-patterns',
  'metronome-best-practices',
  'metronome-create-contract',
  'sentry-sdk-setup',
  'sentry-workflow',
  'stripe-best-practices',
  'stripe-docs',
  'systematic-debugging',
  'test-driven-development',
  'use-railway',
  'verification-before-completion',
];
const records = fs.readFileSync('/tmp/project-skill-scoping-pi-commands.jsonl', 'utf8')
  .trim().split('\n').map((line) => JSON.parse(line));
const response = records.find((record) => record.type === 'response' && record.command === 'get_commands');
if (!response?.success) throw new Error('Pi did not return get_commands metadata');
const skills = response.data.commands.filter((command) => command.source === 'skill');
const actual = skills.map((command) => command.name.replace(/^skill:/, '')).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected Pi skill names: ${actual.join(', ')}`);
}
for (const command of skills) {
  const expectedPath = path.join(repoRoot, '.agents', 'skills', command.name.replace(/^skill:/, ''), 'SKILL.md');
  if (command.sourceInfo?.path !== expectedPath || command.sourceInfo?.scope !== 'project') {
    throw new Error(`Unexpected Pi skill provenance for ${command.name}: ${JSON.stringify(command.sourceInfo)}`);
  }
}
NODE
```

Expected: Pi’s machine-readable command metadata contains exactly the eleven approved skills, each loaded from this repository’s `.agents/skills/` path. This detects all automatic Pi discovery sources, not only `~/.agents/skills`.

- [ ] **Step 4: Verify Hermes retained every non-cmux skill independently**

Run:
```bash
set -euo pipefail
(
  cd "$HOME/.hermes"
  sha256sum -c /tmp/project-skill-scoping-hermes-before.sha256
) > /tmp/project-skill-scoping-hermes-protected-check.txt
COLUMNS=300 hermes skills list > /tmp/project-skill-scoping-hermes-after.txt
for source in "$HOME/.agents/skills.pre-project-scoping"/*/SKILL.md; do
  name="$(basename "$(dirname "$source")")"
  target="$HOME/.hermes/skills/$name"
  test -d "$target"
  test ! -L "$target"
  grep -q "│ $name " /tmp/project-skill-scoping-hermes-after.txt
done
test -z "$(find "$HOME/.hermes/skills" -mindepth 1 -maxdepth 1 -name 'cmux*' -print -quit)"
```

Expected: Hermes config, profile skills, and pre-existing real files pass their original hashes; every retired non-cmux global skill remains listed through an ordinary directory in `~/.hermes/skills/`; cmux is absent.

- [ ] **Step 5: Commit only the local project-skill changes**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git add .agents skills-lock.json
git commit -m 'chore: scope skills to project'
```

Expected: commit includes only `.agents/` and `skills-lock.json`; it does not include unrelated pre-existing working-tree changes.
