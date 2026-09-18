import { Injectable } from '@nestjs/common';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { MyahInboxContactTriageReceiptService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-receipt.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

export let afterMyahInboxContactTriageFinalMarkerLockedForTest:
  | ((workspaceId: string) => Promise<void>)
  | undefined;

export const setAfterMyahInboxContactTriageFinalMarkerLockedForTest = (
  hook: typeof afterMyahInboxContactTriageFinalMarkerLockedForTest,
): void => {
  afterMyahInboxContactTriageFinalMarkerLockedForTest = hook;
};

@RegisteredWorkspaceCommand('2.20.0', 1789633748002)
@Injectable()
export class CatchUpMyahInboxContactTriageWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly receiptService: MyahInboxContactTriageReceiptService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    // A workspace without a provisioned data source cannot be caught up; every
    // sibling workspace command skips it, and throwing here would abort the
    // whole upgrade sequence for the remaining workspaces.
    if (!args.dataSource) {
      this.logger.log(
        `contact-triage catch-up skipped workspace=${args.workspaceId} reason=no-data-source`,
      );

      return;
    }
    if (args.options.dryRun) return;

    this.logger.log(
      `contact-triage catch-up start workspace=${args.workspaceId}`,
    );
    for (;;) {
      const fence = await this.advanceFence(args);
      if (fence === null) return;
      this.logger.log(
        `contact-triage catch-up fence workspace=${args.workspaceId} sequence=${fence}`,
      );

      let drained = 0;
      for (;;) {
        const count = await this.receiptService.drain({
          workspaceId: args.workspaceId,
          throughSequence: fence,
          purpose: 'CATCH_UP',
        });
        drained += count;
        if (count === 0) break;
      }
      this.logger.log(
        `contact-triage catch-up pending workspace=${args.workspaceId} drained=${drained}`,
      );

      if (await this.completeIfStable(args, fence)) {
        this.logger.log(
          `contact-triage catch-up READY workspace=${args.workspaceId} fence=${fence}`,
        );
        return;
      }
    }
  }

  private async advanceFence(
    args: RunOnWorkspaceArgs,
  ): Promise<string | null> {
    const runner = args.dataSource!.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('SERIALIZABLE');
    try {
      await runner.query("SELECT set_config('search_path', $1, true)", [
        getWorkspaceSchemaName(args.workspaceId),
      ]);
      const [marker] = (await runner.query(
        `SELECT status, "baselineStartedAt" FROM "myahInboxTriageMigration"
         WHERE id=true FOR UPDATE`,
      )) as Array<{ status: string; baselineStartedAt: string | null }>;
      if (!marker?.baselineStartedAt) {
        throw new Error(
          'Contact triage catch-up requires an initialized baseline',
        );
      }
      this.logger.log(
        `contact-triage catch-up status workspace=${args.workspaceId} status=${marker.status}`,
      );
      if (marker.status === 'READY') {
        await runner.commitTransaction();
        return null;
      }
      const [maximum] = (await runner.query(
        `SELECT COALESCE(max(sequence), 0)::text AS sequence
         FROM "myahInboxTriageTransitionReceipt"`,
      )) as Array<{ sequence: string }>;
      const fence = maximum.sequence;
      await runner.query(
        `UPDATE "myahInboxTriageMigration"
         SET "baselineFenceSequence"=$1::bigint,
             version=version+1, "updatedAt"=now() WHERE id=true`,
        [fence],
      );
      await runner.commitTransaction();
      return fence;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  private async completeIfStable(
    args: RunOnWorkspaceArgs,
    fence: string,
  ): Promise<boolean> {
    const runner = args.dataSource!.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('SERIALIZABLE');
    try {
      await runner.query("SELECT set_config('search_path', $1, true)", [
        getWorkspaceSchemaName(args.workspaceId),
      ]);
      await runner.query(
        'SELECT id FROM "myahInboxTriageMigration" WHERE id=true FOR UPDATE',
      );
      await afterMyahInboxContactTriageFinalMarkerLockedForTest?.(
        args.workspaceId,
      );
      const [maximum] = (await runner.query(
        `SELECT COALESCE(max(sequence), 0)::text AS sequence
         FROM "myahInboxTriageTransitionReceipt"`,
      )) as Array<{ sequence: string }>;
      const [pending] = (await runner.query(
        `SELECT count(*)::text AS count FROM "myahInboxTriageTransitionReceipt"
         WHERE status='PENDING' AND sequence <= $1::bigint`,
        [fence],
      )) as Array<{ count: string }>;
      if (maximum.sequence !== fence || pending.count !== '0') {
        await runner.commitTransaction();
        return false;
      }
      await runner.query(
        `UPDATE "myahInboxTriageMigration"
         SET status='READY', version=version+1, "updatedAt"=now()
         WHERE id=true AND "baselineFenceSequence"=$1::bigint`,
        [fence],
      );
      await runner.commitTransaction();
      return true;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
