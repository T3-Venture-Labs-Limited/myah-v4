jest.mock(
  'twenty-shared/workflow',
  () => ({
    WorkflowActionType: { CODE: 'CODE', LOGIC_FUNCTION: 'LOGIC_FUNCTION' },
  }),
  { virtual: true },
);
jest.mock(
  'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager',
  () => ({ GlobalWorkspaceOrmManager: class {} }),
);
jest.mock(
  'twenty-shared/utils',
  () => ({
    CustomError: class extends Error {},
    isDefined: (value: unknown) => value !== undefined && value !== null,
  }),
  { virtual: true },
);
import { WorkflowActionType } from 'twenty-shared/workflow';

import { WorkflowQueryValidationException } from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { WorkflowToolOutreachAccessGuardService } from 'src/modules/workflow/workflow-tools/services/workflow-tool-outreach-access-guard.service';

describe('WorkflowToolOutreachAccessGuardService', () => {
  it('rejects a Campaign Outreach workflow version', async () => {
    const workflowRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ outreachCampaignId: 'campaign-a' }),
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue({ workflowId: 'workflow-a' }),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest
        .fn()
        .mockResolvedValueOnce(workflowVersionRepository)
        .mockResolvedValueOnce(workflowRepository),
    };
    const service = new WorkflowToolOutreachAccessGuardService(
      globalWorkspaceOrmManager as never,
    );

    await expect(
      service.assertWorkflowVersionIsGeneralAutomation({
        workflowVersionId: 'version-a',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toBeInstanceOf(WorkflowQueryValidationException);
  });

  it('rejects a Campaign Outreach workflow run', async () => {
    const workflowRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ outreachCampaignId: 'campaign-a' }),
    };
    const workflowRunRepository = {
      findOne: jest.fn().mockResolvedValue({ workflowId: 'workflow-a' }),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest
        .fn()
        .mockResolvedValueOnce(workflowRunRepository)
        .mockResolvedValueOnce(workflowRepository),
    };
    const service = new WorkflowToolOutreachAccessGuardService(
      globalWorkspaceOrmManager as never,
    );

    await expect(
      service.assertTargetIsGeneralAutomation({
        target: { id: 'run-a', type: 'workflowRun' },
        workspaceId: 'workspace-a',
      }),
    ).rejects.toBeInstanceOf(WorkflowQueryValidationException);
  });

  it('rejects a Campaign Outreach agent', async () => {
    const workflowRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ outreachCampaignId: 'campaign-a' }),
    };
    const workflowVersionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          steps: [{ settings: { input: { agentId: 'agent-a' } } }],
          workflowId: 'workflow-a',
        },
      ]),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest
        .fn()
        .mockResolvedValueOnce(workflowVersionRepository)
        .mockResolvedValueOnce(workflowRepository),
    };
    const service = new WorkflowToolOutreachAccessGuardService(
      globalWorkspaceOrmManager as never,
    );

    await expect(
      service.assertTargetIsGeneralAutomation({
        target: { id: 'agent-a', type: 'agent' },
        workspaceId: 'workspace-a',
      }),
    ).rejects.toBeInstanceOf(WorkflowQueryValidationException);
  });

  it('rejects an agent shared with a Campaign Outreach workflow', async () => {
    const workflowRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ outreachCampaignId: null })
        .mockResolvedValueOnce({ outreachCampaignId: 'campaign-a' }),
    };
    const workflowVersionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          steps: [{ settings: { input: { agentId: 'agent-a' } } }],
          workflowId: 'general-workflow-a',
        },
        {
          steps: [{ settings: { input: { agentId: 'agent-a' } } }],
          workflowId: 'campaign-workflow-a',
        },
      ]),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest
        .fn()
        .mockResolvedValueOnce(workflowVersionRepository)
        .mockResolvedValue(workflowRepository),
    };
    const service = new WorkflowToolOutreachAccessGuardService(
      globalWorkspaceOrmManager as never,
    );

    await expect(
      service.assertTargetIsGeneralAutomation({
        target: { id: 'agent-a', type: 'agent' },
        workspaceId: 'workspace-a',
      }),
    ).rejects.toBeInstanceOf(WorkflowQueryValidationException);
  });

  it('allows a logic function shared through Campaign and General LOGIC_FUNCTION steps', async () => {
    const workflowRepository = {
      findOne: jest.fn(),
    };
    const workflowVersionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          steps: [
            {
              settings: {
                input: { logicFunctionId: 'shared-logic-function-a' },
              },
              type: WorkflowActionType.LOGIC_FUNCTION,
            },
          ],
          workflowId: 'general-workflow-a',
        },
        {
          steps: [
            {
              settings: {
                input: { logicFunctionId: 'shared-logic-function-a' },
              },
              type: WorkflowActionType.LOGIC_FUNCTION,
            },
          ],
          workflowId: 'campaign-workflow-a',
        },
      ]),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest
        .fn()
        .mockResolvedValueOnce(workflowVersionRepository)
        .mockResolvedValue(workflowRepository),
    };
    const service = new WorkflowToolOutreachAccessGuardService(
      globalWorkspaceOrmManager as never,
    );

    await expect(
      service.assertTargetIsGeneralAutomation({
        target: { id: 'shared-logic-function-a', type: 'logicFunction' },
        workspaceId: 'workspace-a',
      }),
    ).resolves.toBeUndefined();
    expect(workflowRepository.findOne).not.toHaveBeenCalled();
  });

  it('finds code functions used by Campaign Outreach workflows', async () => {
    const workflowRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'campaign-workflow-a' }]),
    };
    const workflowVersionRepository = {
      find: jest.fn().mockResolvedValue([
        {
          steps: [
            {
              settings: {
                input: { logicFunctionId: 'campaign-code-function-a' },
              },
              type: WorkflowActionType.CODE,
            },
            {
              settings: {
                input: { logicFunctionId: 'shared-logic-function-a' },
              },
              type: WorkflowActionType.LOGIC_FUNCTION,
            },
          ],
          workflowId: 'campaign-workflow-a',
        },
        {
          steps: [
            {
              settings: {
                input: { logicFunctionId: 'general-code-function-a' },
              },
              type: WorkflowActionType.CODE,
            },
          ],
          workflowId: 'general-workflow-a',
        },
      ]),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest
        .fn()
        .mockResolvedValueOnce(workflowRepository)
        .mockResolvedValueOnce(workflowVersionRepository),
    };
    const service = new WorkflowToolOutreachAccessGuardService(
      globalWorkspaceOrmManager as never,
    );

    await expect(
      service.getCampaignOutreachLogicFunctionIds({
        workspaceId: 'workspace-a',
      }),
    ).resolves.toEqual(new Set(['campaign-code-function-a']));
  });
});
