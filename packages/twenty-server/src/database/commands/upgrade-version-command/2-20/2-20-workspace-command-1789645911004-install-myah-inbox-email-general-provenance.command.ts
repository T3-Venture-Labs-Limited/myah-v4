import { InjectDataSource } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

@RegisteredWorkspaceCommand('2.20.0', 1789645911004)
@Command({
  name: 'upgrade:2-20:install-myah-inbox-email-general-provenance',
  description: 'Install insert-only Email General provenance in compatibility Release A without backfilling history',
})
export class InstallMyahInboxEmailGeneralProvenanceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.options.dryRun) return;
    if (!isValidUuid(args.workspaceId)) throw new Error('Invalid workspace ID');
    const schema = getWorkspaceSchemaName(args.workspaceId);
    // PostgreSQL DDL cannot parameterize identifiers or trigger arguments;
    // both interpolated values are derived from the validated workspace UUID.
    await this.dataSource.transaction(async (manager) => {
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await manager.query(`DROP TRIGGER IF EXISTS "TRG_MYAH_EMAIL_GENERAL_PROVENANCE" ON "${schema}"."messageThread"`);
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await manager.query(`CREATE TRIGGER "TRG_MYAH_EMAIL_GENERAL_PROVENANCE"
        AFTER INSERT OR UPDATE OR DELETE ON "${schema}"."messageThread"
        FOR EACH ROW EXECUTE FUNCTION core."recordMyahInboxEmailGeneralProvenance"('${args.workspaceId}')`);
    });
  }
}
