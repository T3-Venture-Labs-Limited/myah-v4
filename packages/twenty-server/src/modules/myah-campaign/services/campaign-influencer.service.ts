import { isUUID } from 'class-validator';
import { Injectable } from '@nestjs/common';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

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
      const sourceListIds =
        sourceListIdsByCreator.get(creatorId) ?? new Set<string>();
      sourceListIds.add(listId);
      sourceListIdsByCreator.set(creatorId, sourceListIds);
    }
  }
  for (const creatorId of directIds)
    if (!sourceListIdsByCreator.has(creatorId))
      sourceListIdsByCreator.set(creatorId, new Set());
  return [...sourceListIdsByCreator.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([creatorId, sourceListIds]) => ({
      campaignId,
      creatorId,
      isDirectlyAdded: directIds.has(creatorId),
      sourceListIds: [...sourceListIds].sort(),
    }));
};

export type CampaignListSyncInput = {
  attachedListIds: readonly string[];
  existingCreators: readonly Pick<
    EffectiveCampaignCreator,
    'campaignId' | 'creatorId'
  >[];
  listMembersByListId: Readonly<Record<string, readonly string[]>>;
};
export const getCampaignListSyncChanges = ({
  attachedListIds,
  existingCreators,
  listMembersByListId,
}: CampaignListSyncInput) => {
  const existing = new Set(existingCreators.map(({ creatorId }) => creatorId));
  const sources = new Set(
    attachedListIds.flatMap((id) => listMembersByListId[id] ?? []),
  );
  return {
    additions: [...sources].filter((id) => !existing.has(id)).sort(),
    preserved: [...sources].filter((id) => existing.has(id)).sort(),
  };
};

type RecordRow = {
  id: string;
  campaignId: string;
  creatorId?: string;
  creatorListId?: string;
  isDirectlyAdded?: boolean;
  assignedManagedMailboxId?: string | null;
  deletedAt?: unknown;
};
type CampaignCreatorRow = RecordRow & {
  creatorId: string;
  isDirectlyAdded: boolean;
};
type CampaignCreatorListRow = RecordRow & {
  creatorListId: string;
};

