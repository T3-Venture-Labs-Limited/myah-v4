import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'twenty-ui/theme-constants';

import { AiChatErrorRenderer } from '@/ai/components/AiChatErrorRenderer';
import { usePermissionFlagMap } from '@/settings/roles/hooks/usePermissionFlagMap';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const mockNavigateSettings = jest.fn();
jest.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: () => mockNavigateSettings,
}));
jest.mock('@/settings/roles/hooks/usePermissionFlagMap', () => ({
  usePermissionFlagMap: jest.fn(),
}));

const usageCode = 'MANAGED_PROVIDER_INSUFFICIENT_PREPAID_BALANCE';
const renderError = (
  error: Error | CombinedGraphQLErrors,
  onRetry = jest.fn(),
) =>
  render(
    <I18nProvider i18n={i18n}>
      <ThemeProvider colorScheme="light">
        <AiChatErrorRenderer error={error} onRetry={onRetry} />
      </ThemeProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePermissionFlagMap).mockReturnValue({
    [PermissionFlagType.BILLING]: true,
  } as ReturnType<typeof usePermissionFlagMap>);
});

it.each([
  Object.assign(new Error('internal prepaid details'), { code: usageCode }),
  new CombinedGraphQLErrors({
    errors: [
      {
        message: 'internal prepaid details',
        extensions: { code: 'FORBIDDEN', subCode: usageCode },
      },
    ],
  }),
])(
  'shows usage exhaustion with Billing, not an interruption or retry',
  (error) => {
    renderError(error);
    expect(screen.getByText('Your AI usage is used up.')).toBeVisible();
    expect(
      screen.queryByText('internal prepaid details'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(mockNavigateSettings).toHaveBeenCalledWith('billing');
  },
);

it('asks a workspace admin when the user cannot manage Billing', () => {
  jest.mocked(usePermissionFlagMap).mockReturnValue({
    [PermissionFlagType.BILLING]: false,
  } as ReturnType<typeof usePermissionFlagMap>);
  renderError(
    Object.assign(new Error('balance depleted'), { code: usageCode }),
  );
  expect(
    screen.getByText(/Your AI usage is used up.*Ask a workspace admin/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Billing' }),
  ).not.toBeInTheDocument();
});

it('keeps Retry for an unrelated failure instead of claiming usage is exhausted', () => {
  const retry = jest.fn();
  renderError(
    new Error('The response was interrupted before it could finish.'),
    retry,
  );
  expect(
    screen.getByText('The response was interrupted before it could finish.'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Billing' }),
  ).not.toBeInTheDocument();
});
