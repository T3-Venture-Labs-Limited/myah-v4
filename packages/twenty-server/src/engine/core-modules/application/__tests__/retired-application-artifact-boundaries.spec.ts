import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { ApplicationUpgradeService } from 'src/engine/core-modules/application/application-upgrade/application-upgrade.service';
import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { PublicDomainService } from 'src/engine/core-modules/public-domain/public-domain.service';
import { AgentService } from 'src/engine/metadata-modules/ai/ai-agent/agent.service';
import { CommandMenuItemService } from 'src/engine/metadata-modules/command-menu-item/command-menu-item.service';
import { FrontComponentService } from 'src/engine/metadata-modules/front-component/front-component.service';
import { AiAgentWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/ai-agent/ai-agent.workflow-action';
import { WorkflowActionType } from 'twenty-shared/workflow';

const retiredApplication = {
  id: 'retired-application-id',
  universalIdentifier: RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
};

describe('retired application artifact boundaries', () => {
  it('hides and blocks retired agents before migration effects', async () => {
    const retiredAgent = {
      id: 'retired-agent-id',
      universalIdentifier: 'retired-agent-universal-id',
      applicationId: retiredApplication.id,
    };
    const migrate = jest.fn();
    const service = new AgentService(
      {} as never,
      { validateBuildAndRunWorkspaceMigration: migrate } as never,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            workspaceCustomFlatApplication: {
              id: 'custom-app-id',
              universalIdentifier: 'custom-app',
            },
          }),
      } as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatAgentMaps: {
            universalIdentifierById: {
              [retiredAgent.id]: retiredAgent.universalIdentifier,
            },
            byUniversalIdentifier: {
              [retiredAgent.universalIdentifier]: retiredAgent,
            },
          },
          flatRoleTargetByAgentIdMaps: {},
          flatRoleMaps: {},
          flatApplicationMaps: {
            byId: { [retiredApplication.id]: retiredApplication },
          },
        }),
      } as never,
    );

    await expect(service.findManyAgents('workspace-id')).resolves.toEqual([]);
    await expect(
      service.findOneAgentById({
        id: retiredAgent.id,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      service.updateOneAgent({
        input: { id: retiredAgent.id, update: {} } as never,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toThrow(/not found/i);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('hides and blocks retired front components before migration effects', async () => {
    const component = {
      id: 'component-id',
      universalIdentifier: 'component-universal-id',
      name: 'Brand Brain component',
      applicationId: retiredApplication.id,
    };
    const migrate = jest.fn();
    const cache = {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
        flatFrontComponentMaps: {
          universalIdentifierById: {
            [component.id]: component.universalIdentifier,
          },
          byUniversalIdentifier: {
            [component.universalIdentifier]: component,
          },
        },
        flatApplicationMaps: {
          byId: { [retiredApplication.id]: retiredApplication },
        },
      }),
    };
    const service = new FrontComponentService(
      { validateBuildAndRunWorkspaceMigration: migrate } as never,
      cache as never,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            workspaceCustomFlatApplication: {
              universalIdentifier: 'custom-app',
            },
          }),
      } as never,
      {} as never,
      {} as never,
    );

    await expect(service.findAll('workspace-id')).resolves.toEqual([]);
    await expect(
      service.findById(component.id, 'workspace-id'),
    ).resolves.toBeNull();
    await expect(
      service.updateOne({
        id: component.id,
        update: {},
        workspaceId: 'workspace-id',
      }),
    ).rejects.toThrow(/not found/i);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('hides and blocks retired command items before migration effects', async () => {
    const item = {
      id: 'item-id',
      universalIdentifier: 'item-universal-id',
      applicationUniversalIdentifier:
        RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      position: 0,
    };
    const migrate = jest.fn();
    const service = new CommandMenuItemService(
      { validateBuildAndRunWorkspaceMigration: migrate } as never,
      {
        getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
          flatCommandMenuItemMaps: {
            universalIdentifierById: {
              [item.id]: item.universalIdentifier,
            },
            byUniversalIdentifier: { [item.universalIdentifier]: item },
          },
          flatObjectMetadataMaps: {},
          flatPageLayoutMaps: {},
        }),
      } as never,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            workspaceCustomFlatApplication: {
              universalIdentifier: 'custom-app',
            },
          }),
      } as never,
      {} as never,
    );

    await expect(service.findAll('workspace-id')).resolves.toEqual([]);
    await expect(service.findById(item.id, 'workspace-id')).resolves.toBeNull();
    await expect(
      service.update({ id: item.id, update: {} } as never, 'workspace-id'),
    ).rejects.toThrow(/not found/i);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('rejects retired agents in workflow execution before executor effects', async () => {
    const executeAgent = jest.fn();
    const getExecutionContext = jest.fn();
    const service = new AiAgentWorkflowAction(
      { executeAgent } as never,
      { getExecutionContext } as never,
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'agent-id',
          applicationId: retiredApplication.id,
        }),
      } as never,
      { findById: jest.fn().mockResolvedValue(retiredApplication) } as never,
    );

    await expect(
      service.execute({
        currentStepId: 'step-id',
        steps: [
          {
            id: 'step-id',
            type: WorkflowActionType.AI_AGENT,
            settings: { input: { agentId: 'agent-id', prompt: 'prompt' } },
          } as never,
        ],
        context: {} as never,
        runInfo: { workspaceId: 'workspace-id' } as never,
      }),
    ).rejects.toThrow(/not found/i);
    expect(getExecutionContext).not.toHaveBeenCalled();
    expect(executeAgent).not.toHaveBeenCalled();
  });

  it('rejects retired public domains before DNS or persistence effects', async () => {
    const registerHostname = jest.fn();
    const insert = jest.fn();
    const service = new PublicDomainService(
      { registerHostname } as never,
      { findOne: jest.fn().mockResolvedValue(null), insert } as never,
      {} as never,
      { findOneBy: jest.fn().mockResolvedValue(null) } as never,
      { findOneBy: jest.fn().mockResolvedValue(retiredApplication) } as never,
    );

    await expect(
      service.createPublicDomain({
        domain: 'brand-brain.example.com',
        workspace: { id: 'workspace-id' } as never,
        applicationId: retiredApplication.id,
      }),
    ).rejects.toThrow(/not found/i);
    expect(registerHostname).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('skips retired registrations during version checks', async () => {
    const update = jest.fn();
    const registration = {
      id: 'registration-id',
      universalIdentifier: RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      sourceType: ApplicationRegistrationSourceType.NPM,
      sourcePackage: '@myah/brand-brain',
    };
    const service = new ApplicationUpgradeService(
      {
        find: jest.fn().mockResolvedValue([registration]),
        update,
      } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    await expect(
      service.checkForUpdates(registration as never),
    ).resolves.toBeNull();
    await expect(service.checkAllForUpdates()).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
