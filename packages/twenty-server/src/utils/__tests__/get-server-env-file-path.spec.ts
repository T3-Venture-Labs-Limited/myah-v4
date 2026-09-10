import { ChildProcess, spawn, type SpawnOptions } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { constants as osConstants, tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';

import { getServerEnvFilePath } from 'src/utils/get-server-env-file-path';

const SELECTOR = 'TWENTY_SERVER_INTEGRATION_ENV_FILE';
const EMPTY_SELECTOR_ERROR =
  'TWENTY_SERVER_INTEGRATION_ENV_FILE must be a non-empty path';
const SERVER_ROOT = resolve(__dirname, '../../..');
const REPOSITORY_ROOT = resolve(SERVER_ROOT, '../..');

const ENV_KEYS = [
  'NODE_ENV',
  SELECTOR,
  'IS_BILLING_ENABLED',
  'PG_DATABASE_URL',
  'METER_DRIVER',
  'EXCEPTION_HANDLER_DRIVER',
] as const;
type EnvSnapshot = Record<
  (typeof ENV_KEYS)[number],
  { isPresent: boolean; value: string | undefined }
>;

const snapshotEnvironment = (): EnvSnapshot =>
  Object.fromEntries(
    ENV_KEYS.map((key) => [
      key,
      {
        isPresent: Object.prototype.hasOwnProperty.call(process.env, key),
        value: process.env[key],
      },
    ]),
  ) as EnvSnapshot;

const restoreEnvironment = (snapshot: EnvSnapshot) => {
  for (const key of ENV_KEYS) {
    const previous = snapshot[key];

    if (previous.isPresent) {
      process.env[key] = previous.value;
    } else {
      delete process.env[key];
    }
  }
};

describe('getServerEnvFilePath', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnvironment();
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    restoreEnvironment(envSnapshot);
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('returns .env.test byte-for-byte in test when the selector is absent', () => {
    process.env.NODE_ENV = 'test';
    delete process.env[SELECTOR];

    expect(getServerEnvFilePath()).toBe('.env.test');
  });

  it.each([undefined, 'development', 'production'])(
    'returns .env and ignores every selector value when NODE_ENV is %s',
    (nodeEnv) => {
      if (nodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = nodeEnv;
      }

      for (const selector of ['/synthetic/selected.env', '', ' \t\n ']) {
        process.env[SELECTOR] = selector;
        expect(getServerEnvFilePath()).toBe('.env');
      }
    },
  );

  it.each([
    '/synthetic/private/integration.env',
    './relative synthetic/integration.env',
  ])('preserves a nonblank test selection byte-for-byte: %s', (selector) => {
    process.env.NODE_ENV = 'test';
    process.env[SELECTOR] = selector;

    expect(getServerEnvFilePath()).toBe(selector);
  });

  it.each(['', ' ', '\t', '\n', ' \t\n '])(
    'throws the fixed redacted error for a blank test selection',
    (selector) => {
      process.env.NODE_ENV = 'test';
      process.env[SELECTOR] = selector;

      expect(() => getServerEnvFilePath()).toThrow(
        new Error(EMPTY_SELECTOR_ERROR),
      );
    },
  );
});

