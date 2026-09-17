import { randomUUID } from 'crypto';
import {
  DataSource,
  EntitySchema,
  getMetadataArgsStorage,
  type EntityManager,
  type QueryRunner,
  type EntitySchemaColumnOptions,
} from 'typeorm';
import { AddInstagramMessageV3SnapshotFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789488000359-add-instagram-message-v3-snapshot';
import { INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/api/common/common-args-processors/data-arg-processor/utils/assert-instagram-composer-fields-not-written.util';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import { ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionExecutionReceiptEntity } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { InstagramActionLimitBlockEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-limit-block.entity';
import { InstagramActionReservationEntity } from 'src/engine/core-modules/instagram-action-budget/entities/instagram-action-reservation.entity';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { workspaceContextStorage } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { InstagramMessageAuthorityReaderService } from '../instagram-message-authority-reader.service';
import { INSTAGRAM_COMPOSER_STORAGE_FIELDS } from '../instagram-message-composer-readiness.util';
import { InstagramMessageComposerService } from '../instagram-message-composer.service';
import { InstagramMessageDraftLockService } from '../instagram-message-draft-lock.service';
import { InstagramMessagePermissionService } from '../instagram-message-permission.service';
import { InstagramMessageRecipientService } from '../instagram-message-recipient.service';
import { InstagramMessageReconciliationService } from '../instagram-message-reconciliation.service';
import { InstagramMessageRecordAccessService } from '../instagram-message-record-access.service';
import { InstagramMessageSendService } from '../instagram-message-send.service';

// Native TypeORM repositories, transactions, enums, constraints and relations.
// Relocation is test-only: no runtime core table is created or changed.
class ComposerFixtureDataSource extends DataSource {
  fixtureSchema = '';
  afterStatement?: (sql: string) => Promise<void>;
  override createQueryRunner(mode: 'master' | 'slave' = 'master') {
    const runner = super.createQueryRunner(mode);
    const nativeQuery = runner.query.bind(runner);
    runner.query = async (
      sql: string,
      parameters?: unknown[],
      structured?: true,
    ) => {
      if (/CREATE\s+EXTENSION/i.test(sql))
        throw new Error('Fixture must never create extensions');
      const relocatedSql = sql
        .split('"core".')
        .join(`"${this.fixtureSchema}".`)
        .replace(
          /\bcore\.application\b/g,
          `"${this.fixtureSchema}".application`,
        );
      const result = structured
        ? await nativeQuery(relocatedSql, parameters, true)
        : await nativeQuery(relocatedSql, parameters);
      await this.afterStatement?.(sql);
      return result;
    };
    return runner;
  }
}

const barrier = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

const isolatedUrl = process.env.MYAH359_ISOLATED_POSTGRES_URL;
const describePostgres = isolatedUrl ? describe : describe.skip;

// No default endpoint: a skipped suite is NOT RUN, never database evidence.
describePostgres('InstagramMessageComposer isolated PostgreSQL', () => {
  let database: DataSource;
  let ownsSchema = false;
  const schema = `myah359_${randomUUID().split('-').join('')}`;
  const executeFixtureSql = (sql: string, parameters?: unknown[]) => {
    if (/CREATE\s+EXTENSION/i.test(sql))
      throw new Error('Fixture must never create extensions');
    if (!/^myah359_[a-f0-9]{32}$/.test(schema))
      throw new Error('Invalid UUID fixture schema');
    return database.query(sql, parameters);
  };
  const assertPristineCatalog = async () => {
    expect(
      await executeFixtureSql(
        `SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY e.extname`,
      ),
    ).toEqual([{ extname: 'plpgsql', nspname: 'pg_catalog' }]);
    expect(
      await executeFixtureSql(
        `SELECT count(*)::int AS count FROM pg_class WHERE relnamespace = 'public'::regnamespace`,
      ),
    ).toEqual([{ count: 0 }]);
    expect(
      await executeFixtureSql(
        `SELECT count(*)::int AS count FROM pg_proc WHERE pronamespace = 'public'::regnamespace`,
      ),
    ).toEqual([{ count: 0 }]);
  };
  const table = `"${schema}"."actionApprovalBinding"`;
  const workspaceId = randomUUID();
  const draftId = randomUUID();
  const snapshot = {
    publicIdentifier: 'recipient',
    providerId: 'profile-001',
    providerMessagingId: 'messaging-009',
    creatorRecordId: randomUUID(),
    accountBindingId: randomUUID(),
    instagramAccountRecordId: randomUUID(),
    unipileAccountId: 'fake-account',
    instagramUserId: 'fake-instagram-user',
    recipientSourceValues: [{ field: 'instagramUsername', value: 'recipient' }],
    actionKind: 'START_CHAT',
    conversationRecordId: null,
    providerChatId: null,
    attendeeProviderId: null,
  };
  const command = new AddInstagramMessageV3SnapshotFastInstanceCommand();
  const upgradeRunner = () =>
    ({
      // Execute the actual command, relocating ONLY its fixed core namespace
      // into this UUID fixture schema. Never create/drop the runtime core schema.
      query: (sql: string) =>
        executeFixtureSql(sql.split('"core".').join(`"${schema}".`)),
    }) as QueryRunner;

  beforeAll(async () => {
    jest.useRealTimers();
    if (process.env.PG_DATABASE_URL !== undefined)
      throw new Error('Ambient PG_DATABASE_URL must be absent');
    const endpoint = new URL(isolatedUrl!);
    if (
      !['postgres:', 'postgresql:'].includes(endpoint.protocol) ||
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      !/^\/myah359_[a-f0-9]{20}$/.test(endpoint.pathname) ||
      !/^myah359_[a-f0-9]{20}$/.test(endpoint.username) ||
      !/^[a-f0-9]{64}$/.test(endpoint.password) ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error(
        'MYAH359 dedicated endpoint guard rejected configuration',
      );
    database = new DataSource({
      type: 'postgres',
      url: isolatedUrl,
      connectTimeoutMS: 2000,
      installExtensions: false,
      uuidExtension: 'pgcrypto',
      extra: { max: 12, statement_timeout: 5000 },
    });
    await database.initialize();
    const [identity] = await executeFixtureSql(
      'SELECT current_database() AS database, current_user AS principal',
    );
    if (
      identity.database !== endpoint.pathname.slice(1) ||
      identity.principal !== endpoint.username
    )
      throw new Error('MYAH359 dedicated database/principal guard failed');
    await assertPristineCatalog();
    await executeFixtureSql(`CREATE SCHEMA "${schema}"`);
    ownsSchema = true;
    await executeFixtureSql(`CREATE TABLE ${table} (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "actionName" text NOT NULL DEFAULT 'send_instagram_message',
      "actionVersion" integer NOT NULL DEFAULT 3,
      "actionKind" text DEFAULT 'START_CHAT',
      "draftId" uuid NOT NULL DEFAULT '${draftId}',
      "threadId" uuid,
      "interactionContextType" text DEFAULT 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
      "interactionContextId" uuid DEFAULT '${draftId}',
      "status" text DEFAULT 'APPROVED'
    )`);
    await executeFixtureSql(
      `INSERT INTO ${table} ("actionVersion", "interactionContextType") VALUES (2, 'MYAH_INBOX_INSTAGRAM_DRAFT')`,
    );
    await executeFixtureSql(
      `INSERT INTO ${table} ("actionVersion", "actionKind", "interactionContextType") VALUES (2, 'REPLY', 'MYAH_INBOX_INSTAGRAM_DRAFT')`,
    );
  });

  afterAll(async () => {
    if (database?.isInitialized) {
      // Only the UUID schema created after successful endpoint/identity guards.
      if (ownsSchema)
        await executeFixtureSql(`DROP SCHEMA "${schema}" CASCADE`);
      try {
        if (ownsSchema) await assertPristineCatalog();
      } finally {
        await database.destroy();
      }
    }
  });

  it('applies the actual v3 upgrade twice while preserving legacy rows', async () => {
    await command.up(upgradeRunner());
    await command.up(upgradeRunner());
    expect(
      await executeFixtureSql(
        `SELECT "actionVersion", "instagramMessageSnapshot", "composerInputDigest" FROM ${table}`,
      ),
    ).toEqual([
      {
        actionVersion: 2,
        instagramMessageSnapshot: null,
        composerInputDigest: null,
      },
      {
        actionVersion: 2,
        instagramMessageSnapshot: null,
        composerInputDigest: null,
      },
    ]);
  });

  it('inserts a complete v3 START and rejects immutable snapshot/digest mutations', async () => {
    const [row] = await executeFixtureSql(
      `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest") VALUES ($1, $2) RETURNING "id"`,
      [snapshot, 'a'.repeat(64)],
    );
    await expect(
      executeFixtureSql(
        `UPDATE ${table} SET "instagramMessageSnapshot" = $1 WHERE "id" = $2`,
        [{ ...snapshot, providerId: 'changed' }, row.id],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      executeFixtureSql(
        `UPDATE ${table} SET "composerInputDigest" = $1 WHERE "id" = $2`,
        ['b'.repeat(64), row.id],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      executeFixtureSql(
        `UPDATE ${table} SET "status" = 'EXPIRED' WHERE "id" = $1`,
        [row.id],
      ),
    ).resolves.toBeDefined();
    await command.up(upgradeRunner());
    expect(
      await executeFixtureSql(
        `SELECT "instagramMessageSnapshot", "composerInputDigest" FROM ${table} WHERE "id" = $1`,
        [row.id],
      ),
    ).toEqual([
      {
        instagramMessageSnapshot: snapshot,
        composerInputDigest: 'a'.repeat(64),
      },
    ]);
  });

  it.each(
    Object.keys(snapshot).flatMap((field) =>
      ['missing', 'null', 'wrong-type']
        .filter(
          (kind) =>
            !(
              kind === 'null' &&
              [
                'conversationRecordId',
                'providerChatId',
                'attendeeProviderId',
              ].includes(field)
            ),
        )
        .map((kind) => ({ field, kind })),
    ),
  )('rejects $field $kind snapshot data', async ({ field, kind }) => {
    // Explicit JSON null is required only for START target fields.
    const value: Record<string, unknown> = { ...snapshot };
    if (kind === 'missing') delete value[field];
    else value[field] = kind === 'null' ? null : 123;
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest") VALUES ($1, $2)`,
        [value, 'a'.repeat(64)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each([null, {}, [], 1, 'snapshot'])(
    'rejects incomplete snapshot %j',
    async (value) => {
      await expect(
        executeFixtureSql(
          `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest") VALUES ($1::jsonb, $2)`,
          [value === null ? null : JSON.stringify(value), 'a'.repeat(64)],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it('enforces START/REPLY route and direct/thread context constraints', async () => {
    const reply = {
      ...snapshot,
      actionKind: 'REPLY',
      conversationRecordId: randomUUID(),
      providerChatId: 'fake-chat',
      attendeeProviderId: snapshot.providerMessagingId,
    };
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("actionKind", "instagramMessageSnapshot") VALUES ('REPLY', $1)`,
        [reply],
      ),
    ).resolves.toBeDefined();
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("actionKind", "instagramMessageSnapshot", "threadId", "interactionContextType", "interactionContextId") VALUES ('REPLY', $1, $2, NULL, NULL)`,
        [reply, randomUUID()],
      ),
    ).resolves.toBeDefined();
    for (const value of [
      snapshot,
      { ...reply, attendeeProviderId: snapshot.providerId },
      { ...reply, conversationRecordId: null },
      { ...reply, providerChatId: '' },
    ]) {
      await expect(
        executeFixtureSql(
          `INSERT INTO ${table} ("actionKind", "instagramMessageSnapshot") VALUES ('REPLY', $1)`,
          [value],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    for (const context of ['MYAH_INBOX_INSTAGRAM_DRAFT', null]) {
      await expect(
        executeFixtureSql(
          `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest", "interactionContextType") VALUES ($1, $2, $3)`,
          [snapshot, 'a'.repeat(64), context],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest", "interactionContextId") VALUES ($1, $2, $3)`,
        [snapshot, 'a'.repeat(64), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest", "threadId", "interactionContextType", "interactionContextId") VALUES ($1, $2, $3, NULL, NULL)`,
        [snapshot, 'a'.repeat(64), randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each(
    ['conversationRecordId', 'providerChatId', 'attendeeProviderId'].flatMap(
      (field) =>
        ['missing', 'null', 'wrong-type', 'empty'].map((kind) => ({
          field,
          kind,
        })),
    ),
  )('rejects REPLY $field $kind', async ({ field, kind }) => {
    const reply: Record<string, unknown> = {
      ...snapshot,
      actionKind: 'REPLY',
      conversationRecordId: randomUUID(),
      providerChatId: 'fake-chat',
      attendeeProviderId: snapshot.providerMessagingId,
    };
    if (kind === 'missing') delete reply[field];
    else reply[field] = kind === 'null' ? null : kind === 'empty' ? '' : 123;
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("actionKind", "instagramMessageSnapshot") VALUES ('REPLY', $1)`,
        [reply],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it.each([null, '', 'not-a-digest'])(
    'rejects START missing/malformed composer digest %j',
    async (digest) => {
      await expect(
        executeFixtureSql(
          `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest") VALUES ($1, $2)`,
          [snapshot, digest],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );

  it('rejects mixed v2/non-Instagram snapshots and preserves opaque strings exactly', async () => {
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("actionVersion", "interactionContextType", "instagramMessageSnapshot") VALUES (2, 'MYAH_INBOX_INSTAGRAM_DRAFT', $1)`,
        [snapshot],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      executeFixtureSql(
        `INSERT INTO ${table} ("actionName", "actionKind", "threadId", "interactionContextType", "interactionContextId", "instagramMessageSnapshot") VALUES ('other_action', NULL, $1, NULL, NULL, $2)`,
        [randomUUID(), snapshot],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const opaqueSnapshot = {
      ...snapshot,
      providerId: ' profile:ABC ',
      providerMessagingId: ' opaque:009 ',
    };
    const [row] = await executeFixtureSql(
      `INSERT INTO ${table} ("instagramMessageSnapshot", "composerInputDigest") VALUES ($1, $2) RETURNING "instagramMessageSnapshot"`,
      [opaqueSnapshot, 'a'.repeat(64)],
    );
    expect(row.instagramMessageSnapshot).toEqual(opaqueSnapshot);
  });

  it('rejects populated rollback; restores valid v2 SQL after fixture-only v3 cleanup and upgrades again', async () => {
    await expect(command.down(upgradeRunner())).rejects.toThrow(
      'Cannot roll back populated Instagram v3 snapshots',
    );
    await executeFixtureSql(`DELETE FROM ${table} WHERE "actionVersion" = 3`);
    const legacyBefore = await executeFixtureSql(
      `SELECT * FROM ${table} ORDER BY "id"`,
    );
    await command.down(upgradeRunner());
    await command.up(upgradeRunner());
    await command.up(upgradeRunner());
    expect(
      await executeFixtureSql(`SELECT * FROM ${table} ORDER BY "id"`),
    ).toEqual(legacyBefore);
  });

  const fixtureSources: ComposerFixtureDataSource[] = [];
  const fixtureSchemas: string[] = [];
  const createComposerFixture = async () => {
    const fixtureWorkspaceId = randomUUID();
    const workspaceSchema = getWorkspaceSchemaName(fixtureWorkspaceId);
    const coreSchema = `myah359_${randomUUID().split('-').join('')}`;
    const memberId = randomUUID();
    const userId = randomUUID();
    const accountId = randomUUID();
    const bindingId = randomUUID();
    const applicationId = randomUUID();
    if (
      !/^workspace_[a-z0-9]+$/.test(workspaceSchema) ||
      !/^myah359_[a-f0-9]{32}$/.test(coreSchema)
    )
      throw new Error('Invalid fixture schema');
    await executeFixtureSql(
      `CREATE SCHEMA "${coreSchema}"; CREATE SCHEMA "${workspaceSchema}"`,
    );
    fixtureSchemas.push(coreSchema, workspaceSchema);
    const uuid: EntitySchemaColumnOptions = { type: 'uuid', nullable: true };
    const text: EntitySchemaColumnOptions = { type: 'text', nullable: true };
    const date: EntitySchemaColumnOptions = {
      type: 'timestamptz',
      nullable: true,
    };
    const id: EntitySchemaColumnOptions = {
      type: 'uuid',
      primary: true,
      generated: 'uuid',
    };
    const entity = (
      name: string,
      tableName: string,
      columns: Record<string, EntitySchemaColumnOptions>,
      schemaName = workspaceSchema,
    ) =>
      new EntitySchema({
        name,
        tableName,
        schema: schemaName,
        columns: { id, ...columns },
      });
    const source = new ComposerFixtureDataSource({
      type: 'postgres',
      url: isolatedUrl,
      connectTimeoutMS: 2000,
      installExtensions: false,
      uuidExtension: 'pgcrypto',
      extra: { max: 12, statement_timeout: 5000 },
      entities: [
        ...[
          ActionApprovalBindingEntity,
          ActionApprovalBindingEvidenceLinkEntity,
          ActionExecutionReceiptEntity,
          InstagramActionReservationEntity,
          InstagramActionLimitBlockEntity,
        ].map((target) => {
          const metadata = getMetadataArgsStorage();
          const columns = Object.fromEntries(
            metadata.columns
              .filter((column) => column.target === target)
              .map((column) => {
                if (!column.options.type)
                  throw new Error('Fixture requires explicit column types');
                const {
                  generated: _generated,
                  spatialFeatureType,
                  ...options
                } = column.options;
                if (spatialFeatureType)
                  throw new Error('Unexpected spatial fixture column');
                return [
                  column.propertyName,
                  {
                    ...options,
                    type: column.options.type,
                    precision: options.precision ?? undefined,
                    scale: options.scale ?? undefined,
                    ...(column.mode === 'createDate'
                      ? { createDate: true }
                      : column.mode === 'updateDate'
                        ? { updateDate: true }
                        : {}),
                    ...(metadata.generations.some(
                      (generation) =>
                        generation.target === target &&
                        generation.propertyName === column.propertyName,
                    )
                      ? { generated: 'uuid' as const }
                      : {}),
                  },
                ];
              }),
          );
          const relations = Object.fromEntries(
            metadata.relations
              .filter((relation) => relation.target === target)
              .map((relation) => [
                relation.propertyName,
                {
                  type: relation.relationType,
                  target: (relation.type as () => { name: string })().name,
                  inverseSide:
                    typeof relation.inverseSideProperty === 'function'
                      ? String(
                          relation.inverseSideProperty(
                            new Proxy(
                              {},
                              { get: (_target, property) => property },
                            ),
                          ),
                        )
                      : relation.inverseSideProperty,
                  ...relation.options,
                  ...(relation.relationType === 'many-to-one'
                    ? {
                        joinColumn: metadata.joinColumns
                          .filter(
                            (join) =>
                              join.target === target &&
                              join.propertyName === relation.propertyName,
                          )
                          .map((join) => ({
                            name: join.name,
                            referencedColumnName: join.referencedColumnName,
                          })),
                      }
                    : {}),
                },
              ]),
          );
          return new EntitySchema({
            name: target.name,
            target,
            schema: coreSchema,
            tableName: metadata.tables.find((table) => table.target === target)!
              .name,
            columns,
            relations,
            checks: metadata.checks
              .filter((check) => check.target === target)
              .map((check) => ({
                name: check.name,
                expression: check.expression,
              })),
            indices: metadata.indices
              .filter((index) => index.target === target)
              .map((index) => ({
                name: index.name,
                columns: index.columns as string[],
                unique: index.unique,
                where: index.where,
              })),
            uniques: metadata.uniques
              .filter((unique) => unique.target === target)
              .map((unique) => ({
                name: unique.name,
                columns: unique.columns as string[],
              })),
          });
        }),
        new EntitySchema({
          name: 'WorkspaceEntity',
          target: WorkspaceEntity,
          schema: coreSchema,
          tableName: 'workspace',
          columns: { id },
        }),
        entity(
          'accountBinding',
          'accountBinding',
          {
            workspaceId: uuid,
            workspaceInstagramAccountRecordId: uuid,
            unipileAccountId: text,
            instagramUserId: text,
            status: text,
            deactivatedAt: date,
          },
          coreSchema,
        ),
        entity(
          'applicationFixture',
          'application',
          { workspaceId: uuid, universalIdentifier: text, deletedAt: date },
          coreSchema,
        ),
        entity('creator', 'creator', {
          instagramUsername: text,
          instagramUrl: text,
          instagramLinkPrimaryLinkUrl: text,
          deletedAt: date,
        }),
        entity('myahInstagramAccount', '_myahInstagramAccount', {
          label: text,
          status: text,
          unipileAccountId: text,
          deletedAt: date,
        }),
        entity('myahSocialConversation', '_myahSocialConversation', {
          creatorId: uuid,
          instagramAccountId: uuid,
          providerConversationId: text,
          recipientIgsid: text,
          recipientUsername: text,
          provider: text,
          lifecycle: text,
          deletedAt: date,
        }),
        entity('myahInstagramReplyDraft', '_myahInstagramReplyDraft', {
          name: text,
          title: text,
          body: text,
          kind: text,
          status: text,
          source: text,
          creatorId: uuid,
          conversationId: uuid,
          recipientUsername: text,
          recipientProviderId: text,
          revision: { type: 'integer' },
          composerInputDigest: text,
          instagramMessageSnapshot: { type: 'jsonb', nullable: true },
          createdByWorkspaceMemberId: uuid,
          sentAt: date,
          deletedAt: date,
        }),
      ],
    });
    source.fixtureSchema = coreSchema;
    await source.initialize();
    fixtureSources.push(source);
    await assertPristineCatalog();
    await source.synchronize();
    await assertPristineCatalog();
    const migrationRunner = source.createQueryRunner();
    try {
      await command.up(migrationRunner);
    } finally {
      await migrationRunner.release();
    }
    await source
      .getRepository(WorkspaceEntity)
      .insert({ id: fixtureWorkspaceId });
    await source.getRepository('applicationFixture').insert({
      id: applicationId,
      workspaceId: fixtureWorkspaceId,
      universalIdentifier: INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER,
    });
    await source.getRepository('accountBinding').insert({
      id: bindingId,
      workspaceId: fixtureWorkspaceId,
      workspaceInstagramAccountRecordId: accountId,
      unipileAccountId: 'fake-account',
      instagramUserId: 'fake-instagram-user',
      status: 'ACTIVE',
    });
    await source.getRepository('myahInstagramAccount').insert({
      id: accountId,
      label: 'Fake Instagram',
      status: 'ACTIVE',
      unipileAccountId: 'fake-account',
    });
    const objectDefinitions = [
      ['2d357469-831a-4629-ad4b-47335900e883', 'myahInstagramAccount'],
      ['85762d24-541b-407f-9d6a-cdf89552c665', 'myahInstagramReplyDraft'],
      ['36817464-855f-42db-9fbb-f8853643f8d6', 'myahSocialConversation'],
      ['5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator'],
    ].map(([universalIdentifier, nameSingular]) => ({
      id: randomUUID(),
      universalIdentifier,
      nameSingular,
      workspaceId: fixtureWorkspaceId,
      isActive: true,
      applicationId,
      fieldIds: [] as string[],
    }));
    const draftObject = objectDefinitions[1];
    const creatorObject = objectDefinitions[3];
    const fields = [
      ...INSTAGRAM_COMPOSER_STORAGE_FIELDS.map((field) => ({
        ...field,
        id: randomUUID(),
        objectMetadataId: draftObject.id,
        workspaceId: fixtureWorkspaceId,
        applicationId,
        isActive: true,
        isNullable: true,
      })),
      ...['id', 'instagramUsername'].map((name) => ({
        id: randomUUID(),
        universalIdentifier: randomUUID(),
        name,
        type: name === 'id' ? 'UUID' : 'TEXT',
        objectMetadataId: creatorObject.id,
        workspaceId: fixtureWorkspaceId,
        applicationId,
        isActive: true,
        isNullable: true,
      })),
    ];
    for (const object of objectDefinitions)
      object.fieldIds = fields
        .filter((field) => field.objectMetadataId === object.id)
        .map((field) => field.id);
    const flatMaps = (rows: typeof fields | typeof objectDefinitions) => ({
      byUniversalIdentifier: Object.fromEntries(
        rows.map((row) => [row.universalIdentifier, row]),
      ),
      universalIdentifierById: Object.fromEntries(
        rows.map((row) => [row.id, row.universalIdentifier]),
      ),
      universalIdentifiersByApplicationId: {},
    });
    const context = {
      authContext: { workspace: { id: fixtureWorkspaceId } },
      flatObjectMetadataMaps: flatMaps(objectDefinitions),
      flatFieldMetadataMaps: flatMaps(fields),
      objectIdByNameSingular: Object.fromEntries(
        objectDefinitions.map((object) => [object.nameSingular, object.id]),
      ),
    };
    const authenticatedContext = {
      workspaceId: fixtureWorkspaceId,
      initiatorUserWorkspaceId: userId,
      workspaceMemberId: memberId,
      rolePermissionConfig: { unionOf: ['fixture-role'] },
    };
    const run = <T>(operation: () => Promise<T>) =>
      workspaceContextStorage.run(context as never, operation);
    // Workspace repositories adapt the existing manager-position/actor-column
    // convention to native TypeORM; no locks, decisions or durable writes are faked.
    // Permission arguments are asserted, not enforced by this native adapter.
    // Real workspace permission enforcement is covered in persistence-boundaries.
    const conversationPermissionConfigs: unknown[] = [];
    const orm = {
      getGlobalWorkspaceDataSource: async () => source,
      executeInWorkspaceContext: async (operation: () => Promise<unknown>) =>
        operation(),
      getRepository: async (
        _workspace: string,
        name: string,
        role?: unknown,
      ) => {
        if (name === 'myahSocialConversation') {
          expect([
            { shouldBypassPermissionChecks: true },
            authenticatedContext.rolePermissionConfig,
          ]).toContainEqual(role);
          conversationPermissionConfigs.push(role);
        }
        return {
          internalContext: context,
          objectRecordsPermissions: {
            [creatorObject.id]: {
              canReadObjectRecords: true,
              canUpdateObjectRecords: true,
              canSoftDeleteObjectRecords: false,
              canDestroyObjectRecords: false,
              restrictedFields: {},
              rowLevelPermissionPredicates: [],
              rowLevelPermissionPredicateGroups: [],
            },
          },
          find: (options: never, manager?: EntityManager) =>
            (manager ?? source.manager).getRepository(name).find(options),
          findOne: (options: never, manager?: EntityManager) =>
            (manager ?? source.manager).getRepository(name).findOne(options),
          insert: async (
            values: Record<string, unknown>,
            manager: EntityManager,
            columns: string[],
          ) => {
            expect(columns).toEqual(['id']);
            const { createdBy, updatedBy: _updatedBy, ...stored } = values;
            if (createdBy)
              stored.createdByWorkspaceMemberId = (
                createdBy as { workspaceMemberId: string }
              ).workspaceMemberId;
            return manager.getRepository(name).insert(stored);
          },
        };
      },
    };
    const accounts = {
      find: (_workspace: string, options: never) =>
        source.getRepository('accountBinding').find(options),
      findOne: (_workspace: string, options: never) =>
        source.getRepository('accountBinding').findOne(options),
    };
    const writes: unknown[] = [];
    let messagingId = 'messaging-009';
    let chats: Array<{
      chatId: string;
      accountId: string;
      type: string;
      attendeeProviderId: string;
    }> = [];
    let requestedHandle: string | undefined;
    let providerFault: 'none' | 'after-marker' | 'after-acceptance' = 'none';
    let beforeProfile: (() => Promise<void>) | undefined;
    const provider = {
      getInstagramMessagingProfile: async (input: { username: string }) => {
        await beforeProfile?.();
        return {
          username: requestedHandle ?? input.username,
          providerId: 'profile-001',
          providerMessagingId: messagingId,
        };
      },
      listChats: async () => ({ chats, nextCursor: null }),
      listMessages: async () => ({ messages: [], nextCursor: null }),
      getChat: async () => ({
        chatId: 'fake-chat',
        accountId: 'fake-account',
        type: 'ONE_TO_ONE',
        attendeeProviderId: messagingId,
      }),
      startChat: async (
        input: unknown,
        options: { beforeDispatch: () => Promise<void> },
      ) => {
        await options.beforeDispatch();
        if (providerFault === 'after-marker')
          throw new Error('fault after durable attempt marker');
        writes.push(input);
        if (providerFault === 'after-acceptance')
          throw new Error(
            'fault after fake provider accepted before receipt persistence',
          );
        return {
          kind: 'ACCEPTED',
          value: { chatId: 'fake-chat', messageId: 'fake-message' },
        };
      },
      sendMessage: async () => {
        throw new Error('START must never silently convert to REPLY');
      },
    };
    const permissions = new InstagramMessagePermissionService({
      hasToolPermission: async () => true,
    } as never);
    const access = new InstagramMessageRecordAccessService(
      orm as never,
      accounts as never,
    );
    const budget = new InstagramActionBudgetService(source);
    const recipients = new InstagramMessageRecipientService(
      orm as never,
      access,
      permissions,
      budget,
      provider as never,
      {
        upsertVerifiedChat: async () => ({ conversationRecordId: 'c' }),
      } as never,
      { findOne: async () => null } as never,
    );
    const authority = new InstagramMessageAuthorityReaderService(
      { findOneBy: async () => ({ id: fixtureWorkspaceId }) } as never,
      orm as never,
      accounts as never,
      { find: async () => objectDefinitions } as never,
      provider as never,
    );
    const approvals = new ActionApprovalService(source, {} as never);
    const locks = new InstagramMessageDraftLockService(source);
    const sender = new InstagramMessageSendService(
      approvals,
      authority,
      locks,
      budget,
      provider as never,
      { projectReceiptWithWriter: async () => ({ projected: false }) } as never,
      {} as never,
      permissions,
      access,
    );
    const reconciliation = new InstagramMessageReconciliationService(
      {
        findOne: (_workspace: string, options: never) =>
          source.getRepository(ActionExecutionReceiptEntity).findOne(options),
      } as never,
      {
        findOne: (_workspace: string, options: never) =>
          source
            .getRepository(InstagramActionReservationEntity)
            .findOne(options),
      } as never,
      approvals,
      authority,
      provider as never,
      {} as never,
      {} as never,
      budget,
    );
    const composer = new InstagramMessageComposerService(
      orm as never,
      recipients,
      permissions,
      locks,
      approvals,
      sender,
    );
    const prepare = async (recipient = { rawHandle: 'recipient' }) =>
      run(async () => {
        const prepared = await recipients.resolve(
          { recipient },
          authenticatedContext,
        );
        return {
          recipient,
          draftId: randomUUID(),
          expectedAccountRecordId: accountId,
          expectedPreparationFingerprint: prepared.preparationFingerprint,
          body: 'hello',
        };
      });
    return {
      source,
      coreSchema,
      workspaceSchema,
      accountId,
      bindingId,
      fixtureWorkspaceId,
      writes,
      budget,
      composer,
      approvals,
      recipients,
      reconciliation,
      conversationPermissionConfigs,
      prepare,
      run,
      authenticatedContext,
      send: (input: Awaited<ReturnType<typeof prepare>>) =>
        run(() => composer.send(input, authenticatedContext)),
      setProfile: (handle: string, idValue: string) => {
        requestedHandle = handle;
        messagingId = idValue;
      },
      setExistingChat: async (exists: boolean) => {
        chats = exists
          ? [
              {
                chatId: 'fake-chat',
                accountId: 'fake-account',
                type: 'ONE_TO_ONE',
                attendeeProviderId: messagingId,
              },
            ]
          : [];
        if (exists)
          await source.getRepository('myahSocialConversation').insert({
            id: randomUUID(),
            instagramAccountId: accountId,
            providerConversationId: 'fake-chat',
            recipientIgsid: messagingId,
            recipientUsername: 'recipient',
            provider: 'UNIPILE',
            lifecycle: 'ACTIVE',
          });
        else
          await source
            .getRepository('myahSocialConversation')
            .delete({ providerConversationId: 'fake-chat' });
      },
      setFault: (fault: typeof providerFault) => {
        providerFault = fault;
      },
      setBeforeProfile: (hook?: () => Promise<void>) => {
        beforeProfile = hook;
      },
    };
  };

  afterEach(async () => {
    for (const source of fixtureSources.splice(0))
      if (source.isInitialized) await source.destroy();
    for (const fixtureSchema of fixtureSchemas.splice(0))
      await executeFixtureSql(`DROP SCHEMA "${fixtureSchema}" CASCADE`);
  });

  it('runs the actual composer/approval/budget/sender chain with one durable receipt and reservation', async () => {
    const h = await createComposerFixture();
    const input = await h.prepare();
    const sent = await h.send(input);
    expect(sent.status).toBe('PROVIDER_ACCEPTED');
    expect(await h.send(input)).toEqual(sent);
    expect(h.writes).toEqual([
      { accountId: 'fake-account', attendeeId: 'messaging-009', text: 'hello' },
    ]);
    expect(
      await executeFixtureSql(
        `SELECT count(*)::int AS count FROM "${h.workspaceSchema}".creator WHERE "instagramUsername" = $1`,
        ['recipient'],
      ),
    ).toEqual([{ count: 1 }]);
    expect(
      await executeFixtureSql(
        `SELECT count(*)::int AS count FROM "${h.coreSchema}"."instagramActionReservation" WHERE "actionExecutionReceiptId" = $1`,
        [sent.receiptId],
      ),
    ).toEqual([{ count: 1 }]);
    await expect(h.send({ ...input, body: 'changed' })).rejects.toThrow(
      'Instagram composer input changed',
    );
  });

  const waitForDatabaseWaiter = async (locktype: 'advisory' | 'relation') => {
    for (let i = 0; i < 100; i++) {
      const [row] = await executeFixtureSql(
        `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = $1 AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
        [locktype],
      );
      if (row.count > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`No actual PostgreSQL ${locktype} waiter`);
  };

  it.each(['same-attempt', 'different-attempt'] as const)(
    'serializes concurrent %s raw-handle sends through actual composer locks',
    async (attempt) => {
      const h = await createComposerFixture();
      const input = await h.prepare();
      const reached = barrier();
      const resume = barrier();
      let profiles = 0;
      h.setBeforeProfile(async () => {
        if (++profiles === 1) {
          reached.release();
          await resume.promise;
        }
      });
      const first = h.send(input);
      await reached.promise;
      const second = h.send(
        attempt === 'same-attempt'
          ? input
          : { ...input, draftId: randomUUID() },
      );
      const results = Promise.allSettled([first, second]);
      try {
        await waitForDatabaseWaiter('advisory');
      } finally {
        resume.release();
      }
      const outcomes = await results;
      expect(outcomes).toHaveLength(2);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(h.writes).toHaveLength(1);
      expect(
        await executeFixtureSql(
          `SELECT count(*)::int AS count FROM "${h.workspaceSchema}".creator WHERE "instagramUsername" = $1`,
          ['recipient'],
        ),
      ).toEqual([{ count: 1 }]);
      expect(
        await executeFixtureSql(
          `SELECT count(*)::int AS count FROM "${h.coreSchema}"."actionExecutionReceipt"`,
        ),
      ).toEqual([{ count: 1 }]);
      const firstResult = await first;
      expect(
        await executeFixtureSql(
          `SELECT count(*)::int AS count FROM "${h.coreSchema}"."instagramActionReservation" WHERE "actionExecutionReceiptId" = $1`,
          [firstResult.receiptId],
        ),
      ).toEqual([{ count: 1 }]);
      // The loser fails closed on discovery drift; subsequent read/replay preserves
      // the existing receipt rather than manufacturing an accidental REPLY.
      expect(await h.send(input)).toEqual(firstResult);
      expect(h.writes).toHaveLength(1);
      await expect(
        h.send({ ...input, body: 'different body' }),
      ).rejects.toThrow('Instagram composer input changed');
    },
  );

  it('serializes different handles for the same immutable START messaging target through the actual budget', async () => {
    const h = await createComposerFixture();
    const firstInput = await h.prepare({ rawHandle: 'recipient' });
    const secondInput = await h.prepare({ rawHandle: 'secondhandle' });
    const both = barrier();
    const resume = barrier();
    let arrived = 0;
    h.setBeforeProfile(async () => {
      if (++arrived <= 2) {
        if (arrived === 2) both.release();
        await resume.promise;
      }
    });
    const accountLockAcquired = barrier();
    const releaseAccountLock = barrier();
    let accountLocks = 0;
    h.source.afterStatement = async (sql) => {
      if (sql.includes('pg_advisory_xact_lock') && ++accountLocks === 1) {
        accountLockAcquired.release();
        await releaseAccountLock.promise;
      }
    };
    const first = h.send(firstInput);
    const second = h.send(secondInput);
    const settled = Promise.allSettled([first, second]);
    await both.promise;
    resume.release();
    await accountLockAcquired.promise;
    try {
      await waitForDatabaseWaiter('advisory');
    } finally {
      releaseAccountLock.release();
    }
    expect(await settled).toHaveLength(2);
    expect(accountLocks).toBe(2);
    expect(h.writes.length).toBeLessThanOrEqual(1);
    const [reservations] = await executeFixtureSql(
      `SELECT count(*)::int AS count FROM "${h.coreSchema}"."instagramActionReservation" WHERE "targetLockReleasedAt" IS NULL`,
    );
    expect(reservations.count).toBeLessThanOrEqual(1);
    const [receipts] = await executeFixtureSql(
      `SELECT count(*)::int AS count FROM "${h.coreSchema}"."actionExecutionReceipt" WHERE "state" IN ('PROVIDER_ACCEPTED', 'UNKNOWN')`,
    );
    expect(receipts.count).toBe(h.writes.length);
  });

  it.each(['alias', 'reassignment'] as const)(
    'fails closed when a prepared handle has %s provider evidence',
    async (kind) => {
      const h = await createComposerFixture();
      const input = await h.prepare();
      h.setProfile(
        kind === 'alias' ? 'canonical.other' : 'recipient',
        kind === 'alias' ? 'messaging-009' : 'reassigned-messaging-id',
      );
      await expect(h.send(input)).rejects.toThrow();
      expect(h.writes).toHaveLength(0);
      expect(await h.source.getRepository('creator').find()).toHaveLength(0);
      expect(
        await h.source.getRepository(ActionExecutionReceiptEntity).find(),
      ).toHaveLength(0);
    },
  );

  it.each(['START-to-REPLY', 'REPLY-to-START'] as const)(
    'rejects %s drift without converting the approved route',
    async (change) => {
      const h = await createComposerFixture();
      if (change === 'REPLY-to-START') await h.setExistingChat(true);
      const input = await h.prepare();
      expect(h.conversationPermissionConfigs).toEqual([
        { shouldBypassPermissionChecks: true },
        ...(change === 'REPLY-to-START'
          ? [h.authenticatedContext.rolePermissionConfig]
          : []),
      ]);
      h.conversationPermissionConfigs.length = 0;
      await h.setExistingChat(change === 'START-to-REPLY');
      await expect(h.send(input)).rejects.toThrow(
        'Instagram composer context changed',
      );
      expect(h.conversationPermissionConfigs).toEqual([
        { shouldBypassPermissionChecks: true },
        ...(change === 'START-to-REPLY'
          ? [h.authenticatedContext.rolePermissionConfig]
          : []),
      ]);
      expect(h.writes).toHaveLength(0);
      expect(await h.source.getRepository('creator').find()).toHaveLength(0);
      expect(
        await h.source.getRepository(ActionExecutionReceiptEntity).find(),
      ).toHaveLength(0);
    },
  );

  it('waits for a generic Creator edit transaction and rejects the newly committed preparation drift', async () => {
    const h = await createComposerFixture();
    const creatorId = randomUUID();
    await h.source
      .getRepository('creator')
      .insert({ id: creatorId, instagramUsername: 'recipient' });
    const input = await h.prepare();
    const writer = h.source.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    await writer.manager
      .getRepository('creator')
      .update({ id: creatorId }, { instagramUsername: 'renamed' });
    const sending = h.send(input);
    const outcome = Promise.allSettled([sending]);
    try {
      await waitForDatabaseWaiter('relation');
      await writer.commitTransaction();
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      await writer.release();
    }
    expect((await outcome)[0].status).toBe('rejected');
    expect(await h.source.getRepository('creator').find()).toEqual([
      expect.objectContaining({ id: creatorId, instagramUsername: 'renamed' }),
    ]);
    expect(
      await h.source.getRepository(ActionExecutionReceiptEntity).find(),
    ).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });

  it.each(['unlink', 'rebind'] as const)(
    'blocks account %s committed on a separate connection during post-reservation provider verification',
    async (change) => {
      const h = await createComposerFixture();
      const input = await h.prepare();
      const reached = barrier();
      const resume = barrier();
      let profiles = 0;
      h.setBeforeProfile(async () => {
        if (++profiles === 2) {
          reached.release();
          await resume.promise;
        }
      });
      const sending = h.send(input);
      const outcome = Promise.allSettled([sending]);
      await reached.promise;
      const writer = h.source.createQueryRunner();
      try {
        await writer.connect();
        await writer.startTransaction();
        await writer.manager
          .getRepository('accountBinding')
          .update(
            { id: h.bindingId },
            change === 'unlink'
              ? { status: 'DISCONNECTED', deactivatedAt: new Date() }
              : { unipileAccountId: 'rebound-account' },
          );
        await writer.commitTransaction();
      } finally {
        if (writer.isTransactionActive) await writer.rollbackTransaction();
        await writer.release();
        resume.release();
      }
      expect((await outcome)[0]).toEqual({
        status: 'fulfilled',
        value: expect.objectContaining({ status: 'BLOCKED' }),
      });
      expect(h.writes).toHaveLength(0);
      const reservations = await h.source
        .getRepository(InstagramActionReservationEntity)
        .find();
      expect(reservations).toHaveLength(1);
      expect(reservations[0].providerAttemptedAt).toBeNull();
      expect(reservations[0].releasedAt).not.toBeNull();
      expect(reservations[0].targetLockReleasedAt).not.toBeNull();
    },
  );

  it.each(['after-marker', 'after-acceptance'] as const)(
    'retains Unknown capacity/target after %s and reconciles with zero additional provider writes',
    async (fault) => {
      const h = await createComposerFixture();
      const input = await h.prepare();
      h.setFault(fault);
      const result = await h.send(input);
      expect(result.status).toBe('UNKNOWN');
      expect(h.writes).toHaveLength(fault === 'after-marker' ? 0 : 1);
      const beforeWrites = [...h.writes];
      expect(await h.send(input)).toEqual(result);
      expect(
        await h.run(() =>
          h.reconciliation.reconcile({
            workspaceId: h.fixtureWorkspaceId,
            receiptId: result.receiptId,
          }),
        ),
      ).toEqual({ kind: 'INDETERMINATE' });
      expect(h.writes).toEqual(beforeWrites);
      const reservations = await h.source
        .getRepository(InstagramActionReservationEntity)
        .find();
      expect(reservations).toHaveLength(1);
      expect(reservations[0]).toMatchObject({
        actionExecutionReceiptId: result.receiptId,
        providerAttemptedAt: expect.any(Date),
        releasedAt: null,
        targetLockReleasedAt: null,
      });
      expect(
        await h.budget.inspectUsage({
          workspaceId: h.fixtureWorkspaceId,
          instagramAccountRecordId: h.accountId,
        }),
      ).toMatchObject({
        hourlyUsed: 1,
        hourlyLimit: 10,
        dailyUsed: 1,
        dailyLimit: 100,
      });
      await expect(h.prepare()).rejects.toThrow('TARGET_LOCKED');
      expect(await h.source.getRepository('creator').find()).toHaveLength(1);
    },
  );

  it('uses actual separate native lock connections and releases nested handle/draft locks', async () => {
    const first = new InstagramMessageDraftLockService(database);
    const second = new InstagramMessageDraftLockService(database);
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const order: string[] = [];
    const lock = { workspaceId, normalizedHandle: 'recipient' };
    const a = first.withNormalizedHandleLock(lock, () =>
      first.withLock({ workspaceId, draftId }, async () => {
        order.push('first');
        entered();
        await barrier;
      }),
    );
    await acquired;
    const b = second.withNormalizedHandleLock(lock, () =>
      second.withLock({ workspaceId, draftId }, async () => {
        order.push('second');
      }),
    );
    try {
      // PostgreSQL reports an actual blocked session, not a timing assumption.
      for (let i = 0; ; i++) {
        const [row] = await executeFixtureSql(
          `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
        );
        if (row.count === 1) break;
        if (i === 100) throw new Error('Second lock connection did not block');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(order).toEqual(['first']);
    } finally {
      release();
    }
    await Promise.all([a, b]);
    expect(order).toEqual(['first', 'second']);
    const [row] = await executeFixtureSql(
      `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    expect(row.count).toBe(0);
  });
});
