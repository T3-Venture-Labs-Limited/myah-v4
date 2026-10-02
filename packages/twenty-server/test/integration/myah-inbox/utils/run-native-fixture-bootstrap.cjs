'use strict';

// Bootstrap smoke only: never install, synchronize, initialize triage or
// listen. Copy/review this runner with the exact compiled candidate; do not
// invoke the ordinary integration global setup or a queue worker.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const guard = require('./native-fixture-guard.cjs');

const { config, allowed } = guard.readConfig(); // built-ins only, before app imports
if (process.argv.length !== 2) throw new Error('Runner takes no arguments');
if (process.cwd() !== config.serverPackagePath ||
    !path.isAbsolute(config.serverPackagePath) ||
    fs.realpathSync(config.serverPackagePath) !== config.serverPackagePath ||
    !config.serverPackagePath.endsWith('/packages/twenty-server'))
  throw new Error('Unexpected candidate server package');

guard.install(allowed);
guard.assertPinnedCandidate(config); // full frozen tree + separately supplied approved digest
const stageFile = process.env.MYAH409_BOOTSTRAP_STAGE_FILE;
if (!stageFile || !path.isAbsolute(stageFile) ||
    !stageFile.startsWith(config.root + '/') ||
    fs.realpathSync(stageFile) !== stageFile) throw new Error('Missing owned bootstrap stage file');
const stageStat = fs.lstatSync(stageFile);
if (!stageStat.isFile() || stageStat.uid !== process.getuid() || (stageStat.mode & 0o077) !== 0)
  throw new Error('Unsafe bootstrap stage file');
const stage = (name) => fs.appendFileSync(stageFile,
  JSON.stringify({ stage: name, denied: guard.failures.denied, worker: guard.failures.worker }) + '\n');
const serverRequire = createRequire(path.join(config.serverPackagePath, 'package.json'));

// No dotenv file may introduce a different effective target at module load.
const dotenv = serverRequire('dotenv');
const env = dotenv.parse(fs.readFileSync(config.envFile));
for (const [key, value] of Object.entries({
  PG_DATABASE_URL: config.pgUrl,
  REDIS_URL: config.redisUrl,
  REDIS_QUEUE_URL: config.redisUrl,
  STORAGE_TYPE: 'LOCAL',
  STORAGE_LOCAL_PATH: config.storage,
  IS_CONFIG_VARIABLES_IN_DB_ENABLED: 'false',
  NODE_ENV: 'test',
})) {
  if (env[key] !== value || process.env[key] !== value)
    throw new Error(`Effective fixture setting mismatch: ${key}`);
}

guard.installWorkerTripwire(serverRequire);

const load = (file, exported) => serverRequire(`./dist/${file}.js`)[exported];
const assertGraph = (app) => {
  const modules = [...app.container.getModules().values()];
  const denied = new Set([
    'JobsModule', 'MessageQueueExplorer', 'DatabaseConfigModule',
    'DatabaseConfigDriver', 'ScheduleModule', 'SchedulerOrchestrator',
  ]);
  for (const module of modules) {
    if (denied.has(module.metatype?.name)) throw new Error('Forbidden bootstrap module');
    for (const wrapper of module.providers.values()) {
      if (denied.has(wrapper.metatype?.name) || denied.has(wrapper.instance?.constructor?.name))
        throw new Error('Forbidden bootstrap provider');
    }
  }
  return modules.length;
};

const main = async () => {
  let app;
  try {
    stage('factory-start');
    load('database/pg/set-pg-date-type-parser', 'setPgDateTypeParser')();
    const { NestFactory } = serverRequire('@nestjs/core');
    const AppModule = load('app.module', 'AppModule');
    app = await NestFactory.create(AppModule, { logger: false });
    stage('factory-ready');
    const moduleCount = assertGraph(app);
    const configService = app.get(load('engine/core-modules/twenty-config/twenty-config.service', 'TwentyConfigService'), { strict: false });
    for (const [key, expected] of Object.entries({
      PG_DATABASE_URL: config.pgUrl, REDIS_URL: config.redisUrl,
      REDIS_QUEUE_URL: config.redisUrl, STORAGE_TYPE: 'LOCAL', STORAGE_LOCAL_PATH: config.storage,
    })) {
      if (configService.get(key) !== expected) throw new Error(`Resolved setting mismatch: ${key}`);
    }
    for (const [file, name] of [
      ['engine/core-modules/application/application-registration/application-registration.service', 'ApplicationRegistrationService'],
      ['engine/core-modules/application/application.service', 'ApplicationService'],
      ['engine/core-modules/file-storage/file-storage.service', 'FileStorageService'],
      ['engine/core-modules/application/application-manifest/application-sync.service', 'ApplicationSyncService'],
      ['database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748001-initialize-myah-inbox-contact-triage.command', 'InitializeMyahInboxContactTriageWorkspaceCommand'],
      ['database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789633748002-catch-up-myah-inbox-contact-triage.command', 'CatchUpMyahInboxContactTriageWorkspaceCommand'],
      ['engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager', 'GlobalWorkspaceOrmManager'],
    ]) app.get(load(file, name), { strict: false });
    guard.assertClean();
    stage('init-start');
    await app.init(); // no app.listen, no application/triage mutation
    assertGraph(app);
    guard.assertClean();
    stage('init-ready');
    if (!Number.isSafeInteger(moduleCount) || moduleCount < 1) throw new Error('Empty bootstrap graph');
    stage('bootstrap-only');
  } finally {
    stage('close-start');
    try { if (app) await app.close(); stage('close-finished'); }
    finally { guard.assertClean(); }
  }
};

main().catch((error) => {
  console.error(JSON.stringify({ stage: 'failed', type: error?.constructor?.name || 'Error', denied: guard.failures.denied, worker: guard.failures.worker }));
  process.exitCode = 1;
});
