import { DataSource, type QueryRunner } from 'typeorm';

import {
  ConnectedAccountProvider,
  MessageFolderImportPolicy,
} from 'twenty-shared/types';
import { type MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessagingEmailBaselineService } from 'src/modules/messaging/message-import-manager/services/messaging-email-baseline.service';

const enabled = process.env.MYAH334_FRONTIER_PHYSICAL_PG === '1';
const databaseName = 'myah334_frontier_clean_20260928';
const marker = 'MYAH334_CLEAN_FRONTIER_20260928_TASK_OWNED';

// Run only against the separately marked PG16 fixture. The outer transaction
// rolls back all evidence and credential-incarnation changes, even on failure.
describe(
  enabled
    ? 'MYAH-334 physical frontier'
    : 'MYAH-334 physical frontier (opt-in)',
  () => {
    (enabled ? it : it.skip)(
      'seals dispositions and fences a reconnect across canonical transactions',
      async () => {
        jest.useRealTimers();
        const urlString = process.env.MYAH334_FRONTIER_PHYSICAL_PG_URL;
        if (!urlString) throw new Error('Explicit marked fixture URL required');
        const url = new URL(urlString);
        if (
          url.protocol !== 'postgres:' ||
          url.hostname !== '127.0.0.1' ||
          url.port !== '32788' ||
          url.pathname !== `/${databaseName}` ||
          url.search ||
          url.hash
        )
          throw new Error('Refusing unmarked PostgreSQL target');

        const dataSource = new DataSource({ type: 'postgres', url: urlString });
        let runner: QueryRunner | undefined;
        try {
          await dataSource.initialize();
          runner = dataSource.createQueryRunner();
          await runner.connect();
          const [identity]: Array<{
            name: string;
            marker: string | null;
            version: string;
          }> = await runner.query(
            `SELECT current_database() AS name, pg_catalog.shobj_description(oid, 'pg_database') AS marker,
          current_setting('server_version_num') AS version FROM pg_database WHERE datname=current_database()`,
          );
          if (
            identity?.name !== databaseName ||
            identity.marker !== marker ||
            !identity.version.startsWith('16')
          )
            throw new Error('Task-owned PG16 identity not verified');
          const [before]: Array<{ generations: string; items: string }> =
            await runner.query(
              `SELECT (SELECT count(*) FROM core."campaignEmailBaselineGeneration") AS generations,
          (SELECT count(*) FROM core."campaignEmailBaselineItem") AS items`,
            );
          if (Number(before.generations) !== 0 || Number(before.items) !== 0)
            throw new Error('Fixture has existing Email frontier evidence');
          await runner.startTransaction();
          const [selected]: Array<{
            workspaceId: string;
            id: string;
            connectedAccountId: string;
          }> = await runner.query(
            `SELECT c."workspaceId", c."id", c."connectedAccountId"
          FROM core."messageChannel" c JOIN core."connectedAccount" a ON a."id"=c."connectedAccountId"
          WHERE a."provider"='google' AND c."messageFolderImportPolicy"='ALL_FOLDERS'
          ORDER BY c."id" LIMIT 1`,
          );
          if (!selected)
            throw new Error('No synthetic Gmail channel in fixture');
          const channel = {
            id: selected.id,
            connectedAccountId: selected.connectedAccountId,
            connectedAccount: { provider: ConnectedAccountProvider.GOOGLE },
            messageFolderImportPolicy: MessageFolderImportPolicy.ALL_FOLDERS,
            messageFolders: [],
          } as unknown as MessageChannelEntity;
          const service = new MessagingEmailBaselineService({
            getGlobalWorkspaceDataSource: async () => ({
              coreDataSource: { manager: runner!.manager, isInitialized: true },
            }),
          } as unknown as GlobalWorkspaceOrmManager);
          const incarnation = await service.snapshotIncarnation(
            channel,
            selected.workspaceId,
          );
          expect(incarnation).toBeTruthy();
          const listing = [
            {
              messageExternalIds: ['historical', 'missing'],
              messageExternalIdsToDelete: [],
              previousSyncCursor: '',
              nextSyncCursor: 'synthetic-final-cursor',
              folderId: undefined,
              initialFrontierVerified: true,
            },
          ];
          const generation = await service.recordEnumeration(
            channel,
            [],
            selected.workspaceId,
            listing,
            incarnation,
          );
          expect(generation).toBeTruthy();
          await service.recordAlreadyImported(
            selected.workspaceId,
            channel,
            generation,
            ['historical'],
          );
          await service.recordDispositionsInTransaction(runner.manager, {
            generationId: generation!,
            workspaceId: selected.workspaceId,
            messageChannelId: channel.id,
            connectedAccountId: channel.connectedAccountId,
            listedIds: ['missing'],
            importedIds: [],
            excludedIds: [],
          });
          const rows: Array<{
            providerMessageId: string;
            disposition: string;
          }> = await runner.query(
            `SELECT "providerMessageId", "disposition" FROM core."campaignEmailBaselineItem" WHERE "generationId"=$1 ORDER BY "providerMessageId"`,
            [generation],
          );
          expect(rows).toEqual([
            { providerMessageId: 'historical', disposition: 'IMPORTED' },
            { providerMessageId: 'missing', disposition: 'FAILED' },
          ]);
          expect(
            await service.finalize(selected.workspaceId, channel, generation),
          ).toBe(false);
          expect(
            await service.classifyNewIds(selected.workspaceId, channel, [
              'prospective',
            ]),
          ).toBeNull();

          // A retry must create fresh evidence; the FAILED generation cannot be certified.
          await runner.query(
            `UPDATE core."campaignEmailBaselineGeneration" SET "status"='INVALID', "isCurrent"=false WHERE "id"=$1`,
            [generation],
          );
          const retried = await service.recordEnumeration(
            channel,
            [],
            selected.workspaceId,
            listing,
            incarnation,
          );
          expect(retried).toBeTruthy();
          await service.recordAlreadyImported(
            selected.workspaceId,
            channel,
            retried,
            listing[0].messageExternalIds,
          );
          expect(
            await service.finalize(selected.workspaceId, channel, retried),
          ).toBe(true);
          const classification = await service.classifyNewIds(
            selected.workspaceId,
            channel,
            ['historical', 'prospective'],
          );
          expect(classification?.ids).toEqual(new Set(['prospective']));
          expect(
            await service.verifyLiveInTransaction(
              runner.manager,
              selected.workspaceId,
              channel,
              retried!,
              ['historical', 'prospective'],
            ),
          ).toEqual(new Set(['prospective']));

          // Reconnect between remote enumeration and insertion/finalization loses authority.
          await runner.query(
            `UPDATE core."connectedAccount" SET "campaignEmailIncarnationId"=uuid_generate_v4() WHERE "id"=$1`,
            [channel.connectedAccountId],
          );
          expect(
            await service.classifyNewIds(selected.workspaceId, channel, [
              'prospective',
            ]),
          ).toBeNull();
          expect(
            await service.verifyLiveInTransaction(
              runner.manager,
              selected.workspaceId,
              channel,
              retried!,
              ['prospective'],
            ),
          ).toEqual(new Set());
          expect(
            await service.recordEnumeration(
              channel,
              [],
              selected.workspaceId,
              listing,
              incarnation,
            ),
          ).toBeNull();
          expect(
            await service.needsInitialScan(channel, [], selected.workspaceId),
          ).toBe(true);
        } finally {
          if (runner?.isTransactionActive) await runner.rollbackTransaction();
          if (runner && !runner.isReleased) await runner.release();
          if (dataSource.isInitialized) await dataSource.destroy();
        }
      },
      30000,
    );
  },
);
