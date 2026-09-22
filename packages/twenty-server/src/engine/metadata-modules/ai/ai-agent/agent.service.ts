import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { ILike, IsNull } from 'typeorm';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { isSupportedApplicationUniversalIdentifier } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { type FlatApplicationCacheMaps } from 'src/engine/core-modules/application/types/flat-application-cache-maps.type';
import { type CreateAgentInput } from 'src/engine/metadata-modules/ai/ai-agent/dtos/create-agent.input';
import { type UpdateAgentInput } from 'src/engine/metadata-modules/ai/ai-agent/dtos/update-agent.input';
import { fromCreateAgentInputToFlatAgent } from 'src/engine/metadata-modules/ai/ai-agent/utils/from-create-agent-input-to-flat-agent.util';
import { fromUpdateAgentInputToFlatAgentToUpdate } from 'src/engine/metadata-modules/ai/ai-agent/utils/from-update-agent-input-to-flat-agent-to-update.util';
import {
  type FlatAgent,
  type FlatAgentWithRoleId,
} from 'src/engine/metadata-modules/flat-agent/types/flat-agent.type';
import { findFlatEntityByIdInFlatEntityMapsOrThrow } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps-or-throw.util';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMigrationBuilderException } from 'src/engine/workspace-manager/workspace-migration/exceptions/workspace-migration-builder-exception';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';

import { AgentEntity } from './entities/agent.entity';

@Injectable()
export class AgentService {
  constructor(
    @InjectWorkspaceScopedRepository(AgentEntity)
    private readonly agentRepository: WorkspaceScopedRepository<AgentEntity>,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async findManyAgents(workspaceId: string): Promise<FlatAgentWithRoleId[]> {
    const { flatAgentMaps, flatRoleTargetByAgentIdMaps, flatApplicationMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatAgentMaps',
        'flatRoleTargetByAgentIdMaps',
        'flatApplicationMaps',
      ]);

    return Object.values(flatAgentMaps.byUniversalIdentifier)
      .filter(
        (agent): agent is FlatAgent =>
          isDefined(agent) &&
          !this.isRetiredAgent(agent.applicationId, flatApplicationMaps),
      )
      .map((flatAgent) => {
        const roleId = flatRoleTargetByAgentIdMaps[flatAgent.id]?.roleId;

        return {
          ...flatAgent,
          roleId: roleId ?? null,
        };
      });
  }

  async findOneAgentByName({
    name,
    workspaceId,
  }: {
    workspaceId: string;
    name: string;
  }): Promise<AgentEntity> {
    const agent = await this.agentRepository.findOne(workspaceId, {
      where: { name },
    });

    if (!agent || !(await this.isAgentEntityAvailable(agent))) {
      const identifier = `name "${name}"`;

      throw new AiException(
        `Agent with ${identifier} not found`,
        AiExceptionCode.AGENT_NOT_FOUND,
      );
    }

    return agent;
  }

  async findOneAgentById({
    id,
    workspaceId,
  }: {
    workspaceId: string;
    id: string;
  }): Promise<FlatAgentWithRoleId> {
    const { flatAgentMaps, flatRoleTargetByAgentIdMaps, flatApplicationMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatAgentMaps',
        'flatRoleTargetByAgentIdMaps',
        'flatApplicationMaps',
      ]);

