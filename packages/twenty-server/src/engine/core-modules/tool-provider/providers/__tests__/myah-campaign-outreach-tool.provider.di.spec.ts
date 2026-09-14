import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ToolCategory } from 'twenty-shared/ai';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-campaign-outreach-tool-service.token';
import { TOOL_PROVIDERS } from 'src/engine/core-modules/tool-provider/constants/tool-providers.token';
import { WORKFLOW_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/workflow-tool-service.token';
import { MyahCampaignOutreachToolProvider } from 'src/engine/core-modules/tool-provider/providers/myah-campaign-outreach-tool.provider';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';

import { ToolExecutorService } from 'src/engine/core-modules/tool-provider/services/tool-executor.service';
import { ToolRegistryService } from 'src/engine/core-modules/tool-provider/services/tool-registry.service';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';
import { ToolOutputSpillService } from 'src/engine/core-modules/tool/services/tool-output-spill.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { AiChatModule } from 'src/engine/metadata-modules/ai/ai-chat/ai-chat.module';
import { CampaignOutreachToolsModule } from 'src/modules/myah-outreach/campaign-outreach-tools.module';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';
import { CampaignOutreachToolAccessGuardService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool-access-guard.service';
import { CampaignOutreachToolWorkspaceService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool.workspace-service';
import { WorkflowToolsModule } from 'src/modules/workflow/workflow-tools/workflow-tools.module';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CreateManyRecordsService } from 'src/engine/core-modules/record-crud/services/create-many-records.service';
import { CreateRecordService } from 'src/engine/core-modules/record-crud/services/create-record.service';
import { DeleteManyRecordsService } from 'src/engine/core-modules/record-crud/services/delete-many-records.service';
import { DeleteRecordService } from 'src/engine/core-modules/record-crud/services/delete-record.service';
import { FindRecordsService } from 'src/engine/core-modules/record-crud/services/find-records.service';
import { GroupByRecordsService } from 'src/engine/core-modules/record-crud/services/group-by-records.service';
import { UpdateManyRecordsService } from 'src/engine/core-modules/record-crud/services/update-many-records.service';
import { UpdateRecordService } from 'src/engine/core-modules/record-crud/services/update-record.service';
import { UpsertManyRecordsService } from 'src/engine/core-modules/record-crud/services/upsert-many-records.service';
import { LogicFunctionExecutorService } from 'src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userId = '20202020-1234-4678-9012-345678901235';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const campaignId = '20202020-8c3a-4c18-a8a1-012345678901';
const campaignToolName = 'get_campaign_outreach_workflow';

const context = {
  workspaceId,
  userId,
  userWorkspaceId,
  roleId: 'role-id',
  actorContext: { workspaceMemberId },
  authContext: {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId,
    user: { id: userId },
    workspaceMemberId,
  },
  rolePermissionConfig: { unionOf: ['role-id'] },
} as unknown as ToolProviderContext;

const executorLeafServices = [
  FindRecordsService,
  GroupByRecordsService,
  CreateRecordService,
  CreateManyRecordsService,
  UpdateRecordService,
  UpdateManyRecordsService,
  UpsertManyRecordsService,
  DeleteRecordService,
  DeleteManyRecordsService,
  LogicFunctionExecutorService,
  WorkspaceCacheService,
] as const;

describe('MyahCampaignOutreachToolProvider focused dependency seam', () => {
  it('routes a Campaign provider through the real token, registry, and executor alongside general Workflow', async () => {
    const campaignWorkflow = {
      campaignId,
      currentVersionId: null,
      name: 'Campaign Outreach',
      workflowId: '20202020-4b7c-4c1c-8acb-012345678902',
    };
    const campaignOutreachWorkflowService = {
      find: jest.fn().mockResolvedValue(campaignWorkflow),
      createOrGet: jest.fn(),
    };
    const workflowToolService = {
      buildWorkflowToolSet: jest.fn().mockReturnValue({}),
    };
    const permissionsService = {
      checkRolesPermissions: jest.fn().mockResolvedValue(true),
    };
    const generalWorkflowProvider = {
      category: ToolCategory.WORKFLOW,
      isAvailable: jest.fn().mockResolvedValue(true),
      generateDescriptors: jest.fn().mockResolvedValue([
        {
          name: 'get_workflow_current_version',
          description: 'Get a general Workflow version.',
          category: ToolCategory.WORKFLOW,
          executionRef: {
            kind: 'static',
            toolId: 'get_workflow_current_version',
          },
        },
      ]),
      executeStaticTool: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignOutreachToolAccessGuardService,
        CampaignOutreachToolWorkspaceService,
        MyahCampaignOutreachToolProvider,
        ToolExecutorService,
        ToolRegistryService,
        {
          provide: MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN,
          useExisting: CampaignOutreachToolWorkspaceService,
        },
        {
          provide: WORKFLOW_TOOL_SERVICE_TOKEN,
          useValue: workflowToolService,
        },
        {
          provide: CampaignOutreachWorkflowService,
          useValue: campaignOutreachWorkflowService,
        },
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {},
        },
        {
          provide: WorkspaceManyOrAllFlatEntityMapsCacheService,
          useValue: {
            getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
              flatObjectMetadataMaps: {
                byUniversalIdentifier: {
                  [MYAH_STANDARD_OBJECTS.campaign.universalIdentifier]: {
                    id: 'campaign-object-id',
                    isActive: true,
                  },
                },
              },
            }),
          },
        },
        {
          provide: PermissionsService,
          useValue: permissionsService,
        },
        {
          provide: TOOL_PROVIDERS,
          inject: [MyahCampaignOutreachToolProvider],
          useFactory: (campaignProvider: MyahCampaignOutreachToolProvider) => [
            generalWorkflowProvider,
            campaignProvider,
          ],
        },
        {
          provide: ToolOutputSpillService,
          useValue: {},
        },
        ...executorLeafServices.map((provide) => ({ provide, useValue: {} })),
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {},
        },
      ],
    }).compile();

    const registry = moduleRef.get(ToolRegistryService);
    const campaignProvider = moduleRef.get(MyahCampaignOutreachToolProvider);
    const campaignService = moduleRef.get(CampaignOutreachToolWorkspaceService);
    const catalog = await registry.getCatalog(context);
    const campaignDescriptor = catalog.find(
      (descriptor) => descriptor.name === campaignToolName,
    );

    expect(
      moduleRef.get(CampaignOutreachToolAccessGuardService),
    ).toBeInstanceOf(CampaignOutreachToolAccessGuardService);
    expect(campaignService).toBeInstanceOf(
      CampaignOutreachToolWorkspaceService,
    );
    expect(campaignProvider).toBeInstanceOf(MyahCampaignOutreachToolProvider);
    expect(moduleRef.get(MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN)).toBe(
      campaignService,
    );
    expect(moduleRef.get(ToolExecutorService)).toBeInstanceOf(
      ToolExecutorService,
    );
    expect(registry).toBeInstanceOf(ToolRegistryService);
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get_workflow_current_version',
          category: ToolCategory.WORKFLOW,
        }),
        expect.objectContaining({
          name: campaignToolName,
          category: ToolCategory.MYAH_CAMPAIGN_OUTREACH,
        }),
      ]),
    );
    expect(campaignDescriptor).toBeDefined();

    const toolSet = registry.hydrateToolSet(
      [campaignDescriptor as never],
      context,
    );
    const execute = toolSet[campaignToolName]?.execute;

    if (!execute) {
      throw new Error(`Missing hydrated ${campaignToolName} execution`);
    }

    await expect(
      execute({ campaignId }, { toolCallId: '', messages: [] }),
    ).resolves.toEqual({
      success: true,
      category: 'SUCCESS',
      message: 'Myah action completed',
      result: campaignWorkflow,
    });
    expect(campaignOutreachWorkflowService.find).toHaveBeenCalledWith({
      authContext: context.authContext,
      campaignId,
      workspaceId,
    });

    await moduleRef.close();
  });

  it('keeps Campaign registration directional in module metadata', () => {
    const campaignProviders = Reflect.getMetadata(
      'providers',
      CampaignOutreachToolsModule,
    ) as unknown[];
    const campaignExports = Reflect.getMetadata(
      'exports',
      CampaignOutreachToolsModule,
    ) as unknown[];
    const aiChatImports = Reflect.getMetadata(
      'imports',
      AiChatModule,
    ) as unknown[];
    const toolProviderImports = Reflect.getMetadata(
      'imports',
      ToolProviderModule,
    ) as unknown[];
    const toolProviderProviders = Reflect.getMetadata(
      'providers',
      ToolProviderModule,
    ) as unknown[];
    const tokenBinding = campaignProviders.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN,
    );

    expect(
      Reflect.getMetadata('__module:global__', CampaignOutreachToolsModule),
    ).toBe(true);
    expect(tokenBinding).toEqual({
      provide: MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN,
      useExisting: CampaignOutreachToolWorkspaceService,
    });
    expect(campaignExports).toContain(
      MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN,
    );
    expect(aiChatImports).toEqual(
      expect.arrayContaining([
        WorkflowToolsModule,
        CampaignOutreachToolsModule,
        ToolProviderModule,
      ]),
    );
    expect(toolProviderImports).not.toContain(WorkflowToolsModule);
    expect(toolProviderImports).not.toContain(CampaignOutreachToolsModule);
    expect(
      toolProviderProviders.filter(
        (provider) => provider === MyahCampaignOutreachToolProvider,
      ),
    ).toHaveLength(1);
  });
});
