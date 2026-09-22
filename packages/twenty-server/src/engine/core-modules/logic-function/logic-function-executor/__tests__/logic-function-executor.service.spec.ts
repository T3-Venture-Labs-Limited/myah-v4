import {
  LogicFunctionExecutionExceptionCode,
  LogicFunctionExecutorService,
} from 'src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service';
import {
  RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
  RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';

describe('LogicFunctionExecutorService', () => {
  it.each([
    RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
    RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
    '00000000-0000-4000-8000-000000000001',
  ])(
    'rejects unavailable application logic functions before driver execution',
    async (applicationUniversalIdentifier) => {
      const driverFactory = { getCurrentDriver: jest.fn() };
      const service = new LogicFunctionExecutorService(
        driverFactory as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
      );
      const serviceInternals = service as unknown as {
        throttleExecution: jest.Mock;
        getFlatEntitiesOrThrow: jest.Mock;
        getExecutionEnvVariables: jest.Mock;
      };

      serviceInternals.throttleExecution = jest.fn();
      serviceInternals.getFlatEntitiesOrThrow = jest.fn().mockResolvedValue({
        flatApplication: {
          universalIdentifier: applicationUniversalIdentifier,
        },
        flatLogicFunction: { id: 'brand-brain-function-id' },
        flatApplicationVariables: [],
      });
      serviceInternals.getExecutionEnvVariables = jest.fn();

      await expect(
        service.execute({
          logicFunctionId: 'brand-brain-function-id',
          workspaceId: 'workspace-id',
          payload: {},
        }),
      ).rejects.toMatchObject({
        code: LogicFunctionExecutionExceptionCode.LOGIC_FUNCTION_NOT_FOUND,
      });
      expect(serviceInternals.getExecutionEnvVariables).not.toHaveBeenCalled();
      expect(driverFactory.getCurrentDriver).not.toHaveBeenCalled();
    },
  );
});
