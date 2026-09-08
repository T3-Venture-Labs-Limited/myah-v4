import {
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PermissionFlagType } from 'twenty-shared/constants';

import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';

import { CampaignOutreachWorkflowResolver } from 'src/modules/myah-outreach/resolvers/campaign-outreach-workflow.resolver';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

describe('CampaignOutreachWorkflowResolver', () => {
  const workspace = { id: 'workspace-a' };
  const authContext = { type: 'user', workspace };
  const campaignId = 'campaign-a';
  const workflow = {
    campaignId,
    currentVersionId: 'version-a',
    name: 'Campaign Outreach',
    workflowId: 'workflow-a',
  };
  const snapshot = {
    campaignId,
    workflowId: 'workflow-a',
    versionId: 'version-a',
    sequence: { schemaVersion: 1 as const, messages: [], delaysSeconds: [] },
    lifecycleStatus: 'DRAFT',
    editable: true,
    issues: [],
  };

  beforeEach(() => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue(authContext as never);
  });

  it('finds Outreach only through the authenticated workspace Campaign', async () => {
    const campaignOutreachWorkflowService = {
      find: jest.fn().mockResolvedValue(workflow),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      campaignOutreachWorkflowService as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.findCampaignOutreachWorkflow(campaignId, workspace as never),
    ).resolves.toEqual(workflow);

    expect(campaignOutreachWorkflowService.find).toHaveBeenCalledWith({
      authContext,
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
      {} as never,
      {} as never,
    );

    await expect(
      resolver.createCampaignOutreachWorkflow(campaignId, workspace as never),
    ).resolves.toEqual(workflow);

    expect(campaignOutreachWorkflowService.createOrGet).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId: workspace.id,
    });
  });

  it('loads the discriminated Campaign sequence result from server-derived scope', async () => {
    const campaignSequenceService = {
      load: jest.fn().mockResolvedValue({ kind: 'SEQUENCE', snapshot }),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      {} as never,
      campaignSequenceService as never,
      {} as never,
    );

    await expect(
      resolver.campaignSequence(campaignId, workspace as never),
    ).resolves.toEqual({ kind: 'SEQUENCE', snapshot });
    expect(campaignSequenceService.load).toHaveBeenCalledWith({
      authContext,
      campaignId,
      workspaceId: workspace.id,
    });
  });

  it('saves and validates only with server-derived workspace and auth context', async () => {
    const campaignSequenceService = {
      save: jest.fn().mockResolvedValue(snapshot),
      validate: jest.fn().mockResolvedValue(snapshot),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      {} as never,
      campaignSequenceService as never,
      {} as never,
    );
    const input = {
      campaignId,
      expectedVersionId: 'version-a',
      sequence: snapshot.sequence,
    };

    await expect(
      resolver.saveCampaignSequence(input, workspace as never),
    ).resolves.toEqual(snapshot);
    await expect(
      resolver.validateCampaignSequence(
        campaignId,
        'version-a',
        workspace as never,
      ),
    ).resolves.toEqual(snapshot);
    expect(campaignSequenceService.save).toHaveBeenCalledWith({
      ...input,
      authContext,
      workspaceId: workspace.id,
    });
    expect(campaignSequenceService.validate).toHaveBeenCalledWith({
      authContext,
      campaignId,
      expectedVersionId: 'version-a',
      workspaceId: workspace.id,
    });
  });

  it('replaces only the exact inspected legacy Campaign definition', async () => {
    const cleanupService = {
      replaceLegacyCampaignSequence: jest.fn().mockResolvedValue(snapshot),
    };
    const resolver = new CampaignOutreachWorkflowResolver(
      {} as never,
      {} as never,
      cleanupService as never,
    );
    const input = {
      campaignId,
      expectedWorkflowId: 'workflow-a',
    };

    await expect(
      resolver.replaceLegacyCampaignSequence(input, workspace as never),
    ).resolves.toEqual(snapshot);
    expect(cleanupService.replaceLegacyCampaignSequence).toHaveBeenCalledWith({
      ...input,
      authContext,
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
