import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { Injectable } from '@nestjs/common';

export type EffectiveAudienceInput = {
  campaignId: string;
  directCreatorIds: readonly string[];
  listMembersByListId: Readonly<Record<string, readonly string[]>>;
};

export type EffectiveCampaignCreator = {
  campaignId: string;
  creatorId: string;
  isDirectlyAdded: boolean;
  sourceListIds: string[];
};

export const buildEffectiveCampaignCreators = ({
  campaignId,
  directCreatorIds,
  listMembersByListId,
}: EffectiveAudienceInput): EffectiveCampaignCreator[] => {
  const directIds = new Set(directCreatorIds);
  const sourceListIdsByCreator = new Map<string, Set<string>>();

  for (const [listId, creatorIds] of Object.entries(listMembersByListId)) {
    for (const creatorId of creatorIds) {
      const sourceListIds = sourceListIdsByCreator.get(creatorId) ?? new Set();
      sourceListIds.add(listId);
      sourceListIdsByCreator.set(creatorId, sourceListIds);
    }
  }

  for (const creatorId of directIds) {
    if (!sourceListIdsByCreator.has(creatorId)) {
      sourceListIdsByCreator.set(creatorId, new Set());
    }
  }

  return [...sourceListIdsByCreator.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([creatorId, sourceListIds]) => ({
      campaignId,
      creatorId,
      isDirectlyAdded: directIds.has(creatorId),
      sourceListIds: [...sourceListIds].sort(),
    }));
};

type ExistingCampaignCreator = Pick<
  EffectiveCampaignCreator,
  'campaignId' | 'creatorId'
>;

export type CampaignListSyncInput = {
  attachedListIds: readonly string[];
  existingCreators: readonly ExistingCampaignCreator[];
  listMembersByListId: Readonly<Record<string, readonly string[]>>;
};

export const getCampaignListSyncChanges = ({
  attachedListIds,
  existingCreators,
  listMembersByListId,
}: CampaignListSyncInput): { additions: string[]; preserved: string[] } => {
  const existingCreatorIds = new Set(
    existingCreators.map(({ creatorId }) => creatorId),
  );
  const sourceCreatorIds = new Set(
    attachedListIds.flatMap((listId) => listMembersByListId[listId] ?? []),
  );

  return {
    additions: [...sourceCreatorIds]
      .filter((creatorId) => !existingCreatorIds.has(creatorId))
      .sort(),
    preserved: [...sourceCreatorIds]
      .filter((creatorId) => existingCreatorIds.has(creatorId))
      .sort(),
  };
};


export type SourceRemovalImpact = {
  affectedCreatorIds: string[];
  requiresConfirmation: boolean;
};

export const getSourceRemovalImpact = ({
  removedListId,
  directCreatorIds,
  listMembersByListId,
}: {
  removedListId: string;
  directCreatorIds: readonly string[];
  listMembersByListId: Readonly<Record<string, readonly string[]>>;
}): SourceRemovalImpact => {
  const directIds = new Set(directCreatorIds);
  const removedCreatorIds = new Set(listMembersByListId[removedListId] ?? []);
  const affectedCreatorIds = [...removedCreatorIds]
    .filter((creatorId) => {
      if (directIds.has(creatorId)) {
        return false;
      }

      return !Object.entries(listMembersByListId).some(
        ([listId, creatorIds]) =>
          listId !== removedListId && creatorIds.includes(creatorId),
      );
    })
    .sort();

  return {
    affectedCreatorIds,
    requiresConfirmation: affectedCreatorIds.length > 0,
  };
};

