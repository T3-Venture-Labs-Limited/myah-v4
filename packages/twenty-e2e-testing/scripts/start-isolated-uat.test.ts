import { spawn as spawnChild, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupProcessGroup, getProcessIdentity, cleanupOwned, configFromEnv, start, urlsFor } from './start-isolated-uat';

const baseEnv = (extra: Record<string, string> = {}) => ({ UAT_DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/uat_disposable', UAT_REDIS_URL: 'redis://127.0.0.1:6379/5', UAT_POSTGRES_PORT: '0', UAT_REDIS_PORT: '0', ...extra });
const root = () => mkdtempSync(join(tmpdir(), 'myah-uat-'));
const waitIdentity = async (pid: number) => { for (;;) { const value = getProcessIdentity(pid); if (value) return value; await new Promise<void>(resolve => setImmediate(resolve)); } };
const controlled = (token?: string, script = 'setInterval(()=>{},1000)') => spawnChild(process.execPath, ['-e', script], { detached: true, env: { ...process.env, ...(token ? { UAT_OWNER_TOKEN: token } : {}) }, stdio: 'ignore' });

 describe('isolated UAT ownership contract', () => {
  it('composes URLs and rejects default databases', () => { const config = configFromEnv(baseEnv({ UAT_API_PORT: '43100', UAT_FRONTEND_PORT: '43101' })); assert.deepEqual(urlsFor(config), { apiUrl: 'http://127.0.0.1:43100', frontendUrl: 'http://127.0.0.1:43101' }); assert.throws(() => configFromEnv(baseEnv({ UAT_DATABASE_URL: 'postgres://localhost/default' })), /explicitly disposable/); });
  it('registers signals and persists token before first spawn while preserving commands', async () => {
    const directory = root(); const path = join(directory, 'state.json'); const config = configFromEnv(baseEnv({ UAT_STATE_PATH: path, UAT_BUILD_PATH: join(directory, 'build'), UAT_API_PORT: '43102', UAT_FRONTEND_PORT: '43103' })); const commands: string[] = []; const signals: string[] = []; const children: ChildProcess[] = [];
    const spawn = ((command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => { assert.equal(existsSync(path), true); assert.ok(options.env?.UAT_OWNER_TOKEN); children.push(controlled(options.env?.UAT_OWNER_TOKEN)); return children.at(-1)!; }) as never;
    await start(config, { run: (command, args) => commands.push([command, ...args].join(' ')), spawn, ready: async () => {}, returnAfterReady: true, registerSignal: (signal) => signals.push(signal) });
    assert.deepEqual(commands.slice(0, 4), ['yarn nx run twenty-server:database:reset:seed', 'yarn nx build twenty-front', 'cp -R packages/twenty-front/build/. ' + join(config.buildPath, 'build'), 'sh ' + join(process.cwd(), 'packages/twenty-front/scripts/inject-runtime-env.sh')]); assert.deepEqual(signals, ['SIGINT', 'SIGTERM']); const state = JSON.parse(readFileSync(path, 'utf8')); assert.match(state.token, /^[0-9a-f]{64}$/); await cleanupOwned(path); });
  it('recovers provisional state by token when child slots are absent', async () => { const directory = root(); const path = join(directory, 'state.json'); const token = 'recovery-token'; const child = controlled(token); const identity = await waitIdentity(child.pid!); const config = configFromEnv(baseEnv({ UAT_STATE_PATH: path })); writeFileSync(path, JSON.stringify({ token, launcherPid: 999999, launcherIdentity: { ...identity, startTime: 'gone' }, config })); await cleanupOwned(path); assert.equal(existsSync(path), false); });
  it('refuses reused unauthenticated process groups', async () => { const child = controlled(undefined); const identity = await waitIdentity(child.pid!); assert.equal(await cleanupProcessGroup(child.pid!, identity), false); child.kill('SIGKILL'); });
  it('escalates TERM-resistant token-owned groups and confirms death', async () => { const token = 'term-resistant'; const child = controlled(token, 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'); const identity = await waitIdentity(child.pid!); assert.equal(await cleanupProcessGroup(child.pid!, identity), true); });
  it('retains state when atomic write fails with an unconfirmed survivor', async () => { const directory = root(); const blocked = join(directory, 'blocked'); writeFileSync(blocked, 'not a directory'); const config = configFromEnv(baseEnv({ UAT_STATE_PATH: join(blocked, 'state.json'), UAT_BUILD_PATH: join(directory, 'build') })); await assert.rejects(start(config, { run: () => {}, spawn: (() => { throw new Error('must not spawn'); }) as never, ready: async () => {}, returnAfterReady: true })); });
 });
