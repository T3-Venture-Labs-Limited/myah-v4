'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const guard = require('./native-fixture-guard.cjs');
const { supervise } = require('./launch-native-fixture-bootstrap.cjs');

// Every case gets a fresh Node process: patching transports is intentionally
// irreversible within a fixture process and must remain active through close.
const guardPath = path.join(__dirname, 'native-fixture-guard.cjs');
const isolated = (source) => {
  const result = spawnSync(process.execPath, ['-e', `
    const guard = require(${JSON.stringify(guardPath)});
    const assert = require('node:assert/strict');
    ${source}
  `], { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
};

void test('no receipt denies bootstrap before application import', () => {
  isolated(`assert.throws(() => guard.readConfig(), /Missing pinned private fixture receipt/);`);
});

void test('wrong DB, Redis and foreign endpoints fail before any connection', () => {
  isolated(`
    const good = {
      pgUrl: 'postgres://fixture:fixture@127.0.0.1:5432/myah_409_native_unique',
      redisUrl: 'redis://127.0.0.1:6397',
    };
    assert.deepEqual([...guard.validateEndpoints(good)].sort(), ['127.0.0.1:5432', '127.0.0.1:6397']);
    for (const change of [
      { pgUrl: 'postgres://fixture:fixture@127.0.0.1:5432/postgres' },
      { pgUrl: 'postgres://fixture:fixture@remote.example:5432/myah_409_native_unique' },
      { redisUrl: 'redis://127.0.0.1:6379' },
      { redisUrl: 'rediss://127.0.0.1:6397' },
    ]) assert.throws(() => guard.validateEndpoints({ ...good, ...change }), /not independently bounded/);
  `);
});

void test('self-authored receipt cannot replace an external candidate pin', () => {
  isolated(`
    assert.throws(() => guard.assertPinnedCandidate({
      root: '/home/superdao/.local/share/myah-scratch/myah409-native-fixture',
      candidateRoot: '/home/superdao/.local/share/myah-scratch/myah409-native-build',
      candidateSha256: 'a'.repeat(64),
      serverPackagePath: '/home/superdao/.local/share/myah-scratch/myah409-native-build/packages/twenty-server',
    }), /no independent snapshot pin/);
  `);
});

void test('full read-only snapshot changes on omitted, extra or altered executable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myah409-tree-'));
  try {
    const dist = path.join(root, 'dist');
    const dependencies = path.join(root, 'node_modules');
    fs.mkdirSync(dist);
    fs.mkdirSync(dependencies);
    const app = path.join(dist, 'app.module.js');
    const dependency = path.join(dependencies, 'dependency.js');
    fs.writeFileSync(app, 'original');
    fs.writeFileSync(dependency, 'v1');
    for (const item of [app, dependency]) fs.chmodSync(item, 0o444);
    for (const item of [dist, dependencies, root]) fs.chmodSync(item, 0o555);
    const approved = guard.digestReadOnlyTree(root);
    assert.match(approved, /^[a-f0-9]{64}$/);
    fs.chmodSync(dependency, 0o644);
    fs.writeFileSync(dependency, 'v2');
    fs.chmodSync(dependency, 0o444);
    assert.notEqual(guard.digestReadOnlyTree(root), approved);
    fs.chmodSync(dependencies, 0o755);
    const extra = path.join(dependencies, 'extra.js');
    fs.writeFileSync(extra, 'extra');
    fs.chmodSync(extra, 0o444);
    fs.chmodSync(dependencies, 0o555);
    assert.notEqual(guard.digestReadOnlyTree(root), approved);
    fs.chmodSync(dependencies, 0o755);
    fs.rmSync(extra);
    fs.chmodSync(dependencies, 0o555);
    fs.chmodSync(dependency, 0o644);
    fs.writeFileSync(dependency, 'v1');
    fs.chmodSync(dependency, 0o444);
    assert.equal(guard.digestReadOnlyTree(root), approved);
    fs.chmodSync(app, 0o644);
    assert.throws(() => guard.digestReadOnlyTree(root), /read-only/);
  } finally {
    for (const item of [root, path.join(root, 'dist'), path.join(root, 'node_modules')])
      if (fs.existsSync(item)) fs.chmodSync(item, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

void test('snapshot rejects symlink escaping its root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myah409-link-'));
  try {
    fs.symlinkSync(os.tmpdir(), path.join(root, 'external'));
    fs.chmodSync(root, 0o555);
    assert.throws(() => guard.digestReadOnlyTree(root), /escapes snapshot/);
  } finally {
    fs.chmodSync(root, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

void test('only literal owned TCP endpoints can reach the original transport', () => {
  isolated(`
    const net = require('node:net');
    let called = 0;
    net.Socket.prototype.connect = function () { called++; return this; };
    guard.install(new Set(['127.0.0.1:5432', '127.0.0.1:6397']));
    const socket = new net.Socket();
    for (const args of [
      [{ host: 'localhost', port: 5432 }],
      [{ host: '127.0.0.1', port: 5433 }],
      [{ path: '/var/run/postgresql/.s.PGSQL.5432' }],
      [{ host: '127.0.0.1', port: 5432, lookup: () => {} }],
      [{ host: '127.0.0.1', port: 5432, fd: 1 }],
      [5432, 'other.host'],
    ]) assert.throws(() => socket.connect(...args), /denied/);
    assert.equal(called, 0);
    socket.connect({host: '127.0.0.1', port: 5432});
    socket.connect(6397, '127.0.0.1');
    assert.equal(called, 2);
    assert.equal(guard.failures.allowedTcp, 2);
    assert.equal(guard.failures.denied, 6);
    assert.throws(() => guard.assertClean(), /violation/);
  `);
});

void test('DNS, TLS, UDP, HTTP, fetch, listen, child and thread routes fail closed', () => {
  isolated(`
    const net = require('node:net');
    const dns = require('node:dns');
    const tls = require('node:tls');
    const dgram = require('node:dgram');
    const http = require('node:http');
    const https = require('node:https');
    const child = require('node:child_process');
    const threads = require('node:worker_threads');
    guard.install(new Set());
    const calls = [
      () => dns.lookup('external.example', () => {}),
      () => dns.promises.resolve4('external.example'),
      () => tls.connect(443, 'external.example'),
      () => new tls.TLSSocket(),
      () => dgram.createSocket('udp4'),
      () => http.request('http://external.example'),
      () => https.get('https://external.example'),
      () => fetch('https://external.example'),
      () => new net.Server().listen(0),
      () => child.spawn('true'),
      () => child.execSync('true'),
      () => new threads.Worker('anything'),
      () => new net.Socket({fd: 1}),
    ];
    for (const call of calls) assert.throws(call, /denied/);
    assert.equal(guard.failures.denied, calls.length);
    assert.throws(() => guard.assertClean(), /violation/);
  `);
});

void test('direct Undici request cannot reach even a stub original socket', () => {
  isolated(`
    const net = require('node:net');
    let reached = 0;
    net.Socket.prototype.connect = function () { reached++; throw new Error('original transport reached'); };
    guard.install(new Set(['127.0.0.1:5432']));
    const undici = require('undici');
    (async () => {
      await assert.rejects(undici.request('http://127.0.0.2:1/'));
      assert.equal(reached, 0);
      assert.ok(guard.failures.denied > 0);
      assert.throws(() => fetch('http://127.0.0.2:1/'), /denied/);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `);
});

void test('real emitted BullMQ driver is intercepted before work', () => {
  isolated(`
    const { createRequire } = require('node:module');
    const serverRequire = createRequire(${JSON.stringify(path.resolve(__dirname, '../../../../package.json'))});
    const file = './dist/engine/core-modules/message-queue/drivers/bullmq.driver.js';
    const { BullMQDriver } = serverRequire(file);
    guard.installWorkerTripwire(serverRequire);
    assert.throws(() => BullMQDriver.prototype.work.call({}), /worker registration denied/);
    assert.equal(guard.failures.worker, 1);
    assert.throws(() => guard.assertClean(), /violation/);
  `);
});

void test('finite launcher kills a detached group with a pipe-holding grandchild', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myah409-process-group-'));
  try {
    const entry = path.join(root, 'fixture.cjs');
    const stageFile = path.join(root, 'stages.jsonl');
    const grandchildPidFile = path.join(root, 'grandchild-pid');
    fs.writeFileSync(stageFile, '', { mode: 0o600 });
    fs.writeFileSync(entry, `
      const fs = require('node:fs');
      const { spawn } = require('node:child_process');
      const grandchild = spawn(process.execPath,
        ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)'],
        { stdio: ['ignore', 'pipe', 'ignore'] });
      fs.writeFileSync(process.env.TEST_GRANDCHILD_PID, String(grandchild.pid));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    `);
    const result = await supervise({
      entry, cwd: root, stageFile, deadlineMs: 1500,
      env: { PATH: process.env.PATH, TEST_GRANDCHILD_PID: grandchildPidFile },
    });
    assert.equal(result.deadlineHit, true);
    assert.equal(result.result, 'failed-or-timed-out');
    assert.equal(result.killError, null);
    assert.ok(result.durationMs < 3000, 'timeout must not wait on descendant-held pipe');
    const pid = Number(fs.readFileSync(grandchildPidFile, 'utf8'));
    let state;
    try {
      state = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0];
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    assert.ok(state === undefined || state === 'Z' || state === 'X',
      'no running descendant may survive group SIGKILL');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

void test('finite launcher accepts only clean, reaped bootstrap completion', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myah409-process-clean-'));
  try {
    const entry = path.join(root, 'fixture.cjs');
    const stageFile = path.join(root, 'stages.jsonl');
    fs.writeFileSync(stageFile, '', { mode: 0o600 });
    fs.writeFileSync(entry, `
      const fs = require('node:fs');
      for (const stage of ['bootstrap-only', 'close-finished'])
        fs.appendFileSync(process.env.TEST_STAGE_FILE,
          JSON.stringify({stage, denied: 0, worker: 0}) + '\\n');
    `);
    const result = await supervise({
      entry, cwd: root, stageFile, deadlineMs: 1500,
      env: { PATH: process.env.PATH, TEST_STAGE_FILE: stageFile },
    });
    assert.equal(result.result, 'bootstrap-only-complete');
    assert.equal(result.unexpectedGroup, false);
    assert.equal(result.groupPresent, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

void test('worker tripwire counts swallowed attempts before BullMQ Worker construction', () => {
  isolated(`
    class BullMQDriver { work() { throw new Error('original worker reached'); } }
    guard.installWorkerTripwire(() => ({ BullMQDriver }));
    assert.throws(() => new BullMQDriver().work(), /worker registration denied/);
    assert.equal(guard.failures.worker, 1);
    assert.throws(() => guard.assertClean(), /violation/);
  `);
});
