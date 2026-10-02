import {
  LogicFunctionExecutorService,
  LogicFunctionExecutionExceptionCode,
} from './logic-function-executor.service';

describe('LogicFunctionExecutorService installed application boundary', () => {
  const shopifyUniversalIdentifier = 'a51fd2e5-b101-48f2-b1f8-cbc0a591e8ef';
  const instagramUniversalIdentifier = '4738ebcd-6662-4ecc-a190-374fa0525951';

  const run = async (
    universalIdentifier: string,
    logicFunctionUniversalIdentifier = 'function-universal-id',
  ) => {
    const driver = {
      execute: jest
        .fn()
        .mockResolvedValue({ logs: '', duration: 1, status: 'SUCCESS' }),
    };
    const token = {
      generateApplicationAccessToken: jest
        .fn()
        .mockResolvedValue({ token: 'fake-token' }),
    };
    const billing = { isBillingEnabled: jest.fn().mockReturnValue(false) };
    const throttler = { tokenBucketThrottleOrThrow: jest.fn() };
    const cache = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatLogicFunctionMaps: {
          universalIdentifierById: {
            'function-id': logicFunctionUniversalIdentifier,
          },
          byUniversalIdentifier: {
            [logicFunctionUniversalIdentifier]: {
              id: 'function-id',
              applicationId: 'application-id',
              timeoutSeconds: 1,
              name: 'installed',
              executionMode: 'LIVE',
              deletedAt: null,
            },
          },
        },
        flatApplicationMaps: {
          byId: {
            'application-id': {
              id: 'application-id',
              universalIdentifier,
              applicationRegistrationId: null,
            },
          },
        },
        applicationVariableMaps: {
          universalIdentifiersByApplicationId: {},
          byUniversalIdentifier: {},
        },
      }),
    };
    const service = new LogicFunctionExecutorService(
      { getCurrentDriver: () => driver } as never,
      throttler as never,
      { get: jest.fn().mockReturnValue('http://localhost') } as never,
      cache as never,
      token as never,
      {} as never,
      { publish: jest.fn() } as never,
      { isWatched: jest.fn().mockResolvedValue(false) } as never,
      {
        isEnabled: jest.fn().mockReturnValue(false),
        createContext: jest
          .fn()
          .mockReturnValue({ insertWorkspaceEvent: jest.fn() }),
      } as never,
      { emitCustomBatchEvent: jest.fn() } as never,
      billing as never,
      {} as never,
      { isFeatureEnabled: jest.fn().mockResolvedValue(false) } as never,
      { find: jest.fn() } as never,
    );
    return {
      execution: service.execute({
        logicFunctionId: 'function-id',
        workspaceId: 'workspace-id',
        payload: {},
        executionMode: undefined,
      }),
      driver,
      token,
      billing,
      throttler,
    };
  };

  it.each([
    ['store context', '5652c9d4-d09b-470b-83e4-92ecb546824c'],
    ['product search', '8ae23b04-8b91-455b-bcb8-193d38cae7bf'],
    ['product detail', '122d3ea9-df50-4504-bfe7-72d37fad666c'],
    ['brand content', '79af8028-766d-45ec-b2cd-acedf92d7397'],
    ['custom data', 'b23f0779-4e87-46cc-a2f8-73bd8b0def4e'],
    ['commerce summary', '2f0030d7-e47d-4472-94f5-75d441dfa6c5'],
    ['customer summary', '67800b3f-b680-4c22-8d86-de7214fc3163'],
    ['promotions summary', 'd00e848a-8dcd-4413-8aca-e5ad7290672b'],
    ['channel context', '7ebc1181-c037-435d-b0fb-3fda023d0eff'],
  ])(
    'rejects cached Shopify %s before token, throttle, driver or billing',
    async (_operation, logicFunctionUniversalIdentifier) => {
      const { execution, driver, token, billing, throttler } = await run(
        shopifyUniversalIdentifier,
        logicFunctionUniversalIdentifier,
      );
      await expect(execution).rejects.toMatchObject({
        code: LogicFunctionExecutionExceptionCode.LOGIC_FUNCTION_NOT_FOUND,
      });
      expect(throttler.tokenBucketThrottleOrThrow).not.toHaveBeenCalled();
      expect(token.generateApplicationAccessToken).not.toHaveBeenCalled();
      expect(driver.execute).not.toHaveBeenCalled();
      expect(billing.isBillingEnabled).not.toHaveBeenCalled();
    },
  );

  it('executes a retained installed application', async () => {
    const { execution, driver, token, throttler } = await run(
      instagramUniversalIdentifier,
    );
    await expect(execution).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(throttler.tokenBucketThrottleOrThrow).toHaveBeenCalledTimes(1);
    expect(token.generateApplicationAccessToken).toHaveBeenCalledTimes(1);
    expect(driver.execute).toHaveBeenCalledTimes(1);
  });
});
