import { ForbiddenException } from '@nestjs/common';

jest.mock(
  'twenty-shared/workflow',
  () => ({ WorkflowActionType: { CODE: 'CODE' } }),
  { virtual: true },
);

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: () => ({
      apiKeyRoleMap: {},
      userWorkspaceRoleMap: {},
    }),
  }),
);
jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: () => ({ unionOf: ['role-id'] }),
  }),
);
jest.mock(
  'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager',
  () => ({ GlobalWorkspaceOrmManager: class {} }),
);

import { CampaignOutreachToolAccessGuardService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool-access-guard.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const campaignAId = '20202020-1c25-4d02-bf25-6aeccf7ea420';
const campaignBId = '20202020-1c25-4d02-bf25-6aeccf7ea421';
const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
} as never;

const createService = ({ canReadCampaign = true } = {}) => {
  const workflowRepository = {
    findOne: jest.fn(({ where }) =>
      Promise.resolve(
        (
          {
            general: { id: 'general', outreachCampaignId: null },
            'workflow-a': { id: 'workflow-a', outreachCampaignId: campaignAId },
            'workflow-b': { id: 'workflow-b', outreachCampaignId: campaignBId },
          } as Record<string, { id: string; outreachCampaignId: string | null }>
        )[where.id as string],
      ),
    ),
  };
  const workflowVersionRepository = {
    find: jest.fn().mockResolvedValue([
      {
        workflowId: 'workflow-a',
        steps: [
          {
            type: 'CODE',
            settings: { input: { logicFunctionId: 'function-a' } },
          },
          {
            type: 'AI_AGENT',
            settings: { input: { agentId: 'agent-a' } },
          },
          {
            type: 'LOGIC_FUNCTION',
            settings: { input: { logicFunctionId: 'shared-function-a' } },
          },
        ],
      },
      {
        workflowId: 'workflow-b',
        steps: [
          {
            type: 'CODE',
            settings: { input: { logicFunctionId: 'function-b' } },
          },
        ],
      },
    ]),
    findOne: jest.fn(({ where }) =>
      Promise.resolve(
        (
          {
            'version-a': { workflowId: 'workflow-a' },
            'version-b': { workflowId: 'workflow-b' },
          } as Record<string, { workflowId: string }>
        )[where.id as string],
      ),
    ),
  };
  const workflowRunRepository = {
    findOne: jest.fn(({ where }) =>
      Promise.resolve(
        (
          {
            'run-a': { workflowId: 'workflow-a' },
            'run-b': { workflowId: 'workflow-b' },
          } as Record<string, { workflowId: string }>
        )[where.id as string],
      ),
    ),
  };
  const campaignRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(canReadCampaign ? { id: campaignAId } : null),
  };
  const flatEntityMapsCacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
      flatLogicFunctionMaps: {
        byUniversalIdentifier: {
          reusable: {
            id: 'shared-function-a',
            deletedAt: null,
            workflowActionTriggerSettings: {},
          },
          inactive: {
            id: 'inactive-function-a',
            deletedAt: null,
            workflowActionTriggerSettings: null,
          },
        },
      },
    }),
  };

  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback) => callback()),
    getRepository: jest.fn((_workspaceId, objectName) => {
      if (objectName === 'campaign') return campaignRepository;
      if (objectName === 'workflow') return workflowRepository;
      if (objectName === 'workflowVersion') return workflowVersionRepository;
      return workflowRunRepository;
    }),
  };

  return {
    service: new CampaignOutreachToolAccessGuardService(
      globalWorkspaceOrmManager as never,
      flatEntityMapsCacheService as never,
    ),
  };
};

describe('CampaignOutreachToolAccessGuardService', () => {
  it.each([
    { type: 'workflow', id: 'workflow-a' },
    { type: 'workflowVersion', id: 'version-a' },
    { type: 'workflowRun', id: 'run-a' },
    { type: 'agent', id: 'agent-a' },
    { type: 'logicFunction', id: 'function-a' },
  ] as const)('allows Campaign A $type targets', async (target) => {
    const { service } = createService();

    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target,
      }),
    ).resolves.toBeUndefined();
  });

  it.each([
    { type: 'workflow', id: 'general' },
    { type: 'workflow', id: 'workflow-b' },
    { type: 'workflowVersion', id: 'version-b' },
    { type: 'workflowRun', id: 'run-b' },
    { type: 'logicFunction', id: 'function-b' },
    { type: 'workflow', id: 'unknown' },
  ] as const)(
    'rejects General, other Campaign and unknown $type targets',
    async (target) => {
      const { service } = createService();

      await expect(
        service.assertTargetBelongsToCampaign({
          authContext,
          campaignId: campaignAId,
          target,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('allows Campaign-owned CODE and reusable LOGIC_FUNCTION references only while creating or updating steps', async () => {
    const { service } = createService();

    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'shared-function-a' },
        action: 'createWorkflowVersionStep',
      } as never),
    ).resolves.toBeUndefined();
    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'shared-function-a' },
        action: 'updateWorkflowVersionStep',
      } as never),
    ).resolves.toBeUndefined();

    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'shared-function-a' },
        action: 'updateLogicFunctionSource',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'function-a' },
        action: 'createWorkflowVersionStep',
      } as never),
    ).resolves.toBeUndefined();
    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'function-a' },
        action: 'updateWorkflowVersionStep',
      } as never),
    ).resolves.toBeUndefined();
    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'function-b' },
        action: 'updateWorkflowVersionStep',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'logicFunction', id: 'inactive-function-a' },
        action: 'createWorkflowVersionStep',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unreadable Campaign without revealing the target', async () => {
    const { service } = createService({ canReadCampaign: false });

    await expect(
      service.assertTargetBelongsToCampaign({
        authContext,
        campaignId: campaignAId,
        target: { type: 'workflow', id: 'workflow-a' },
      }),
    ).rejects.toThrow('Campaign not found or inaccessible');
  });
});
