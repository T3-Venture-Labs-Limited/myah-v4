import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { LogicFunctionResolver } from 'src/engine/metadata-modules/logic-function/logic-function.resolver';

describe('LogicFunctionResolver retired applications', () => {
  it('hides retired logic functions and their packages', async () => {
    const retiredFunction = {
      id: 'retired-function-id',
      universalIdentifier: 'retired-function-universal-id',
      applicationId: 'retired-application-id',
      deletedAt: null,
    };
    const activeFunction = {
      id: 'active-function-id',
      universalIdentifier: 'active-function-universal-id',
      applicationId: 'active-application-id',
      deletedAt: null,
    };
    const cacheService = {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
        flatLogicFunctionMaps: {
          universalIdentifierById: {
            [retiredFunction.id]: retiredFunction.universalIdentifier,
            [activeFunction.id]: activeFunction.universalIdentifier,
          },
          byUniversalIdentifier: {
            [retiredFunction.universalIdentifier]: retiredFunction,
            [activeFunction.universalIdentifier]: activeFunction,
          },
        },
        flatApplicationMaps: {
          byId: {
            [retiredFunction.applicationId]: {
              universalIdentifier:
                RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
              availablePackages: { secret: '1.0.0' },
            },
            [activeFunction.applicationId]: {
              universalIdentifier: 'active-application',
              availablePackages: { public: '1.0.0' },
            },
          },
        },
      }),
    };
    const resolver = new LogicFunctionResolver(
      {} as never,
      cacheService as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.findManyLogicFunctions({ id: 'workspace-id' } as never),
    ).resolves.toEqual([expect.objectContaining({ id: activeFunction.id })]);
    await expect(
      resolver.getAvailablePackages({ id: retiredFunction.id }, {
        id: 'workspace-id',
      } as never),
    ).resolves.toEqual({});
  });
});
