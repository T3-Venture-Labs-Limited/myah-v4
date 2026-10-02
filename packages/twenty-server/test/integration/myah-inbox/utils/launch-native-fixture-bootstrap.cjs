'use strict';

// This is a finite, non-listening bootstrap supervisor, not a permission to
// run an unreviewed snapshot. The outside invocation must independently pin
// the complete read-only candidate/Node/env and newly owned DB/Redis.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { readConfig } = require('./native-fixture-guard.cjs');

const DEADLINE_MS = 180_000;
const KILL_GRACE_MS = 1_000;

// POSIX detached child becomes a new process-group leader. No pipes are
// inherited: a grandchild cannot keep this supervisor waiting for EOF.
const supervise = ({ entry, cwd, env, stageFile, deadlineMs }) => new Promise((resolve) => {
  const started = Date.now();
  let child;
  let errorCode = null;
  let deadlineHit = false;
  let killError = null;
  let finished = false;
  let grace;
  const killGroup = () => {
    if (!child?.pid) return;
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') killError = error.code || 'KILL_FAILED'; }
  };
  const present = () => {
    if (!child?.pid) return false;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { return error.code !== 'ESRCH'; }
  };
  const finish = (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    clearTimeout(grace);
    // After the direct child has closed/reaped, any remaining group member is
    // an unexpected descendant, even if SIGKILL subsequently succeeds.
    const unexpectedGroup = present();
    killGroup();
    const groupPresent = present();
    let stages = [];
    try {
      if (fs.statSync(stageFile).size > 4096) throw new Error('Oversized stage receipt');
      stages = fs.readFileSync(stageFile, 'utf8').split('\n').slice(0, 32).flatMap((line) => {
        try {
          const item = JSON.parse(line);
          return typeof item.stage === 'string' && /^[a-z-]{1,32}$/.test(item.stage) &&
            Number.isSafeInteger(item.denied) && Number.isSafeInteger(item.worker)
            ? [{ stage: item.stage, denied: item.denied, worker: item.worker }] : [];
        } catch { return []; }
      });
    } catch { errorCode ||= 'STAGE_READ_FAILED'; }
    const completed = stages.some(({ stage }) => stage === 'bootstrap-only') &&
      stages.some(({ stage }) => stage === 'close-finished') &&
      stages.every(({ denied, worker }) => denied === 0 && worker === 0);
    resolve({
      result: !deadlineHit && code === 0 && !signal && !errorCode && !killError &&
        !unexpectedGroup && !groupPresent && completed ? 'bootstrap-only-complete' : 'failed-or-timed-out',
      durationMs: Date.now() - started,
      deadlineMs,
      processGroupId: child?.pid ?? null,
      exitCode: code,
      signal: signal || null,
      errorCode,
      killError,
      unexpectedGroup,
      groupPresent,
      deadlineHit,
      stages,
    });
  };
  // No shell, no extra arguments, no transport or worker process in this
  // production path; entry is the fixed runner from the pinned snapshot.
  try {
    child = spawn(process.execPath, [entry], {
      cwd, env, detached: true, stdio: 'ignore', windowsHide: true,
    });
  } catch (error) { errorCode = error.code || 'SPAWN_FAILED'; }
  const deadline = setTimeout(() => {
    deadlineHit = true;
    killGroup();
    // A kernel-uninterruptible immediate child cannot keep the wrapper alive.
    // This reports groupPresent, not a false assertion of successful cleanup.
    grace = setTimeout(() => finish(null, 'SIGKILL'), KILL_GRACE_MS);
  }, deadlineMs);
  if (!child) {
    finish(null, null);
    return;
  }
  child.once('error', (error) => { errorCode = error.code || 'SPAWN_FAILED'; });
  child.once('close', (code, signal) => finish(code, signal));
  child.unref();
});

const main = async () => {
  if (process.platform !== 'linux' || process.argv.length !== 2)
    throw new Error('Bootstrap launcher requires Linux and no arguments');
  const { config } = readConfig();
  if (process.cwd() !== config.serverPackagePath ||
      __dirname !== path.join(config.serverPackagePath, 'test/integration/myah-inbox/utils'))
    throw new Error('Bootstrap launcher is outside candidate');
  const entry = path.join(__dirname, 'run-native-fixture-bootstrap.cjs');
  const stageFile = path.join(config.root, `bootstrap-stage-${crypto.randomBytes(8).toString('hex')}.jsonl`);
  fs.closeSync(fs.openSync(stageFile, 'wx', 0o600));
  const summary = await supervise({
    entry, cwd: config.serverPackagePath,
    env: { ...process.env, MYAH409_BOOTSTRAP_STAGE_FILE: stageFile },
    stageFile, deadlineMs: DEADLINE_MS,
  });
  const receipt = path.join(config.root, `bootstrap-${crypto.randomBytes(8).toString('hex')}.json`);
  fs.writeFileSync(receipt, JSON.stringify(summary) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ result: summary.result, receipt }));
  if (summary.result !== 'bootstrap-only-complete') process.exitCode = 1;
};

if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = { supervise };
