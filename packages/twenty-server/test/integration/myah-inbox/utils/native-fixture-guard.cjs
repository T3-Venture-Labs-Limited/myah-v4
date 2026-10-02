'use strict';

// This guard is loaded before any application module. It confines accidental
// Node transport use, not malicious native addons or a hostile process.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const dns = require('node:dns');
const tls = require('node:tls');
const dgram = require('node:dgram');
const http = require('node:http');
const https = require('node:https');
const child = require('node:child_process');
const threads = require('node:worker_threads');
const { syncBuiltinESMExports } = require('node:module');

const failures = { denied: 0, worker: 0, allowedTcp: 0 };
const deny = (operation) => {
  failures.denied++;
  throw new Error(`Native fixture transport denied: ${operation}`);
};

const inside = (root, target) => path.isAbsolute(target) &&
  path.relative(root, target) !== '' &&
  !path.relative(root, target).startsWith(`..${path.sep}`) &&
  path.relative(root, target) !== '..' &&
  !path.isAbsolute(path.relative(root, target));

// A complete, sorted digest of *every* file, directory and symlink in the
// frozen candidate (including emitted server, dependencies and this runner).
// An extra executable or omitted dependency changes the digest. A reviewed
// value must arrive separately from the fixture receipt and be pinned by the
// supervisor's launcher; matching a self-authored receipt is not approval.
const digestReadOnlyTree = (root) => {
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root)
    throw new Error('Candidate root must be canonical');
  const hash = crypto.createHash('sha256');
  const visit = (target, relative) => {
    const stat = fs.lstatSync(target);
    if (!stat.isSymbolicLink() && (stat.mode & 0o222))
      throw new Error('Candidate snapshot must be read-only');
    const mode = stat.mode & 0o7777;
    if (stat.isSymbolicLink()) {
      const link = fs.readlinkSync(target);
      const resolved = fs.realpathSync(target);
      if (!inside(root, resolved)) throw new Error('Candidate symlink escapes snapshot');
      hash.update(JSON.stringify([relative, 'link', mode, link]) + '\n');
    } else if (stat.isDirectory()) {
      hash.update(JSON.stringify([relative, 'dir', mode]) + '\n');
      for (const name of fs.readdirSync(target).sort()) visit(path.join(target, name), path.posix.join(relative, name));
    } else if (stat.isFile()) {
      const fileHash = crypto.createHash('sha256');
      const fd = fs.openSync(target, 'r');
      try {
        const buffer = Buffer.allocUnsafe(65536);
        for (;;) {
          const count = fs.readSync(fd, buffer, 0, buffer.length, null);
          if (!count) break;
          fileHash.update(buffer.subarray(0, count));
        }
      } finally { fs.closeSync(fd); }
      hash.update(JSON.stringify([relative, 'file', mode, stat.size, fileHash.digest('hex')]) + '\n');
    } else throw new Error('Unexpected candidate device/socket');
  };
  visit(root, '.');
  return hash.digest('hex');
};

const assertPinnedCandidate = (config) => {
  const approved = process.env.MYAH409_APPROVED_CANDIDATE_SHA256;
  const approvedNode = process.env.MYAH409_APPROVED_NODE_SHA256;
  if (!/^[a-f0-9]{64}$/.test(approved || '') || !/^[a-f0-9]{64}$/.test(approvedNode || '') ||
      approved !== config.candidateSha256 ||
      typeof config.candidateRoot !== 'string' ||
      !/^\/home\/superdao\/\.local\/share\/myah-scratch\/myah409-native-[a-z0-9-]+$/.test(config.candidateRoot) ||
      (config.candidateRoot === config.root || inside(config.root, config.candidateRoot) ||
       inside(config.candidateRoot, config.root)) ||
      config.serverPackagePath !== path.join(config.candidateRoot, 'packages/twenty-server'))
    throw new Error('Candidate has no independent snapshot pin');
  if (digestReadOnlyTree(config.candidateRoot) !== approved ||
      crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex') !== approvedNode)
    throw new Error('Candidate/Node snapshot mismatch');
};

const ownedDirectory = (directory) => {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      fs.realpathSync(directory) !== directory || stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0) throw new Error('Fixture directory must be private and owned');
};

const validateEndpoints = (config) => {
  const pg = new URL(config.pgUrl);
  const redis = new URL(config.redisUrl);
  if (!['postgres:', 'postgresql:'].includes(pg.protocol) || pg.hostname !== '127.0.0.1' ||
      !/^myah_409_native_[a-z0-9_]+$/.test(decodeURIComponent(pg.pathname.slice(1))) ||
      pg.search || pg.hash || pg.port !== '5432' || !pg.username || !pg.password ||
      redis.protocol !== 'redis:' || redis.hostname !== '127.0.0.1' ||
      !/^(63[0-9][0-9])$/.test(redis.port) || redis.port === '6379' ||
      redis.username || redis.password || redis.search || redis.hash)
    throw new Error('Fixture DB/Redis endpoint not independently bounded');
  return new Set(['127.0.0.1:5432', `127.0.0.1:${redis.port}`]);
};

