import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  CalendarChannelSyncStage,
  CalendarChannelSyncStatus,
  WebhookSubscriptionStatus,
} from 'twenty-shared/types';
import { type QueryResult, type QueryRunner, type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

export const RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS = [
  STANDARD_OBJECTS.calendarChannelEventAssociation.universalIdentifier,
  STANDARD_OBJECTS.calendarEventParticipant.universalIdentifier,
  STANDARD_OBJECTS.calendarEvent.universalIdentifier,
  STANDARD_OBJECTS.callRecording.universalIdentifier,
];

type Channel = { id: string; accountWorkspaceId: string | null };
type ObjectRow = {
  id: string;
  isActive: boolean;
  applicationWorkspaceId: string | null;
  applicationUniversalIdentifier: string | null;
};

const channelSql = `SELECT cc.id, ca."workspaceId" AS "accountWorkspaceId"
         FROM core."calendarChannel" cc
         LEFT JOIN core."connectedAccount" ca ON ca.id = cc."connectedAccountId"
        WHERE cc."workspaceId" = $1
          AND (cc."isSyncEnabled" = true OR cc."webhookSubscriptionStatus" = $2)
        ORDER BY cc.id`;
const objectSql = `SELECT obj.id, obj."isActive", app."workspaceId" AS "applicationWorkspaceId",
              app."universalIdentifier" AS "applicationUniversalIdentifier"
         FROM core."objectMetadata" obj
         LEFT JOIN core.application app ON app.id = obj."applicationId"
        WHERE obj."workspaceId" = $1 AND obj."universalIdentifier" = ANY($2::uuid[])
        ORDER BY obj.id`;
const hasExactIds = (rows: unknown, ids: string[]): boolean =>
  Array.isArray(rows) &&
  rows.length === ids.length &&
  new Set(
    rows.map((row: unknown) =>
      row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined,
    ),
  ).size === ids.length &&
  rows.every(
    (row: unknown) =>
      row !== null &&
      typeof row === 'object' &&
      typeof (row as { id?: unknown }).id === 'string' &&
      ids.includes((row as { id: string }).id),
  );

const assertOwnership = (
  channels: Channel[],
  objects: ObjectRow[],
  workspaceId: string,
) => {
  if (
    channels.some(
      ({ accountWorkspaceId }) => accountWorkspaceId !== workspaceId,
    )
  ) {
    throw new Error(
      'Foreign or missing calendar channel account; no retirement performed',
    );
  }
  if (
    objects.some(
      (row) =>
        row.applicationWorkspaceId !== workspaceId ||
        row.applicationUniversalIdentifier !==
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
    )
  ) {
    throw new Error(
      'Foreign or missing calendar/call-recording metadata owner; no retirement performed',
    );
  }
};

@RegisteredWorkspaceCommand('2.20.0', 1790000000412)
@Command({
  name: 'upgrade:2-20:retire-calendar-sync',
  description:
    'Disable calendar synchronization while preserving channels and provider recovery identifiers',
})
export class RetireCalendarSyncCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    private readonly workspaceCache: WorkspaceCacheService,
    private readonly metadataVersion: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    options,
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!options.dryRun) {
      throw new Error(
        'Calendar retirement requires a pinned upgrade transaction',
      );
    }
    const channels: Channel[] = await this.calendarChannelRepository.query(
      channelSql,
      [workspaceId, WebhookSubscriptionStatus.ACTIVE],
    );
    const objects: ObjectRow[] = await this.objectMetadataRepository.query(
      objectSql,
      [workspaceId, RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS],
    );
    assertOwnership(channels, objects, workspaceId);
    this.logger.log(
      `${channels.length} active calendar channel(s) and ${objects.filter(({ isActive }) => isActive).length} active calendar/call-recording object(s) found (dry run)`,
      workspaceId,
    );
  }

  override async runOnWorkspaceInUpgradeTransaction(
    { workspaceId, options }: RunOnWorkspaceArgs,
    runner: QueryRunner,
    afterCommit: (effect: () => Promise<void> | void) => void,
  ): Promise<void> {
    if (
      options.dryRun ||
      !runner?.isTransactionActive ||
      runner.isReleased ||
      runner.manager?.queryRunner !== runner ||
      typeof afterCommit !== 'function'
    ) {
      throw new Error(
        'Calendar retirement requires a pinned upgrade transaction',
      );
    }

    const channels: Channel[] = await runner.query(
      `${channelSql} FOR UPDATE OF cc`,
      [workspaceId, WebhookSubscriptionStatus.ACTIVE],
    );
    // Include inactive rows in the ownership check, but never rewrite their state.
    const objects: ObjectRow[] = await runner.query(
      `${objectSql} FOR UPDATE OF obj`,
      [workspaceId, RETIRED_CALENDAR_OBJECT_UNIVERSAL_IDENTIFIERS],
    );
    assertOwnership(channels, objects, workspaceId);
    const channelIds = channels.map(({ id }) => id);
    const objectIds = objects
      .filter(({ isActive }) => isActive)
      .map(({ id }) => id);
    this.logger.log(
      `${channelIds.length} active calendar channel(s) and ${objectIds.length} active calendar/call-recording object(s) found`,
      workspaceId,
    );

    if (channelIds.length > 0) {
      // One update per ID even when both predicates matched. Never clear the
      // subscription's external ID, client state, sync cursor or shared account.
      const updated: QueryResult<{ id: string }> = await runner.query(
        `UPDATE core."calendarChannel"
            SET "isSyncEnabled" = false, "syncStage" = $3,
                "syncStageStartedAt" = NULL, "syncStatus" = $4,
                "webhookSubscriptionExpiresAt" = NOW(), "webhookSubscriptionStatus" = $5
          WHERE "workspaceId" = $1 AND id = ANY($2::uuid[])
          RETURNING id`,
        [
          workspaceId,
          channelIds,
          CalendarChannelSyncStage.PENDING_CONFIGURATION,
          CalendarChannelSyncStatus.NOT_SYNCED,
          WebhookSubscriptionStatus.EXPIRED,
        ],
        true,
      );
      const remaining: { id: string }[] = await runner.query(
        `SELECT id FROM core."calendarChannel"
          WHERE "workspaceId" = $1 AND id = ANY($2::uuid[])
            AND ("isSyncEnabled" = true OR "webhookSubscriptionStatus" IS DISTINCT FROM $3)`,
        [workspaceId, channelIds, WebhookSubscriptionStatus.EXPIRED],
      );
      if (
        updated.affected !== channelIds.length ||
        !hasExactIds(updated.records, channelIds) ||
        remaining.length
      ) {
        throw new Error('Calendar channel retirement postcondition failed');
      }
    }
    if (objectIds.length > 0) {
      // Native inferred-deletion migration can drop historical physical tables.
      // Keep the approved visibility-only update bound to the receipt transaction.
      const updated: QueryResult<{ id: string }> = await runner.query(
        `UPDATE core."objectMetadata"
            SET "isActive" = false, "isUICreatable" = false, "isUIEditable" = false
          WHERE "workspaceId" = $1 AND id = ANY($2::uuid[]) AND "isActive" = true
          RETURNING id`,
        [workspaceId, objectIds],
        true,
      );
      const remaining: { id: string }[] = await runner.query(
        `SELECT id FROM core."objectMetadata"
          WHERE "workspaceId" = $1 AND id = ANY($2::uuid[])
            AND ("isActive" = true OR "isUICreatable" = true OR "isUIEditable" = true)`,
        [workspaceId, objectIds],
      );
      if (
        updated.affected !== objectIds.length ||
        !hasExactIds(updated.records, objectIds) ||
        remaining.length
      ) {
        throw new Error('Calendar metadata retirement postcondition failed');
      }
      // Invalidate before the version service publishes its committed version.
      afterCommit(() =>
        this.workspaceCache.flush(workspaceId, ['flatObjectMetadataMaps']),
      );
      await this.metadataVersion.incrementMetadataVersion(workspaceId, {
        queryRunner: runner,
        afterCommit,
      });
    }
    // Receipt is written by the sequence runner on this same connection.
  }
}
