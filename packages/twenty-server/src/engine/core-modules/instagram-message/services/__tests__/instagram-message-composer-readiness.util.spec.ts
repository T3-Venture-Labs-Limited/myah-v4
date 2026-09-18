import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { DataSource } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { InstagramMessageComposerService } from '../instagram-message-composer.service';
import { InstagramMessageRecipientService } from '../instagram-message-recipient.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER,
  INSTAGRAM_COMPOSER_PROTECTED_FIELD_UNIVERSAL_IDENTIFIERS,
} from 'src/engine/api/common/common-args-processors/data-arg-processor/utils/assert-instagram-composer-fields-not-written.util';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import {
  withWorkspaceContext,
  type ORMWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { InstagramMessageRecordAccessService } from '../instagram-message-record-access.service';
import {
  INSTAGRAM_COMPOSER_STORAGE_FIELDS,
  isInstagramComposerReady,
} from '../instagram-message-composer-readiness.util';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const fixture = () => {
  const object = {
    id: 'draft-object',
    universalIdentifier: INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
    workspaceId,
    nameSingular: 'myahInstagramReplyDraft',
    isActive: true,
    applicationId: 'installed-app-id',
    fieldIds: ['field-0', 'field-1'],
  };
  const fields = INSTAGRAM_COMPOSER_STORAGE_FIELDS.map((field, index) => ({
    ...field,
    id: `field-${index}`,
    workspaceId,
    objectMetadataId: object.id,
    applicationId: object.applicationId,
    isActive: true,
    isNullable: true,
  }));
  const context = {
    authContext: { workspace: { id: workspaceId } },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: { [object.universalIdentifier]: object },
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        fields.map((field) => [field.universalIdentifier, field]),
      ),
    },
    objectIdByNameSingular: { myahInstagramReplyDraft: object.id },
  } as unknown as ORMWorkspaceContext;
  const columns = fields.map((field) => ({
    column_name: field.name,
    udt_name: field.storageType,
    is_nullable: 'YES',
  }));
  const applications = [{ id: object.applicationId }];
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('core.application')) {
      expect(sql).toContain('"deletedAt" IS NULL');
      expect(params).toEqual([
        object.applicationId,
        workspaceId,
        INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER,
      ]);
      return applications;
    }
    expect(sql).toContain("t.table_type = 'BASE TABLE'");
    expect(sql).toContain("c.table_name = '_myahInstagramReplyDraft'");
    expect(sql).toContain('c.table_schema = $1');
    expect(params).toEqual([
      getWorkspaceSchemaName(workspaceId),
      fields.map((field) => field.name),
    ]);
    return columns;
  });
  const source = new GlobalWorkspaceDataSource(
    { type: 'postgres' },
    {} as never,
    new DataSource({ type: 'postgres' }),
  );
  // Real manager, datasource permission gate and native runner. Only SQL wire
  // execution and cache contents are fixtures; no initialize/socket/credentials.
  const driver = source.driver as PostgresDriver;
  const release = jest.fn();
  jest.spyOn(driver, 'obtainMasterConnection').mockImplementation(async () => {
    const client = Object.assign(new EventEmitter(), {
      query: async (sql: string, params: unknown[]) => ({
        rows: await query(sql, params),
        command: 'SELECT',
      }),
    });
    return [client, release];
  });
  const cache = {
    getOrRecompute: jest.fn(async () => ({
      ...context,
      ORMEntityMetadatas: [],
      rolesPermissions: {},
    })),
  };
  const manager = new GlobalWorkspaceOrmManager(
    { getGlobalWorkspaceDataSource: () => source } as never,
    cache as never,
  );
  const getRepository = jest.spyOn(manager, 'getRepository');
  return {
    object,
    fields,
    context,
    columns,
    applications,
    query,
    manager,
    getRepository,
    source,
    driver,
    release,
    cache,
    ready: () =>
      withWorkspaceContext(context, () =>
        isInstagramComposerReady(manager, workspaceId),
      ),
  };
};

