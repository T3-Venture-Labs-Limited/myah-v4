import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

export type EffectiveAudienceInput = { campaignId: string; directCreatorIds: readonly string[]; listMembersByListId: Readonly<Record<string, readonly string[]>> };
export type EffectiveCampaignCreator = { campaignId: string; creatorId: string; isDirectlyAdded: boolean; sourceListIds: string[] };

export const buildEffectiveCampaignCreators = ({ campaignId, directCreatorIds, listMembersByListId }: EffectiveAudienceInput): EffectiveCampaignCreator[] => {
  const directIds = new Set(directCreatorIds);
  const sourceListIdsByCreator = new Map<string, Set<string>>();
  for (const [listId, creatorIds] of Object.entries(listMembersByListId)) {
    for (const creatorId of creatorIds) {
      const sourceListIds = sourceListIdsByCreator.get(creatorId) ?? new Set<string>();
      sourceListIds.add(listId);
      sourceListIdsByCreator.set(creatorId, sourceListIds);
    }
  }
  for (const creatorId of directIds) if (!sourceListIdsByCreator.has(creatorId)) sourceListIdsByCreator.set(creatorId, new Set());
  return [...sourceListIdsByCreator.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([creatorId, sourceListIds]) => ({ campaignId, creatorId, isDirectlyAdded: directIds.has(creatorId), sourceListIds: [...sourceListIds].sort() }));
};

export type CampaignListSyncInput = { attachedListIds: readonly string[]; existingCreators: readonly Pick<EffectiveCampaignCreator, 'campaignId' | 'creatorId'>[]; listMembersByListId: Readonly<Record<string, readonly string[]>> };
export const getCampaignListSyncChanges = ({ attachedListIds, existingCreators, listMembersByListId }: CampaignListSyncInput) => {
  const existing = new Set(existingCreators.map(({ creatorId }) => creatorId));
  const sources = new Set(attachedListIds.flatMap((id) => listMembersByListId[id] ?? []));
  return { additions: [...sources].filter((id) => !existing.has(id)).sort(), preserved: [...sources].filter((id) => existing.has(id)).sort() };
};

export type SourceRemovalImpact = { affectedCreatorIds: string[]; requiresConfirmation: boolean };
export const getSourceRemovalImpact = ({ removedListId, directCreatorIds, listMembersByListId }: { removedListId: string; directCreatorIds: readonly string[]; listMembersByListId: Readonly<Record<string, readonly string[]>> }): SourceRemovalImpact => {
  const direct = new Set(directCreatorIds);
  const affectedCreatorIds = [...new Set(listMembersByListId[removedListId] ?? [])].filter((creatorId) => !direct.has(creatorId) && !Object.entries(listMembersByListId).some(([id, members]) => id !== removedListId && members.includes(creatorId))).sort();
  return { affectedCreatorIds, requiresConfirmation: affectedCreatorIds.length > 0 };
};

type RecordRow = { id?: string; campaignId: string; creatorId?: string; creatorListId?: string; isDirectlyAdded?: boolean };
type PermissionOptions = RolePermissionConfig;

@Injectable()
export class CampaignInfluencerService {
  constructor(private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager) {}
  buildEffectiveCampaignCreators(input: EffectiveAudienceInput) { return buildEffectiveCampaignCreators(input); }
  getCampaignListSyncChanges(input: CampaignListSyncInput) { return getCampaignListSyncChanges(input); }
  getSourceRemovalImpact(input: Parameters<typeof getSourceRemovalImpact>[0]) { return getSourceRemovalImpact(input); }

  private permissionOptions(authContext: WorkspaceAuthContext): PermissionOptions {
    const context = getWorkspaceContext();
    const options = resolveRolePermissionConfig({ authContext, userWorkspaceRoleMap: context.userWorkspaceRoleMap, apiKeyRoleMap: context.apiKeyRoleMap });
    if (!options) throw new Error('Role could not be resolved');
    return options;
  }

  private async repository<T extends RecordRow>(authContext: WorkspaceAuthContext, name: string, options: PermissionOptions) {
    return this.globalWorkspaceOrmManager.getRepository<T>(authContext.workspace.id, name, options);
  }
  private intentPermissionOptions(): PermissionOptions {
    return { shouldBypassPermissionChecks: true };
  }

