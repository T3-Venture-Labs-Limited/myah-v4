import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type UatConfig = { host: string; postgresPort: number; redisPort: number; apiPort: number; frontendPort: number; databaseUrl: string; redisUrl: string; statePath: string; timeoutMs: number; buildPath: string };
type Identity = { startTime: string; command: string };
type State = { token: string; launcherPid: number; launcherIdentity: Identity; apiPid?: number; apiIdentity?: Identity; frontendPid?: number; frontendIdentity?: Identity; config: UatConfig };

export const configFromEnv = (env = process.env): UatConfig => {
  const host = env.UAT_HOST ?? '127.0.0.1';
  const port = (name: string, fallback: number) => Number(env[name] ?? fallback);
  const databaseUrl = env.UAT_DATABASE_URL ?? '';
  let databaseName = '';
  try { databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1)); } catch { throw new Error('UAT_DATABASE_URL must be a valid URL'); }
  if (!databaseUrl || databaseName.toLowerCase() === 'default' || databaseName === '') throw new Error('UAT_DATABASE_URL must name an explicitly disposable database, not default');
  const redisUrl = env.UAT_REDIS_URL ?? '';
  if (!redisUrl) throw new Error('UAT_REDIS_URL is required');
  const apiPort = port('UAT_API_PORT', 3000); const frontendPort = port('UAT_FRONTEND_PORT', 3001);
  if (apiPort === frontendPort) throw new Error('UAT_API_PORT and UAT_FRONTEND_PORT must be distinct');
  return { host, postgresPort: port('UAT_POSTGRES_PORT', 5432), redisPort: port('UAT_REDIS_PORT', 6379), apiPort, frontendPort, databaseUrl, statePath: env.UAT_STATE_PATH ?? join(process.cwd(), '.tmp', 'isolated-uat.json'), timeoutMs: port('UAT_READY_TIMEOUT_SECONDS', 120) * 1000, buildPath: env.UAT_BUILD_PATH ?? join(process.cwd(), '.tmp', 'isolated-uat-build'), redisUrl };
};
export const urlsFor = (config: UatConfig) => ({ apiUrl: `http://${config.host}:${config.apiPort}`, frontendUrl: `http://${config.host}:${config.frontendPort}` });
const occupied = (host: string, port: number) => new Promise<boolean>((resolve) => { const socket = createConnection({ host, port }); socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); socket.setTimeout(250, () => { socket.destroy(); resolve(false); }); });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitForPortFree = async (config: UatConfig) => { const deadline = Date.now() + 10000; while (Date.now() < deadline) { if (!(await occupied(config.host, config.apiPort)) && !(await occupied(config.host, config.frontendPort))) return; await wait(100); } throw new Error('previous UAT generation did not release application ports'); };

