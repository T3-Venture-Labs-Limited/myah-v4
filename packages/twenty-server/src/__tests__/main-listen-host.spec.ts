import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('server listen host wiring (no bootstrap)', () => {
  it('passes the validated optional host to the HTTP listener', () => {
    const source = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');

    expect(source).toContain(
      "const port = twentyConfigService.get('NODE_PORT');",
    );
    expect(source).toContain(
      "const host = twentyConfigService.get('NODE_HOST');",
    );
    expect(source).toMatch(
      /host === undefined\s*\? app\.listen\(port\)\s*: app\.listen\(port, host\)/,
    );
  });
});
