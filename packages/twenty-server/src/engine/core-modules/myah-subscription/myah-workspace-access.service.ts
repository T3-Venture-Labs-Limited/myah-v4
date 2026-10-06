import { Injectable } from '@nestjs/common';
import { type DeepPartial } from 'typeorm';

import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';

export enum MyahWorkspaceAccess {
  COMPLIMENTARY = 'COMPLIMENTARY',
  ACTIVE = 'ACTIVE',
  PAYMENT_RETRYING = 'PAYMENT_RETRYING',
  NEEDS_SUBSCRIPTION = 'NEEDS_SUBSCRIPTION',
  LAPSED = 'LAPSED',
}

@Injectable()
export class MyahWorkspaceAccessService {
  constructor(
    @InjectWorkspaceScopedRepository(MyahWorkspaceSubscriptionEntity)
    private readonly subscriptions: WorkspaceScopedRepository<MyahWorkspaceSubscriptionEntity>,
    private readonly config: TwentyConfigService,
    @InjectCacheStorage(CacheStorageNamespace.ModuleMyahSubscription)
    private readonly cache: CacheStorageService,
  ) {}

  async getAccess(workspaceId: string): Promise<MyahWorkspaceAccess> {
    // Config is checked before cache so enabling the paywall cannot reuse a dark-mode grant.
    if (
      !this.config.get('MYAH_SUBSCRIPTION_REQUIRED') ||
      this.config.get('MYAH_COMPLIMENTARY_WORKSPACE_IDS').includes(workspaceId)
    ) {
      return MyahWorkspaceAccess.COMPLIMENTARY;
    }

    // Read the generation before the row: a request that read an old row before
    // a sync can only cache under the old generation, which is never read again.
    const generation =
      (await this.cache.get<number>(this.generationKey(workspaceId))) ?? 0;
    const key = `myah-access:${workspaceId}:${generation}`;
    const cached = await this.cache.get<MyahWorkspaceAccess>(key);

    if (cached) return cached;

    const subscription = await this.getSubscription(workspaceId);
    const state =
      subscription?.stripeStatus === 'active' ||
      subscription?.stripeStatus === 'trialing'
        ? MyahWorkspaceAccess.ACTIVE
        : subscription?.stripeStatus === 'past_due'
          ? MyahWorkspaceAccess.PAYMENT_RETRYING
          : subscription?.hadPaidSubscription
            ? MyahWorkspaceAccess.LAPSED
            : MyahWorkspaceAccess.NEEDS_SUBSCRIPTION;

    await this.cache.set(key, state, 5 * 60 * 1000);

    return state;
  }

  getSubscription(workspaceId: string) {
    return this.subscriptions.findOneBy(workspaceId, {});
  }

  async saveSubscription(
    workspaceId: string,
    values: Omit<
      DeepPartial<MyahWorkspaceSubscriptionEntity>,
      'workspaceId' | 'workspace'
    >,
  ) {
    const subscription = await this.subscriptions.save(workspaceId, values);

    await this.invalidate(workspaceId);

    return subscription;
  }

  async invalidate(workspaceId: string) {
    await this.cache.incrBy(this.generationKey(workspaceId), 1);
  }

  private generationKey(workspaceId: string) {
    return `myah-access-generation:${workspaceId}`;
  }
}
