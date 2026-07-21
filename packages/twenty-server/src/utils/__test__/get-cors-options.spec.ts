import {
  type CorsOptions,
  type CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';

import { getCorsOptions } from 'src/utils/get-cors-options.util';

type CorsRequest = {
  headers: {
    origin?: string;
  };
};

const resolveCorsOptions = (
  corsOptions: CorsOptionsDelegate<CorsRequest>,
  origin?: string,
): CorsOptions => {
  let resolvedOptions: CorsOptions | undefined;

  corsOptions({ headers: { origin } }, (error, options) => {
    expect(error).toBeNull();
    resolvedOptions = options;
  });

  expect(resolvedOptions).toBeDefined();

  return resolvedOptions!;
};

const createCorsOptions = ({
  frontendUrl,
  serverUrl = 'http://localhost:33395',
}: {
  frontendUrl?: string;
  serverUrl?: string;
}) =>
  getCorsOptions({
    getFrontendUrl: () => frontendUrl,
    getServerUrl: () => serverUrl,
  });

describe('getCorsOptions', () => {
  it('allows credentialed requests from the configured frontend origin', () => {
    expect(
      resolveCorsOptions(
        createCorsOptions({ frontendUrl: 'http://localhost:37995/' }),
        'http://localhost:37995',
      ),
    ).toEqual({
      credentials: true,
      exposedHeaders: ['WWW-Authenticate'],
      origin: 'http://localhost:37995',
    });
  });

  it('uses the server origin when no frontend URL is configured', () => {
    expect(
      resolveCorsOptions(createCorsOptions({}), 'http://localhost:33395'),
    ).toEqual({
      credentials: true,
      exposedHeaders: ['WWW-Authenticate'],
      origin: 'http://localhost:33395',
    });
  });

  it('reads frontend configuration when each request is handled', () => {
    let frontendUrl = 'http://localhost:3001';
    const corsOptions = getCorsOptions({
      getFrontendUrl: () => frontendUrl,
      getServerUrl: () => 'http://localhost:3000',
    });

    frontendUrl = 'http://localhost:37995';

    expect(resolveCorsOptions(corsOptions, frontendUrl)).toEqual({
      credentials: true,
      exposedHeaders: ['WWW-Authenticate'],
      origin: frontendUrl,
    });
  });

  it('preserves non-credentialed access for other browser clients', () => {
    expect(
      resolveCorsOptions(
        createCorsOptions({ frontendUrl: 'http://localhost:37995' }),
        'https://browser-mcp.example.com',
      ),
    ).toEqual({
      exposedHeaders: ['WWW-Authenticate'],
      origin: true,
    });
  });
});
