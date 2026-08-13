import {
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PermissionFlagType } from 'twenty-shared/constants';

import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';

import { CampaignOutreachWorkflowResolver } from 'src/modules/myah-outreach/resolvers/campaign-outreach-workflow.resolver';

describe('CampaignOutreachWorkflowResolver', () => {
  const workspace = { id: 'workspace-a' };
  const campaignId = 'campaign-a';
  const workflow = {
    campaignId,
    currentVersionId: 'version-a',
    name: 'Campaign Outreach',
    workflowId: 'workflow-a',
  };

  it('finds Outreach only through the authenticated workspace Campaign', async () => {
    const campaignOutreachWorkflowService = {
      find: jest.fn().mockResolvedValue(workflow),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      campaignOutreachWorkflowService as never,
    );

    await expect(
      resolver.findCampaignOutreachWorkflow(campaignId, workspace as never),
    ).resolves.toEqual(workflow);

    expect(campaignOutreachWorkflowService.find).toHaveBeenCalledWith({
      campaignId,
      workspaceId: workspace.id,
    });
  });

  it('creates or returns Outreach only through the authenticated workspace Campaign', async () => {
    const campaignOutreachWorkflowService = {
      createOrGet: jest.fn().mockResolvedValue(workflow),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      campaignOutreachWorkflowService as never,
    );

    await expect(
      resolver.createCampaignOutreachWorkflow(campaignId, workspace as never),
    ).resolves.toEqual(workflow);

    expect(campaignOutreachWorkflowService.createOrGet).toHaveBeenCalledWith({
      campaignId,
      workspaceId: workspace.id,
    });
  });

  it('requires the native Workflows permission', async () => {
    const permissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    };
    const executionContext = {
      getType: jest.fn(() => 'graphql'),
    } as unknown as ExecutionContext;
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getContext: () => ({
        req: {
          userWorkspaceId: 'user-workspace-a',
          workspace: { id: 'workspace-a', activationStatus: 'ACTIVE' },
        },
      }),
    } as never);
    const guards: Type<CanActivate>[] = Reflect.getMetadata(
      GUARDS_METADATA,
      CampaignOutreachWorkflowResolver,
    );

    expect(guards).toHaveLength(3);
    expect(guards.slice(0, 2)).toEqual([WorkspaceAuthGuard, UserAuthGuard]);

    const WorkflowsPermissionGuard = guards[2];
    const guard = new WorkflowsPermissionGuard(
      permissionsService as unknown as PermissionsService,
    );

    await expect(
      Promise.resolve(guard.canActivate(executionContext)),
    ).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ setting: PermissionFlagType.WORKFLOWS }),
    );
  });
});
