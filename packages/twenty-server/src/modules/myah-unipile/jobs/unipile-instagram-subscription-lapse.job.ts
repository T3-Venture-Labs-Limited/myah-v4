import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { lockMyahSubscription } from 'src/engine/core-modules/myah-subscription/utils/lock-myah-subscription.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class UnipileInstagramSubscriptionLapseJob {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: TwentyConfigService,
    private readonly accounts: UnipileInstagramAccountService,
  ) {}

  @Process(UnipileInstagramSubscriptionLapseJob.name)
  async handle({ workspaceId }: { workspaceId: string }): Promise<void> {
    if (
      !this.config.get('MYAH_SUBSCRIPTION_REQUIRED') ||
      this.config.get('MYAH_COMPLIMENTARY_WORKSPACE_IDS').includes(workspaceId)
    )
      return;

    const error = await this.dataSource.transaction(
      async (manager): Promise<unknown> => {
        // Same lock as Stripe sync: a stale job cannot delete an account after a
        // resubscription has restored access. It is an advisory lock, so the
        // workspace row stays writable during the Unipile call. Disconnect keeps
        // its separate session lock and durable unknown-outcome recovery marker.
        await lockMyahSubscription(manager, workspaceId);
        const workspace = await manager.getRepository(WorkspaceEntity).findOne({
          where: { id: workspaceId },
          withDeleted: true,
        });
        if (!workspace) return null;
        const subscriptions = manager.getRepository(
          MyahWorkspaceSubscriptionEntity,
        );
        const subscription = await subscriptions.findOneBy({ workspaceId });
        if (
          !subscription?.hadPaidSubscription ||
          ['active', 'trialing', 'past_due'].includes(
            subscription.stripeStatus ?? '',
          )
        )
          return null;
        const binding = await manager
          .getRepository(UnipileInstagramAccountBindingEntity)
          .findOne({
            where: {
              workspaceId,
              deactivatedAt: IsNull(),
              status: Not(UnipileInstagramAccountBindingStatus.INACTIVE),
            },
          });
        if (!binding) return null;

        let failure: unknown = null;
        try {
          await this.accounts.disconnectWorkspaceAccount(workspaceId);
        } catch (error) {
          failure = error;
        }
        // Preserve the reconnect prompt even if deletion needs recovery. Commit
        // this before retrying, without replaying an unknown provider DELETE.
        await subscriptions.update(
          { workspaceId },
          {
            instagramDisconnectedForLapseAt:
              subscription.instagramDisconnectedForLapseAt ?? new Date(),
          },
        );
        return failure;
      },
    );
    if (error) throw error;
  }
}
