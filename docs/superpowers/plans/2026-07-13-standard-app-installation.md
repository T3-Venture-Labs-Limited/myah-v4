# Standard app installation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each explicit standard-app dispatch install Brand Brain and Creator Ops in its selected workspace while safely retrying an equal already-installed version.

**Architecture:** Keep server application semantics unchanged: equal versions remain an `APP_ALREADY_INSTALLED` error and downgrades remain errors. A small Node helper inside the existing installer composite action converts only the documented equal-version result into an opt-in workflow no-op. The dispatch workflow calls that action immediately after each corresponding publish and promotion, retaining its existing environment-scoped credentials and manual trigger.

**Tech Stack:** GitHub Actions composite actions and workflow YAML; Node 24 CommonJS built-ins (`node:child_process`, `node:test`); `actionlint`; Twenty CLI.

## Global Constraints

- Preserve `workflow_dispatch` as the only workflow trigger; do not add a push, pull-request, schedule, or production-automatic trigger.
- Do not change `application-install.service.ts`; it must continue to reject both equal versions and downgrades.
- Ignore only the exact equal-version text `This version of the application is already installed in this workspace.` when `allow-existing-installation` is exactly `true`.
- Preserve a non-zero exit for `CANNOT_DOWNGRADE_APPLICATION`, missing credentials, missing Node/Yarn workspace files, and every unrelated install failure.
- Use the existing selected `MYAH_API_URL` and `MYAH_APP_PUBLISHER_KEY`; never commit a secret, API URL, workspace ID, or token.
- PR #15 (`deestax/fix/retry-safe-standard-app-publish`) must be merged into `main` before this branch is rebased and the staging retry is dispatched.
- Install Brand Brain before Creator Ops. A failure must halt the workflow before the next app's publish, promotion, or installation.

---

## File structure

- `.github/actions/install-twenty-app/action.yml` remains the public composite-action interface. It adds `workspace-path` and the opt-in `allow-existing-installation` inputs, configures Node/Yarn from the workspace root, and invokes the helper.
- `.github/actions/install-twenty-app/install.cjs` owns process execution and the sole equal-version no-op decision.
- `.github/actions/install-twenty-app/install.test.cjs` drives `install.cjs` through a temporary fake `yarn` executable to exercise real child-process exit and output behavior without an API key.
- `.github/workflows/deploy-myah-standard-apps.yaml` keeps credential selection and promotion logic, adds retry-safe publish opt-in from merged PR #15, and inserts the two installer calls at the required points.
- `docs/superpowers/specs/2026-07-13-standard-app-installation-design.md` records the approved release behavior and its retry semantics.

### Task 1: Make the installer action retry-safe and workspace-aware

**Files:**
- Create: `.github/actions/install-twenty-app/install.cjs`
- Create: `.github/actions/install-twenty-app/install.test.cjs`
- Modify: `.github/actions/install-twenty-app/action.yml:4-53`

**Interfaces:**
- Consumes: `ALLOW_EXISTING_INSTALLATION` (`'true'` enables the one allowed no-op) and the `yarn` executable available on `PATH`.
- Produces: `install.cjs` exits `0` on a successful install or the single opted-in equal-version response; it otherwise forwards the child exit status.
- Produces: composite inputs `workspace-path` (default `.`) and `allow-existing-installation` (default `'false'`).

- [ ] **Step 1: Write the failing executable-behavior test**

Create `.github/actions/install-twenty-app/install.test.cjs` with the following test harness. It creates an executable named `yarn`, places it first in `PATH`, and invokes the real helper path. The helper does not exist yet, so the first assertion must fail because the subprocess cannot satisfy the expected zero exit.

```js
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmod, mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const helperPath = path.join(__dirname, 'install.cjs');
const equalVersionMessage =
  'This version of the application is already installed in this workspace.';

const runInstall = async ({ output, status, allowExistingInstallation }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'install-twenty-app-'));
  const yarnPath = path.join(directory, 'yarn');

  try {
    await writeFile(
      yarnPath,
      `#!/bin/sh\nprintf '%s\\n' '${output}' >&2\nexit ${status}\n`,
    );
    await chmod(yarnPath, 0o755);

    return spawnSync(process.execPath, [helperPath], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        ALLOW_EXISTING_INSTALLATION: allowExistingInstallation,
        PATH: `${directory}:${process.env.PATH}`,
      },
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