type CampaignCreatorListSourceRow = RecordRow & {
  campaignCreatorId: string;
  creatorListId: string;
};
type PermissionOptions = RolePermissionConfig;
type AddDirectCampaignCreatorsServiceInput = {
  campaignId: string;
  creatorIds: readonly string[];
  assignedManagedMailboxId?: string | null;
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

  private permissionOptions(
    authContext: WorkspaceAuthContext,
  ): PermissionOptions {
    const context = getWorkspaceContext();
    const options = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: context.userWorkspaceRoleMap,
      apiKeyRoleMap: context.apiKeyRoleMap,
    });
    if (!options) throw new Error('Role could not be resolved');
    return options;
  }

  private async repository<T extends RecordRow>(
    authContext: WorkspaceAuthContext,
    name: string,
    options: PermissionOptions,
  ) {
    return this.globalWorkspaceOrmManager.getRepository<T>(
      authContext.workspace.id,
      name,
      options,
    );
  }
  private intentPermissionOptions(): PermissionOptions {
    return { shouldBypassPermissionChecks: true };
  }

  private async restoreDeletedCampaignCreators(
    campaignCreators: readonly CampaignCreatorRow[],
    restore: (id: string) => Promise<unknown>,
  ): Promise<void> {
    const activeCreatorIds = new Set(
      campaignCreators
        .filter(
          ({ deletedAt }) => deletedAt === null || deletedAt === undefined,
        )
        .map(({ creatorId }) => creatorId),
    );
    const restoredCreatorIds = new Set<string>();
    for (const campaignCreator of campaignCreators
      .filter(({ deletedAt }) => deletedAt !== null && deletedAt !== undefined)
      .sort(
        (left, right) =>
          left.creatorId.localeCompare(right.creatorId) ||
          left.id.localeCompare(right.id),
      )) {
      if (
        activeCreatorIds.has(campaignCreator.creatorId) ||
        restoredCreatorIds.has(campaignCreator.creatorId)
      )
        continue;
      await restore(campaignCreator.id);
      restoredCreatorIds.add(campaignCreator.creatorId);
    }
  }

  private async executeTransaction<T>(
    authContext: WorkspaceAuthContext,
    callback: (manager: WorkspaceEntityManager) => Promise<T>,
  ) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        return dataSource.transaction(callback);
      },
      authContext,
    );
  }

  private assertCampaignUpdatePermission(options: PermissionOptions) {
    if ('shouldBypassPermissionChecks' in options) return;
    const context = getWorkspaceContext();
    const objectId = context.objectIdByNameSingular.campaign;
    const isUnion = 'unionOf' in options;
    const roleIds = isUnion ? options.unionOf : options.intersectionOf;
    const allowed = roleIds.map(
      (roleId) =>
        context.permissionsPerRoleId[roleId]?.[objectId]
          ?.canUpdateObjectRecords === true,
    );
    if (isUnion ? !allowed.some(Boolean) : !allowed.every(Boolean))
      throw new Error('Campaign update permission is required');
  }
  private assertObjectPermission(
    options: PermissionOptions,
    objectName: string,
    action: 'canUpdateObjectRecords' | 'canSoftDeleteObjectRecords',
  ) {
    if ('shouldBypassPermissionChecks' in options) return;
    const context = getWorkspaceContext();
    const objectId = context.objectIdByNameSingular[objectName];
    const isUnion = 'unionOf' in options;
    const roleIds = isUnion ? options.unionOf : options.intersectionOf;
    const allowed = roleIds.map(
      (roleId) =>
        context.permissionsPerRoleId[roleId]?.[objectId]?.[action] === true,
    );
    if (isUnion ? !allowed.some(Boolean) : !allowed.every(Boolean))
      throw new Error(`${objectName} permission is required`);
  }

  private async authorizeTargets(
    authContext: WorkspaceAuthContext,
    campaignId: string,
    creatorIds: readonly string[],
    listIds: readonly string[],
    manager?: WorkspaceEntityManager,
    requireUpdate = true,
  ) {
    const options = this.permissionOptions(authContext);
    if (requireUpdate) this.assertCampaignUpdatePermission(options);
    const [campaigns, creators, lists] = await Promise.all([
      this.repository(authContext, 'campaign', options),
      this.repository(authContext, 'creator', options),
      this.repository(authContext, 'creatorList', options),
    ]);
    const campaignOptions = manager
      ? {
          where: { id: campaignId },
          lock: { mode: 'pessimistic_write' as const },
        }
      : { where: { id: campaignId } };
    if (!(await campaigns.findOne(campaignOptions, manager)))
      throw new Error('Campaign not found');
    for (const id of creatorIds)
      if (!(await creators.findOne({ where: { id } }, manager)))
        throw new Error('Creator not found');
    for (const id of listIds)
      if (
        !(await lists.findOne(
          manager
            ? {
                where: { id },
                lock: { mode: 'pessimistic_write' },
              }
            : { where: { id } },
          manager,
        ))
      )
        throw new Error('Creator list not found');
    return options;
  }

  async assertGenericMembershipMutationAllowed(
    creatorListId: string | undefined,
    authContext: WorkspaceAuthContext,
  ) {
    if (!creatorListId) throw new Error('Creator list identity is required');
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const options = this.permissionOptions(authContext);
        const attachments = await this.repository(
          authContext,
          'campaignCreatorList',
          options,
        );
        if (await attachments.exists({ where: { creatorListId } }))
          throw new Error(
            'Use the creator-list membership intent for attached lists',
          );
      },
      authContext,
    );
  }
  async assertGenericMembershipMutationAllowedForListIds(
    creatorListIds: readonly (string | undefined)[],
    authContext: WorkspaceAuthContext,
  ) {
    const ids = [...new Set(creatorListIds)];
    for (const creatorListId of ids) {
      await this.assertGenericMembershipMutationAllowed(
        creatorListId,
        authContext,
      );
    }
  }

  async assertGenericMembershipMutationAllowedForMemberIds(
    memberIds: readonly string[],
    authContext: WorkspaceAuthContext,
  ) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const options = this.permissionOptions(authContext);
        const members = await this.repository<RecordRow>(
          authContext,
          'creatorListMember',
          options,
        );
        const rows = await members.find({
          where: memberIds.map((id) => ({ id })),
        });
        await this.assertGenericMembershipMutationAllowedForListIds(
          rows.map((row) => row.creatorListId),
          authContext,
        );
      },
      authContext,
    );
  }

  async assertGenericMembershipMutationAllowedForDeleteFilter(
    filter: {
      creatorListId?: { eq?: string };
      id?: { eq?: string; in?: string[] };
    },
    authContext: WorkspaceAuthContext,
  ) {
    const creatorListId = filter.creatorListId?.eq;
    if (creatorListId) {
      return this.assertGenericMembershipMutationAllowed(
        creatorListId,
        authContext,
      );
    }
    const memberIds = filter.id?.in ?? (filter.id?.eq ? [filter.id.eq] : []);
    if (memberIds.length === 0) {
      throw new Error('Creator list identity is required');
    }
    return this.assertGenericMembershipMutationAllowedForMemberIds(
      memberIds,
      authContext,
    );
  }

  private async snapshotInTransaction(
    campaignId: string,
    authContext: WorkspaceAuthContext,
    manager?: WorkspaceEntityManager,
  ) {
    const options = this.permissionOptions(authContext);
    const [creators, lists] = await Promise.all([
      this.repository<CampaignCreatorRow>(
        authContext,
        'campaignCreator',
        options,
      ),
      this.repository<CampaignCreatorListRow>(
        authContext,
        'campaignCreatorList',
        options,
      ),
    ]);
    return {
      campaignCreators: await creators.find({ where: { campaignId } }, manager),
      campaignCreatorLists: await lists.find(
        { where: { campaignId } },
        manager,
      ),
    };
  }

  async snapshot(campaignId: string, authContext: WorkspaceAuthContext) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        await this.authorizeTargets(
          authContext,
          campaignId,
          [],
          [],
          undefined,
          false,
        );
        return this.snapshotInTransaction(campaignId, authContext);
      },
      authContext,
    );
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }

  private assertUuid(...ids: readonly string[]) {
    if (ids.some((id) => !isUUID(id, '4')))
      throw new Error('Campaign List candidates require UUID identifiers');
  }

  private async ensureCampaignCreatorListSources(
    input: {
      campaignId: string;
      creatorListId: string;
      creatorIds: readonly string[];
    },
    authContext: WorkspaceAuthContext,
    manager: WorkspaceEntityManager,
  ) {
    const requestedIds = [...new Set(input.creatorIds)].sort();
    const options = await this.authorizeTargets(
      authContext,
      input.campaignId,
      requestedIds,
      [input.creatorListId],
      manager,
    );
    const [attachments, members] = await Promise.all([
      this.repository<CampaignCreatorListRow>(
        authContext,
        'campaignCreatorList',
        options,
      ),
      this.repository<RecordRow>(authContext, 'creatorListMember', options),
    ]);
    if (
      !(await attachments.findOne(
        {
          where: {
            campaignId: input.campaignId,
            creatorListId: input.creatorListId,
          },
          lock: { mode: 'pessimistic_write' },
        },
        manager,
      ))
    )
      throw new Error('Campaign Creator List attachment not found');
    const memberIds = [
      ...new Set(
        (
          await members.find(
            { where: { creatorListId: input.creatorListId } },
            manager,
          )
        )
          .map((member) => member.creatorId)
          .filter((creatorId): creatorId is string => Boolean(creatorId)),
      ),
    ].sort();
    const admittedIds = requestedIds.length > 0 ? requestedIds : memberIds;
    if (admittedIds.some((creatorId) => !memberIds.includes(creatorId)))
      throw new Error('Creator is not an eligible List addition candidate');
    if (admittedIds.length === 0) return;
    await this.authorizeTargets(
      authContext,
      input.campaignId,
      admittedIds,
      [input.creatorListId],
      manager,
    );
    const campaignCreators = await this.repository<CampaignCreatorRow>(
      authContext,
      'campaignCreator',
      this.intentPermissionOptions(),
    );
    const existingCampaignCreators = await campaignCreators.find(
      {
        where: admittedIds.map((creatorId) => ({
          campaignId: input.campaignId,
          creatorId,
        })),
        withDeleted: true,
      },
      manager,
    );
    await this.restoreDeletedCampaignCreators(existingCampaignCreators, (id) =>
      campaignCreators.restore(id, manager),
    );

    const existing = await campaignCreators.find(
      { where: { campaignId: input.campaignId } },
      manager,
    );
    const missingIds = admittedIds.filter(
      (creatorId) => !existing.some((row) => row.creatorId === creatorId),
    );
    if (missingIds.length)
      try {
        await campaignCreators.upsert(
          missingIds.map((creatorId) => ({
            campaignId: input.campaignId,
            creatorId,
            isDirectlyAdded: false,
          })),
          {
            conflictPaths: ['campaignId', 'creatorId'],
            indexPredicate: '"deletedAt" IS NULL',
          },
          manager,
        );
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    const resolved = (
      await campaignCreators.find(
        { where: { campaignId: input.campaignId } },
        manager,
      )
    ).filter((row) => admittedIds.includes(row.creatorId));
    if (resolved.length !== admittedIds.length)
      throw new Error('Campaign Creator admission could not be resolved');
    const sources = await this.repository<CampaignCreatorListSourceRow>(
      authContext,
      'campaignCreatorListSource',
      this.intentPermissionOptions(),
    );
    try {
      await sources.upsert(
        resolved.map(({ id: campaignCreatorId }) => ({
          campaignCreatorId,
          creatorListId: input.creatorListId,
        })),
        {
          conflictPaths: ['campaignCreatorId', 'creatorListId'],
          indexPredicate: '"deletedAt" IS NULL',
        },
        manager,
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const reloaded = await sources.find(
        { where: { creatorListId: input.creatorListId } },
        manager,
      );
      if (
        resolved.some(
          ({ id }) =>
            !reloaded.some((source) => source.campaignCreatorId === id),
        )
      )
        throw error;
    }
  }

  private async campaignCreatorListAdditionCandidateIds(
    input: { campaignId: string; creatorListId: string },
    authContext: WorkspaceAuthContext,
    manager: WorkspaceEntityManager,
  ) {
    this.assertUuid(input.campaignId, input.creatorListId);
    const options = await this.authorizeTargets(
      authContext,
      input.campaignId,
      [],
      [input.creatorListId],
      manager,
      false,
    );
    const [attachments, members, campaignCreators, sources] = await Promise.all(
      [
        this.repository<CampaignCreatorListRow>(
          authContext,
          'campaignCreatorList',
          options,
        ),
        this.repository<RecordRow>(authContext, 'creatorListMember', options),
        this.repository<CampaignCreatorRow>(
          authContext,
          'campaignCreator',
          options,
        ),
        this.repository<CampaignCreatorListSourceRow>(
          authContext,
          'campaignCreatorListSource',
          options,
        ),
      ],
    );
    if (
      !(await attachments.findOne(
        {
          where: {
            campaignId: input.campaignId,
            creatorListId: input.creatorListId,
          },
          lock: { mode: 'pessimistic_write' },
        },
        manager,
      ))
    )
      throw new Error('Campaign Creator List attachment not found');
    const [memberRows, creatorRows, sourceRows] = await Promise.all([
      members.find({ where: { creatorListId: input.creatorListId } }, manager),
      campaignCreators.find(
        { where: { campaignId: input.campaignId } },
        manager,
      ),
      sources.find({ where: { creatorListId: input.creatorListId } }, manager),
    ]);
    const memberCreatorIds = [
      ...new Set(
        memberRows
          .map((member) => member.creatorId)
          .filter((creatorId): creatorId is string => Boolean(creatorId)),
      ),
    ];
    await this.authorizeTargets(
      authContext,
      input.campaignId,
      memberCreatorIds,
      [input.creatorListId],
      manager,
      false,
    );
    const sourceCreatorIds = new Set(
      sourceRows
        .map((source) =>
          creatorRows.find(
            (creator) => creator.id === source.campaignCreatorId,
          ),
        )
        .filter((creator): creator is CampaignCreatorRow => Boolean(creator))
        .map((creator) => creator.creatorId),
    );
    return memberCreatorIds
      .filter((creatorId) => !sourceCreatorIds.has(creatorId))
      .sort();
  }

  async campaignCreatorListAdditionCandidates(
    input: { campaignId: string; creatorListId: string },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (manager) => ({
      creatorIds: await this.campaignCreatorListAdditionCandidateIds(
        input,
        authContext,
        manager,
      ),
    }));
  }

  async approveCampaignCreatorListAdditions(
    input: {
      campaignId: string;
      creatorListId: string;
      creatorIds: readonly string[];
    },
    authContext: WorkspaceAuthContext,
  ) {
    this.assertUuid(input.campaignId, input.creatorListId, ...input.creatorIds);
    return this.executeTransaction(authContext, async (manager) => {
      const candidates = await this.campaignCreatorListAdditionCandidateIds(
        input,
        authContext,
        manager,
      );
      if (
        input.creatorIds.length === 0 ||
        input.creatorIds.some((creatorId) => !candidates.includes(creatorId))
      )
        throw new Error('Creator is not an eligible List addition candidate');
      await this.ensureCampaignCreatorListSources(input, authContext, manager);
    });
  }

  async attachCampaignCreatorLists(
    input: { campaignId: string; creatorListIds: readonly string[] },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (manager) => {
      const ids = [...new Set(input.creatorListIds)].sort();
      const options = await this.authorizeTargets(
        authContext,
        input.campaignId,
        [],
        ids,
        manager,
      );
      this.assertObjectPermission(
        options,
        'creatorList',
        'canUpdateObjectRecords',
      );
      const attachments = await this.repository<CampaignCreatorListRow>(
        authContext,
        'campaignCreatorList',
        options,
      );
      const current = await attachments.find(
        { where: { campaignId: input.campaignId } },
        manager,
      );
      const attachedIds = new Set(
        current.map((attachment) => attachment.creatorListId),
      );
      const newIds = ids.filter(
        (creatorListId) => !attachedIds.has(creatorListId),
      );
      if (newIds.length)
        await (
          await this.repository(
            authContext,
            'campaignCreatorList',
            this.intentPermissionOptions(),
          )
        ).upsert(
          newIds.map((creatorListId) => ({
            campaignId: input.campaignId,
            creatorListId,
          })),
          {
            conflictPaths: ['campaignId', 'creatorListId'],
            indexPredicate: '"deletedAt" IS NULL',
          },
          manager,
        );
      for (const creatorListId of newIds)
        await this.ensureCampaignCreatorListSources(
          { campaignId: input.campaignId, creatorListId, creatorIds: [] },
          authContext,
          manager,
        );
      return this.snapshotInTransaction(input.campaignId, authContext, manager);
    });
  }

  async addDirectCampaignCreators(
    input: AddDirectCampaignCreatorsServiceInput,
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (manager) => {
      const ids = [...new Set(input.creatorIds)];
      await this.authorizeTargets(
        authContext,
        input.campaignId,
        ids,
        [],
        manager,
      );
      const creators = await this.repository<CampaignCreatorRow>(
        authContext,
        'campaignCreator',
        this.intentPermissionOptions(),
      );
      const existingCampaignCreators = await creators.find(
        {
          where: ids.map((creatorId) => ({
            campaignId: input.campaignId,
            creatorId,
          })),
          withDeleted: true,
        },
        manager,
      );
      await this.restoreDeletedCampaignCreators(
        existingCampaignCreators,
        (id) => creators.restore(id, manager),
      );

      await creators.upsert(
        ids.map((creatorId) => ({
          campaignId: input.campaignId,
          creatorId,
          isDirectlyAdded: true,
          ...(input.assignedManagedMailboxId !== undefined
            ? {
                assignedManagedMailboxId: input.assignedManagedMailboxId,
              }
            : {}),
        })),
        {
          conflictPaths: ['campaignId', 'creatorId'],
          indexPredicate: '"deletedAt" IS NULL',
        },
        manager,
      );
      return this.snapshotInTransaction(input.campaignId, authContext, manager);
    });
  }

  async addDirectCreators(
    input: AddDirectCampaignCreatorsServiceInput,
    authContext: WorkspaceAuthContext,
  ) {
    return this.addDirectCampaignCreators(input, authContext);
  }

  async campaignCreatorListRemovalImpact(
    input: { campaignId: string; creatorListId: string },
    authContext: WorkspaceAuthContext,
  ) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        await this.authorizeTargets(
          authContext,
          input.campaignId,
          [],
          [input.creatorListId],
          undefined,
          false,
        );

        return {
          affectedCreatorIds: [],
          requiresConfirmation: false,
        };
      },
      authContext,
    );
  }

  async detachCampaignCreatorList(
    input: { campaignId: string; creatorListId: string },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (manager) => {
      const options = await this.authorizeTargets(
        authContext,
        input.campaignId,
        [],
        [input.creatorListId],
        manager,
      );
      const attachments = await this.repository<CampaignCreatorListRow>(
        authContext,
        'campaignCreatorList',
        options,
      );
      if (
        !(await attachments.findOne(
          {
            where: {
              campaignId: input.campaignId,
              creatorListId: input.creatorListId,
            },
            lock: { mode: 'pessimistic_write' },
          },
          manager,
        ))
      )
        throw new Error('Campaign Creator List attachment not found');
      await (
        await this.repository(
          authContext,
          'campaignCreatorList',
          this.intentPermissionOptions(),
        )
      ).softDelete(
        { campaignId: input.campaignId, creatorListId: input.creatorListId },
        manager,
      );
      return this.snapshotInTransaction(input.campaignId, authContext, manager);
    });
  }

  async addCreatorListMemberIntent(
    input: { creatorListId: string; creatorId: string },
    authContext: WorkspaceAuthContext,
  ) {
    const [membership] = await this.addCreatorListMembersIntent(
      { creatorListId: input.creatorListId, creatorIds: [input.creatorId] },
      authContext,
    );
    return membership;
  }

  async addCreatorListMembersIntent(
    input: { creatorListId: string; creatorIds: readonly string[] },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (manager) => {
      const creatorIds = [...new Set(input.creatorIds)].sort();
      const options = this.permissionOptions(authContext);
      this.assertObjectPermission(
        options,
        'creatorList',
        'canUpdateObjectRecords',
      );
      const [lists, creators] = await Promise.all([
        this.repository(authContext, 'creatorList', options),
        this.repository(authContext, 'creator', options),
      ]);
      if (
        !(await lists.findOne(
          {
            where: { id: input.creatorListId },
            lock: { mode: 'pessimistic_write' },
          },
          manager,
        ))
      )
        throw new Error('Creator list not found');
      for (const creatorId of creatorIds)
        if (!(await creators.findOne({ where: { id: creatorId } }, manager)))
          throw new Error('Creator not found');
      const members = await this.repository(
        authContext,
        'creatorListMember',
        this.intentPermissionOptions(),
      );
      const rows = [];
      for (const creatorId of creatorIds) {
        let membership = await members.findOne(
          { where: { creatorListId: input.creatorListId, creatorId } },
          manager,
        );
        if (!membership) {
          await members.upsert(
            { creatorListId: input.creatorListId, creatorId },
            {
              conflictPaths: ['creatorListId', 'creatorId'],
              indexPredicate: '"deletedAt" IS NULL',
            },
            manager,
          );
          membership = await members.findOne(
            { where: { creatorListId: input.creatorListId, creatorId } },
            manager,
          );
          if (!membership)
            throw new Error('Creator list membership creation failed');
        }
        rows.push(membership);
      }
      return rows;
    });
  }

  async creatorListMembershipRemovalImpact(
    input: { creatorListId: string; creatorId: string },
    authContext: WorkspaceAuthContext,
  ) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const options = this.permissionOptions(authContext);
        const [lists, members] = await Promise.all([
          this.repository(authContext, 'creatorList', options),
          this.repository(authContext, 'creatorListMember', options),
        ]);
        if (!(await lists.findOne({ where: { id: input.creatorListId } })))
          throw new Error('Creator list not found');
        if (
          !(await members.findOne({
            where: {
              creatorListId: input.creatorListId,
              creatorId: input.creatorId,
            },
          }))
        )
          throw new Error('Creator list membership not found');

        return {
          affectedCampaignIds: [],
          requiresConfirmation: false,
        };
      },
      authContext,
    );
  }

  async removeCreatorListMemberIntent(
    input: { creatorListId: string; creatorId: string },
    authContext: WorkspaceAuthContext,
  ) {
    return this.executeTransaction(authContext, async (manager) => {
      const options = this.permissionOptions(authContext);
      this.assertObjectPermission(
        options,
        'creatorList',
        'canUpdateObjectRecords',
      );
      const [lists, creators, members] = await Promise.all([
        this.repository(authContext, 'creatorList', options),
        this.repository(authContext, 'creator', options),
        this.repository(authContext, 'creatorListMember', options),
      ]);
      if (
        !(await lists.findOne(
          {
            where: { id: input.creatorListId },
            lock: { mode: 'pessimistic_write' },
          },
          manager,
        ))
      )
        throw new Error('Creator list not found');
      if (
        !(await creators.findOne({ where: { id: input.creatorId } }, manager))
      )
        throw new Error('Creator not found');
      if (
        !(await members.findOne(
          {
            where: {
              creatorListId: input.creatorListId,
              creatorId: input.creatorId,
            },
          },
          manager,
        ))
      )
        throw new Error('Creator list membership not found');
      await (
        await this.repository(
          authContext,
          'creatorListMember',
          this.intentPermissionOptions(),
        )
      ).softDelete(
        { creatorListId: input.creatorListId, creatorId: input.creatorId },
        manager,
      );
      return true;
    });
  }
}
