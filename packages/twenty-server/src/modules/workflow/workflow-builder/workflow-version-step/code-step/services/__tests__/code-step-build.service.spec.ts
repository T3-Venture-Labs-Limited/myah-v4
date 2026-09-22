import { WorkflowActionType } from 'twenty-shared/workflow';

import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { LogicFunctionExecutionMode } from 'src/engine/metadata-modules/logic-function/logic-function.entity';
import { CodeStepBuildService } from 'src/modules/workflow/workflow-builder/workflow-version-step/code-step/services/code-step-build.service';
import { WorkflowTriggerExceptionCode } from 'src/modules/workflow/workflow-trigger/exceptions/workflow-trigger.exception';

describe('CodeStepBuildService retired applications', () => {
  it('rejects prebuilt switching before metadata mutation', async () => {
    const logicFunctionId = 'brand-brain-function-id';
    const applicationId = 'brand-brain-application-id';
    const updateOneFromMetadata = jest.fn();
    const service = new CodeStepBuildService(
      {
        getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
          flatLogicFunctionMaps: {
            universalIdentifierById: {
              [logicFunctionId]: 'brand-brain-function-universal-id',
            },
            byUniversalIdentifier: {
              'brand-brain-function-universal-id': {
                id: logicFunctionId,
                applicationId,
                isBuildUpToDate: true,
                checksum: 'checksum',
                executionMode: LogicFunctionExecutionMode.LIVE,
                deletedAt: null,
              },
            },
          },
          flatApplicationMaps: {
            byId: {
              [applicationId]: {
                id: applicationId,
                universalIdentifier:
                  RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
              },
            },
          },
        }),
      } as never,
      {} as never,
      { updateOneFromMetadata } as never,
      { isFeatureEnabled: jest.fn().mockResolvedValue(true) } as never,
    );

    await expect(
      service.switchCodeStepLogicFunctionsToPrebuilt({
        workspaceId: 'workspace-id',
        steps: [
          {
            id: 'code-step-id',
            type: WorkflowActionType.CODE,
            settings: { input: { logicFunctionId } },
          } as never,
        ],
      }),
    ).rejects.toMatchObject({
      code: WorkflowTriggerExceptionCode.INVALID_WORKFLOW_VERSION,
    });
    expect(updateOneFromMetadata).not.toHaveBeenCalled();
  });
});