describe('reachable env-loader use sites', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnvironment();
    process.env.NODE_ENV = 'test';
    process.env[SELECTOR] = '/synthetic/selected.env';
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    restoreEnvironment(envSnapshot);
    jest.restoreAllMocks();
    jest.dontMock('dotenv');
    jest.dontMock('typeorm');
    jest.dontMock('@nestjs/typeorm');
    jest.dontMock('@nestjs/config');
    jest.dontMock('@opentelemetry/api');
    jest.dontMock('@opentelemetry/exporter-metrics-otlp-http');
    jest.dontMock('@opentelemetry/exporter-prometheus');
    jest.dontMock('@opentelemetry/sdk-metrics');
    jest.dontMock('@sentry/node');
    jest.dontMock('@sentry/profiling-node');
    jest.resetModules();
  });

  it('loads the selected env before Jest filter capture and keeps override enabled', () => {
    const events: string[] = [];
    const config = jest.fn((_options: { path: string; override?: boolean }) => {
      events.push('dotenv');
      process.env.IS_BILLING_ENABLED = 'true';

      return { parsed: {} };
    });

    jest.doMock('dotenv', () => ({ __esModule: true, default: { config } }));

    let jestConfig: { testPathIgnorePatterns?: string[] } | undefined;

    jest.isolateModules(() => {
      jestConfig = require('../../../jest-integration.config').default;
      events.push('filters');
    });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({
      path: '/synthetic/selected.env',
      override: true,
    });
    expect(events).toEqual(['dotenv', 'filters']);
    expect(jestConfig?.testPathIgnorePatterns).not.toContain(
      '<rootDir>/test/integration/billing',
    );
  });

  it.each([
    {
      label: 'raw datasource',
      modulePath: 'src/database/typeorm/raw/raw.datasource',
      exportedOptions: (loaded: Record<string, unknown>) =>
        (loaded.rawDataSource as { options: unknown }).options,
    },
    {
      label: 'core datasource',
      modulePath: 'src/database/typeorm/core/core.datasource',
      exportedOptions: (loaded: Record<string, unknown>) =>
        loaded.typeORMCoreModuleOptions,
    },
  ])(
    'loads the selected env before $label option construction and keeps override enabled',
    ({ modulePath, exportedOptions }) => {
      const events: string[] = [];
      const config = jest.fn(
        (_options: { path: string; override?: boolean }) => {
          events.push('dotenv');
          process.env.PG_DATABASE_URL =
            'postgresql://selected.invalid/isolated';

          return { parsed: {} };
        },
      );
      const DataSource = jest.fn(function (
        this: { options: unknown },
        options: unknown,
      ) {
        events.push('datasource');
        this.options = options;
      });

      jest.doMock('dotenv', () => ({ config }));
      jest.doMock('typeorm', () => ({ DataSource }));
      jest.doMock('@nestjs/typeorm', () => ({}));

      let loaded: Record<string, unknown> = {};

      jest.isolateModules(() => {
        loaded = require(modulePath);
      });

      expect(config).toHaveBeenCalledTimes(1);
      expect(config).toHaveBeenCalledWith({
        path: '/synthetic/selected.env',
        override: true,
      });
      expect(events).toEqual(['dotenv', 'datasource']);
      expect(exportedOptions(loaded)).toMatchObject({
        url: 'postgresql://selected.invalid/isolated',
      });
    },
  );

  it('loads the selected env before telemetry capture without enabling override', () => {
    const events: string[] = [];
    const config = jest.fn((_options: { path: string; override?: boolean }) => {
      events.push('dotenv');
      process.env.METER_DRIVER = '';
      process.env.EXCEPTION_HANDLER_DRIVER = 'CONSOLE';

      return { parsed: {} };
    });
    const MeterProvider = jest.fn(() => {
      events.push('meter');

      return {};
    });

    jest.doMock('dotenv', () => ({ __esModule: true, default: { config } }));
    jest.doMock('@opentelemetry/api', () => ({
      metrics: { setGlobalMeterProvider: jest.fn() },
    }));
    jest.doMock('@opentelemetry/exporter-metrics-otlp-http', () => ({
      OTLPMetricExporter: jest.fn(),
    }));
    jest.doMock('@opentelemetry/exporter-prometheus', () => ({
      PrometheusExporter: jest.fn(),
    }));
    jest.doMock('@opentelemetry/sdk-metrics', () => ({
      AggregationTemporality: { DELTA: 'DELTA' },
      ConsoleMetricExporter: jest.fn(),
      MeterProvider,
      PeriodicExportingMetricReader: jest.fn(),
    }));
    jest.doMock('@sentry/node', () => ({
      getIsolationScope: jest.fn(),
      init: jest.fn(),
    }));
    jest.doMock('@sentry/profiling-node', () => ({
      nodeProfilingIntegration: jest.fn(),
    }));

    jest.isolateModules(() => {
      require('src/instrument');
    });

    expect(config).toHaveBeenCalledTimes(1);
    expect(config).toHaveBeenCalledWith({
      path: '/synthetic/selected.env',
    });
    expect(events).toEqual(['dotenv', 'meter']);
  });

  it('passes the selected env to ConfigModule before Nest config capture', () => {
    const events: string[] = [];
    const forRoot = jest.fn((_options: { envFilePath: string }) => {
      events.push('config');

      return Promise.resolve({ module: class SyntheticConfigModule {} });
    });

    jest.doMock('@nestjs/config', () => ({
      ConfigModule: { forRoot },
    }));

    jest.isolateModules(() => {
      require('src/engine/core-modules/environment/environment.module');
    });

    expect(forRoot).toHaveBeenCalledTimes(1);
    expect(forRoot).toHaveBeenCalledWith(
      expect.objectContaining({ envFilePath: '/synthetic/selected.env' }),
    );
    expect(events).toEqual(['config']);
  });

  it.each([
    {
      label: 'Jest config',
      modulePath: '../../../jest-integration.config',
      dotenvShape: 'default',
    },
    {
      label: 'raw datasource',
      modulePath: 'src/database/typeorm/raw/raw.datasource',
      dotenvShape: 'named',
    },
    {
      label: 'core datasource',
      modulePath: 'src/database/typeorm/core/core.datasource',
      dotenvShape: 'named',
    },
    {
      label: 'instrumentation',
      modulePath: 'src/instrument',
      dotenvShape: 'default',
    },
  ])(
    'rejects empty and whitespace selectors before $label calls dotenv',
    ({ modulePath, dotenvShape }) => {
      const config = jest.fn();

      jest.doMock('dotenv', () =>
        dotenvShape === 'default'
          ? { __esModule: true, default: { config } }
          : { config },
      );

      for (const blankSelector of ['', ' \t ']) {
        process.env[SELECTOR] = blankSelector;

        expect(() => {
          jest.isolateModules(() => require(modulePath));
        }).toThrow(new Error(EMPTY_SELECTOR_ERROR));
      }
      expect(config).not.toHaveBeenCalled();
    },
  );

  it('rejects empty and whitespace selectors before ConfigModule is called', () => {
    const forRoot = jest.fn();

    jest.doMock('@nestjs/config', () => ({
      ConfigModule: { forRoot },
    }));

    for (const blankSelector of ['', '\n']) {
      process.env[SELECTOR] = blankSelector;

      expect(() => {
        jest.isolateModules(() =>
          require('src/engine/core-modules/environment/environment.module'),
        );
      }).toThrow(new Error(EMPTY_SELECTOR_ERROR));
    }
    expect(forRoot).not.toHaveBeenCalled();
  });
});

type ChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  startupTimedOut: boolean;
  overflowed: boolean;
  spawnFailed: boolean;
  spawnConfirmed: boolean;
  closeSettled: boolean;
  supervisionFailed: boolean;
  lifecycleVerificationFailed: boolean;
  runnerPidWasAssigned: boolean;
  ownedProcessGroupWasAssigned: boolean;
  ownedProcessGroupMatchesRunnerPid: boolean;
  runnerPidAbsent: boolean;
  ownedProcessGroupAbsent: boolean;
  descendantPidWasReported: boolean;
  descendantPidAbsent: boolean;
  stdoutMatchesProtocol: boolean;
  stderrIsEmpty: boolean;
};

type ChildLimits = {
  timeoutMs?: number;
  startupTimeoutMs?: number;
  waitForDescendantReady?: boolean;
  maxOutputBytes?: number;
};

