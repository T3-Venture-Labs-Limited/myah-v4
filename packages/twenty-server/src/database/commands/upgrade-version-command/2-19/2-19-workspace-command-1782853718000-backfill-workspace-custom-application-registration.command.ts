import { InjectRepository } from '@nestjs/typeorm';

import { Command } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { type QueryRunner, Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';

@RegisteredWorkspaceCommand('2.19.0', 1782853718000)
@Command({
  name: 'upgrade:2-19:backfill-workspace-custom-application-registration',
  description:
    'Create a workspace-scoped application registration for each existing workspace Custom application so custom object/field labels become translatable.',
})
export class BackfillWorkspaceCustomApplicationRegistrationCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepository: Repository<ApplicationEntity>,
    private readonly applicationService: ApplicationService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    await this.backfill(args);
  }

  override async runOnWorkspaceInUpgradeTransaction(
    args: RunOnWorkspaceArgs,
    queryRunner: QueryRunner,
    afterCommit: UpgradeWorkspaceTransaction['afterCommit'],
  ): Promise<void> {
    await this.backfill(args, { queryRunner, afterCommit });
  }

  private async backfill(
    { workspaceId, options }: RunOnWorkspaceArgs,
    upgradeTransaction?: UpgradeWorkspaceTransaction,
  ): Promise<void> {
    const workspaceRepository = upgradeTransaction
      ? upgradeTransaction.queryRunner.manager.getRepository(WorkspaceEntity)
      : this.workspaceRepository;
    const applicationRepository = upgradeTransaction
      ? upgradeTransaction.queryRunner.manager.getRepository(ApplicationEntity)
      : this.applicationRepository;
    // Suspended workspaces are soft-deleted, so the row needs withDeleted.
    const workspace = await workspaceRepository.findOne({
      select: ['id', 'workspaceCustomApplicationId'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (!isDefined(workspace)) {
      this.logger.log(`Workspace ${workspaceId} not found, skipping`);

      return;
    }

    const customApplication = await applicationRepository.findOne({
      select: ['id', 'universalIdentifier', 'applicationRegistrationId'],
      where: {
        id: workspace.workspaceCustomApplicationId,
        workspaceId,
      },
    });

    if (!isDefined(customApplication)) {
      this.logger.log(
        `No custom application for workspace ${workspaceId}, skipping`,
      );

      return;
    }

    if (isDefined(customApplication.applicationRegistrationId)) {
      this.logger.log(
        `Custom application for workspace ${workspaceId} already has a registration, skipping`,
      );

      return;
    }

    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would create an application registration for workspace ${workspaceId} custom application`,
      );

      return;
    }

    const registration =
      await this.applicationService.createWorkspaceCustomApplicationRegistration(
        {
          workspaceId,
          universalIdentifier: customApplication.universalIdentifier,
        },
        ...(upgradeTransaction ? [upgradeTransaction.queryRunner] : []),
      );

    await this.applicationService.update(customApplication.id, {
      applicationRegistrationId: registration.id,
      workspaceId,
    }, ...(upgradeTransaction ? [upgradeTransaction] : []));

    this.logger.log(
      `Created application registration ${registration.id} for workspace ${workspaceId} custom application`,
    );
  }
}