  private async executeTransaction<T>(authContext: WorkspaceAuthContext, callback: (manager: WorkspaceEntityManager) => Promise<T>) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const dataSource = await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
      return dataSource.transaction(callback);
    }, authContext);
  }

  private async authorizeTargets(authContext: WorkspaceAuthContext, campaignId: string, creatorIds: readonly string[], listIds: readonly string[], manager?: WorkspaceEntityManager) {
    const options = this.permissionOptions(authContext);
    const [campaigns, creators, lists] = await Promise.all([
      this.repository(authContext, 'campaign', options), this.repository(authContext, 'creator', options), this.repository(authContext, 'creatorList', options),
    ]);
    if (!(await campaigns.findOne({ where: { id: campaignId } }, manager))) throw new Error('Campaign not found');
    for (const id of creatorIds) if (!(await creators.findOne({ where: { id } }, manager))) throw new Error('Creator not found');
    for (const id of listIds) if (!(await lists.findOne({ where: { id } }, manager))) throw new Error('Creator list not found');
    return options;
  }

  private async snapshotInTransaction(campaignId: string, authContext: WorkspaceAuthContext, manager?: WorkspaceEntityManager) {
    const options = this.permissionOptions(authContext);
    const [creators, lists] = await Promise.all([this.repository(authContext, 'campaignCreator', options), this.repository(authContext, 'campaignCreatorList', options)]);
    return { campaignCreators: await creators.find({ where: { campaignId } }, manager), campaignCreatorLists: await lists.find({ where: { campaignId } }, manager) };
  }

  async snapshot(campaignId: string, authContext: WorkspaceAuthContext) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      await this.authorizeTargets(authContext, campaignId, [], []);
      return this.snapshotInTransaction(campaignId, authContext);
    }, authContext);
  }

  async attachCampaignCreatorLists(input: { campaignId: string; creatorListIds: readonly string[] }, authContext: WorkspaceAuthContext) {
    return this.executeTransaction(authContext, async (manager) => {
      const ids = [...new Set(input.creatorListIds)];
      const options = await this.authorizeTargets(authContext, input.campaignId, [], ids, manager);
      const attachments = await this.repository(authContext, 'campaignCreatorList', options);
      const writeAttachments = await this.repository(authContext, 'campaignCreatorList', this.intentPermissionOptions());
      const creators = await this.repository(authContext, 'campaignCreator', options);
      const writeCreators = await this.repository(authContext, 'campaignCreator', this.intentPermissionOptions());
      const members = await this.repository<RecordRow>(authContext, 'creatorListMember', options);
      const current = await attachments.find({ where: { campaignId: input.campaignId } }, manager);
      await writeAttachments.upsert(ids.map((creatorListId) => ({ campaignId: input.campaignId, creatorListId })), { conflictPaths: ['campaignId', 'creatorListId'], indexPredicate: '"deletedAt" IS NULL' }, manager);
      const all = [...new Set([...current.map((r) => r.creatorListId!), ...ids])];
      const memberRows = await members.find({ where: all.map((creatorListId) => ({ creatorListId })) }, manager);
      const byList = Object.fromEntries(all.map((id) => [id, memberRows.filter((m) => m.creatorListId === id).map((m) => m.creatorId!)]));
      const desired = new Set(all.flatMap((id) => byList[id] ?? []));
      const existing = await creators.find({ where: { campaignId: input.campaignId } }, manager);
      const missing = [...desired].filter((creatorId) => !existing.some((row) => row.creatorId === creatorId));
      if (missing.length) await writeCreators.upsert(missing.map((creatorId) => ({ campaignId: input.campaignId, creatorId, isDirectlyAdded: false })), { conflictPaths: ['campaignId', 'creatorId'], indexPredicate: '"deletedAt" IS NULL' }, manager);
      return this.snapshotInTransaction(input.campaignId, authContext, manager);
    });
  }

  async addDirectCampaignCreators(input: { campaignId: string; creatorIds: readonly string[] }, authContext: WorkspaceAuthContext) {
    return this.executeTransaction(authContext, async (manager) => {
      const ids = [...new Set(input.creatorIds)];
      await this.authorizeTargets(authContext, input.campaignId, ids, [], manager);
      const creators = await this.repository(authContext, 'campaignCreator', this.intentPermissionOptions());
      await creators.upsert(ids.map((creatorId) => ({ campaignId: input.campaignId, creatorId, isDirectlyAdded: true })), { conflictPaths: ['campaignId', 'creatorId'], indexPredicate: '"deletedAt" IS NULL' }, manager);
      return this.snapshotInTransaction(input.campaignId, authContext, manager);
    });
  }

  async addDirectCreators(input: { campaignId: string; creatorIds: readonly string[] }, authContext: WorkspaceAuthContext) { return this.addDirectCampaignCreators(input, authContext); }

  private confirmationToken(input: { campaignId: string; creatorListId: string; affectedCreatorIds: readonly string[] }) { return createHash('sha256').update(`${input.campaignId}:${input.creatorListId}:${[...input.affectedCreatorIds].sort().join(',')}`).digest('hex'); }

  private async calculateImpact(input: { campaignId: string; creatorListId: string }, authContext: WorkspaceAuthContext, manager?: WorkspaceEntityManager) {
    const options = await this.authorizeTargets(authContext, input.campaignId, [], [input.creatorListId], manager);
    const [creators, attachments, members] = await Promise.all([
      this.repository(authContext, 'campaignCreator', options),
      this.repository(authContext, 'campaignCreatorList', options),
      this.repository(authContext, 'creatorListMember', options),
    ]);
    const [creatorRows, attachmentRows] = await Promise.all([
      creators.find({ where: { campaignId: input.campaignId } }, manager),
      attachments.find({ where: { campaignId: input.campaignId } }, manager),
    ]);
    const listIds = attachmentRows.map((r) => r.creatorListId!).filter(Boolean);
    const allMembers = await members.find({ where: listIds.map((creatorListId) => ({ creatorListId })) }, manager);
    const byList = Object.fromEntries(listIds.map((id) => [id, allMembers.filter((m) => m.creatorListId === id).map((m) => m.creatorId!)]));
    const impact = getSourceRemovalImpact({
      removedListId: input.creatorListId,
      directCreatorIds: creatorRows.filter((r) => r.isDirectlyAdded).map((r) => r.creatorId!),
      listMembersByListId: byList,
    });
    return { ...impact, confirmationToken: this.confirmationToken({ ...input, affectedCreatorIds: impact.affectedCreatorIds }) };
  }

  async campaignCreatorListRemovalImpact(input: { campaignId: string; creatorListId: string }, authContext: WorkspaceAuthContext) {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(() => this.calculateImpact(input, authContext), authContext);
  }

  async detachCampaignCreatorList(input: { campaignId: string; creatorListId: string; confirmedCreatorIds: readonly string[]; confirmationToken?: string }, authContext: WorkspaceAuthContext) {
    return this.executeTransaction(authContext, async (manager) => {
      const impact = await this.calculateImpact(input, authContext, manager);
      const confirmed = new Set(input.confirmedCreatorIds);
      if (impact.requiresConfirmation && (input.confirmationToken !== impact.confirmationToken || confirmed.size !== impact.affectedCreatorIds.length || impact.affectedCreatorIds.some((id) => !confirmed.has(id)))) throw new Error('Exact final-source Creator confirmation is required');
      const creators = await this.repository(authContext, 'campaignCreator', this.intentPermissionOptions());
      const attachments = await this.repository(authContext, 'campaignCreatorList', this.intentPermissionOptions());
      for (const creatorId of impact.affectedCreatorIds) await creators.softDelete({ campaignId: input.campaignId, creatorId }, manager);
      await attachments.softDelete({ campaignId: input.campaignId, creatorListId: input.creatorListId }, manager);
      return this.snapshotInTransaction(input.campaignId, authContext, manager);
    });
  }

  async detachCreatorList(input: { campaignId: string; creatorListId: string; confirmedCreatorIds: readonly string[]; confirmationToken?: string }, authContext: WorkspaceAuthContext) {
    return this.detachCampaignCreatorList(input, authContext);
  }

  async syncCreatorListMembership(input: { creatorListId: string; creatorId: string; removed?: boolean }, authContext: WorkspaceAuthContext): Promise<void> {
    await this.executeTransaction(authContext, async (manager) => {
      const options = this.permissionOptions(authContext);
      const lists = await this.repository(authContext, 'creatorList', options);
      const creatorsTarget = await this.repository(authContext, 'creator', options);
      if (!(await lists.findOne({ where: { id: input.creatorListId } }, manager))) throw new Error('Creator list not found');
      if (!(await creatorsTarget.findOne({ where: { id: input.creatorId } }, manager))) throw new Error('Creator not found');
      const attachments = await this.repository(authContext, 'campaignCreatorList', options);
      const creators = await this.repository(authContext, 'campaignCreator', this.intentPermissionOptions());
      const attached = await attachments.find({ where: { creatorListId: input.creatorListId } }, manager);
      for (const attachment of attached) {
        if (!input.removed) {
          await creators.upsert({ campaignId: attachment.campaignId, creatorId: input.creatorId, isDirectlyAdded: false }, { conflictPaths: ['campaignId', 'creatorId'], indexPredicate: '"deletedAt" IS NULL' }, manager);
        }
      }
    });
  }
}