    const flatAgent = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: id,
      flatEntityMaps: flatAgentMaps,
    });

    if (
      !isDefined(flatAgent) ||
      this.isRetiredAgent(flatAgent.applicationId, flatApplicationMaps)
    ) {
      throw new AiException(`Agent not found`, AiExceptionCode.AGENT_NOT_FOUND);
    }

    const roleId = flatRoleTargetByAgentIdMaps[flatAgent.id]?.roleId;

    return { ...flatAgent, roleId: roleId ?? null };
  }

  async createOneAgent(
    input: CreateAgentInput & { isCustom: boolean },
    workspaceId: string,
  ): Promise<FlatAgentWithRoleId> {
    const { flatApplicationMaps, flatRoleMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatApplicationMaps',
        'flatRoleMaps',
      ]);

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        {
          workspaceId,
        },
      );

    const flatApplication = isDefined(input.applicationId)
      ? flatApplicationMaps.byId[input.applicationId]
      : undefined;

    const resolvedFlatApplication =
      flatApplication ?? workspaceCustomFlatApplication;

    this.assertApplicationIsAvailable(
      resolvedFlatApplication.universalIdentifier,
    );

    const { flatAgentToCreate, flatRoleTargetToCreate } =
      fromCreateAgentInputToFlatAgent({
        createAgentInput: input,
        workspaceId,
        flatApplication: resolvedFlatApplication,
        flatRoleMaps,
      });

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            agent: {
              flatEntityToCreate: [flatAgentToCreate],
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
            roleTarget: {
              flatEntityToCreate: isDefined(flatRoleTargetToCreate)
                ? [flatRoleTargetToCreate]
                : [],
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
          },
          workspaceId,
          isSystemBuild: false,
          applicationUniversalIdentifier:
            workspaceCustomFlatApplication.universalIdentifier,
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        validateAndBuildResult,
        'Multiple validation errors occurred while creating agent',
      );
    }

    const { flatAgentMaps: recomputedFlatAgentMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatAgentMaps',
      ]);

    const createdAgent = findFlatEntityByIdInFlatEntityMapsOrThrow({
      flatEntityId: flatAgentToCreate.id,
      flatEntityMaps: recomputedFlatAgentMaps,
    });

    return {
      ...createdAgent,
      roleId: flatRoleTargetToCreate?.roleId ?? null,
    };
  }

  async updateOneAgent({
    input,
    workspaceId,
  }: {
    input: UpdateAgentInput;
    workspaceId: string;
  }): Promise<FlatAgentWithRoleId> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        {
          workspaceId,
        },
      );

    const {
      flatRoleTargetByAgentIdMaps,
      flatAgentMaps,
      flatRoleMaps,
      flatApplicationMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatRoleTargetByAgentIdMaps',
      'flatAgentMaps',
      'flatRoleMaps',
      'flatApplicationMaps',
    ]);

    const existingAgent = findFlatEntityByIdInFlatEntityMaps({
      flatEntityId: input.id,
      flatEntityMaps: flatAgentMaps,
    });

    if (
      !isDefined(existingAgent) ||
      this.isRetiredAgent(existingAgent.applicationId, flatApplicationMaps)
    ) {
      throw new AiException(`Agent not found`, AiExceptionCode.AGENT_NOT_FOUND);
    }

    const {
      flatAgentToUpdate,
      flatRoleTargetToCreate,
      flatRoleTargetToDelete,
      flatRoleTargetToUpdate,
    } = fromUpdateAgentInputToFlatAgentToUpdate({
      updateAgentInput: input,
      flatAgentMaps,
      flatRoleTargetByAgentIdMaps,
      flatRoleMaps,
    });

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            agent: {
              flatEntityToCreate: [],
              flatEntityToDelete: [],
              flatEntityToUpdate: [flatAgentToUpdate],
            },
            roleTarget: {
              flatEntityToCreate: isDefined(flatRoleTargetToCreate)
                ? [flatRoleTargetToCreate]
                : [],
              flatEntityToDelete: isDefined(flatRoleTargetToDelete)
                ? [flatRoleTargetToDelete]
                : [],
              flatEntityToUpdate: isDefined(flatRoleTargetToUpdate)
                ? [flatRoleTargetToUpdate]
                : [],
            },
          },
          workspaceId,
          isSystemBuild: false,
          applicationUniversalIdentifier:
            workspaceCustomFlatApplication.universalIdentifier,
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        validateAndBuildResult,
        'Multiple validation errors occurred while updating agent',
      );
    }

    const {
      flatAgentMaps: recomputedFlatAgentMaps,
      flatRoleTargetByAgentIdMaps: recomputedFlatRoleTargetByAgentIdMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatAgentMaps',
      'flatRoleTargetByAgentIdMaps',
    ]);

    const updatedAgent = findFlatEntityByIdInFlatEntityMapsOrThrow({
      flatEntityId: input.id,
      flatEntityMaps: recomputedFlatAgentMaps,
    });

    const existingRoleTarget =
      recomputedFlatRoleTargetByAgentIdMaps[flatAgentToUpdate.id];

    return {
      ...updatedAgent,
      roleId: existingRoleTarget?.roleId ?? null,
    };
  }

  async deleteOneAgent(
    id: string,
    workspaceId: string,
  ): Promise<FlatAgentWithRoleId> {
    const deletedAgents = await this.deleteManyAgents({
      ids: [id],
      workspaceId,
    });

    if (deletedAgents.length !== 1) {
      throw new AiException(
        'Could not retrieve deleted agent',
        AiExceptionCode.AGENT_NOT_FOUND,
      );
    }

    const [deletedAgent] = deletedAgents;

    return deletedAgent;
  }

  async deleteManyAgents({
    ids,
    workspaceId,
    isSystemBuild = false,
  }: {
    ids: string[];
    workspaceId: string;
    isSystemBuild?: boolean;
  }): Promise<FlatAgentWithRoleId[]> {
    if (ids.length === 0) {
      return [];
    }

    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        {
          workspaceId,
        },
      );

    const { flatAgentMaps, flatRoleTargetByAgentIdMaps, flatApplicationMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatAgentMaps',
        'flatRoleTargetByAgentIdMaps',
        'flatApplicationMaps',
      ]);

    const agentsToDelete = ids
      .map((id) =>
        findFlatEntityByIdInFlatEntityMaps({
          flatEntityId: id,
          flatEntityMaps: flatAgentMaps,
        }),
      )
      .filter(isDefined);

    if (
      agentsToDelete.length === 0 ||
      agentsToDelete.some((agent) =>
        this.isRetiredAgent(agent.applicationId, flatApplicationMaps),
      )
    ) {
      return [];
    }

    const roleTargetsToDelete = agentsToDelete
      .map((agent) => flatRoleTargetByAgentIdMaps[agent.id])
      .filter(isDefined);

    const validateAndBuildResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigration(
        {
          allFlatEntityOperationByMetadataName: {
            agent: {
              flatEntityToCreate: [],
              flatEntityToDelete: agentsToDelete,
              flatEntityToUpdate: [],
            },
            roleTarget: {
              flatEntityToCreate: [],
              flatEntityToDelete: roleTargetsToDelete,
              flatEntityToUpdate: [],
            },
          },
          workspaceId,
          isSystemBuild,
          applicationUniversalIdentifier:
            workspaceCustomFlatApplication.universalIdentifier,
        },
      );

    if (validateAndBuildResult.status === 'fail') {
      throw new WorkspaceMigrationBuilderException(
        validateAndBuildResult,
        `Multiple validation errors occurred while deleting agent${ids.length > 1 ? 's' : ''}`,
      );
    }

    return agentsToDelete.map((agent) => ({
      ...agent,
      roleId: flatRoleTargetByAgentIdMaps[agent.id]?.roleId ?? null,
    }));
  }

  async searchAgents(
    query: string,
    workspaceId: string,
    options: { limit: number } = { limit: 2 },
  ): Promise<AgentEntity[]> {
    const queryLower = query.toLowerCase();

    const agents = await this.agentRepository.find(workspaceId, {
      where: [
        { deletedAt: IsNull(), name: ILike(`%${queryLower}%`) },
        {
          deletedAt: IsNull(),
          description: ILike(`%${queryLower}%`),
        },
        { deletedAt: IsNull(), label: ILike(`%${queryLower}%`) },
      ],
      take: options.limit,
      order: { name: 'ASC' },
    });
    const availability = await Promise.all(
      agents.map((agent) => this.isAgentEntityAvailable(agent)),
    );

    return agents.filter((_, index) => availability[index]);
  }

  private isRetiredAgent(
    applicationId: string,
    flatApplicationMaps: FlatApplicationCacheMaps,
  ): boolean {
    const application = flatApplicationMaps.byId[applicationId];

    return (
      isDefined(application) &&
      !isSupportedApplicationUniversalIdentifier(
        application.universalIdentifier,
      )
    );
  }

  private async isAgentEntityAvailable(agent: AgentEntity): Promise<boolean> {
    const application = await this.applicationService.findById(
      agent.applicationId,
    );

    return (
      isDefined(application) &&
      isSupportedApplicationUniversalIdentifier(application.universalIdentifier)
    );
  }

  private assertApplicationIsAvailable(universalIdentifier: string): void {
    if (!isSupportedApplicationUniversalIdentifier(universalIdentifier)) {
      throw new AiException('Agent not found', AiExceptionCode.AGENT_NOT_FOUND);
    }
  }
}
