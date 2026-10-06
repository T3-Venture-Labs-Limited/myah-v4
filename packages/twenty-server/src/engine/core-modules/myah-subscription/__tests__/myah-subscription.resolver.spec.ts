import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionFlagType } from 'twenty-shared/constants';
import { MyahSubscriptionResolver } from 'src/engine/core-modules/myah-subscription/myah-subscription.resolver';

describe('Myah subscription resolver authorization', () => {
  it.each([
    'myahSubscriptionDetails',
    'createMyahCheckoutSession',
    'syncMyahCheckoutSession',
    'createMyahCustomerPortalSession',
  ] as const)('%s requires Billing permission', async (method) => {
    const [Guard] = Reflect.getMetadata(
      GUARDS_METADATA,
      MyahSubscriptionResolver.prototype[method],
    ) as Array<new (permissions: unknown) => CanActivate>;
    const userHasWorkspaceSettingPermission = jest
      .fn()
      .mockResolvedValue(false);
    const guard = new Guard({ userHasWorkspaceSettingPermission });
    const request = {
      workspace: { id: 'workspace', activationStatus: 'ACTIVE' },
      userWorkspaceId: 'member',
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    expect(userHasWorkspaceSettingPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        userWorkspaceId: 'member',
        setting: PermissionFlagType.BILLING,
      }),
    );
    userHasWorkspaceSettingPermission.mockResolvedValue(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  const setup = (canManageBilling: boolean) => {
    const quoteCheckout = jest.fn();
    const getUsage = jest.fn();
    const getBillingDetails = jest.fn();
    const userHasWorkspaceSettingPermission = jest
      .fn()
      .mockResolvedValue(canManageBilling);
    const tokenBucketThrottleOrThrow = jest.fn();
    const resolver = new MyahSubscriptionResolver(
      { quoteCheckout, getBillingDetails } as never,
      { getUsage } as never,
      { userHasWorkspaceSettingPermission } as never,
      { tokenBucketThrottleOrThrow } as never,
    );
    return {
      resolver,
      quoteCheckout,
      getUsage,
      getBillingDetails,
      userHasWorkspaceSettingPermission,
      tokenBucketThrottleOrThrow,
    };
  };
  const workspace = { id: 'workspace' } as never;

  it('scopes usage and price queries to the authenticated workspace', async () => {
    const { resolver, quoteCheckout, getUsage, getBillingDetails } =
      setup(true);
    await resolver.myahCheckoutPrice(workspace, 'admin', undefined, 'tester');
    await resolver.myahWorkspaceUsage(workspace);
    await resolver.myahSubscriptionDetails(workspace);
    expect(getBillingDetails).toHaveBeenCalledWith('workspace');
    expect(quoteCheckout).toHaveBeenCalledWith('workspace', 'tester');
    expect(getUsage).toHaveBeenCalledWith('workspace');
  });

  it('lets every member see the plain price without a permission check or rate limit', async () => {
    const {
      resolver,
      quoteCheckout,
      userHasWorkspaceSettingPermission,
      tokenBucketThrottleOrThrow,
    } = setup(false);
    await resolver.myahCheckoutPrice(workspace, 'member', undefined, '  ');
    expect(quoteCheckout).toHaveBeenCalledWith('workspace', '  ');
    expect(userHasWorkspaceSettingPermission).not.toHaveBeenCalled();
    expect(tokenBucketThrottleOrThrow).not.toHaveBeenCalled();
  });

  it('refuses promotion codes from members without Billing permission before calling Stripe', async () => {
    const { resolver, quoteCheckout, tokenBucketThrottleOrThrow } =
      setup(false);
    await expect(
      resolver.myahCheckoutPrice(workspace, 'member', undefined, 'TESTER100'),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(quoteCheckout).not.toHaveBeenCalled();
    expect(tokenBucketThrottleOrThrow).not.toHaveBeenCalled();
  });

  it('rate-limits promotion code checks per workspace', async () => {
    const {
      resolver,
      quoteCheckout,
      userHasWorkspaceSettingPermission,
      tokenBucketThrottleOrThrow,
    } = setup(true);
    tokenBucketThrottleOrThrow.mockRejectedValueOnce(
      new Error('Limit reached'),
    );
    await expect(
      resolver.myahCheckoutPrice(
        workspace,
        undefined,
        { id: 'api-key' } as never,
        'GUESS',
      ),
    ).rejects.toThrow('Limit reached');
    expect(userHasWorkspaceSettingPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace',
        apiKeyId: 'api-key',
        setting: PermissionFlagType.BILLING,
      }),
    );
    expect(tokenBucketThrottleOrThrow).toHaveBeenCalledWith(
      'myah-promotion-code:workspace',
      1,
      10,
      600_000,
    );
    expect(quoteCheckout).not.toHaveBeenCalled();
  });
});
