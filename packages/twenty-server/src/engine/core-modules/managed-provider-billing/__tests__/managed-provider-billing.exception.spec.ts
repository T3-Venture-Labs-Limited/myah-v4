import {
  ManagedProviderBillingException,
  ManagedProviderBillingExceptionCode,
} from '../managed-provider-billing.exception';

describe('ManagedProviderBillingException', () => {
  it('reports an operation replay conflict without describing it as insufficient balance', () => {
    const exception = new ManagedProviderBillingException(
      ManagedProviderBillingExceptionCode.OPERATION_REPLAY_CONFLICT,
    );

    expect(exception.message).toBe(
      'Managed provider operation replay conflicts with the existing operation',
    );
    const insufficientBalanceException = new ManagedProviderBillingException(
      ManagedProviderBillingExceptionCode.INSUFFICIENT_PREPAID_BALANCE,
    );

    expect(exception.userFriendlyMessage.id).not.toBe(
      insufficientBalanceException.userFriendlyMessage.id,
    );
  });
});
