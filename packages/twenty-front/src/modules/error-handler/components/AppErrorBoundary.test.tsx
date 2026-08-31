import { render } from '@testing-library/react';
import type { ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

import { AppErrorBoundary } from '@/error-handler/components/AppErrorBoundary';
let mockOnError:
  | ((error: Error & { code?: string }, info: ErrorInfo) => unknown)
  | undefined;

jest.mock('@sentry/react', () => ({
  captureReactException: jest.fn(),
}));

jest.mock('react-error-boundary', () => ({
  ErrorBoundary: ({
    children,
    onError,
  }: {
    children: ReactNode;
    onError: typeof mockOnError;
  }) => {
    mockOnError = onError;

    return children;
  },
}));

const renderBoundary = () =>
  render(
    <AppErrorBoundary
      FallbackComponent={() => null}
      resetOnLocationChange={false}
    >
      <div>content</div>
    </AppErrorBoundary>,
  );

const reactErrorInfo = {
  componentStack: '\n  at BrokenComponent\n  at App',
} as ErrorInfo;

describe('AppErrorBoundary', () => {
  it('captures a coded React error once with its component stack and code fingerprint', () => {
    const error = Object.assign(new Error('Something broke'), {
      code: 'BROKEN_COMPONENT',
    });

    renderBoundary();
    mockOnError?.(error, reactErrorInfo);

    expect(Sentry.captureReactException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureReactException).toHaveBeenCalledWith(
      error,
      reactErrorInfo,
      { fingerprint: ['BROKEN_COMPONENT'] },
    );
  });

  it('uses the error message when no code is available', () => {
    const error = new Error('Something broke');

    renderBoundary();
    mockOnError?.(error, reactErrorInfo);

    expect(Sentry.captureReactException).toHaveBeenCalledWith(
      error,
      reactErrorInfo,
      { fingerprint: ['Something broke'] },
    );
  });
});
