import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

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

const getFirstImportedModule = (path: string) => {
  const source = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const firstStatement = sourceFile.statements[0];

  if (
    !ts.isImportDeclaration(firstStatement) ||
    !ts.isStringLiteral(firstStatement.moduleSpecifier)
  ) {
    throw new Error(`${path} does not begin with an import declaration`);
  }

  return firstStatement.moduleSpecifier.text;
};

describe('Sentry backend instrumentation', () => {
  it.each(entrypoints)(
    'loads instrumentation before application modules in $path',
    ({ path, instrumentModule }) => {
      expect(getFirstImportedModule(path)).toBe(instrumentModule);
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
});