describe('Instagram composer installed metadata and storage readiness', () => {
  it('resolves installation-local ownership against the actual live application record and physical schema', async () => {
    const f = fixture();
    await expect(f.ready()).resolves.toBe(true);
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(f.release).toHaveBeenCalledTimes(2);
    expect(f.driver.connectedQueryRunners).toHaveLength(0);
  });

  it('loads real manager workspace metadata before guarded physical readiness queries', async () => {
    const f = fixture();
    await expect(
      f.manager.executeInWorkspaceContext(
        () => isInstagramComposerReady(f.manager, workspaceId),
        f.context.authContext,
      ),
    ).resolves.toBe(true);
    expect(f.cache.getOrRecompute).toHaveBeenCalledWith(
      workspaceId,
      expect.arrayContaining([
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]),
    );
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(f.release).toHaveBeenCalledTimes(2);
    expect(f.driver.connectedQueryRunners).toHaveLength(0);
    expect(f.getRepository).not.toHaveBeenCalled();
  });

  it.each([
    'universalIdentifier',
    'workspaceId',
    'nameSingular',
    'applicationId',
    'isActive',
    'fieldIds',
  ] as const)(
    'rejects stale/wrong object %s before storage access',
    async (key) => {
      const f = fixture();
      Object.assign(f.object, {
        [key]: key === 'isActive' ? false : key === 'fieldIds' ? [] : 'wrong',
      });
      // Wrong owner is detected against fields before any application query.
      await expect(f.ready()).resolves.toBe(false);
      expect(f.query).not.toHaveBeenCalled();
    },
  );

  it.each(
    INSTAGRAM_COMPOSER_STORAGE_FIELDS.flatMap((_, index) =>
      [
        'universalIdentifier',
        'workspaceId',
        'name',
        'applicationId',
        'objectMetadataId',
        'type',
        'isActive',
        'isNullable',
      ].map((key) => [index, key] as const),
    ),
  )('rejects field %s drift in %s', async (index, key) => {
    const f = fixture();
    Object.assign(f.fields[index], {
      [key]: key.startsWith('is') ? false : 'wrong',
    });
    await expect(f.ready()).resolves.toBe(false);
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each([
    'object',
    'field',
    'application',
    'column',
    'type',
    'nullable',
    'duplicate',
  ] as const)('fails closed for missing/wrong %s', async (failure) => {
    const f = fixture();
    if (failure === 'object')
      delete f.context.flatObjectMetadataMaps.byUniversalIdentifier[
        f.object.universalIdentifier
      ];
    if (failure === 'field')
      delete f.context.flatFieldMetadataMaps.byUniversalIdentifier[
        f.fields[0].universalIdentifier
      ];
    if (failure === 'application') f.applications.length = 0;
    if (failure === 'column') f.columns.pop();
    if (failure === 'type')
      Object.assign(f.columns[0], { udt_name: 'varchar' });
    if (failure === 'nullable') f.columns[0].is_nullable = 'NO';
    if (failure === 'duplicate') f.columns[1] = f.columns[0];
    await expect(f.ready()).resolves.toBe(false);
  });

  it('blocks account app-table access when the metadata is absent', async () => {
    const f = fixture();
    f.object.isActive = false;
    const bindings = { find: jest.fn() };
    const service = new InstagramMessageRecordAccessService(
      f.manager,
      bindings as never,
    );
    await expect(
      withWorkspaceContext(f.context, () =>
        service.getComposerAccount({
          workspaceId,
          rolePermissionConfig: { shouldBypassPermissionChecks: true },
        }),
      ),
    ).resolves.toBeNull();
    expect(bindings.find).not.toHaveBeenCalled();
    expect(f.getRepository).not.toHaveBeenCalled();
  });

  it('keeps the one server UID mirror in parity with app-owned identifiers', () => {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../../../../../../twenty-apps/public/myah-instagram-messaging/src/constants/universal-identifiers.ts',
      ),
      'utf8',
    );
    const read = (name: string) =>
      source.match(new RegExp(`export const ${name} =\\s*'([^']+)'`))?.[1];
    expect(read('APPLICATION_UNIVERSAL_IDENTIFIER')).toBe(
      INSTAGRAM_MESSAGING_APPLICATION_UNIVERSAL_IDENTIFIER,
    );
    expect(read('REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER')).toBe(
      INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
    );
    expect(
      new Set([
        read('REPLY_DRAFT_COMPOSER_INPUT_DIGEST_FIELD_UNIVERSAL_IDENTIFIER'),
        read(
          'REPLY_DRAFT_INSTAGRAM_MESSAGE_SNAPSHOT_FIELD_UNIVERSAL_IDENTIFIER',
        ),
      ]),
    ).toEqual(INSTAGRAM_COMPOSER_PROTECTED_FIELD_UNIVERSAL_IDENTIFIERS);
  });
  it.each(['metadata', 'application', 'storage'] as const)(
    'preparation fails before account/app/provider queries when %s is unavailable',
    async (failure) => {
      const f = fixture();
      if (failure === 'metadata') f.fields[0].isActive = false;
      if (failure === 'application') f.applications.length = 0;
      if (failure === 'storage') f.columns.length = 0;
      const bindings = { find: jest.fn() };
      const account = new InstagramMessageRecordAccessService(
        f.manager,
        bindings as never,
      );
      const provider = { resolveInstagramUser: jest.fn() };
      const recipient = new InstagramMessageRecipientService(
        f.manager,
        account,
        { canQueryComposerAccount: jest.fn(async () => true) } as never,
        {} as never,
        provider as never,
        { upsertVerifiedChat: jest.fn() } as never,
        { findOne: jest.fn() } as never,
      );
      await expect(
        withWorkspaceContext(f.context, () =>
          recipient.prepare(
            { recipient: { rawHandle: 'recipient' } },
            {
              workspaceId,
              workspaceMemberId: 'member',
              initiatorUserWorkspaceId: 'user',
              rolePermissionConfig: { shouldBypassPermissionChecks: true },
            },
          ),
        ),
      ).resolves.toEqual({ status: 'BLOCKED', code: 'ACCOUNT_UNAVAILABLE' });
      expect(bindings.find).not.toHaveBeenCalled();
      expect(f.getRepository).not.toHaveBeenCalled();
      expect(f.query).toHaveBeenCalledTimes(
        failure === 'metadata' ? 0 : failure === 'application' ? 1 : 2,
      );
      expect(f.driver.connectedQueryRunners).toHaveLength(0);
      expect(provider.resolveInstagramUser).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'fresh/draft-only discovery requires exact readiness; historical receipt recovery does not (receipt=%s)',
    async (receipt) => {
      const f = fixture();
      f.context.flatObjectMetadataMaps.byUniversalIdentifier = {};
      const input = {
        draftId: 'draft',
        body: 'hello',
        recipient: { rawHandle: 'recipient' },
        expectedAccountRecordId: 'account',
        expectedPreparationFingerprint: 'fingerprint',
      };
      const auth = {
        workspaceId,
        initiatorUserWorkspaceId: 'user',
        workspaceMemberId: 'member',
        rolePermissionConfig: { shouldBypassPermissionChecks: true } as const,
      };
      const attempt = {
        id: 'binding',
        actionKind: 'START_CHAT',
        instagramMessageSnapshot: { publicIdentifier: 'recipient' },
        composerInputDigest: createHash('sha256')
          .update(
            JSON.stringify([
              workspaceId,
              'user',
              'draft',
              ['rawHandle', 'recipient'],
              'account',
              'fingerprint',
              'hello',
            ]),
          )
          .digest('hex'),
        receipt: { id: 'receipt', state: 'SUCCEEDED' },
      };
      const recipient = {
        resolve: jest.fn(),
        resolveNormalizedHandle: jest.fn(),
      };
      const approval = {
        findComposerAttempt: jest.fn(async () => (receipt ? attempt : null)),
        getApprovedBinding: jest.fn(async () => ({
          actionName: 'send_instagram_message',
        })),
      };
      const permission = { assertCanSend: jest.fn() };
      const execute = jest.fn(async () => ({
        receiptId: 'receipt',
        state: 'SUCCEEDED',
      }));
      const locks = {
        withNormalizedHandleLock: jest.fn(async (_input, callback) =>
          callback(),
        ),
        withLock: jest.fn(async (_input, callback) => callback()),
      };
      const composer = new InstagramMessageComposerService(
        f.manager,
        recipient as never,
        permission as never,
        locks as never,
        approval as never,
        { executeApprovedWithDraftLockHeld: execute } as never,
      );
      const send = withWorkspaceContext(f.context, () =>
        composer.send(input, auth),
      );
      if (receipt) {
        await expect(send).resolves.toMatchObject({ receiptId: 'receipt' });
        await expect(composer.getAttempt('draft', auth)).resolves.toMatchObject(
          { receiptId: 'receipt' },
        );
        expect(permission.assertCanSend).toHaveBeenCalledTimes(1);
      } else {
        await expect(send).rejects.toThrow('metadata is unavailable');
        await expect(
          withWorkspaceContext(f.context, () =>
            composer.getAttempt('draft', auth),
          ),
        ).rejects.toThrow('metadata is unavailable');
        expect(locks.withNormalizedHandleLock).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
      }
      expect(recipient.resolve).not.toHaveBeenCalled();
      expect(recipient.resolveNormalizedHandle).not.toHaveBeenCalled();
      expect(f.query).not.toHaveBeenCalled();
      expect(f.getRepository).not.toHaveBeenCalled();
    },
  );
});
