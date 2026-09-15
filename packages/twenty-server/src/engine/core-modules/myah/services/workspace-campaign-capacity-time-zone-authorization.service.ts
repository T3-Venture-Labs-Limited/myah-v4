import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { WorkspaceCampaignCapacityTimeZoneAuthorizationPort } from 'src/engine/core-modules/myah/types/workspace-campaign-capacity-time-zone.type';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';

@Injectable()
export class WorkspaceCampaignCapacityTimeZoneAuthorizationService extends WorkspaceCampaignCapacityTimeZoneAuthorizationPort {
  async assertReadAllowedInTransaction(
    input: Readonly<{ workspaceId: string }>,
    manager: EntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner;

    if (
      !runner ||
      !runner.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager ||
      getWorkspaceContext().authContext.workspace.id !== input.workspaceId
    ) {
      throw new Error('Workspace capacity timezone scope is unavailable');
    }
  }

  async assertMutationAllowedInTransaction(
    _input: Readonly<{
      workspaceId: string;
      campaignCapacityTimeZone: string | null;
    }>,
    _manager: EntityManager,
  ): Promise<void> {
    // W15 deliberately has no timezone mutation surface. Reject before SQL,
    // including no-op values and system actors.
    throw new Error(
      'Workspace campaign capacity timezone mutation is unsupported',
    );
  }
}
