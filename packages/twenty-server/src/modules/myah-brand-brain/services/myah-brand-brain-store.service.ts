import { Injectable } from '@nestjs/common';

import { ILike, In } from 'typeorm';

import type { RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  type BrandBrainExecutorLinkRecord,
  type BrandBrainExecutorPageRecord,
  type BrandBrainExecutorStore,
} from 'src/modules/myah-brand-brain/utils/brand-brain-agent-executor.util';

type BrandBrainRepository<T> = {
  find: (options?: object) => Promise<T[]>;
  create: (input: object) => T;
  save: (record: T | object) => Promise<T>;
};

type BrandBrainStoreContext = {
  workspaceId: string;
  rolePermissionConfig: RolePermissionConfig;
};

@Injectable()
export class MyahBrandBrainStoreService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  createStore(context: BrandBrainStoreContext): BrandBrainExecutorStore {
    return {
      listPagesByBrandSlug: async ({ brandSlug }) => {
        const repository =
          await this.getRepository<BrandBrainExecutorPageRecord>(
            context,
            'brandBrainPage',
          );

        return repository.find({
          where: { canonicalPath: ILike(`${brandSlug}%`) },
          order: { canonicalPath: 'ASC' },
        });
      },
      createPage: async (input) => {
        const repository =
          await this.getRepository<BrandBrainExecutorPageRecord>(
            context,
            'brandBrainPage',
          );

        return repository.save(repository.create(input));
      },
      updatePage: async ({ id, patch }) => {
        const repository =
          await this.getRepository<BrandBrainExecutorPageRecord>(
            context,
            'brandBrainPage',
          );

        return repository.save({ id, ...this.stripUndefined(patch) });
      },
      listLinksByBrandSlug: async ({ brandSlug }) => {
        const pageRepository =
          await this.getRepository<BrandBrainExecutorPageRecord>(
            context,
            'brandBrainPage',
          );
        const pages = await pageRepository.find({
          where: { canonicalPath: ILike(`${brandSlug}%`) },
        });
        const pageIds = pages.map(({ id }) => id);

        if (pageIds.length === 0) {
          return [];
        }

        const repository =
          await this.getRepository<BrandBrainExecutorLinkRecord>(
            context,
            'brandBrainLink',
          );

        return repository.find({
          where: { sourcePageId: In(pageIds), targetPageId: In(pageIds) },
        });
      },
      createLink: async (input) => {
        const repository =
          await this.getRepository<BrandBrainExecutorLinkRecord>(
            context,
            'brandBrainLink',
          );

        return repository.save(repository.create(input));
      },
      updateLink: async ({ id, patch }) => {
        const repository =
          await this.getRepository<BrandBrainExecutorLinkRecord>(
            context,
            'brandBrainLink',
          );

        return repository.save({ id, ...this.stripUndefined(patch) });
      },
    };
  }

  private async getRepository<T extends { id: string }>(
    context: BrandBrainStoreContext,
    objectMetadataName: 'brandBrainPage' | 'brandBrainLink',
  ): Promise<BrandBrainRepository<T>> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.globalWorkspaceOrmManager.getRepository<T>(
          context.workspaceId,
          objectMetadataName,
          context.rolePermissionConfig,
        ),
      buildSystemAuthContext(context.workspaceId),
    );
  }

  private stripUndefined<T extends object>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entryValue]) => entryValue !== undefined,
      ),
    ) as T;
  }
}
