import { Injectable } from '@nestjs/common';

import { isDefined } from 'class-validator';
import { QUERY_MAX_RECORDS_FROM_RELATION } from 'twenty-shared/constants';
import { ObjectRecord } from 'twenty-shared/types';
import { FindOptionsRelations, ObjectLiteral } from 'typeorm';

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
  UpdateManyQueryArgs,
} from 'src/engine/api/common/types/common-query-args.type';
import { buildColumnsToReturn } from 'src/engine/api/graphql/graphql-query-runner/utils/build-columns-to-return';
import { assertIsValidUuid } from 'src/engine/api/graphql/workspace-query-runner/utils/assert-is-valid-uuid.util';
import { WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { assertMutationNotOnRemoteObject } from 'src/engine/metadata-modules/object-metadata/utils/assert-mutation-not-on-remote-object.util';

@Injectable()
export class CommonUpdateManyQueryRunnerService extends CommonBaseQueryRunnerService<
  UpdateManyQueryArgs,
  ObjectRecord[]
> {
  protected readonly operationName = CommonQueryNames.UPDATE_MANY;

  constructor(
    private readonly myahInboxContactTriageLifecycleService: MyahInboxContactTriageLifecycleService,
  ) {
    super();
  }

  async run(
    args: CommonExtendedInput<UpdateManyQueryArgs>,
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

    const updatedRecords =
      flatObjectMetadata.nameSingular === 'creator'
        ? await this.runCreatorUpdateInTransaction({
            args,
            queryRunnerContext,
            queryBuilder,
            columnsToReturn,
          })
        : this.isInboxSourceCreatorRelationshipUpdate(
              flatObjectMetadata.nameSingular,
              args.data,
            )
          ? await this.runSourceCreatorRelationshipUpdateInTransaction({
              args,
              queryRunnerContext,
              queryBuilder,
              columnsToReturn,
            })
          : ((
              await queryBuilder
                .update()
                .set(args.data)
                .returning(columnsToReturn)
                .execute()
            ).generatedMaps as ObjectRecord[]);

    if (isDefined(args.selectedFieldsResult.relations)) {
      await this.processNestedRelationsHelper.processNestedRelations({
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
        parentObjectMetadataItem: flatObjectMetadata,
        parentObjectRecords: updatedRecords,
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

    return updatedRecords;
  }

  private async runCreatorUpdateInTransaction({
    args,
    queryRunnerContext,
    queryBuilder,
    columnsToReturn,
  }: {
    args: CommonExtendedInput<UpdateManyQueryArgs>;
    queryRunnerContext: CommonExtendedQueryRunnerContext;
    queryBuilder: ReturnType<typeof buildMutationQueryBuilder>;
    columnsToReturn: string[];
  }): Promise<ObjectRecord[]> {
    // This permission-aware read is intentionally limited to authorized IDs.
    // Current Creator identity is only resolved after transaction locks.
    const authorizedIds = await this.readSortedTargetIds(
      queryBuilder,
      queryRunnerContext.flatObjectMetadata.nameSingular,
    );
    if (authorizedIds.length === 0) return [];

    return queryRunnerContext.workspaceDataSource.transaction(
      async (manager: WorkspaceEntityManager) =>
        this.myahInboxContactTriageLifecycleService.withPreparedCreatorMutationInTransaction(
          {
            workspaceId: queryRunnerContext.authContext.workspace.id,
            creatorIds: authorizedIds,
            manager,
            mutate: async () => {
              const repository = manager.getRepository(
                queryRunnerContext.flatObjectMetadata.nameSingular,
                queryRunnerContext.rolePermissionConfig,
                queryRunnerContext.authContext,
              );
              const transactionQueryBuilder = buildMutationQueryBuilder({
                repository,
                alias: queryRunnerContext.flatObjectMetadata.nameSingular,
                filter: args.filter,
                commonQueryParser: queryRunnerContext.commonQueryParser,
              });
              this.assertTargetIdsUnchanged(
                authorizedIds,
                await this.readSortedTargetIds(
                  transactionQueryBuilder,
                  queryRunnerContext.flatObjectMetadata.nameSingular,
                ),
                'Creator records changed before transaction reconciliation',
              );
              const result = await transactionQueryBuilder
                .update()
                .set(args.data)
                .returning(columnsToReturn)
                .execute();

              return result.generatedMaps as ObjectRecord[];
            },
          },
        ),
    );
  }

  private isInboxSourceCreatorRelationshipUpdate(
    objectName: string,
    data: Record<string, unknown>,
  ): boolean {
    return (
      (objectName === 'messageThread' ||
        objectName === 'myahSocialConversation' ||
        objectName === 'socialConversation' ||
        objectName === '_myahSocialConversation') &&
      (Object.prototype.hasOwnProperty.call(data, 'creatorId') ||
        Object.prototype.hasOwnProperty.call(data, 'creator'))
    );
  }

  private async runSourceCreatorRelationshipUpdateInTransaction({
    args,
    queryRunnerContext,
    queryBuilder,
    columnsToReturn,
  }: {
    args: CommonExtendedInput<UpdateManyQueryArgs>;
    queryRunnerContext: CommonExtendedQueryRunnerContext;
    queryBuilder: ReturnType<typeof buildMutationQueryBuilder>;
    columnsToReturn: string[];
  }): Promise<ObjectRecord[]> {
    const objectName = queryRunnerContext.flatObjectMetadata.nameSingular;
    const sourceType =
      objectName === 'messageThread'
        ? 'EMAIL_THREAD'
        : 'INSTAGRAM_CONVERSATION';
    const authorizedIds = await this.readSortedTargetIds(
      queryBuilder,
      objectName,
    );
    if (authorizedIds.length === 0) return [];

    return queryRunnerContext.workspaceDataSource.transaction(
      (manager: WorkspaceEntityManager) =>
        this.myahInboxContactTriageLifecycleService.withPreparedSourceMutationInTransaction(
          {
            workspaceId: queryRunnerContext.authContext.workspace.id,
            sourceType,
            sourceRecordIds: authorizedIds,
            nextCreatorIds: this.creatorIdsFromUpdateData(args.data),
            manager,
            verify: async () => {
              const repository = manager.getRepository(
                objectName,
                queryRunnerContext.rolePermissionConfig,
                queryRunnerContext.authContext,
              );
              const transactionQueryBuilder = buildMutationQueryBuilder({
                repository,
                alias: objectName,
                filter: args.filter,
                commonQueryParser: queryRunnerContext.commonQueryParser,
              });
              this.assertTargetIdsUnchanged(
                authorizedIds,
                await this.readSortedTargetIds(
                  transactionQueryBuilder,
                  objectName,
                ),
                'Inbox source records changed before transaction reconciliation',
              );
            },
            mutate: async () => {
              const repository = manager.getRepository(
                objectName,
                queryRunnerContext.rolePermissionConfig,
                queryRunnerContext.authContext,
              );
              const transactionQueryBuilder = buildMutationQueryBuilder({
                repository,
                alias: objectName,
                filter: args.filter,
                commonQueryParser: queryRunnerContext.commonQueryParser,
              });
              const result = await transactionQueryBuilder
                .update()
                .set(args.data)
                .returning(columnsToReturn)
                .execute();

              return result.generatedMaps as ObjectRecord[];
            },
          },
        ),
    );
  }

  private creatorIdsFromUpdateData(data: Record<string, unknown>): string[] {
    const creatorId = data.creatorId;
    if (typeof creatorId === 'string') return [creatorId];

    const creator = data.creator;
    if (typeof creator === 'string') return [creator];
    if (
      creator !== null &&
      typeof creator === 'object' &&
      'id' in creator &&
      typeof creator.id === 'string'
    ) {
      return [creator.id];
    }

    return [];
  }

  private async readSortedTargetIds(
    queryBuilder: ReturnType<typeof buildMutationQueryBuilder>,
    alias: string,
  ): Promise<string[]> {
    const rows = (await queryBuilder
      .clone()
      .select(`${alias}.id`, 'id')
      .getRawMany()) as Array<{ id?: string; [key: string]: unknown }>;

    return rows
      .map((row) => row.id ?? row[`${alias}_id`])
      .filter((id): id is string => typeof id === 'string')
      .sort();
  }

  private assertTargetIdsUnchanged(
    authorizedIds: string[],
    currentIds: string[],
    message: string,
  ): void {
    if (
      currentIds.length !== authorizedIds.length ||
      currentIds.some((id, index) => id !== authorizedIds[index])
    ) {
      throw new CommonQueryRunnerException(
        message,
        CommonQueryRunnerExceptionCode.RECORD_NOT_FOUND,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }
  }

  async computeArgs(
    args: CommonInput<UpdateManyQueryArgs>,
    queryRunnerContext: CommonBaseQueryRunnerContext,
  ): Promise<CommonInput<UpdateManyQueryArgs>> {
    const {
      authContext,
      flatObjectMetadata,
      flatFieldMetadataMaps,
      flatObjectMetadataMaps,
    } = queryRunnerContext;

    return {
      ...args,
      filter: this.filterArgProcessor.process({
        filter: args.filter,
        flatObjectMetadata,
        flatObjectMetadataMaps,
        flatFieldMetadataMaps,
      }),
      data: (
        await this.dataArgProcessor.process({
          partialRecordInputs: [args.data],
          authContext,
          flatObjectMetadata,
          flatFieldMetadataMaps,
          flatObjectMetadataMaps,
          shouldBackfillPositionIfUndefined: false,
        })
      )[0],
    };
  }

  async validate(
    args: CommonInput<UpdateManyQueryArgs>,
    queryRunnerContext: CommonBaseQueryRunnerContext,
  ): Promise<void> {
    const { flatObjectMetadata } = queryRunnerContext;

    assertMutationNotOnRemoteObject(flatObjectMetadata);
    if (!args.filter) {
      throw new CommonQueryRunnerException(
        'Filter is required',
        CommonQueryRunnerExceptionCode.INVALID_QUERY_INPUT,
        { userFriendlyMessage: STANDARD_ERROR_MESSAGE },
      );
    }

    args.filter.id?.in?.forEach((id: string) => assertIsValidUuid(id));
  }

  async processQueryResult(
    queryResult: ObjectRecord[],
    flatObjectMetadata: FlatObjectMetadata,
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>,
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>,
    authContext: WorkspaceAuthContext,
  ): Promise<ObjectRecord[]> {
    return await this.commonResultGettersService.processRecordArray(
      queryResult,
      flatObjectMetadata,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      authContext.workspace.id,
    );
  }
}
