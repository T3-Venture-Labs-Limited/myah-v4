import { Injectable } from '@nestjs/common';

import { QUERY_MAX_RECORDS_FROM_RELATION } from 'twenty-shared/constants';
import { ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { FindOptionsRelations, ObjectLiteral } from 'typeorm';

import { WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { CommonBaseQueryRunnerService } from 'src/engine/api/common/common-query-runners/common-base-query-runner.service';
import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { STANDARD_ERROR_MESSAGE } from 'src/engine/api/common/common-query-runners/errors/standard-error-message.constant';
import { buildMutationQueryBuilder } from 'src/engine/api/common/common-query-runners/utils/build-mutation-query-builder.util';
import { CommonBaseQueryRunnerContext } from 'src/engine/api/common/types/common-base-query-runner-context.type';
import { CommonExtendedQueryRunnerContext } from 'src/engine/api/common/types/common-extended-query-runner-context.type';
import {
  CommonExtendedInput,
  CommonInput,
  CommonQueryNames,
  DestroyManyQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';
import { buildColumnsToReturn } from 'src/engine/api/graphql/graphql-query-runner/utils/build-columns-to-return';
import { assertIsValidUuid } from 'src/engine/api/graphql/workspace-query-runner/utils/assert-is-valid-uuid.util';
import { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { assertMutationNotOnRemoteObject } from 'src/engine/metadata-modules/object-metadata/utils/assert-mutation-not-on-remote-object.util';

@Injectable()
export class CommonDestroyManyQueryRunnerService extends CommonBaseQueryRunnerService<
  DestroyManyQueryArgs,
  ObjectRecord[]
> {
  protected readonly operationName = CommonQueryNames.DESTROY_MANY;

  constructor(
    private readonly myahInboxContactTriageLifecycleService: MyahInboxContactTriageLifecycleService,
  ) {
    super();
  }

  async run(
    args: CommonExtendedInput<DestroyManyQueryArgs>,
    queryRunnerContext: CommonExtendedQueryRunnerContext,
  ): Promise<ObjectRecord[]> {
    const {
      repository,
      authContext,
      rolePermissionConfig,
      workspaceDataSource,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatObjectMetadata,
      commonQueryParser,
    } = queryRunnerContext;

    const queryBuilder = buildMutationQueryBuilder({
      repository,
      alias: flatObjectMetadata.nameSingular,
      filter: args.filter,
      commonQueryParser,
    });

    const columnsToReturn = buildColumnsToReturn({
      select: args.selectedFieldsResult.select,
      relations: args.selectedFieldsResult.relations,
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    });

    const destroyedRecords =
      flatObjectMetadata.nameSingular === 'creator'
        ? await this.runCreatorDestroyInTransaction({
            queryBuilder,
            queryRunnerContext,
            columnsToReturn,
          })
        : ((await queryBuilder.delete().returning(columnsToReturn).execute())
            .generatedMaps as ObjectRecord[]);

    if (isDefined(args.selectedFieldsResult.relations)) {
      await this.processNestedRelationsHelper.processNestedRelations({
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        parentObjectMetadataItem: flatObjectMetadata,
        parentObjectRecords: destroyedRecords,
        relations: args.selectedFieldsResult.relations as Record<
          string,
          FindOptionsRelations<ObjectLiteral>
        >,
        limit: QUERY_MAX_RECORDS_FROM_RELATION,
        authContext,
        workspaceDataSource,
        rolePermissionConfig,
        selectedFields: args.selectedFieldsResult.select,
      });
    }

    return destroyedRecords;
  }

  private async runCreatorDestroyInTransaction({
    queryBuilder,
    queryRunnerContext,
    columnsToReturn,
  }: {
    queryBuilder: ReturnType<typeof buildMutationQueryBuilder>;
    queryRunnerContext: CommonExtendedQueryRunnerContext;
    columnsToReturn: string[];
  }): Promise<ObjectRecord[]> {
    const rows = (await queryBuilder
      .clone()
      .select('creator.id', 'id')
      .getRawMany()) as Array<{
      id?: string;
      creator_id?: string;
    }>;
    const creatorIds = rows
      .map((row) => row.id ?? row.creator_id)
      .filter((id): id is string => id !== undefined)
      .sort();
    if (creatorIds.length === 0) return [];

    return queryRunnerContext.workspaceDataSource.transaction(
      async (manager: WorkspaceEntityManager) =>
        this.myahInboxContactTriageLifecycleService.withPreparedCreatorMutationInTransaction(
          {
            workspaceId: queryRunnerContext.authContext.workspace.id,
            creatorIds,
            manager,
            verify: async () => {
              const repository = manager.getRepository(
                'creator',
                queryRunnerContext.rolePermissionConfig,
                queryRunnerContext.authContext,
              );
              await this.assertCreatorTargetsUnchanged(repository, creatorIds);
            },
            mutate: async (sources) => {
              const repository = manager.getRepository(
                'creator',
                queryRunnerContext.rolePermissionConfig,
                queryRunnerContext.authContext,
              );
              await this.myahInboxContactTriageLifecycleService.rekeyPreparedSourcesToUnmatchedInTransaction(
                { sources, manager },
              );
              return (
                await repository
                  .createQueryBuilder('creator')
                  .delete()
                  .whereInIds(creatorIds)
                  .returning(columnsToReturn)
                  .execute()
              ).generatedMaps as ObjectRecord[];
            },
          },
        ),
    );
  }

  private async assertCreatorTargetsUnchanged(
    repository: WorkspaceRepository<ObjectLiteral>,
    authorizedIds: string[],
  ): Promise<void> {
    const rows = (await repository
      .createQueryBuilder('creator')
      .select('creator.id', 'id')
      .whereInIds(authorizedIds)
      .setLock('pessimistic_write')
      .getRawMany()) as Array<{ id?: string; creator_id?: string }>;
    const currentIds = rows
      .map((row) => row.id ?? row.creator_id)
      .filter((id): id is string => id !== undefined)
      .sort();
    const expectedIds = [...new Set(authorizedIds)].sort();

    if (
      currentIds.length !== expectedIds.length ||
      currentIds.some((id, index) => id !== expectedIds[index])
    ) {
      throw new CommonQueryRunnerException(
        'Creator records changed before transaction reconciliation',
        CommonQueryRunnerExceptionCode.RECORD_NOT_FOUND,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }
  }

  async computeArgs(
    args: CommonInput<DestroyManyQueryArgs>,
    queryRunnerContext: CommonBaseQueryRunnerContext,
  ): Promise<CommonInput<DestroyManyQueryArgs>> {
    const {
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
    } = queryRunnerContext;

    return {
      ...args,
      filter: this.filterArgProcessor.process({
        filter: args.filter,
        flatObjectMetadata,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      }),
    };
  }

  async processQueryResult(
    queryResult: ObjectRecord[],
    flatObjectMetadata: FlatObjectMetadata,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
    authContext: WorkspaceAuthContext,
  ): Promise<ObjectRecord[]> {
    return this.commonResultGettersService.processRecordArray(
      queryResult,
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      authContext.workspace.id,
    );
  }

  async validate(
    args: CommonInput<DestroyManyQueryArgs>,
    queryRunnerContext: CommonBaseQueryRunnerContext,
  ): Promise<void> {
    const { flatObjectMetadata } = queryRunnerContext;

    assertMutationNotOnRemoteObject(flatObjectMetadata);

    if (!isDefined(args.filter)) {
      throw new CommonQueryRunnerException(
        'Filter is required',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    args.filter.id?.in?.forEach((id: string) => assertIsValidUuid(id));
  }
}