const readConfig = () => {
  // The receipt is created/reviewed outside this runner, not derived from an
  // arbitrary CLI manifest, workspace or URL argument.
  const receiptPath = process.env.MYAH409_NATIVE_FIXTURE_RECEIPT;
  const expectedHash = process.env.MYAH409_NATIVE_FIXTURE_RECEIPT_SHA256;
  if (!receiptPath || !/^[a-f0-9]{64}$/.test(expectedHash || '') ||
      !path.isAbsolute(receiptPath)) throw new Error('Missing pinned private fixture receipt');
  const stat = fs.lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(receiptPath) !== receiptPath ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o077) !== 0) throw new Error('Fixture receipt must be private and owned');
  const bytes = fs.readFileSync(receiptPath);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expectedHash)
    throw new Error('Fixture receipt hash mismatch');
  const config = JSON.parse(bytes.toString('utf8'));
  const root = config.root;
  if (typeof root !== 'string' || !/^\/home\/superdao\/\.local\/share\/myah-scratch\/myah409-native-[a-z0-9-]+$/.test(root))
    throw new Error('Non-native fixture root');
  ownedDirectory(root);
  if (!inside(root, receiptPath) || path.resolve(receiptPath) !== receiptPath)
    throw new Error('Receipt outside fixture');
  for (const directory of [config.tmp, config.storage]) {
    if (typeof directory !== 'string' || !inside(root, directory))
      throw new Error('Fixture path outside root');
    ownedDirectory(directory);
  }
  if (process.env.TMPDIR !== config.tmp || process.env.STORAGE_LOCAL_PATH !== config.storage ||
      process.env.STORAGE_TYPE !== 'LOCAL' || process.env.NODE_ENV !== 'test' ||
      process.env.IS_CONFIG_VARIABLES_IN_DB_ENABLED !== 'false' ||
      process.env.PG_DATABASE_URL !== config.pgUrl || process.env.REDIS_URL !== config.redisUrl ||
      process.env.REDIS_QUEUE_URL !== config.redisUrl || process.env.MESSAGE_QUEUE_TYPE !== 'bull-mq')
    throw new Error('Effective fixture environment mismatch');
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.HTTP_PROXY ||
      process.env.HTTPS_PROXY || process.env.ALL_PROXY || process.env.http_proxy ||
      process.env.https_proxy || process.env.all_proxy)
    throw new Error('Inherited preload or proxy');
  const envFile = process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;
  if (envFile !== config.envFile || typeof envFile !== 'string' || !inside(root, envFile))
    throw new Error('Unexpected dotenv selector');
  const envStat = fs.lstatSync(envFile);
  if (!envStat.isFile() || envStat.isSymbolicLink() || fs.realpathSync(envFile) !== envFile ||
      envStat.uid !== process.getuid() ||
      (envStat.mode & 0o077) !== 0 ||
      crypto.createHash('sha256').update(fs.readFileSync(envFile)).digest('hex') !== config.envSha256)
    throw new Error('Fixture dotenv changed');
  const allowed = validateEndpoints(config);
  if (config.workspaceId && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(config.workspaceId))
    throw new Error('Invalid fixture workspace ID');
  return { config, allowed };
};

const normalizeConnect = (args) => {
  let options;
  if (typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
    options = args[0];
  } else if (typeof args[0] === 'number' || (typeof args[0] === 'string' && /^\d+$/.test(args[0]))) {
    options = { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
  } else return null;
  if (options.path || options.fd !== undefined || options.localAddress || options.localPort ||
      options.lookup || options.family === 6 || options.autoSelectFamily ||
      !Number.isInteger(Number(options.port)) || String(options.port) !== String(Number(options.port))) return null;
  return `${options.host || 'localhost'}:${options.port}`;
};

const install = (allowed) => {
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const endpoint = normalizeConnect(args);
    if (!endpoint || !allowed.has(endpoint)) return deny('tcp');
    failures.allowedTcp++;
    return originalConnect.apply(this, args);
  };
  // Constructor fd attachment bypasses connect. net.createConnection still
  // routes through the patched prototype; direct fd constructors are denied.
  const Socket = net.Socket;
  net.Socket = class FixtureSocket extends Socket {
    constructor(options) {
      if (options && typeof options === 'object' && options.fd !== undefined) deny('socket-fd');
      super(options);
    }
  };
  net.Stream = net.Socket;
  net.Server.prototype.listen = () => deny('listen');
  tls.connect = () => deny('tls');
  const TLSSocket = tls.TLSSocket;
  tls.TLSSocket = class FixtureTLSSocket extends TLSSocket {
    constructor() { deny('tls-socket'); }
  };
  for (const method of [
    'lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny',
    'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs',
    'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse', 'setServers',
  ]) {
    if (typeof dns[method] === 'function') dns[method] = () => deny('dns');
    if (dns.promises && typeof dns.promises[method] === 'function')
      dns.promises[method] = () => deny('dns');
  }
  dns.Resolver = class FixtureResolver { constructor() { deny('dns-resolver'); } };
  if (dns.promises) dns.promises.Resolver = dns.Resolver;
  dgram.createSocket = () => deny('udp');
  for (const method of ['bind', 'connect', 'send'])
    dgram.Socket.prototype[method] = () => deny('udp');
  for (const transport of [http, https]) {
    transport.request = () => deny('http');
    transport.get = () => deny('http');
  }
  globalThis.fetch = () => deny('fetch');
  if (globalThis.WebSocket) globalThis.WebSocket = class FixtureWebSocket {
    constructor() { deny('websocket'); }
  };
  for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
    child[method] = () => deny('child');
  child.ChildProcess.prototype.spawn = () => deny('child');
  threads.Worker = class FixtureWorker { constructor() { deny('worker-thread'); } };
  syncBuiltinESMExports();
};

const installWorkerTripwire = (serverRequire) => {
  const { BullMQDriver } = serverRequire('./dist/engine/core-modules/message-queue/drivers/bullmq.driver.js');
  BullMQDriver.prototype.work = function () {
    failures.worker++;
    throw new Error('Native fixture worker registration denied');
  };
};

const assertClean = () => {
  if (failures.denied || failures.worker) throw new Error('Native fixture transport/worker violation');
};

module.exports = { readConfig, validateEndpoints, digestReadOnlyTree, assertPinnedCandidate, install, installWorkerTripwire, assertClean, failures };
