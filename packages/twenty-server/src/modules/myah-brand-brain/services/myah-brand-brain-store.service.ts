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
      listPagesByBrandSlug: async ({ brandSlug }) =>
        this.withRepository<
          BrandBrainExecutorPageRecord,
          BrandBrainExecutorPageRecord[]
        >(context, 'brandBrainPage', (repository) =>
          repository.find({
            where: { canonicalPath: ILike(`${brandSlug}%`) },
            order: { canonicalPath: 'ASC' },
          }),
        ),
      createPage: async (input) =>
        this.withRepository<
          BrandBrainExecutorPageRecord,
          BrandBrainExecutorPageRecord
        >(context, 'brandBrainPage', (repository) =>
          repository.save(repository.create(input)),
        ),
      updatePage: async ({ id, patch }) =>
        this.withRepository<
          BrandBrainExecutorPageRecord,
          BrandBrainExecutorPageRecord
        >(context, 'brandBrainPage', (repository) =>
          repository.save({ id, ...this.stripUndefined(patch) }),
        ),
      listLinksByBrandSlug: async ({ brandSlug }) => {
        const pages = await this.withRepository<
          BrandBrainExecutorPageRecord,
          BrandBrainExecutorPageRecord[]
        >(context, 'brandBrainPage', (repository) =>
          repository.find({
            where: { canonicalPath: ILike(`${brandSlug}%`) },
          }),
        );
        const pageIds = pages.map(({ id }) => id);

        if (pageIds.length === 0) {
          return [];
        }

        return this.withRepository<
          BrandBrainExecutorLinkRecord,
          BrandBrainExecutorLinkRecord[]
        >(context, 'brandBrainLink', (repository) =>
          repository.find({
            where: { sourcePageId: In(pageIds), targetPageId: In(pageIds) },
          }),
        );
      },
      createLink: async (input) =>
        this.withRepository<
          BrandBrainExecutorLinkRecord,
          BrandBrainExecutorLinkRecord
        >(context, 'brandBrainLink', (repository) =>
          repository.save(repository.create(input)),
        ),
      updateLink: async ({ id, patch }) =>
        this.withRepository<
          BrandBrainExecutorLinkRecord,
          BrandBrainExecutorLinkRecord
        >(context, 'brandBrainLink', (repository) =>
          repository.save({ id, ...this.stripUndefined(patch) }),
        ),
    };
  }

  private async withRepository<T extends { id: string }, TResult>(
    context: BrandBrainStoreContext,
    objectMetadataName: 'brandBrainPage' | 'brandBrainLink',
    callback: (
      repository: BrandBrainRepository<T>,
    ) => Promise<TResult> | TResult,
  ): Promise<TResult> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repository =
          (await this.globalWorkspaceOrmManager.getRepository<T>(
            context.workspaceId,
            objectMetadataName,
            context.rolePermissionConfig,
          )) as unknown as BrandBrainRepository<T>;

        return callback(repository);
      },
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
