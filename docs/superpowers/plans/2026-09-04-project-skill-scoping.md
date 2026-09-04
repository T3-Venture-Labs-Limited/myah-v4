# Project Skill Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `~/.skills/` the non-discovered personal skill library, give this repository an explicit local skill set, and leave Hermes skills unchanged.

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
  find . -type f -print0 | sort -z | xargs -0 sha256sum
) > /tmp/project-skill-scoping-before.sha256
wc -l /tmp/project-skill-scoping-before.sha256
```

Expected: a non-zero file count, including one `SKILL.md` entry per global skill.

- [ ] **Step 3: Record the global skill count**

Run:
```bash
set -euo pipefail
find "$HOME/.agents/skills" -name SKILL.md -type f | sort > /tmp/project-skill-scoping-before-skill-paths.txt
wc -l /tmp/project-skill-scoping-before-skill-paths.txt
```

Expected: `118` discovered skill files. Stop if the count differs; update the approved inventory only after reconciling the change.

- [ ] **Step 4: Record Hermes’s pre-migration skill inventory and filesystem hashes**

Run:
```bash
set -euo pipefail
hermes skills list > /tmp/project-skill-scoping-hermes-before.txt
(
  cd "$HOME/.hermes"
  { printf '%s  %s\n' "$(sha256sum config.yaml | cut -d' ' -f1)" config.yaml; find skills profiles -type f -print0 | sort -z | xargs -0 sha256sum; }
) > /tmp/project-skill-scoping-hermes-before.sha256
wc -l /tmp/project-skill-scoping-hermes-before.txt /tmp/project-skill-scoping-hermes-before.sha256
```

Expected: both files are non-empty. The hash snapshot covers Hermes’s active `config.yaml`, default skill tree, and every profile-specific skill tree.

### Task 2: Migrate Pi’s global library without losing content

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
rsync -a --checksum "$HOME/.agents/skills/" "$HOME/.skills/"
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
diff -qr "$HOME/.agents/skills" "$HOME/.skills"
```

Expected: no output and exit status `0`. This compares the post-copy source and destination trees, including files, directories, and any entries created while the copy was running.

- [ ] **Step 4: Preserve a rollback copy and retire the Pi global discovery directory**

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

- [ ] **Step 5: Verify the rollback copy has the original hashes**

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

**Rollback rule:** Run Steps 1–4 in one shell session. Before Step 1, execute this guard; it restores Pi’s former global discovery directory if any final verification command fails:

```bash
set -euo pipefail
rollback_on_failure() {
  if test ! -e "$HOME/.agents/skills" && test -d "$HOME/.agents/skills.pre-project-scoping"; then
    mv "$HOME/.agents/skills.pre-project-scoping" "$HOME/.agents/skills"
  fi
}
trap rollback_on_failure ERR
```

Expected: if any local-inventory, Pi-isolation, or Hermes-preservation check fails, `~/.agents/skills/` is restored before the shell exits non-zero. Do not run Step 5 after a failed check.

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
  stripe-docs \
  use-railway
do
  diff -qr "$HOME/.skills/$skill" ".agents/skills/$skill"
done
```

Expected: no output and exit status `0`.

- [ ] **Step 3: Verify normal Pi discovery is project-local via RPC metadata**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
test ! -e "$HOME/.agents/skills"
test -d "$HOME/.skills"
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

- [ ] **Step 4: Verify Hermes is unchanged at both the CLI and filesystem layers**

Run:
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
hermes skills list > /tmp/project-skill-scoping-hermes-after.txt
diff -u \
  /tmp/project-skill-scoping-hermes-before.txt \
  /tmp/project-skill-scoping-hermes-after.txt
(
  cd "$HOME/.hermes"
  { printf '%s  %s\n' "$(sha256sum config.yaml | cut -d' ' -f1)" config.yaml; find skills profiles -type f -print0 | sort -z | xargs -0 sha256sum; }
) > /tmp/project-skill-scoping-hermes-after.sha256
diff -u \
  /tmp/project-skill-scoping-hermes-before.sha256 \
  /tmp/project-skill-scoping-hermes-after.sha256
test -d "$HOME/.hermes/skills"
```

Expected: no diff and exit status `0`. If either the inventory or hash snapshot changes, restore `~/.agents/skills` from `~/.agents/skills.pre-project-scoping/` and investigate before continuing.

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
