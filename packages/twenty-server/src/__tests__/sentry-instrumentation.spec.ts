import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const entrypoints = [
  { path: join(__dirname, '..', 'main.ts'), instrumentModule: './instrument' },
  {
    path: join(__dirname, '..', 'queue-worker', 'queue-worker.ts'),
    instrumentModule: 'src/instrument',
  },
  {
    path: join(__dirname, '..', 'command', 'command.ts'),
    instrumentModule: 'src/instrument',
  },
];

describe('Sentry backend instrumentation', () => {
  it.each(entrypoints)(
    'loads instrumentation before application modules in $path',
    ({ path, instrumentModule }) => {
      const source = readFileSync(path, 'utf8');

      expect(
        source.trimStart().startsWith(`import '${instrumentModule}';`),
      ).toBe(true);
    },
  );

  it('uses current trace-lifecycle profiling options', () => {
    const instrumentSource = readFileSync(
      join(__dirname, '..', 'instrument.ts'),
      'utf8',
    );

    expect(instrumentSource).toContain('profileSessionSampleRate: 0.3');
    expect(instrumentSource).toContain("profileLifecycle: 'trace'");
    expect(instrumentSource).not.toContain('profilesSampleRate');
  });

  it('preloads the selected dotenv file before reading instrumentation config', () => {
    const instrumentSource = readFileSync(
      join(__dirname, '..', 'instrument.ts'),
      'utf8',
    );
    const dotenvConfigIndex = instrumentSource.indexOf('dotenv.config(');
    const instrumentationConfigIndex =
      instrumentSource.indexOf('const meterDrivers');

    expect(dotenvConfigIndex).toBeGreaterThanOrEqual(0);
    expect(dotenvConfigIndex).toBeLessThan(instrumentationConfigIndex);
    expect(instrumentSource).toContain(
      "process.env.NODE_ENV === 'test' ? '.env.test' : '.env'",
    );
  });

  it('leaves Vercel AI payload recording to each call policy', () => {
    const instrumentSource = readFileSync(
      join(__dirname, '..', 'instrument.ts'),
      'utf8',
    );

    expect(instrumentSource).toContain('Sentry.vercelAIIntegration()');
    expect(instrumentSource).not.toContain('Sentry.vercelAIIntegration({');
  });
});