@Injectable()
export class CampaignInfluencerService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  buildEffectiveCampaignCreators(input: EffectiveAudienceInput) {
    return buildEffectiveCampaignCreators(input);
  }

  getCampaignListSyncChanges(input: CampaignListSyncInput) {
    return getCampaignListSyncChanges(input);
  }

  getSourceRemovalImpact(
    input: Parameters<typeof getSourceRemovalImpact>[0],
  ) {
    return getSourceRemovalImpact(input);
  }

  private async executeTransaction<T>(
    authContext: WorkspaceAuthContext,
    callback: (transactionManager: unknown) => Promise<T>,
  ): Promise<T> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        return dataSource.transaction(callback);
      },
      authContext,
    );
  }

  async snapshot(campaignId: string, authContext: WorkspaceAuthContext) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const permissionOptions = resolveRolePermissionConfig({
          authContext,
          workspaceContext,
        });
        const [campaignCreators, campaignCreatorLists] = await Promise.all([
          this.globalWorkspaceOrmManager.getRepository(
            'campaignCreator',
            permissionOptions,
          ),
          this.globalWorkspaceOrmManager.getRepository(
            'campaignCreatorList',
            permissionOptions,
          ),
        ]);
        return {
          campaignCreators: await campaignCreators.find({
            where: { campaignId },
          }),
          campaignCreatorLists: await campaignCreatorLists.find({
            where: { campaignId },
          }),
        };
      },
      authContext,
    );
  }

  async attachCreatorLists(
    input: { campaignId: string; creatorListIds: readonly string[] },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (transactionManager) => {
      const workspaceContext = getWorkspaceContext();
      const permissionOptions = resolveRolePermissionConfig({
        authContext,
        workspaceContext,
      });
      const repository = await this.globalWorkspaceOrmManager.getRepository(
        'campaignCreatorList',
        permissionOptions,
      );
      const existing = await repository.find({
        where: { campaignId: input.campaignId },
      });
      const existingIds = new Set(existing.map((record) => record.creatorListId));
      const records = [...new Set(input.creatorListIds)]
        .filter((creatorListId) => !existingIds.has(creatorListId))
        .map((creatorListId) => ({
          campaignId: input.campaignId,
          creatorListId,
        }));
      if (records.length > 0) {
        await repository.save(records, transactionManager as never);
      }
      return this.snapshot(input.campaignId, authContext);
    });
  }

  async addDirectCreators(
    input: { campaignId: string; creatorIds: readonly string[] },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (transactionManager) => {
      const workspaceContext = getWorkspaceContext();
      const permissionOptions = resolveRolePermissionConfig({
        authContext,
        workspaceContext,
      });
      const repository = await this.globalWorkspaceOrmManager.getRepository(
        'campaignCreator',
        permissionOptions,
      );
      const existing = await repository.find({
        where: { campaignId: input.campaignId },
      });
      const existingByCreator = new Map(
        existing.map((record) => [record.creatorId, record]),
      );
      const records = [...new Set(input.creatorIds)].flatMap((creatorId) => {
        const current = existingByCreator.get(creatorId);
        if (current) {
          return current.isDirectlyAdded
            ? []
            : [{ ...current, isDirectlyAdded: true }];
        }
        return [
          { campaignId: input.campaignId, creatorId, isDirectlyAdded: true },
        ];
      });
      if (records.length > 0) {
        await repository.save(records, transactionManager as never);
      }
      return this.snapshot(input.campaignId, authContext);
    });
  }

  async syncCreatorListMembership(
    input: {
      creatorListId: string;
      creatorId: string;
      removed?: boolean;
    },
    authContext: WorkspaceAuthContext,
  ): Promise<void> {
    await this.executeTransaction(authContext, async (transactionManager) => {
      const workspaceContext = getWorkspaceContext();
      const permissionOptions = resolveRolePermissionConfig({
        authContext,
        workspaceContext,
      });
      const campaignLists = await this.globalWorkspaceOrmManager.getRepository(
        'campaignCreatorList',
        permissionOptions,
      );
      const campaignCreators = await this.globalWorkspaceOrmManager.getRepository(
        'campaignCreator',
        permissionOptions,
      );
      const attached = await campaignLists.find({
        where: { creatorListId: input.creatorListId },
      });
      for (const attachment of attached) {
        const existing = await campaignCreators.findOne({
          where: {
            campaignId: attachment.campaignId,
            creatorId: input.creatorId,
          },
        });
        if (input.removed) {
          const otherAttachments = await campaignLists.find({
            where: { campaignId: attachment.campaignId },
          });
          const otherListIds = otherAttachments
            .map((record) => record.creatorListId)
            .filter((id) => id !== input.creatorListId);
          let hasOtherListSource = false;
          if (otherListIds.length > 0) {
            const memberships = await this.globalWorkspaceOrmManager.getRepository(
              'creatorListMember',
              permissionOptions,
            );
            const otherMembers = await memberships.find({
              where: { creatorId: input.creatorId },
            });
            hasOtherListSource = otherMembers.some((member) =>
              otherListIds.includes(member.creatorListId),
            );
          }
          if (
            existing &&
            existing.isDirectlyAdded !== true &&
            !hasOtherListSource
          ) {
            await campaignCreators.delete(
              { campaignId: attachment.campaignId, creatorId: input.creatorId },
              transactionManager as never,
            );
          }
        } else if (!existing) {
          await campaignCreators.save(
            {
              campaignId: attachment.campaignId,
              creatorId: input.creatorId,
              isDirectlyAdded: false,
            },
            transactionManager as never,
          );
        }
      }
    });
  }

  async campaignCreatorListRemovalImpact(
    input: { campaignId: string; creatorListId: string },
    authContext: WorkspaceAuthContext,
  ) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const permissionOptions = resolveRolePermissionConfig({
          authContext,
          workspaceContext,
        });
        const [campaignCreators, memberships] = await Promise.all([
          this.globalWorkspaceOrmManager.getRepository(
            'campaignCreator',
            permissionOptions,
          ),
          this.globalWorkspaceOrmManager.getRepository(
            'creatorListMember',
            permissionOptions,
          ),
        ]);
        const [creatorRows, memberRows] = await Promise.all([
          campaignCreators.find({ where: { campaignId: input.campaignId } }),
          memberships.find({ where: { creatorListId: input.creatorListId } }),
        ]);
        return getSourceRemovalImpact({
          removedListId: input.creatorListId,
          directCreatorIds: creatorRows
            .filter((record) => record.isDirectlyAdded)
            .map((record) => record.creatorId),
          listMembersByListId: {
            [input.creatorListId]: memberRows.map((record) => record.creatorId),
          },
        });
      },
      authContext,
    );
  }

  async detachCreatorList(
    input: {
      campaignId: string;
      creatorListId: string;
      confirmedCreatorIds: readonly string[];
    },
    authContext: WorkspaceAuthContext,
  ) {
    const impact = await this.campaignCreatorListRemovalImpact(
      input,
      authContext,
    );
    const impacted = new Set(impact.affectedCreatorIds);
    const confirmed = new Set(input.confirmedCreatorIds);
    if (
      impact.requiresConfirmation &&
      (confirmed.size !== impacted.size ||
        [...impacted].some((creatorId) => !confirmed.has(creatorId)))
    ) {
      throw new Error('Exact final-source Creator confirmation is required');
    }

    return this.executeTransaction(authContext, async (transactionManager) => {
      const workspaceContext = getWorkspaceContext();
      const permissionOptions = resolveRolePermissionConfig({
        authContext,
        workspaceContext,
      });
      const repository = await this.globalWorkspaceOrmManager.getRepository(
        'campaignCreatorList',
        permissionOptions,
      );
      await repository.delete(
        {
          campaignId: input.campaignId,
          creatorListId: input.creatorListId,
        },
        transactionManager as never,
      );
      return this.snapshot(input.campaignId, authContext);
    });
  }
}
