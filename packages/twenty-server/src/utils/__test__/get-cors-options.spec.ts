import { type CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

import { getCorsOptions } from 'src/utils/get-cors-options.util';

const resolveCorsOptions = ({
  frontendUrl,
  origin,
  serverUrl = 'http://localhost:33395',
}: {
  frontendUrl?: string;
  origin?: string;
  serverUrl?: string;
}): CorsOptions => {
  let resolvedOptions: CorsOptions | undefined;

  getCorsOptions({ frontendUrl, serverUrl })(
    { headers: { origin } },
    (error, options) => {
      expect(error).toBeNull();
      resolvedOptions = options;
    },
  );

  expect(resolvedOptions).toBeDefined();

  return resolvedOptions!;
};

describe('getCorsOptions', () => {
  it('allows credentialed requests from the configured frontend origin', () => {
    expect(
      resolveCorsOptions({
        frontendUrl: 'http://localhost:37995/',
        origin: 'http://localhost:37995',
      }),
    ).toEqual({
      credentials: true,
      exposedHeaders: ['WWW-Authenticate'],
      origin: 'http://localhost:37995',
    });
  });

  it('uses the server origin when no frontend URL is configured', () => {
    expect(
      resolveCorsOptions({
        origin: 'http://localhost:33395',
      }),
    ).toEqual({
      credentials: true,
      exposedHeaders: ['WWW-Authenticate'],
      origin: 'http://localhost:33395',
    });
  });

  it('preserves non-credentialed access for other browser clients', () => {
    expect(
      resolveCorsOptions({
        frontendUrl: 'http://localhost:37995',
        origin: 'https://browser-mcp.example.com',
      }),
    ).toEqual({
      exposedHeaders: ['WWW-Authenticate'],
      origin: true,
    });
  });
});