test('allows the exact equal-version response only when opted in', async () => {
  const result = await runInstall({
    output: equalVersionMessage,
    status: 17,
    allowExistingInstallation: 'true',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /already installed; continuing/);
});

test('preserves the equal-version failure without opt-in', async () => {
  const result = await runInstall({
    output: equalVersionMessage,
    status: 17,
    allowExistingInstallation: 'false',
  });

  assert.equal(result.status, 17);
  assert.match(result.stderr, /already installed in this workspace/);
});

test('preserves a downgrade failure even when opted in', async () => {
  const result = await runInstall({
    output:
      'A higher version of this application is already installed. Downgrading is not allowed.',
    status: 18,
    allowExistingInstallation: 'true',
  });

  assert.equal(result.status, 18);
  assert.match(result.stderr, /Downgrading is not allowed/);
});

test('preserves an unrelated install failure when opted in', async () => {
  const result = await runInstall({
    output: 'Request failed with status code 401',
    status: 19,
    allowExistingInstallation: 'true',
  });

  assert.equal(result.status, 19);
  assert.match(result.stderr, /status code 401/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx --yes node@24.5.0 --test .github/actions/install-twenty-app/install.test.cjs
```

Expected: all assertions fail because the missing helper returns status `1` rather than the four expected child-process results.

- [ ] **Step 3: Implement the minimal installer helper**

Create `.github/actions/install-twenty-app/install.cjs`:

```js
const { spawnSync } = require('node:child_process');

const equalVersionMessage =
  'This version of the application is already installed in this workspace.';

const result = spawnSync('yarn', ['twenty', 'app:install', '--remote', 'target'], {
  encoding: 'utf8',
});

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

if (result.status === 0) {
  process.exit(0);
}

if (
  process.env.ALLOW_EXISTING_INSTALLATION === 'true' &&
  output.includes(equalVersionMessage)
) {
  process.stdout.write('Application version is already installed; continuing.\n');
  process.exit(0);
}

process.exit(result.status ?? 1);
```

- [ ] **Step 4: Wire the composite action to the helper**

In `.github/actions/install-twenty-app/action.yml`:

1. Add these inputs after `app-path`:

```yaml
  workspace-path:
    description: Path containing the Node.js and Yarn workspace. Defaults to repo root.
    required: false
    default: '.'
  allow-existing-installation:
    description: Treat the exact equal-version installation result as successful.
    required: false
    default: 'false'
```

2. Change `Setup Node.js` to use the workspace inputs:

```yaml
      with:
        node-version-file: '${{ inputs.workspace-path }}/.nvmrc'
        cache: yarn
        cache-dependency-path: '${{ inputs.workspace-path }}/yarn.lock'
```

3. Replace the `Install` command with:

```yaml
    - name: Install
      shell: bash
      working-directory: ${{ inputs.app-path }}
      env:
        ALLOW_EXISTING_INSTALLATION: ${{ inputs.allow-existing-installation }}
      run: node "${{ github.action_path }}/install.cjs"
```

- [ ] **Step 5: Run the focused test and workflow linter to verify GREEN**

Run:

```bash
npx --yes node@24.5.0 --test .github/actions/install-twenty-app/install.test.cjs
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/actions/install-twenty-app/action.yml
```

Expected: all four tests pass; `actionlint` exits `0` with no diagnostics. The staging dispatch in Task 3 proves the two `workspace-path` and environment-variable bindings against both real app directories.

- [ ] **Step 6: Commit the action change**

```bash
git add .github/actions/install-twenty-app/action.yml \
  .github/actions/install-twenty-app/install.cjs \
  .github/actions/install-twenty-app/install.test.cjs
git commit -m "fix(apps): make app installation retry-safe"
```

### Task 2: Install both promoted standard apps in the chosen environment

**Files:**
- Modify: `.github/workflows/deploy-myah-standard-apps.yaml:53-85`

**Interfaces:**
- Consumes: merged PR #15's `deploy-twenty-app` input `allow-existing-version`; Task 1's `install-twenty-app` inputs `workspace-path` and `allow-existing-installation`.
- Produces: exactly two installation action steps, each directly after its matching promotion step.

- [ ] **Step 1: Verify the prerequisite before editing**

Run:

```bash
git fetch origin main
git log -1 --oneline origin/main
git show origin/main:.github/actions/deploy-twenty-app/action.yml | grep -F 'allow-existing-version:'
```

Expected: `origin/main` contains PR #15's `allow-existing-version:` input. If the final command prints nothing, stop implementation; merge PR #15 before rebasing this branch on `origin/main`.

- [ ] **Step 2: Rebase onto the prerequisite commit**

Run:

```bash
git rebase origin/main
```

Expected: the Task 1 commit applies cleanly and `HEAD` contains the retry-safe publisher action.

- [ ] **Step 3: Add publish retry handling and the Brand Brain installer**

Under the existing Brand Brain `workspace-path: .` input, add:

```yaml
          allow-existing-version: true
```

Immediately after `Promote Brand Brain`, add:

```yaml
      - name: Install Brand Brain
        uses: ./.github/actions/install-twenty-app
        with:
          api-url: ${{ env.MYAH_API_URL }}
          api-key: ${{ env.MYAH_APP_PUBLISHER_KEY }}
          app-path: packages/twenty-apps/fixtures/brand-brain-record-wiki-mvp
          workspace-path: .
          allow-existing-installation: true
```

- [ ] **Step 4: Add Creator Ops retry handling and installer**

Under the existing Creator Ops `workspace-path: .` input, add:

```yaml
          allow-existing-version: true
```

Immediately after `Promote Creator Ops`, add:

```yaml
      - name: Install Creator Ops
        uses: ./.github/actions/install-twenty-app
        with:
          api-url: ${{ env.MYAH_API_URL }}
          api-key: ${{ env.MYAH_APP_PUBLISHER_KEY }}
          app-path: packages/twenty-apps/internal/myah-creator-ops
          workspace-path: .
          allow-existing-installation: true
```

- [ ] **Step 5: Validate configuration and ordering**

Run:

```bash
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/deploy-myah-standard-apps.yaml
git diff --check
```

Expected: both commands exit `0`. Inspect the workflow to confirm the executed order is Brand Brain publish → promote → install, then Creator Ops publish → promote → install, with no credentials outside the existing selection steps.

- [ ] **Step 6: Commit the workflow change**

```bash
git add .github/workflows/deploy-myah-standard-apps.yaml
git commit -m "fix(apps): install promoted Myah apps"
```

### Task 3: Prove the release behavior against staging

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-standard-app-installation-design.md:86-96` only if the verified staging result changes a stated acceptance fact.

**Interfaces:**
- Consumes: a merged main branch containing PR #15 and Tasks 1–2, GitHub `staging` environment credentials, and an administrator session for the disposable staging workspace.
- Produces: recorded evidence that both applications are installed, their data models exist, and a repeated release is non-destructive.

- [ ] **Step 1: Confirm the merged release prerequisite**

Run:

```bash
git fetch origin main
git show origin/main:.github/actions/deploy-twenty-app/action.yml | grep -F 'allow-existing-version:'
git show origin/main:.github/actions/install-twenty-app/action.yml | grep -F 'allow-existing-installation:'
```

Expected: both commands print their input declaration. Do not dispatch staging until the currently deployed `main` contains both retry mechanisms.

- [ ] **Step 2: Dispatch the merged workflow to staging**

Run:

```bash
gh workflow run deploy-myah-standard-apps.yaml --ref main -f environment=staging
sleep 5
run_id="$(gh run list --workflow deploy-myah-standard-apps.yaml --branch main --commit "$(git rev-parse origin/main)" --event workflow_dispatch --user "$(gh api user --jq .login)" --limit 1 --json databaseId --jq '.[0].databaseId')"
test -n "$run_id"
gh run watch "$run_id" --exit-status
```

Expected: the run reports successful `Install Brand Brain` and `Install Creator Ops` steps.

- [ ] **Step 3: Verify actual workspace state**

In the authenticated staging workspace, inspect **Settings → Workspace → Apps → Installed** and **Settings → Workspace → Data model**. Record both installed app names and their application-owned object names. Do not create substitute custom objects.

Expected: `Brand Brain Record Wiki MVP` and `Myah Creator Ops` are installed, with their declared schemas present in the data model.

- [ ] **Step 4: Dispatch staging a second time**

Run:

```bash
gh workflow run deploy-myah-standard-apps.yaml --ref main -f environment=staging
sleep 5
run_id="$(gh run list --workflow deploy-myah-standard-apps.yaml --branch main --commit "$(git rev-parse origin/main)" --event workflow_dispatch --user "$(gh api user --jq .login)" --limit 1 --json databaseId --jq '.[0].databaseId')"
test -n "$run_id"
gh run watch "$run_id" --exit-status
```

Expected: publisher retry handling treats the existing private package as published; both installer steps print the equal-version no-op and finish successfully; no duplicate application schemas appear.

- [ ] **Step 5: Run the non-sending release smoke**

Use the release runbook's disposable staging workspace procedure. Exercise only: create a company, create a brand record, create a campaign and CreatorDeal, save an approval-gated email draft without sending it, and inspect one receipt/timeline event.

Expected: no outbound message is sent; the expected campaign, deal, approval, receipt, and timeline data remain available after the second dispatch.

- [ ] **Step 6: Commit documentation only when facts changed**

If the verified result changes an acceptance fact in the specification, update only the affected assertion and commit it:

```bash
git add docs/superpowers/specs/2026-07-13-standard-app-installation-design.md
git commit -m "docs(release): record app installation verification"
```

Otherwise, leave the specification unchanged.
