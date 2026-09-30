import { InjectDataSource } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { MyahInboxContactTriageSchemaService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-schema.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

@RegisteredWorkspaceCommand('2.20.0', 1790742251001)
@Command({
  name: 'upgrade:2-20:install-instagram-reaction',
  description: 'Install private Instagram reaction state in existing workspaces',
})
export class InstallInstagramReactionWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schemaService: MyahInboxContactTriageSchemaService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (options.dryRun) return;
    if (!isValidUuid(workspaceId)) throw new Error('Invalid workspace ID');
    const schema = getWorkspaceSchemaName(workspaceId);
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      if (!(await queryRunner.hasSchema(schema))) return;
      if (!(await queryRunner.hasTable(`${schema}.myahSocialMessage`))) return;
      await queryRunner.startTransaction();
      await this.schemaService.ensureReactionTable(queryRunner, workspaceId);
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
