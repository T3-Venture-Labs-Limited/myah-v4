import { renderHook } from '@testing-library/react';

import { useCreateRootAppRouter } from '@/app/hooks/useCreateRootAppRouter';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  createBrowserRouter: jest.fn(() => ({ direct: true })),
}));
jest.mock('~/instrument', () => ({
  sentryCreateBrowserRouter: jest.fn(() => ({ sentryWrapped: true })),
}));

describe('useCreateRootAppRouter', () => {
  it('creates the router through the Sentry React Router wrapper', () => {
    const sentryModule = jest.requireMock('~/instrument') as {
      sentryCreateBrowserRouter: jest.Mock;
    };
    const { result } = renderHook(() => useCreateRootAppRouter());

    expect(sentryModule.sentryCreateBrowserRouter).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(
      sentryModule.sentryCreateBrowserRouter.mock.results[0].value,
    );
  });
});
