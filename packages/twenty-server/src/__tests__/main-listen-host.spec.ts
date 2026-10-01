import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('server listen host wiring (no bootstrap)', () => {
  it('passes the validated optional host to the HTTP listener', () => {
    const source = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');

    expect(source).toMatch(
      /app\.listen\(\s*twentyConfigService\.get\('NODE_PORT'\),\s*twentyConfigService\.get\('NODE_HOST'\),?\s*\)/,
    );
  });
});