type ProcessTargetState = 'absent' | 'present' | 'verification-failed';
type SpawnChild = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;
type SignalProcess = (target: number, signal: NodeJS.Signals | 0) => boolean;
type OwnedFixtureWriter = (
  path: string,
  contents: string,
  options: { encoding: 'utf8'; mode: number },
) => Promise<void>;
type OwnedTempCleanupState = {
  childRunAttempted: boolean;
  childStarted: boolean;
  spawnFailed: boolean;
  lifecycleAbsenceWasVerified: boolean;
};
type ChildHarnessDependencies = {
  spawnChild?: SpawnChild;
  signalTarget?: SignalProcess;
};

const POST_KILL_SETTLEMENT_MS = 2_000;
const PROCESS_ABSENCE_POLL_MS = 10;
const signalProcess: SignalProcess = (target, signal) =>
  process.kill(target, signal);

const writeOwnedFixture = (
  path: string,
  contents: string,
  writer: OwnedFixtureWriter = writeFile,
) => writer(path, contents, { encoding: 'utf8', mode: 0o600 });

const removeOwnedTempDirectoryWhenSafe = async (
  ownedTempDirectory: string,
  state: OwnedTempCleanupState,
): Promise<boolean> => {
  const noChildStarted =
    !state.childRunAttempted || (state.spawnFailed && !state.childStarted);
  const stoppedChildWasVerified =
    state.childStarted && state.lifecycleAbsenceWasVerified;

  if (!noChildStarted && !stoppedChildWasVerified) {
    return false;
  }

  try {
    await rm(ownedTempDirectory, { recursive: true, force: false });

    return true;
  } catch {
    return false;
  }
};

const getProcessTargetState = (
  target: number,
  signalTarget: SignalProcess = signalProcess,
): ProcessTargetState => {
  try {
    signalTarget(target, 0);

    return 'present';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
      ? 'absent'
      : 'verification-failed';
  }
};

const waitForOwnedLifecycleAbsence = async (
  runnerPid: number | undefined,
  ownedProcessGroupId: number | undefined,
  descendantPid: number | undefined,
  signalTarget: SignalProcess = signalProcess,
): Promise<{
  runnerPidAbsent: boolean;
  ownedProcessGroupAbsent: boolean;
  descendantPidAbsent: boolean;
  lifecycleVerificationFailed: boolean;
}> => {
  const deadline = Date.now() + POST_KILL_SETTLEMENT_MS;

  while (true) {
    const runnerState =
      runnerPid === undefined
        ? 'absent'
        : getProcessTargetState(runnerPid, signalTarget);
    const processGroupState =
      ownedProcessGroupId === undefined
        ? 'absent'
        : getProcessTargetState(-ownedProcessGroupId, signalTarget);
    const descendantState =
      descendantPid === undefined
        ? 'absent'
        : getProcessTargetState(descendantPid, signalTarget);
    const lifecycleVerificationFailed = [
      runnerState,
      processGroupState,
      descendantState,
    ].includes('verification-failed');

    if (
      lifecycleVerificationFailed ||
      [runnerState, processGroupState, descendantState].every(
        (state) => state === 'absent',
      ) ||
      Date.now() >= deadline
    ) {
      return {
        runnerPidAbsent: runnerState === 'absent',
        ownedProcessGroupAbsent: processGroupState === 'absent',
        descendantPidAbsent: descendantState === 'absent',
        lifecycleVerificationFailed,
      };
    }

    await new Promise((resolvePoll) =>
      setTimeout(resolvePoll, PROCESS_ABSENCE_POLL_MS),
    );
  }
};

