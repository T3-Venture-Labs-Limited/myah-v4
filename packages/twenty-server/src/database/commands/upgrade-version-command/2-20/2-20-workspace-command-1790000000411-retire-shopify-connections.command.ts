import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { IsNull, type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

export const RETIRED_SHOPIFY_CONNECTED_ACCOUNT_NAME = 'Shopify';

@RegisteredWorkspaceCommand('2.20.0', 1790000000411)
@Command({
  name: 'upgrade:2-20:retire-shopify-connections',
  description:
    'Archive Shopify connections while preserving encrypted recovery data',
})
export class RetireShopifyConnectionsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    options,
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    const where = {
      archivedAt: IsNull(),
      name: RETIRED_SHOPIFY_CONNECTED_ACCOUNT_NAME,
      provider: ConnectedAccountProvider.APP,
      workspaceId,
    };
    const count = await this.connectedAccountRepository.countBy(where);

    this.logger.log(`${count} active Shopify connection(s) found`, workspaceId);

    if (!options.dryRun && count > 0) {
      await this.connectedAccountRepository.update(where, {
        archivedAt: new Date(),
      });
    }
  }
}
