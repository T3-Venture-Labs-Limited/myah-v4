const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const YAML = require('yaml');

const action = YAML.parse(
  readFileSync(
    join(__dirname, '..', 'actions', 'yarn-install', 'action.yaml'),
    'utf8',
  ),
);
const steps = action.runs.steps;
const builder = steps.find((step) => step.id === 'globals');
const restore = steps.find((step) => step.id === 'cache-node-modules');
const install = steps.find((step) => step.name === 'Install Dependencies');

const keyFor = ({ os, arch, event, node, digest, sha }) => {
  const directory = mkdtempSync(join(tmpdir(), 'myah410-82-key-'));
  let expanded;

  try {
    const outputFile = join(directory, 'github-output');
    const output = spawnSync('bash', ['-eu', '-c', builder.run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BASH_ENV: '/dev/null',
        GITHUB_OUTPUT: outputFile,
        RUNNER_OS: os,
        RUNNER_ARCH: arch,
        CACHE_EVENT: event,
        NODE_VERSION: node,
        CACHE_INPUT_HASH: digest,
      },
    });

    assert.equal(output.status, 0, output.stderr);
    expanded = readFileSync(outputFile, 'utf8').match(
      /^CACHE_KEY_PREFIX=(.*)$/m,
    )?.[1];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  assert.ok(expanded, 'builder must emit CACHE_KEY_PREFIX');

  return {
    primary: restore.with.key
      .replace('${{ steps.globals.outputs.CACHE_KEY_PREFIX }}', expanded)
      .replace('${{github.sha}}', sha),
    restore: restore.with['restore-keys'].replace(
      '${{ steps.globals.outputs.CACHE_KEY_PREFIX }}',
      expanded,
    ),
  };
};

const base = {
  os: 'Linux',
  arch: 'X64',
  event: 'pull_request',
  node: '24.16.0',
  digest: 'sha-of-lock-manifests-config-patches-and-yarn',
  sha: 'a',
};

test('node_modules exact and prefix restores are isolated by platform and event trust boundary', () => {
  const current = keyFor(base);

  for (const change of [
    { os: 'Windows' },
    { arch: 'ARM64' },
    { event: 'push' },
    { node: '24.17.0' },
    { digest: 'changed-lock-or-patch' },
  ]) {
    const other = keyFor({ ...base, ...change });

    assert.notEqual(current.primary, other.primary, JSON.stringify(change));
    assert.ok(
      !current.primary.startsWith(other.restore),
      JSON.stringify(change),
    );
    assert.ok(
      !other.primary.startsWith(current.restore),
      JSON.stringify(change),
    );
  }

  assert.equal(keyFor({ ...base, sha: 'b' }).restore, current.restore);
});

test('default install still verifies full immutable root on a cache miss', () => {
  assert.equal(builder.env.CACHE_EVENT, '${{ github.event_name }}');
  assert.equal(builder.env.NODE_VERSION, '${{ inputs.node-version }}');
  assert.match(
    builder.env.CACHE_INPUT_HASH,
    /hashFiles\('yarn\.lock', '\*\*\/package\.json', '\.yarnrc\.yml', 'yarn\.config\.cjs', '\*\*\/patches\/\*\*', '\.yarn\/releases\/\*\*'\)/,
  );
  assert.match(install.run, /yarn --immutable --check-cache/);
  assert.ok(!install.run.includes('workspaces focus'));
  assert.match(install.if, /cache-matched-key == ''/);
});
