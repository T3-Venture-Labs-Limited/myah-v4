import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { AgentEntity } from 'src/engine/metadata-modules/ai/ai-agent/entities/agent.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

const CUSTOM_PROVIDER_PREFIX = 'openrouter-custom/';
const LEGACY_PROVIDER_PREFIX = 'openrouter/';
@RegisteredWorkspaceCommand('2.19.0', 1784485121000)
@Command({
  name: 'upgrade:2-19:migrate-openrouter-model-identities',
  description:
    'Migrate persisted custom OpenRouter model references to the openrouter-custom provider namespace.',
})
export class MigrateOpenRouterModelIdentitiesCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would migrate custom OpenRouter model identities for workspace ${workspaceId}`,
      );

      return;
    }

    await this.workspaceRepository.manager.transaction(async (manager) => {
      const workspaceRepository = manager.getRepository(WorkspaceEntity);
      const agentRepository = manager.getRepository(AgentEntity);

      await workspaceRepository.query(
        `UPDATE "core"."workspace"
         SET "fastModel" = CASE WHEN "fastModel" LIKE $2 || '%' THEN $1 || substring("fastModel" FROM length($2) + 1) ELSE "fastModel" END,
             "smartModel" = CASE WHEN "smartModel" LIKE $2 || '%' THEN $1 || substring("smartModel" FROM length($2) + 1) ELSE "smartModel" END,
             "routerModel" = CASE WHEN "routerModel" LIKE $2 || '%' THEN $1 || substring("routerModel" FROM length($2) + 1) ELSE "routerModel" END,
             "enabledAiModelIds" = ARRAY(
               SELECT CASE WHEN model_id LIKE $2 || '%' THEN $1 || substring(model_id FROM length($2) + 1) ELSE model_id END
               FROM unnest("enabledAiModelIds") AS model_id
             )
         WHERE "id" = $3`,
        [CUSTOM_PROVIDER_PREFIX, LEGACY_PROVIDER_PREFIX, workspaceId],
      );

      await agentRepository.query(
        `UPDATE "core"."agent"
         SET "modelId" = $1 || substring("modelId" FROM length($2) + 1)
         WHERE "workspaceId" = $3
           AND "modelId" LIKE $2 || '%'`,
        [CUSTOM_PROVIDER_PREFIX, LEGACY_PROVIDER_PREFIX, workspaceId],
      );
    });
  }
}
