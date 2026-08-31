import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { isNonEmptyString } from '@sniptt/guards';

import { SENTRY_REPLAY_IGNORE_MUTATIONS_ATTRIBUTE } from '@/error-handler/constants/SentryReplayIgnoreMutationsAttribute';
import {
  APP_VERSION,
  REACT_APP_SERVER_BASE_URL,
  SENTRY_ENVIRONMENT,
  SENTRY_FRONT_DSN,
} from '~/config';

if (isNonEmptyString(SENTRY_FRONT_DSN)) {
  Sentry.init({
    environment: SENTRY_ENVIRONMENT,
    release: APP_VERSION,
    dsn: SENTRY_FRONT_DSN,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        _experiments: {
          ignoreMutations: [
            `[${SENTRY_REPLAY_IGNORE_MUTATIONS_ATTRIBUTE}]`,
          ],
        },
      }),
      Sentry.globalHandlersIntegration({
        onunhandledrejection: false,
      }),
    ],
    tracePropagationTargets: [
      'localhost:3001',
      REACT_APP_SERVER_BASE_URL,
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export const sentryCreateBrowserRouter =
  Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);
