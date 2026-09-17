import { Reflector } from '@nestjs/core';
import { parse, type OperationDefinitionNode } from 'graphql';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { DataArgProcessorService } from '../data-arg-processor.service';
import {
  INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS,
  INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER,
} from '../utils/assert-instagram-composer-fields-not-written.util';
import { FilterArgProcessorService } from 'src/engine/api/common/common-args-processors/filter-arg-processor/filter-arg-processor.service';
import { CommonCreateOneQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-create-one-query-runner.service';
import { CommonCreateManyQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-create-many-query-runner/common-create-many-query-runner.service';
import { CommonUpdateOneQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-update-one-query-runner.service';
import { CommonUpdateManyQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-update-many-query-runner.service';
import { CommonSelectFieldsHelper } from 'src/engine/api/common/common-select-fields/common-select-fields-helper';
import { RestApiCreateOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-create-one.handler';
import { RestApiCreateManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-create-many.handler';
import { RestApiUpdateOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-update-one.handler';
import { RestApiUpdateManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-update-many.handler';
import { CreateOneResolverFactory } from 'src/engine/api/graphql/workspace-resolver-builder/factories/create-one-resolver.factory';
import { CreateManyResolverFactory } from 'src/engine/api/graphql/workspace-resolver-builder/factories/create-many-resolver.factory';
import { UpdateOneResolverFactory } from 'src/engine/api/graphql/workspace-resolver-builder/factories/update-one-resolver.factory';
import { UpdateManyResolverFactory } from 'src/engine/api/graphql/workspace-resolver-builder/factories/update-many-resolver.factory';
import { WorkspaceQueryHookService } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.service';
import { WorkspaceQueryHookStorage } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/storage/workspace-query-hook.storage';
import { WorkspaceQueryHookMetadataAccessor } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook-metadata.accessor';
import {
  MyahCampaignDestroyOnePreQueryHook,
  MyahCampaignDestroyManyPreQueryHook,
} from 'src/modules/myah-campaign/query-hooks/myah-campaign-destroy.pre-query.hooks';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const id = '00000000-0000-4000-8000-000000000001';
const operations = [
  'createOne',
  'createMany',
  'upsertOne',
  'upsertMany',
  'updateOne',
  'updateMany',
] as const;
type Operation = (typeof operations)[number];
const flatMaps = <T extends { id: string; universalIdentifier: string }>(
  items: T[],
) => ({
  byUniversalIdentifier: Object.fromEntries(
    items.map((item) => [item.universalIdentifier, item]),
  ),
  universalIdentifierById: Object.fromEntries(
    items.map((item) => [item.id, item.universalIdentifier]),
  ),
  universalIdentifiersByApplicationId: {},
});

const fixture = (
  operation: Operation,
  protectedObject: boolean,
  admin = false,
) => {
  const object = {
    id: 'object',
    nameSingular: 'myahInstagramReplyDraft',
    namePlural: 'myahInstagramReplyDrafts',
    universalIdentifier: protectedObject
      ? INSTAGRAM_REPLY_DRAFT_OBJECT_UNIVERSAL_IDENTIFIER
      : 'ordinary-object',
    fieldIds: [
      'id',
      'body',
      'composerInputDigest',
      'instagramMessageSnapshot',
      'draft',
    ],
    isRemote: false,
  } as FlatObjectMetadata;
  const fields = [
    {
      id: 'id',
      name: 'id',
      type: FieldMetadataType.UUID,
      universalIdentifier: 'id',
    },
    {
      id: 'body',
      name: 'body',
      type: FieldMetadataType.TEXT,
      universalIdentifier: 'body',
    },
    ...Object.entries(INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS).map(
      ([name, universalIdentifier]) => ({
        id: name,
        name,
        universalIdentifier,
        type:
          name === 'composerInputDigest'
            ? FieldMetadataType.TEXT
            : FieldMetadataType.RAW_JSON,
      }),
    ),
    {
      id: 'draft',
      name: 'draft',
      type: FieldMetadataType.RELATION,
      universalIdentifier: 'draft',
      settings: {
        relationType: RelationType.MANY_TO_ONE,
        joinColumnName: 'draftId',
      },
      relationTargetObjectMetadataId: 'object',
    },
  ].map((field) => ({
    ...field,
    objectMetadataId: object.id,
    isNullable: true,
  })) as FlatFieldMetadata[];
  const flatObjectMetadataMaps = flatMaps([object]);
  const flatFieldMetadataMaps = flatMaps(fields);
  const authContext = {
    type: 'user',
    workspace: { id },
    user: { id, isAdmin: admin },
    userWorkspaceId: id,
    workspaceMemberId: id,
  } as unknown as WorkspaceAuthContext;
  const context = {
    flatObjectMetadata: object,
    flatObjectMetadataMaps,
    flatFieldMetadataMaps,
    objectIdByNameSingular: { [object.nameSingular]: object.id },
    authContext,
  };
  const position = {
    overridePositionOnRecords: jest.fn(
      async ({ partialRecordInputs }) => partialRecordInputs,
    ),
  };
  const processor = new DataArgProcessorService(position as never);
  const process = jest.spyOn(processor, 'process');
  const createMany = new CommonCreateManyQueryRunnerService(position as never);
  const updateMany = new CommonUpdateManyQueryRunnerService();
  const runners = {
    createOne: new CommonCreateOneQueryRunnerService(createMany),
    createMany,
    updateOne: new CommonUpdateOneQueryRunnerService(updateMany),
    updateMany,
  };
  const key = operation.replace('upsert', 'create') as keyof typeof runners;
  const runner = runners[key];
  const storage = new WorkspaceQueryHookStorage();
  const metadata = new WorkspaceQueryHookMetadataAccessor(new Reflector());
  // These are the real opted-in transaction hooks. Their actual decorator keys
  // must not route draft mutations around the existing generic draft freeze.
  for (const Hook of [
    MyahCampaignDestroyOnePreQueryHook,
    MyahCampaignDestroyManyPreQueryHook,
  ]) {
    const instance = new Hook({} as never);
    storage.registerWorkspaceQueryPreHookInstance(
      metadata.getWorkspaceQueryHookMetadata(Hook)!.key,
      { instance, host: {} as never, isRequestScoped: false },
    );
  }
  const hooks = new WorkspaceQueryHookService(storage, {} as never);
  const routing = jest.spyOn(hooks, 'shouldRunPreQueryHooksInTransaction');
  const rawHooks = jest.spyOn(hooks, 'executeRawInputPreQueryHooks');
  const postProcessorHooks = jest.spyOn(hooks, 'executePreQueryHooks');
  // Stop at the persistence boundary, never open an ambient workspace datasource.
  // No common runner, computeArgs, processor, guard or validator is replaced.
  const persistence = jest.fn(async () => {
    throw new Error('fixture persistence boundary');
  });
  const datasource = jest.fn();
  for (const item of Object.values(runners))
    Object.assign(item, {
      workspaceQueryHookService: hooks,
      dataArgProcessor: processor,
      filterArgProcessor: new FilterArgProcessorService(),
      globalWorkspaceOrmManager: {
        executeInWorkspaceContext: persistence,
        getGlobalWorkspaceDataSource: datasource,
      },
      twentyConfigService: { get: () => 1_000 },
    });
  const execute = jest.spyOn(runner, 'execute');
  const handlers = {
    createOne: new RestApiCreateOneHandler(runners.createOne),
    createMany: new RestApiCreateManyHandler(createMany),
    updateOne: new RestApiUpdateOneHandler(runners.updateOne),
    updateMany: new RestApiUpdateManyHandler(updateMany),
  };
  const handler = handlers[key];
  Object.assign(handler, {
    accessTokenService: {
      validateTokenByRequest: jest.fn(async () => ({ workspace: { id } })),
    },
    workspaceCacheStorageService: {
      getMetadataVersion: jest.fn(async () => 'fixture'),
    },
    workspaceManyOrAllFlatEntityMapsCacheService: {
      getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(async () => ({
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        flatIndexMaps: flatMaps([]),
      })),
    },
    userRoleService: {
      getRoleIdForUserWorkspace: jest.fn(async () =>
        admin ? 'admin' : 'member',
      ),
    },
    workspaceCacheService: {
      getOrRecompute: jest.fn(async () => ({
        rolesPermissions: {
          [admin ? 'admin' : 'member']: {
            object: {
              canRead: true,
              canUpdate: true,
              canDelete: true,
              restrictedFields: {},
            },
          },
        },
      })),
    },
    commonSelectFieldsHelper: new CommonSelectFieldsHelper(),
  });
  const factories = {
    createOne: new CreateOneResolverFactory(runners.createOne),
    createMany: new CreateManyResolverFactory(createMany),
    updateOne: new UpdateOneResolverFactory(runners.updateOne),
    updateMany: new UpdateManyResolverFactory(updateMany),
  };
  const resolver = factories[key].create(context as never);
  const info = {
    fieldNodes: [
      (
        parse('mutation { write { id } }')
          .definitions[0] as OperationDefinitionNode
      ).selectionSet.selections[0],
    ],
    fragments: {},
    variableValues: {},
  };
  const invoke = (
    transport: 'REST' | 'GraphQL',
    data: Record<string, unknown>,
  ) =>
    withWorkspaceAuthContext(authContext, async () => {
      const body = key === 'createMany' ? [{ body: 'ordinary' }, data] : data;
      const upsert = operation.startsWith('upsert');
      if (transport === 'REST')
        return handler.handle({
          body,
          path: `/rest/${object.namePlural}${key === 'updateOne' ? `/${id}` : ''}`,
          query: { upsert: String(upsert) },
        } as never);
      return resolver(
        undefined,
        { data: body, id, filter: {}, upsert } as never,
        {} as never,
        info as never,
      );
    });
  return {
    invoke,
    process,
    processor,
    context,
    position,
    persistence,
    datasource,
    execute,
    routing,
    rawHooks,
    postProcessorHooks,
    hooks,
  };
};

describe.each(['REST', 'GraphQL'] as const)(
  'Instagram composer original-key protection through actual %s handlers',
  (transport) => {
    describe.each(operations)('%s', (operation) => {
      it.each(
        Object.keys(INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS).flatMap(
          (field) =>
            [undefined, null, 'forged'].flatMap((value) =>
              [false, true].map((admin) => ({ field, value, admin })),
            ),
        ),
      )(
        'existing generic draft freeze denies $field=$value admin=$admin before processor or persistence',
        async ({ field, value, admin }) => {
          const f = fixture(operation, true, admin);
          await expect(
            f.invoke(transport, { [field]: value }),
          ).rejects.toThrow();
          expect(f.execute).toHaveBeenCalledTimes(1);
          expect(f.routing).toHaveReturnedWith(false);
          expect(f.process).not.toHaveBeenCalled();
          expect(f.position.overridePositionOnRecords).not.toHaveBeenCalled();
          expect(f.rawHooks).not.toHaveBeenCalled();
          expect(f.postProcessorHooks).not.toHaveBeenCalled();
          expect(f.persistence).not.toHaveBeenCalled();
          expect(f.datasource).not.toHaveBeenCalled();
        },
      );

      it('ordinary same-name/wrong-object fields reach the real processor unchanged', async () => {
        const f = fixture(operation, false, true);
        await expect(
          f.invoke(transport, {
            body: 'ordinary',
            composerInputDigest: 'ordinary',
            instagramMessageSnapshot: null,
          }),
        ).rejects.toThrow();
        expect(f.process).toHaveBeenCalledTimes(1);
        await expect(f.process.mock.results[0].value).resolves.toContainEqual({
          body: 'ordinary',
          composerInputDigest: 'ordinary',
          instagramMessageSnapshot: null,
        });
        expect(f.persistence).toHaveBeenCalledTimes(1);
        expect(f.datasource).not.toHaveBeenCalled();
      });

      it.each(['create', 'update', 'upsert'])(
        'rejects unsupported nested %s using the actual relation validator, before persistence',
        async (nested) => {
          const f = fixture(operation, false);
          await expect(
            f.invoke(transport, {
              draft: { [nested]: { composerInputDigest: null } },
            }),
          ).rejects.toThrow();
          expect(f.process).toHaveBeenCalledTimes(1);
          await expect(f.process.mock.results[0].value).rejects.toThrow(
            'requires connect or disconnect',
          );
          expect(f.persistence).not.toHaveBeenCalled();
          expect(f.postProcessorHooks).not.toHaveBeenCalled();
        },
      );

      it.each([{ connect: { where: { id } } }, { disconnect: true }])(
        'accepts supported nested link operations without creating target write payloads',
        async (relation) => {
          const f = fixture(operation, false);
          await expect(
            f.invoke(transport, { draft: relation }),
          ).rejects.toThrow();
          await expect(f.process.mock.results[0].value).resolves.toContainEqual(
            { draft: relation },
          );
          expect(f.persistence).toHaveBeenCalledTimes(1);
        },
      );
    });
  },
);

describe('DataArgProcessorService targeted defense behind the existing draft freeze', () => {
  it.each(
    Object.keys(INSTAGRAM_COMPOSER_FIELD_UNIVERSAL_IDENTIFIERS).flatMap(
      (field) =>
        [undefined, null, 'forged'].flatMap((value) =>
          [false, true].map((admin) => ({ field, value, admin })),
        ),
    ),
  )(
    'rejects original $field=$value admin=$admin before position/transformation effects',
    async ({ field, value, admin }) => {
      const f = fixture('createMany', true, admin);
      await expect(
        f.processor.process({
          ...f.context,
          partialRecordInputs: [{ body: 'first' }, { [field]: value }],
        }),
      ).rejects.toThrow('server-managed');
      expect(f.position.overridePositionOnRecords).not.toHaveBeenCalled();
    },
  );

  it('ordinary fields on the protected object remain outside the two-field processor policy', async () => {
    const f = fixture('createOne', true);
    await expect(
      f.processor.process({
        ...f.context,
        partialRecordInputs: [{ body: 'ordinary' }],
      }),
    ).resolves.toEqual([{ body: 'ordinary' }]);
  });

  it('real transaction-hook metadata selects campaign destruction only, never draft mutation', () => {
    const f = fixture('createOne', true);
    expect(
      f.hooks.shouldRunPreQueryHooksInTransaction('campaign', 'destroyOne'),
    ).toBe(true);
    expect(
      f.hooks.shouldRunPreQueryHooksInTransaction('campaign', 'destroyMany'),
    ).toBe(true);
    for (const method of [
      'createOne',
      'createMany',
      'updateOne',
      'updateMany',
      'deleteOne',
      'deleteMany',
      'destroyOne',
      'destroyMany',
      'restoreOne',
      'restoreMany',
      'mergeMany',
    ] as const) {
      expect(
        f.hooks.shouldRunPreQueryHooksInTransaction(
          'myahInstagramReplyDraft',
          method,
        ),
      ).toBe(false);
    }
  });
});
