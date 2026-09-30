import {
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';

import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { MESSAGE_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/constants/message-channel-seed-ids.constant';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';

import { getDomainService } from 'test/integration/myah-inbox/utils/seed-myah-inbox-task-7-fixture.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const channelId = MESSAGE_CHANNEL_DATA_SEED_IDS.TIM;
const otherWorkspaceId = SEED_YCOMBINATOR_WORKSPACE_ID;
const otherChannelId = channelId.replace(/^20202020/, '30303030');
const scopeKey = `workspace:${workspaceId}`;

describe('Email sync status uses core metadata and atomically invalidates forecasts', () => {
  let service: MessageChannelSyncStatusService;
  let channelBefore: Record<string, unknown>;
  let accountBefore: Record<string, unknown>;
  let headBefore: Record<string, unknown> | undefined;
  let otherBefore: Record<string, unknown>;
  let otherAccountBefore: Record<string, unknown>;
  let accountId: string;

  const channel = async (id: string = channelId) => {
    const [row] = await global.testDataSource.query(
      `SELECT "syncStage","syncStatus","syncStageStartedAt","syncedAt",
        "throttleRetryAfter","throttleFailureCount","connectedAccountId"
         FROM core."messageChannel" WHERE id=$1`,
      [id],
    );
    return row;
  };
  const revision = async (): Promise<number> => {
    const [row] = await global.testDataSource.query(
      `SELECT "inputRevision" FROM core."campaignForecastHead" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
    return Number(row?.inputRevision ?? 0);
  };

  beforeAll(async () => {
    service = getDomainService<MessageChannelSyncStatusService>(
      'MessageChannelSyncStatusService',
    );
    channelBefore = await channel();
    otherBefore = await channel(otherChannelId);
    if (!channelBefore || !otherBefore)
      throw new Error('Seed channels missing');
    accountId = channelBefore.connectedAccountId as string;
    [accountBefore] = await global.testDataSource.query(
      `SELECT "authFailedAt" FROM core."connectedAccount" WHERE id=$1`,
      [accountId],
    );
    [otherAccountBefore] = await global.testDataSource.query(
      `SELECT "authFailedAt" FROM core."connectedAccount" WHERE id=$1`,
      [otherBefore.connectedAccountId],
    );
    [headBefore] = await global.testDataSource.query(
      `SELECT "inputRevision" FROM core."campaignForecastHead" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
      [workspaceId, scopeKey],
    );
  });

  afterAll(async () => {
    if (!channelBefore) return;
    await global.testDataSource.query(
      `UPDATE core."messageChannel" SET "syncStage"=$2,"syncStatus"=$3,
        "syncStageStartedAt"=$4,"syncedAt"=$5,"throttleRetryAfter"=$7,
        "throttleFailureCount"=$8 WHERE id=$1 AND "workspaceId"=$6`,
      [
        channelId,
        channelBefore.syncStage,
        channelBefore.syncStatus,
        channelBefore.syncStageStartedAt,
        channelBefore.syncedAt,
        workspaceId,
        channelBefore.throttleRetryAfter,
        channelBefore.throttleFailureCount,
      ],
    );
    await global.testDataSource.query(
      `UPDATE core."connectedAccount" SET "authFailedAt"=$2 WHERE id=$1 AND "workspaceId"=$3`,
      [accountId, accountBefore.authFailedAt, workspaceId],
    );
    if (headBefore) {
      await global.testDataSource.query(
        `UPDATE core."campaignForecastHead" SET "inputRevision"=$3 WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
        [workspaceId, scopeKey, headBefore.inputRevision],
      );
    } else {
      await global.testDataSource.query(
        `DELETE FROM core."campaignForecastHead" WHERE "workspaceId"=$1 AND "scopeKey"=$2`,
        [workspaceId, scopeKey],
      );
    }
  });

  it('persists scheduled, fetching, importing and completed stages with one revision per transition', async () => {
    const initial = await revision();
    for (const [method, stage] of [
      [
        'markAsMessagesListFetchScheduled',
        MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
      ],
      [
        'markAsMessagesListFetchOngoing',
        MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
      ],
      [
        'markAsMessagesImportOngoing',
        MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
      ],
    ] as const) {
      await service[method]([channelId], workspaceId);
      expect(await channel()).toMatchObject({
        syncStage: stage,
        syncStatus: MessageChannelSyncStatus.ONGOING,
      });
    }
    expect(await revision()).toBe(initial + 3);
    await service.markAsMessageSyncCompleted([channelId], workspaceId);
    const completed = await channel();
    expect(completed).toMatchObject({
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      syncStatus: MessageChannelSyncStatus.ACTIVE,
      syncStageStartedAt: null,
    });
    expect(new Date(completed.syncedAt as string).getTime()).toBeGreaterThan(0);
    expect(await revision()).toBe(initial + 4);
    expect(await channel(otherChannelId)).toEqual(otherBefore);
  });

  it('records unknown and insufficient-permissions failures without changing a foreign workspace', async () => {
    const initial = await revision();
    await service.markAsFailed(
      [channelId],
      workspaceId,
      MessageChannelSyncStatus.FAILED_UNKNOWN,
    );
    expect(await channel()).toMatchObject({
      syncStage: MessageChannelSyncStage.FAILED,
      syncStatus: MessageChannelSyncStatus.FAILED_UNKNOWN,
    });
    expect(await revision()).toBe(initial + 1);

    await service.markAsFailed(
      [channelId, otherChannelId],
      workspaceId,
      MessageChannelSyncStatus.FAILED_INSUFFICIENT_PERMISSIONS,
    );
    expect(await channel()).toMatchObject({
      syncStage: MessageChannelSyncStage.FAILED,
      syncStatus: MessageChannelSyncStatus.FAILED_INSUFFICIENT_PERMISSIONS,
    });
    expect(await revision()).toBe(initial + 2);
    const [account] = await global.testDataSource.query(
      `SELECT "authFailedAt" FROM core."connectedAccount" WHERE id=$1`,
      [accountId],
    );
    expect(new Date(account.authFailedAt).getTime()).toBeGreaterThan(0);
    expect(await channel(otherChannelId)).toEqual(otherBefore);
    expect(otherWorkspaceId).not.toBe(workspaceId);
    const [otherAccount] = await global.testDataSource.query(
      `SELECT "authFailedAt" FROM core."connectedAccount" WHERE id=$1`,
      [otherBefore.connectedAccountId],
    );
    expect(otherAccount).toEqual(otherAccountBefore);
  });
});