export async function assertPortsAvailable(config: UatConfig) { if (await occupied(config.host, config.apiPort)) throw new Error(`Refusing to reuse unrelated api port ${config.host}:${config.apiPort}`); if (await occupied(config.host, config.frontendPort)) throw new Error(`Refusing to reuse unrelated frontend port ${config.host}:${config.frontendPort}`); }
const fetchText = async (url: string, init?: RequestInit) => { const response = await fetch(url, init); return { response, text: await response.text() }; };
const waitFor = async (check: () => Promise<boolean>, label: string, timeoutMs: number) => { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { if (await check()) return; await wait(500); } throw new Error(`Timed out waiting for ${label}`); };
export async function waitForApplication(config: UatConfig) { const { apiUrl, frontendUrl } = urlsFor(config); await waitFor(async () => { try { return (await fetchText(`${apiUrl}/healthz`)).response.ok; } catch { return false; } }, 'API health', config.timeoutMs); await waitFor(async () => { try { const { response, text } = await fetchText(`${apiUrl}/client-config`); return response.ok && JSON.parse(text).authProviders !== undefined; } catch { return false; } }, 'client configuration', config.timeoutMs); await waitFor(async () => { try { const { response, text } = await fetchText(`${apiUrl}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }) }); return response.ok && text.includes('__typename'); } catch { return false; } }, 'queryable core schema', config.timeoutMs); await waitFor(async () => { try { const { response, text } = await fetchText(`${frontendUrl}/`); return response.ok && /id=["']root["']/.test(text); } catch { return false; } }, 'frontend application shell', config.timeoutMs); }
const identity = (pid?: number): Identity | undefined => {
  if (!pid || pid <= 1) return;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return { startTime: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], command };
  } catch { return; }
};
const matches = (pid: number | undefined, expected?: Identity) => { const actual = identity(pid); return Boolean(actual && expected && actual.startTime === expected.startTime && actual.command === expected.command); };
const groupAlive = (pid?: number, expected?: Identity) => Boolean(pid && matches(pid, expected) && (() => { try { process.kill(-pid, 0); return true; } catch { return false; } })());
const stopChild = (pid?: number, expected?: Identity) => { if (groupAlive(pid, expected)) process.kill(-(pid as number), 'SIGTERM'); };
const waitChild = async (pid?: number, expected?: Identity) => { if (!groupAlive(pid, expected)) return true; const deadline = Date.now() + 5000; while (groupAlive(pid, expected) && Date.now() < deadline) await wait(100); if (groupAlive(pid, expected)) process.kill(-(pid as number), 'SIGKILL'); const forced = Date.now() + 2000; while (groupAlive(pid, expected) && Date.now() < forced) await wait(100); return !groupAlive(pid, expected); };
export type ProcessIdentity = Identity;
export const getProcessIdentity = identity;
export const cleanupProcessGroup = async (pid: number, expected: Identity) => { stopChild(pid, expected); return waitChild(pid, expected); };
const readState = (path: string) => {
  if (!existsSync(path)) return;
  try { return JSON.parse(readFileSync(path, 'utf8')) as State; } catch { try { unlinkSync(path); } catch {} return; }
};
export async function cleanupOwned(statePath: string, token?: string) { const state = readState(statePath); if (!state || (token && state.token !== token)) return; if (state.launcherPid !== process.pid && matches(state.launcherPid, state.launcherIdentity)) { try { process.kill(state.launcherPid, 'SIGTERM'); } catch {} return; } if ((state.apiPid && !matches(state.apiPid, state.apiIdentity)) || (state.frontendPid && !matches(state.frontendPid, state.frontendIdentity))) return; stopChild(state.apiPid, state.apiIdentity); stopChild(state.frontendPid, state.frontendIdentity); const clean = await waitChild(state.apiPid, state.apiIdentity) && await waitChild(state.frontendPid, state.frontendIdentity); if (clean) unlinkSync(statePath); }
const writeState = (path: string, state: State) => { const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`; try { writeFileSync(temporary, JSON.stringify(state), { flag: 'wx' }); renameSync(temporary, path); } catch (error) { try { unlinkSync(temporary); } catch {} throw error; } };

export type StartOptions = { run?: (command: string, args: string[], options: Record<string, unknown>) => void; spawn?: typeof spawn; ready?: (config: UatConfig) => Promise<void>; returnAfterReady?: boolean };
export async function start(config = configFromEnv(), options: StartOptions = {}) {
  const previous = readState(config.statePath);
  if (previous) {
    if (previous.launcherPid !== process.pid && matches(previous.launcherPid, previous.launcherIdentity)) {
      try { process.kill(previous.launcherPid, 'SIGTERM'); } catch {}
      await waitForPortFree(previous.config);
    } else {
      stopChild(previous.apiPid, previous.apiIdentity); stopChild(previous.frontendPid, previous.frontendIdentity);
      if (!(await waitChild(previous.apiPid, previous.apiIdentity)) || !(await waitChild(previous.frontendPid, previous.frontendIdentity))) throw new Error('Unable to clean previous UAT generation');
      if (existsSync(config.statePath)) unlinkSync(config.statePath);
    }
  }
  await assertPortsAvailable(config);
  const run = options.run ?? ((command, args, runOptions) => execFileSync(command, args, runOptions as never));
  const spawnProcess = options.spawn ?? spawn;
  const { apiUrl, frontendUrl } = urlsFor(config); const token = randomUUID(); const env = { ...process.env, NODE_PORT: String(config.apiPort), SERVER_URL: apiUrl, FRONTEND_URL: frontendUrl, REACT_APP_SERVER_BASE_URL: apiUrl, BACKEND_BASE_URL: apiUrl, FRONTEND_BASE_URL: frontendUrl, PG_DATABASE_URL: config.databaseUrl, REDIS_URL: config.redisUrl };
  run('yarn', ['nx', 'run', 'twenty-server:database:reset:seed'], { env, stdio: 'inherit' });
  mkdirSync(config.buildPath, { recursive: true }); run('yarn', ['nx', 'build', 'twenty-front'], { env, stdio: 'inherit' }); run('cp', ['-R', 'packages/twenty-front/build/.', join(config.buildPath, 'build')], { stdio: 'inherit' }); run('sh', [join(process.cwd(), 'packages/twenty-front/scripts/inject-runtime-env.sh')], { cwd: config.buildPath, env: { ...env, REACT_APP_SERVER_BASE_URL: apiUrl }, stdio: 'inherit' });
  const api = spawnProcess('yarn', ['nx', 'run', 'twenty-server:start:ci'], { env, detached: true, stdio: 'inherit' });
  const frontend = spawnProcess('npx', ['--yes', 'serve', '-s', join(config.buildPath, 'build'), '--listen', `tcp://${config.host}:${config.frontendPort}`], { env, detached: true, stdio: 'inherit' });
  const apiIdentity = identity(api.pid); const frontendIdentity = identity(frontend.pid); const launcherIdentity = identity(process.pid);
  if (!api.pid || !frontend.pid || !apiIdentity || !frontendIdentity || !launcherIdentity) { stopChild(api.pid, apiIdentity); stopChild(frontend.pid, frontendIdentity); await waitChild(api.pid, apiIdentity); await waitChild(frontend.pid, frontendIdentity); throw new Error('Unable to start isolated UAT processes'); }
  const state: State = { token, launcherPid: process.pid, launcherIdentity, apiPid: api.pid, apiIdentity, frontendPid: frontend.pid, frontendIdentity, config };
  try { mkdirSync(dirname(config.statePath), { recursive: true }); writeState(config.statePath, state); } catch (error) { stopChild(api.pid, apiIdentity); stopChild(frontend.pid, frontendIdentity); await waitChild(api.pid, apiIdentity); await waitChild(frontend.pid, frontendIdentity); throw error; }
  const shutdown = async (exitCode?: number) => { stopChild(api.pid, apiIdentity); stopChild(frontend.pid, frontendIdentity); const clean = await waitChild(api.pid, apiIdentity) && await waitChild(frontend.pid, frontendIdentity); if (!clean) throw new Error('Unable to confirm UAT process cleanup'); if (readState(config.statePath)?.token === token) unlinkSync(config.statePath); if (exitCode !== undefined) process.exit(exitCode); };
  try { await (options.ready ? options.ready(config) : waitForApplication(config)); console.log(`Isolated UAT ready: ${frontendUrl} (API ${apiUrl})`); if (options.returnAfterReady) return; await new Promise<void>(() => undefined); } catch (error) { await shutdown(); throw error; }
}
if (import.meta.url === `file://${process.argv[1]}`) start().catch((error) => { console.error(error); process.exit(1); });