const runBoundedChild = async (
  tsxCjsHook: string,
  tsxEsmLoader: string,
  tsconfig: string,
  childScript: string,
  order: string,
  cwd: string,
  selectedEnvFile: string,
  limits: ChildLimits = {},
  dependencies: ChildHarnessDependencies = {},
): Promise<ChildResult> => {
  if (process.platform === 'win32') {
    throw new Error('POSIX process-group supervision is required');
  }

  const childEnvironment: NodeJS.ProcessEnv = {
    HOME: cwd,
    TMPDIR: cwd,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    NODE_ENV: 'test',
    [SELECTOR]: selectedEnvFile,
    NO_COLOR: '1',
    TSX_TSCONFIG_PATH: tsconfig,
    TSX_DISABLE_CACHE: '1',
  };
  const spawnChild =
    dependencies.spawnChild ??
    ((command, args, options) => spawn(command, args, options));
  const signalTarget = dependencies.signalTarget ?? signalProcess;
  const maxOutputBytes = limits.maxOutputBytes ?? 4096;
  let stdout: Buffer = Buffer.alloc(0);
  let stderr: Buffer = Buffer.alloc(0);
  let overflowed = false;
  let timedOut = false;
  let startupTimedOut = false;
  let spawnFailed = false;
  let spawnConfirmed = false;
  let closeSettled = false;
  let supervisionFailed = false;
  let code: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let runnerPid: number | undefined;
  let ownedProcessGroupId: number | undefined;
  let descendantPid: number | undefined;
  let descendantReady = false;
  let terminationRequested = false;
  let processGroupSignalSent = false;
  let executionTimeout: NodeJS.Timeout | undefined;
  let startupTimeout: NodeJS.Timeout | undefined;
  let postKillSettlementTimeout: NodeJS.Timeout | undefined;
  let rejectPostKillSettlement: (() => void) | undefined;
  let child: ChildProcess;

  try {
    child = spawnChild(
      process.execPath,
      ['--require', tsxCjsHook, '--import', tsxEsmLoader, childScript, order],
      {
        cwd,
        detached: true,
        env: childEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch {
    return {
      code: null,
      signal: null,
      timedOut: false,
      startupTimedOut: false,
      overflowed: false,
      spawnFailed: true,
      spawnConfirmed: false,
      closeSettled: false,
      supervisionFailed: false,
      lifecycleVerificationFailed: false,
      runnerPidWasAssigned: false,
      ownedProcessGroupWasAssigned: false,
      ownedProcessGroupMatchesRunnerPid: false,
      runnerPidAbsent: true,
      ownedProcessGroupAbsent: true,
      descendantPidWasReported: false,
      descendantPidAbsent: true,
      stdoutMatchesProtocol: false,
      stderrIsEmpty: true,
    };
  }
  const childLifecycle = new Promise<void>((resolveChild) => {
    child.once('spawn', () => {
      spawnConfirmed = true;
      runnerPid = child.pid;
      // A POSIX detached child is the leader of its new session and group.
      ownedProcessGroupId = runnerPid;

      if (runnerPid === undefined) {
        supervisionFailed = true;
      } else if (terminationRequested) {
        requestOwnedProcessGroupTermination();
      }
    });
    child.once('error', () => {
      spawnFailed = true;
      resolveChild();
    });
    child.once('close', (childCode, childSignal) => {
      closeSettled = true;
      code = childCode;
      signal = childSignal;
      resolveChild();
    });
  });
  const postKillSettlement = new Promise<never>((_resolve, reject) => {
    rejectPostKillSettlement = () =>
      reject(new Error('Owned child process group did not settle'));
  });

  function requestOwnedProcessGroupTermination() {
    terminationRequested = true;

    if (
      spawnConfirmed &&
      ownedProcessGroupId !== undefined &&
      !processGroupSignalSent
    ) {
      processGroupSignalSent = true;

      try {
        signalTarget(-ownedProcessGroupId, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          supervisionFailed = true;
        }
      }
    }

    if (
      !spawnFailed &&
      !closeSettled &&
      postKillSettlementTimeout === undefined
    ) {
      postKillSettlementTimeout = setTimeout(
        () => rejectPostKillSettlement?.(),
        POST_KILL_SETTLEMENT_MS,
      );
    }
  }

  function startExecutionTimeout() {
    if (executionTimeout !== undefined) {
      return;
    }

    executionTimeout = setTimeout(() => {
      timedOut = true;
      requestOwnedProcessGroupTermination();
    }, limits.timeoutMs ?? 30_000);
  }

  const appendBounded = (current: Buffer, chunk: Buffer): Buffer => {
    if (current.byteLength + chunk.byteLength > maxOutputBytes) {
      overflowed = true;
      requestOwnedProcessGroupTermination();

      return current;
    }

    return Buffer.concat([current, chunk]);
  };
  const handlePipeError = () => {
    supervisionFailed = true;
    requestOwnedProcessGroupTermination();
  };
  const captureDescendantReadiness = () => {
    if (!limits.waitForDescendantReady || descendantReady) {
      return;
    }

    const descendantPidMatch = /^\{"descendantPid":(\d+)\}\n$/.exec(
      stdout.toString('utf8'),
    );

    if (descendantPidMatch?.[1] === undefined) {
      return;
    }

    descendantPid = Number(descendantPidMatch[1]);
    descendantReady = true;
    if (startupTimeout !== undefined) {
      clearTimeout(startupTimeout);
    }
    startExecutionTimeout();
  };

  child.stdout?.once('error', handlePipeError);
  child.stderr?.once('error', handlePipeError);
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout = appendBounded(stdout, chunk);
    captureDescendantReadiness();
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr = appendBounded(stderr, chunk);
  });

  if (limits.waitForDescendantReady) {
    startupTimeout = setTimeout(() => {
      startupTimedOut = true;
      requestOwnedProcessGroupTermination();
    }, limits.startupTimeoutMs ?? 10_000);
  } else {
    startExecutionTimeout();
  }

  try {
    await Promise.race([childLifecycle, postKillSettlement]);
  } catch {
    supervisionFailed = true;
  } finally {
    if (executionTimeout !== undefined) {
      clearTimeout(executionTimeout);
    }
    if (startupTimeout !== undefined) {
      clearTimeout(startupTimeout);
    }
    if (postKillSettlementTimeout !== undefined) {
      clearTimeout(postKillSettlementTimeout);
    }
    child.stdout?.destroy();
    child.stderr?.destroy();
  }

  if (
    ownedProcessGroupId !== undefined &&
    getProcessTargetState(-ownedProcessGroupId, signalTarget) === 'present'
  ) {
    requestOwnedProcessGroupTermination();
  }

  const lifecycle = await waitForOwnedLifecycleAbsence(
    runnerPid,
    ownedProcessGroupId,
    descendantPid,
    signalTarget,
  );

  return {
    code,
    signal,
    timedOut,
    startupTimedOut,
    overflowed,
    spawnFailed,
    spawnConfirmed,
    closeSettled,
    supervisionFailed,
    lifecycleVerificationFailed: lifecycle.lifecycleVerificationFailed,
    runnerPidWasAssigned: runnerPid !== undefined,
    ownedProcessGroupWasAssigned: ownedProcessGroupId !== undefined,
    ownedProcessGroupMatchesRunnerPid:
      ownedProcessGroupId !== undefined && ownedProcessGroupId === runnerPid,
    runnerPidAbsent: lifecycle.runnerPidAbsent,
    ownedProcessGroupAbsent: lifecycle.ownedProcessGroupAbsent,
    descendantPidWasReported: descendantPid !== undefined,
    descendantPidAbsent: lifecycle.descendantPidAbsent,
    stdoutMatchesProtocol: stdout.equals(Buffer.from('{"ok":true}\n')),
    stderrIsEmpty: stderr.byteLength === 0,
  };
};

const makeSyntheticEnv = (prefix: 'selected' | 'fallback') =>
  [
    `ENV_SOURCE_SENTINEL=${prefix}`,
    `${prefix === 'fallback' ? 'FALLBACK_ONLY_SENTINEL=fallback-only' : 'SELECTED_ONLY_SENTINEL=selected-only'}`,
    `PG_DATABASE_URL=postgresql://${prefix}.invalid/${prefix}`,
    `REDIS_URL=redis://${prefix}.invalid:6379`,
    `REDIS_QUEUE_URL=redis://${prefix}-queue.invalid:6379`,
    'STORAGE_TYPE=LOCAL',
    `STORAGE_LOCAL_PATH=.storage-${prefix}`,
    'AUTH_GOOGLE_ENABLED=false',
    'AUTH_MICROSOFT_ENABLED=false',
    'MANAGED_EMAIL_ENABLED=false',
    'METRONOME_ENABLED=false',
    'MANAGED_OPENROUTER_ENABLED=false',
    'METER_DRIVER=',
    'EXCEPTION_HANDLER_DRIVER=CONSOLE',
    'EMAIL_DRIVER=LOGGER',
    `SERVER_URL=http://${prefix}.invalid:3000`,
    `FRONTEND_URL=http://${prefix}.invalid:3001`,
    '',
  ].join('\n');

const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('fresh child-process reachable import orders', () => {
  let envSnapshot: EnvSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnvironment();
    jest.useRealTimers();
  });

  afterEach(() => {
    restoreEnvironment(envSnapshot);
    jest.useFakeTimers();
  });

  it('keeps the approved source entrypoint ordering assertions', async () => {
    const setupDb = await readFile(
      join(SERVER_ROOT, 'src/database/scripts/setup-db.ts'),
      'utf8',
    );
    const command = await readFile(
      join(SERVER_ROOT, 'src/command/command.ts'),
      'utf8',
    );
    const integrationConfig = await readFile(
      join(SERVER_ROOT, 'jest-integration.config.ts'),
      'utf8',
    );
    expect(setupDb.trimStart()).toMatch(
      /^import \{ rawDataSource \} from 'src\/database\/typeorm\/raw\/raw\.datasource';/,
    );
    expect(command.trimStart()).toMatch(/^import 'src\/instrument';/);
    expect(integrationConfig).toContain(
      "globalSetup: '<rootDir>/test/integration/utils/setup-test.ts'",
    );
    expect(integrationConfig.indexOf('dotenv.config')).toBeLessThan(
      integrationConfig.indexOf('const isBillingEnabled'),
    );
  });

  it('returns a bounded redacted result when spawn emits an error before a PID exists', async () => {
    const failedChild = new ChildProcess();
    const spawnFailure = Object.assign(new Error('synthetic spawn failure'), {
      code: 'EMFILE',
    });
    const emfileExitCode = -Math.abs(osConstants.errno.EMFILE);
    const spawnChild: SpawnChild = () => {
      queueMicrotask(() => {
        failedChild.emit('error', spawnFailure);
        failedChild.emit('close', emfileExitCode, null);
      });

      return failedChild;
    };
    const signalTarget = jest.fn<
      ReturnType<SignalProcess>,
      Parameters<SignalProcess>
    >(() => true);

    const result = await runBoundedChild(
      '/synthetic/cjs-hook',
      '/synthetic/esm-loader',
      '/synthetic/tsconfig',
      '/synthetic/child-script',
      'spawn-failure',
      '/synthetic/cwd',
      '/synthetic/selected.env',
      { timeoutMs: 100 },
      { signalTarget, spawnChild },
    );

    expect(result.spawnFailed).toBe(true);
    expect(result.spawnConfirmed).toBe(false);
    expect(result.closeSettled).toBe(true);
    expect(result.code).toBe(emfileExitCode);
    expect(result.signal).toBeNull();
    expect(result.runnerPidWasAssigned).toBe(false);
    expect(result.ownedProcessGroupWasAssigned).toBe(false);
    expect(result.supervisionFailed).toBe(false);
    expect(result.lifecycleVerificationFailed).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.startupTimedOut).toBe(false);
    expect(result.overflowed).toBe(false);
    expect(result.stdoutMatchesProtocol).toBe(false);
    expect(result.stderrIsEmpty).toBe(true);
    expect(signalTarget).not.toHaveBeenCalled();
  });

  it('sanitizes a synchronous spawn argument error and removes its owned directory', async () => {
    const ownedTempDirectory = await mkdtemp(
      join(tmpdir(), 'twenty-server-spawn-throw-'),
    );
    const signalTarget = jest.fn<
      ReturnType<SignalProcess>,
      Parameters<SignalProcess>
    >(() => true);
    const spawnChild: SpawnChild = () => {
      throw Object.assign(new TypeError('synthetic invalid spawn argument'), {
        code: 'ERR_INVALID_ARG_TYPE',
      });
    };
    const cleanupState: OwnedTempCleanupState = {
      childRunAttempted: true,
      childStarted: false,
      spawnFailed: false,
      lifecycleAbsenceWasVerified: false,
    };
    let ownedTempDirectoryWasRemoved = false;

    try {
      const result = await runBoundedChild(
        '/synthetic/cjs-hook',
        '/synthetic/esm-loader',
        '/synthetic/tsconfig',
        '/synthetic/child-script',
        'spawn-throw',
        ownedTempDirectory,
        '/synthetic/selected.env',
        { timeoutMs: 100 },
        { signalTarget, spawnChild },
      );

      cleanupState.childStarted = result.spawnConfirmed;
      cleanupState.spawnFailed = result.spawnFailed;
      expect(result.spawnFailed).toBe(true);
      expect(result.spawnConfirmed).toBe(false);
      expect(result.closeSettled).toBe(false);
      expect(result.runnerPidWasAssigned).toBe(false);
      expect(result.ownedProcessGroupWasAssigned).toBe(false);
      expect(result.runnerPidAbsent).toBe(true);
      expect(result.ownedProcessGroupAbsent).toBe(true);
      expect(result.lifecycleVerificationFailed).toBe(false);
      expect(result.supervisionFailed).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.startupTimedOut).toBe(false);
      expect(result.overflowed).toBe(false);
      expect(result.stderrIsEmpty).toBe(true);
      expect(result.stdoutMatchesProtocol).toBe(false);
      expect(signalTarget).not.toHaveBeenCalled();
    } finally {
      ownedTempDirectoryWasRemoved = await removeOwnedTempDirectoryWhenSafe(
        ownedTempDirectory,
        cleanupState,
      );
    }

    expect(ownedTempDirectoryWasRemoved).toBe(true);
    await expect(
      access(ownedTempDirectory, constants.F_OK),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('sanitizes a pipe error and cleans the exact owned process group', async () => {
    const syntheticChild = new ChildProcess();
    const syntheticStdout = new PassThrough();
    const syntheticStderr = new PassThrough();
    const syntheticPid = 424_242;

    Object.defineProperties(syntheticChild, {
      pid: { value: syntheticPid },
      stderr: { value: syntheticStderr },
      stdout: { value: syntheticStdout },
    });

    const spawnChild: SpawnChild = () => {
      queueMicrotask(() => {
        syntheticChild.emit('spawn');
        syntheticStdout.emit(
          'error',
          new Error('synthetic private pipe failure'),
        );
      });

      return syntheticChild;
    };
    const signalTarget: SignalProcess = jest.fn((target, signal) => {
      if (target === -syntheticPid && signal === 'SIGKILL') {
        queueMicrotask(() => syntheticChild.emit('close', null, 'SIGKILL'));

        return true;
      }

      throw Object.assign(new Error('synthetic process absent'), {
        code: 'ESRCH',
      });
    });

    const result = await runBoundedChild(
      '/synthetic/cjs-hook',
      '/synthetic/esm-loader',
      '/synthetic/tsconfig',
      '/synthetic/child-script',
      'pipe-error',
      '/synthetic/cwd',
      '/synthetic/selected.env',
      { timeoutMs: 100 },
      { signalTarget, spawnChild },
    );

    expect(result.spawnFailed).toBe(false);
    expect(result.spawnConfirmed).toBe(true);
    expect(result.closeSettled).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.startupTimedOut).toBe(false);
    expect(result.overflowed).toBe(false);
    expect(result.supervisionFailed).toBe(true);
    expect(result.lifecycleVerificationFailed).toBe(false);
    expect(result.runnerPidWasAssigned).toBe(true);
    expect(result.ownedProcessGroupWasAssigned).toBe(true);
    expect(result.ownedProcessGroupMatchesRunnerPid).toBe(true);
    expect(result.runnerPidAbsent).toBe(true);
    expect(result.ownedProcessGroupAbsent).toBe(true);
    expect(result.signal).toBe('SIGKILL');
    expect(result.code).toBeNull();
    expect(result.stderrIsEmpty).toBe(true);
    expect(result.stdoutMatchesProtocol).toBe(false);
    expect(signalTarget).toHaveBeenCalledWith(-syntheticPid, 'SIGKILL');
  });

  it('removes its owned directory after fixture setup fails before spawn', async () => {
    const ownedTempDirectory = await mkdtemp(
      join(tmpdir(), 'twenty-server-fixture-failure-'),
    );
    const setupFailure = new Error('synthetic fixture setup failure');
    const failingWriter: OwnedFixtureWriter = jest.fn(async () => {
      throw setupFailure;
    });
    let ownedTempDirectoryWasRemoved = false;

    const setupFixture = async () => {
      try {
        await writeOwnedFixture(
          join(ownedTempDirectory, 'unwritten.ts'),
          'synthetic',
          failingWriter,
        );
      } finally {
        ownedTempDirectoryWasRemoved = await removeOwnedTempDirectoryWhenSafe(
          ownedTempDirectory,
          {
            childRunAttempted: false,
            childStarted: false,
            spawnFailed: false,
            lifecycleAbsenceWasVerified: false,
          },
        );
      }
    };

    await expect(setupFixture()).rejects.toBe(setupFailure);
    expect(ownedTempDirectoryWasRemoved).toBe(true);
    await expect(
      access(ownedTempDirectory, constants.F_OK),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains its evidence directory when a started lifecycle is uncertain', async () => {
    const ownedTempDirectory = await mkdtemp(
      join(tmpdir(), 'twenty-server-uncertain-child-'),
    );
    let retainedDirectoryWasRemoved = true;

    try {
      retainedDirectoryWasRemoved = await removeOwnedTempDirectoryWhenSafe(
        ownedTempDirectory,
        {
          childRunAttempted: true,
          childStarted: true,
          spawnFailed: false,
          lifecycleAbsenceWasVerified: false,
        },
      );

      expect(retainedDirectoryWasRemoved).toBe(false);
      await expect(
        access(ownedTempDirectory, constants.F_OK),
      ).resolves.toBeUndefined();
    } finally {
      await removeOwnedTempDirectoryWhenSafe(ownedTempDirectory, {
        childRunAttempted: true,
        childStarted: true,
        spawnFailed: false,
        lifecycleAbsenceWasVerified: true,
      });
    }
  });

  it.each([
    {
      label: 'timeout',
      childSource: `
import { spawn } from 'node:child_process';

setTimeout(() => {
  const descendant = spawn(
    process.execPath,
    ['-e', 'setInterval(() => undefined, 1_000)'],
    { stdio: 'ignore' },
  );
  descendant.once('spawn', () => {
    process.stdout.write(JSON.stringify({ descendantPid: descendant.pid }) + '\\n');
  });
}, 300);
setInterval(() => undefined, 1_000);
`,
      limits: {
        timeoutMs: 100,
        startupTimeoutMs: 5_000,
        waitForDescendantReady: true,
      },
      expectedTimedOut: true,
      expectedStartupTimedOut: false,
      expectedOverflowed: false,
      expectedDescendant: true,
    },
    {
      label: 'startup-timeout',
      childSource: 'setInterval(() => undefined, 1_000);\n',
      limits: {
        timeoutMs: 5_000,
        startupTimeoutMs: 1_000,
        waitForDescendantReady: true,
      },
      expectedTimedOut: false,
      expectedStartupTimedOut: true,
      expectedOverflowed: false,
      expectedDescendant: false,
    },
    {
      label: 'overflow',
      childSource:
        "process.stdout.write('x'.repeat(512)); setInterval(() => undefined, 1_000);\n",
      limits: { timeoutMs: 5_000, maxOutputBytes: 64 },
      expectedTimedOut: false,
      expectedStartupTimedOut: false,
      expectedOverflowed: true,
      expectedDescendant: false,
    },
  ])(
    'kills the exact owned process group and cleans up after $label',
    async ({
      label,
      childSource,
      limits,
      expectedTimedOut,
      expectedStartupTimedOut,
      expectedOverflowed,
      expectedDescendant,
    }) => {
      const ownedTempDirectory = await mkdtemp(
        join(tmpdir(), `twenty-server-child-${label}-`),
      );
      const childScript = join(ownedTempDirectory, `${label}.ts`);
      const tsxCjsHook = resolve(
        REPOSITORY_ROOT,
        'node_modules/tsx/dist/cjs/index.cjs',
      );
      const tsxEsmLoader = resolve(
        REPOSITORY_ROOT,
        'node_modules/tsx/dist/esm/index.mjs',
      );
      const tsconfig = join(SERVER_ROOT, 'tsconfig.json');

      const cleanupState: OwnedTempCleanupState = {
        childRunAttempted: false,
        childStarted: false,
        spawnFailed: false,
        lifecycleAbsenceWasVerified: false,
      };
      let ownedTempDirectoryWasRemoved = false;

      try {
        await writeOwnedFixture(childScript, childSource);
        cleanupState.childRunAttempted = true;

        const result = await runBoundedChild(
          tsxCjsHook,
          tsxEsmLoader,
          tsconfig,
          childScript,
          label,
          ownedTempDirectory,
          join(ownedTempDirectory, 'unused.env'),
          limits,
        );

        cleanupState.childStarted = result.spawnConfirmed;
        cleanupState.spawnFailed = result.spawnFailed;
        cleanupState.lifecycleAbsenceWasVerified =
          result.runnerPidAbsent &&
          result.ownedProcessGroupAbsent &&
          result.descendantPidAbsent &&
          !result.lifecycleVerificationFailed;

        expect(result.timedOut).toBe(expectedTimedOut);
        expect(result.startupTimedOut).toBe(expectedStartupTimedOut);
        expect(result.overflowed).toBe(expectedOverflowed);
        expect(result.spawnFailed).toBe(false);
        expect(result.spawnConfirmed).toBe(true);
        expect(result.closeSettled).toBe(true);
        expect(result.supervisionFailed).toBe(false);
        expect(result.lifecycleVerificationFailed).toBe(false);
        expect(result.runnerPidWasAssigned).toBe(true);
        expect(result.ownedProcessGroupWasAssigned).toBe(true);
        expect(result.ownedProcessGroupMatchesRunnerPid).toBe(true);
        expect(result.runnerPidAbsent).toBe(true);
        expect(result.ownedProcessGroupAbsent).toBe(true);
        expect(result.descendantPidWasReported).toBe(expectedDescendant);
        expect(result.descendantPidAbsent).toBe(true);
        expect(result.signal).toBe('SIGKILL');
        expect(result.code).toBeNull();
        expect(result.stderrIsEmpty).toBe(true);
        expect(result.stdoutMatchesProtocol).toBe(false);
      } finally {
        ownedTempDirectoryWasRemoved = await removeOwnedTempDirectoryWhenSafe(
          ownedTempDirectory,
          cleanupState,
        );
      }

      expect(ownedTempDirectoryWasRemoved).toBe(true);
      await expect(
        access(ownedTempDirectory, constants.F_OK),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
    10_000,
  );

  it.each(['init-first', 'command', 'integration'])(
    'loads only the selected synthetic env in the %s import order',
    async (order) => {
      const ownedTempDirectory = await mkdtemp(
        join(tmpdir(), 'twenty-server-env-selector-'),
      );
      const selectedEnvFile = join(ownedTempDirectory, 'selected.env');
      const childScript = join(ownedTempDirectory, 'verify-import-order.ts');
      const tsxCjsHook = resolve(
        REPOSITORY_ROOT,
        'node_modules/tsx/dist/cjs/index.cjs',
      );
      const tsxEsmLoader = resolve(
        REPOSITORY_ROOT,
        'node_modules/tsx/dist/esm/index.mjs',
      );
      const tsconfig = join(SERVER_ROOT, 'tsconfig.json');
      const rawModule = join(
        SERVER_ROOT,
        'src/database/typeorm/raw/raw.datasource.ts',
      );
      const coreModule = join(
        SERVER_ROOT,
        'src/database/typeorm/core/core.datasource.ts',
      );
      const instrumentModule = join(SERVER_ROOT, 'src/instrument.ts');
      const environmentModule = join(
        SERVER_ROOT,
        'src/engine/core-modules/environment/environment.module.ts',
      );
      const integrationConfig = join(SERVER_ROOT, 'jest-integration.config.ts');
      const forbiddenModules = [
        join(SERVER_ROOT, 'src/database/scripts/setup-db.ts'),
        join(SERVER_ROOT, 'src/command/command.ts'),
        join(SERVER_ROOT, 'test/integration/utils/setup-test.ts'),
        join(SERVER_ROOT, 'src/main.ts'),
      ];

      const childSource = `
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rawModule = ${JSON.stringify(rawModule)};
const coreModule = ${JSON.stringify(coreModule)};
const instrumentModule = ${JSON.stringify(instrumentModule)};
const environmentModule = ${JSON.stringify(environmentModule)};
const integrationConfig = ${JSON.stringify(integrationConfig)};
const forbiddenModules = ${JSON.stringify(forbiddenModules)};
const order = process.argv[2];
let warningOrError = false;
let unhandled = false;
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...args: unknown[]) => {
  warningOrError = true;
  originalWarn(...args);
};
console.error = (...args: unknown[]) => {
  warningOrError = true;
  originalError(...args);
};
process.on('unhandledRejection', () => {
  unhandled = true;
  process.exitCode = 1;
});

const importAbsolute = (path: string) => import(pathToFileURL(path).href);

const main = async () => {
  let raw: Record<string, any>;
  let core: Record<string, any>;
  let environment: Record<string, any>;

  if (order === 'init-first') {
    raw = await importAbsolute(rawModule);
    await importAbsolute(instrumentModule);
    core = await importAbsolute(coreModule);
    environment = await importAbsolute(environmentModule);
  } else if (order === 'command') {
    await importAbsolute(instrumentModule);
    raw = await importAbsolute(rawModule);
    core = await importAbsolute(coreModule);
    environment = await importAbsolute(environmentModule);
  } else {
    assert.equal(order, 'integration');
    const loadedJestConfig = await importAbsolute(integrationConfig);
    const jestConfig = loadedJestConfig.default.default ?? loadedJestConfig.default;
    assert.ok(jestConfig.testPathIgnorePatterns.includes('<rootDir>/test/integration/billing'));
    assert.ok(jestConfig.testPathIgnorePatterns.includes('<rootDir>/test/integration/audit'));
    raw = await importAbsolute(rawModule);
    core = await importAbsolute(coreModule);
    environment = await importAbsolute(environmentModule);
  }

  const reflectedImports = Reflect.getMetadata('imports', environment.EnvironmentModule) as unknown[];
  assert.ok(Array.isArray(reflectedImports));
  assert.ok(reflectedImports.length > 0);
  await Promise.all(reflectedImports.map((entry) => Promise.resolve(entry)));

  assert.equal(process.env.ENV_SOURCE_SENTINEL, 'selected');
  assert.equal(process.env.SELECTED_ONLY_SENTINEL, 'selected-only');
  assert.equal(process.env.FALLBACK_ONLY_SENTINEL, undefined);
  assert.equal(process.env.PG_DATABASE_URL, 'postgresql://selected.invalid/selected');
  assert.equal(process.env.REDIS_URL, 'redis://selected.invalid:6379');
  assert.equal(process.env.REDIS_QUEUE_URL, 'redis://selected-queue.invalid:6379');
  assert.equal(process.env.STORAGE_TYPE, 'LOCAL');
  assert.equal(process.env.STORAGE_LOCAL_PATH, '.storage-selected');
  assert.equal(process.env.METER_DRIVER, '');
  assert.equal(process.env.EXCEPTION_HANDLER_DRIVER, 'CONSOLE');
  assert.equal(process.env.EMAIL_DRIVER, 'LOGGER');
  assert.equal(process.env.SERVER_URL, 'http://selected.invalid:3000');
  assert.equal(process.env.FRONTEND_URL, 'http://selected.invalid:3001');
  assert.equal(raw.rawDataSource.options.url, 'postgresql://selected.invalid/selected');
  assert.equal(raw.rawDataSource.isInitialized, false);
  assert.equal(core.typeORMCoreModuleOptions.url, 'postgresql://selected.invalid/selected');
  assert.equal(core.connectionSource.options.url, 'postgresql://selected.invalid/selected');
  assert.equal(core.connectionSource.isInitialized, false);
  assert.ok(forbiddenModules.every((path) => require.cache[path] === undefined));
  assert.equal(warningOrError, false);
  assert.equal(unhandled, false);

  process.stdout.write('{"ok":true}\\n');
};

void main().catch(() => {
  process.exitCode = 1;
});
`;

      const cleanupState: OwnedTempCleanupState = {
        childRunAttempted: false,
        childStarted: false,
        spawnFailed: false,
        lifecycleAbsenceWasVerified: false,
      };
      let ownedTempDirectoryWasRemoved = false;

      try {
        await writeOwnedFixture(
          join(ownedTempDirectory, '.env.test'),
          makeSyntheticEnv('fallback'),
        );
        await writeOwnedFixture(selectedEnvFile, makeSyntheticEnv('selected'));
        await writeOwnedFixture(childScript, childSource);
        cleanupState.childRunAttempted = true;

        const result = await runBoundedChild(
          tsxCjsHook,
          tsxEsmLoader,
          tsconfig,
          childScript,
          order,
          ownedTempDirectory,
          selectedEnvFile,
        );

        cleanupState.childStarted = result.spawnConfirmed;
        cleanupState.spawnFailed = result.spawnFailed;
        cleanupState.lifecycleAbsenceWasVerified =
          result.runnerPidAbsent &&
          result.ownedProcessGroupAbsent &&
          !result.lifecycleVerificationFailed;

        expect(result.timedOut).toBe(false);
        expect(result.startupTimedOut).toBe(false);
        expect(result.overflowed).toBe(false);
        expect(result.spawnFailed).toBe(false);
        expect(result.spawnConfirmed).toBe(true);
        expect(result.closeSettled).toBe(true);
        expect(result.supervisionFailed).toBe(false);
        expect(result.lifecycleVerificationFailed).toBe(false);
        expect(result.runnerPidWasAssigned).toBe(true);
        expect(result.ownedProcessGroupWasAssigned).toBe(true);
        expect(result.ownedProcessGroupMatchesRunnerPid).toBe(true);
        expect(result.runnerPidAbsent).toBe(true);
        expect(result.ownedProcessGroupAbsent).toBe(true);
        expect(result.descendantPidWasReported).toBe(false);
        expect(result.signal).toBeNull();
        expect(result.code).toBe(0);
        expect(result.stderrIsEmpty).toBe(true);
        expect(result.stdoutMatchesProtocol).toBe(true);
      } finally {
        ownedTempDirectoryWasRemoved = await removeOwnedTempDirectoryWhenSafe(
          ownedTempDirectory,
          cleanupState,
        );
      }

      expect(ownedTempDirectoryWasRemoved).toBe(true);
      await expect(
        access(ownedTempDirectory, constants.F_OK),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
    40_000,
  );
});
