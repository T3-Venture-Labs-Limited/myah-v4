import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as Sentry from '@sentry/react';

import { sentryCreateBrowserRouter } from './instrument';

jest.mock('@sentry/react', () => ({
  browserTracingIntegration: jest.fn(),
  globalHandlersIntegration: jest.fn(() => ({ name: 'global-handlers' })),
  init: jest.fn(),
  reactRouterV6BrowserTracingIntegration: jest.fn(() => ({
    name: 'router-tracing',
  })),
  replayIntegration: jest.fn(() => ({ name: 'replay' })),
  wrapCreateBrowserRouterV6: jest.fn(() => jest.fn()),
}));

jest.mock('~/config', () => ({
  APP_VERSION: '2026.08.31',
  REACT_APP_SERVER_BASE_URL: 'https://api.example.com',
  SENTRY_ENVIRONMENT: 'production',
  SENTRY_FRONT_DSN: 'https://public@example.ingest.sentry.io/1',
}));

const mockedSentry = jest.mocked(Sentry);

describe('frontend Sentry instrumentation', () => {
  it('loads before the application bootstrap', () => {
    const indexSource = readFileSync(join(__dirname, 'index.tsx'), 'utf8');

    expect(indexSource.trimStart().startsWith("import './instrument';")).toBe(
      true,
    );
  });

  it('initializes route-aware tracing and existing replay behavior', () => {
    const routerTracingIntegration =
      mockedSentry.reactRouterV6BrowserTracingIntegration.mock.results[0].value;
    const replayIntegration =
      mockedSentry.replayIntegration.mock.results[0].value;
    const globalHandlersIntegration =
      mockedSentry.globalHandlersIntegration.mock.results[0].value;

    expect(mockedSentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@example.ingest.sentry.io/1',
        environment: 'production',
        integrations: [
          routerTracingIntegration,
          replayIntegration,
          globalHandlersIntegration,
        ],
        release: '2026.08.31',
        replaysOnErrorSampleRate: 1,
        replaysSessionSampleRate: 0.1,
        tracePropagationTargets: ['localhost:3001', 'https://api.example.com'],
        tracesSampleRate: 1,
      }),
    );
    expect(mockedSentry.browserTracingIntegration).not.toHaveBeenCalled();
    expect(
      mockedSentry.reactRouterV6BrowserTracingIntegration,
    ).toHaveBeenCalledTimes(1);
    expect(mockedSentry.globalHandlersIntegration).toHaveBeenCalledWith({
      onunhandledrejection: false,
    });
    expect(mockedSentry.wrapCreateBrowserRouterV6).toHaveBeenCalledTimes(1);
    expect(sentryCreateBrowserRouter).toBe(
      mockedSentry.wrapCreateBrowserRouterV6.mock.results[0].value,
    );
  });
});
