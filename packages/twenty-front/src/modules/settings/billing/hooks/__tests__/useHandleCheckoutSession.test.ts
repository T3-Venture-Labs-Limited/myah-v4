import { useRedirect } from '@/domain-manager/hooks/useRedirect';
import { useHandleCheckoutSession } from '@/settings/billing/hooks/useHandleCheckoutSession';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useMutation } from '@apollo/client/react';
import { act, renderHook } from '@testing-library/react';
import {
  BillingPlanKey,
  SubscriptionInterval,
} from '~/generated-metadata/graphql';

const checkoutSessionMock = jest.fn();
const enqueueErrorSnackBarMock = jest.fn();
const redirectMock = jest.fn();

jest.mock('@/domain-manager/hooks/useRedirect');
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar');
jest.mock('@apollo/client/react');

describe('useHandleCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useMutation as jest.Mock).mockReturnValue([checkoutSessionMock]);
    (useSnackBar as jest.Mock).mockReturnValue({
      enqueueErrorSnackBar: enqueueErrorSnackBarMock,
    });
    (useRedirect as jest.Mock).mockReturnValue({ redirect: redirectMock });
  });

  it('should show a Myah-branded error when checkout has no URL', async () => {
    checkoutSessionMock.mockResolvedValue({
      data: { checkoutSession: {} },
    });

    const { result } = renderHook(() =>
      useHandleCheckoutSession({
        recurringInterval: SubscriptionInterval.Month,
        plan: BillingPlanKey.PRO,
        requirePaymentMethod: true,
        successUrlPath: '/settings/billing',
      }),
    );

    await act(async () => {
      await result.current.handleCheckoutSession();
    });

    expect(enqueueErrorSnackBarMock).toHaveBeenCalledWith({
      message: 'Checkout session error. Please retry or contact Myah team',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('should show a Myah-branded error when checkout fails', async () => {
    checkoutSessionMock.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useHandleCheckoutSession({
        recurringInterval: SubscriptionInterval.Month,
        plan: BillingPlanKey.PRO,
        requirePaymentMethod: true,
        successUrlPath: '/settings/billing',
      }),
    );

    await act(async () => {
      await result.current.handleCheckoutSession();
    });

    expect(enqueueErrorSnackBarMock).toHaveBeenCalledWith({
      message: 'Checkout session error. Please retry or contact Myah team',
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
