import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import { t } from '@lingui/core/macro';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { canCreateRecordsForObjectMetadataItem } from '@/object-record/utils/canCreateRecordsForObjectMetadataItem';
import { type DocumentNode, getOperationAST, Kind } from 'graphql';
import { z } from 'zod';
import {
  assertCampaignCreationCurrent,
  CampaignCreationBoundaryError,
  CampaignCreationUnconfirmedError,
  hasCompleteCampaignCreationSelection,
  isCampaignCreationDuplicate,
  isCampaignCreationRecordNotConfirmed,
  isCampaignCreationTransportUncertain,
} from '@/apollo/utils/campaignCreationOperation';
import { generateCreateOneRecordMutation } from '@/object-metadata/utils/generateCreateOneRecordMutation';
import { type RecordGqlNode } from '@/object-record/graphql/types/RecordGqlNode';
import { useFindOneRecordQuery } from '@/object-record/hooks/useFindOneRecordQuery';
import { campaignCreationState } from '@/object-record/record-index/states/campaignCreationState';
import {
  type CampaignCreationAttempt,
  type CampaignCreationOperationContext,
  type CampaignCreationWarning,
  type CreateOneRecordOptions,
} from '@/object-record/record-index/types/CampaignCreationAttempt';
import { useState } from 'react';
import { v4 } from 'uuid';

import { triggerCreateRecordsOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerCreateRecordsOptimisticEffect';
import { triggerDestroyRecordsOptimisticEffect } from '@/apollo/optimistic-effect/utils/triggerDestroyRecordsOptimisticEffect';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useCreateOneRecordInCache } from '@/object-record/cache/hooks/useCreateOneRecordInCache';
import { deleteRecordFromCache } from '@/object-record/cache/utils/deleteRecordFromCache';
import { getObjectTypename } from '@/object-record/cache/utils/getObjectTypename';
import { getRecordFromRecordNode } from '@/object-record/cache/utils/getRecordFromRecordNode';
import { getRecordNodeFromRecord } from '@/object-record/cache/utils/getRecordNodeFromRecord';
import { useGenerateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/hooks/useGenerateDepthRecordGqlFieldsFromObject';
import { useCreateOneRecordMutation } from '@/object-record/hooks/useCreateOneRecordMutation';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import {
  type ObjectRecord as ObjectRecordShared,
  type RecordGqlOperationGqlRecordFields,
} from 'twenty-shared/types';

import { type BaseObjectRecord } from '@/object-record/types/BaseObjectRecord';
import { computeOptimisticCreateRecordBaseRecordInput } from '@/object-record/utils/computeOptimisticCreateRecordBaseRecordInput';
import { computeOptimisticRecordFromInput } from '@/object-record/utils/computeOptimisticRecordFromInput';
import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { getCreateOneRecordMutationResponseField } from '@/object-record/utils/getCreateOneRecordMutationResponseField';
import { sanitizeRecordInput } from '@/object-record/utils/sanitizeRecordInput';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { CustomError, isDefined } from 'twenty-shared/utils';

type CampaignCreationReadResult =
  | { kind: 'found'; node: RecordGqlNode }
  | { kind: 'not-confirmed' };

type useCreateOneRecordProps = {
  objectNameSingular: string;
  recordGqlFields?: RecordGqlOperationGqlRecordFields;
  skipPostOptimisticEffect?: boolean;
  shouldMatchRootQueryFilter?: boolean;
};

export const useCreateOneRecord = <
  CreatedObjectRecord extends ObjectRecord = ObjectRecord,
>({
  objectNameSingular,
  recordGqlFields,
  skipPostOptimisticEffect = false,
  shouldMatchRootQueryFilter,
}: useCreateOneRecordProps) => {
  const { upsertRecordsInStore } = useUpsertRecordsInStore();
  const apolloCoreClient = useApolloCoreClient();
  const [loading, setLoading] = useState(false);

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const { recordGqlFields: depthOneRecordGqlFields } =
    useGenerateDepthRecordGqlFieldsFromObject({
      objectNameSingular,
      depth: 1,
    });

  const computedRecordGqlFields = recordGqlFields ?? depthOneRecordGqlFields;

  const { createOneRecordMutation } = useCreateOneRecordMutation({
    objectNameSingular,
    recordGqlFields: computedRecordGqlFields,
  });

  const { findOneRecordQuery } = useFindOneRecordQuery({
    objectNameSingular,
    recordGqlFields: { ...computedRecordGqlFields, id: true, deletedAt: true },
  });
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);

  const createOneRecordInCache = useCreateOneRecordInCache<CreatedObjectRecord>(
    {
      objectMetadataItem,
    },
  );

  const { objectMetadataItems } = useObjectMetadataItems();
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const { refetchAggregateQueries } = useRefetchAggregateQueries();

  const createOneRecord = async (
    recordInput: Partial<CreatedObjectRecord>,
    options?: CreateOneRecordOptions,
  ): Promise<CreatedObjectRecord> => {
    setLoading(true);
    try {
      if (options?.campaignCreation) {
        const { context, intent } = options.campaignCreation;
        assertCampaignCreationCurrent(context);
        const getAttempt = () =>
          context.store.get(campaignCreationState.atom).attempts[
            context.attemptKey
          ];
        const attempt = getAttempt();
        if (
          objectNameSingular !== 'campaign' ||
          !attempt?.inputJson ||
          recordInput.id !== attempt.recordId ||
          attempt.objectMetadataId !== objectMetadataItem.id ||
          JSON.stringify(recordInput) !== attempt.inputJson
        ) {
          throw new Error('Invalid Campaign creation request');
        }
        const updateAttempt = (changes: Partial<CampaignCreationAttempt>) => {
          const state = context.store.get(campaignCreationState.atom);
          const current = state.attempts[context.attemptKey];
          if (
            state.sessionGeneration === context.sessionGeneration &&
            current?.runId === context.runId
          ) {
            context.store.set(campaignCreationState.atom, {
              ...state,
              attempts: {
                ...state.attempts,
                [context.attemptKey]: { ...current, ...changes },
              },
            });
          }
        };
        const operationContext = (
          kind: 'create' | 'read',
        ): CampaignCreationOperationContext => ({
          ...context,
          kind,
          transport: { dispatched: false, uncertain: false },
        });
        const validateCampaignNode = (
          value: unknown,
          operation: CampaignCreationOperationContext,
          document: DocumentNode,
        ): RecordGqlNode => {
          assertCampaignCreationCurrent(operation);
          const parsed = z
            .object({
              id: z.string().uuid(),
              __typename: z.literal('Campaign'),
              deletedAt: z.null(),
              name: z.string().nullable().optional(),
              objective: z.string().nullable().optional(),
              position: z.number().nullable().optional(),
              createdAt: z.string().optional(),
              updatedAt: z.string().optional(),
            })
            .passthrough()
            .safeParse(value);
          const root = getOperationAST(document)?.selectionSet.selections[0];
          if (
            !parsed.success ||
            parsed.data.id !== attempt.recordId ||
            root?.kind !== Kind.FIELD ||
            !root.selectionSet ||
            !hasCompleteCampaignCreationSelection(
              parsed.data,
              root.selectionSet,
            )
          ) {
            throw new CampaignCreationUnconfirmedError();
          }
          for (const field of objectMetadataItem.readableFields) {
            if (
              Object.hasOwn(parsed.data, field.name) &&
              field.isNullable === false &&
              parsed.data[field.name] === null
            )
              throw new CampaignCreationUnconfirmedError();
          }
          return parsed.data;
        };
        const campaignMutation = generateCreateOneRecordMutation({
          objectMetadataItem,
          objectMetadataItems,
          recordGqlFields: {
            ...computedRecordGqlFields,
            id: true,
            deletedAt: true,
          },
          objectPermissionsByObjectMetadataId,
        });
        const readRetainedCampaign =
          async (): Promise<CampaignCreationReadResult> => {
            const readContext = operationContext('read');
            assertCampaignCreationCurrent(readContext);
            if (getAttempt()?.phase !== 'saved')
              updateAttempt({ phase: 'checking' });
            const readPromise = apolloCoreClient.query<
              Record<string, RecordGqlNode | null>
            >({
              query: findOneRecordQuery,
              variables: { objectRecordId: attempt.recordId },
              fetchPolicy: 'no-cache',
              errorPolicy: 'none',
              context: {
                campaignCreation: readContext,
                queryDeduplication: false,
              },
            });
            let result: Awaited<typeof readPromise>;
            try {
              result = await readPromise;
            } catch (error) {
              assertCampaignCreationCurrent(readContext);
              if (isCampaignCreationRecordNotConfirmed(error))
                return { kind: 'not-confirmed' };
              throw error;
            }
            assertCampaignCreationCurrent(readContext);
            if (
              !result.data ||
              !Object.hasOwn(result.data, 'campaign') ||
              result.data.campaign === null
            )
              throw new CampaignCreationUnconfirmedError();
            return {
              kind: 'found',
              node: validateCampaignNode(
                result.data.campaign,
                readContext,
                findOneRecordQuery,
              ),
            };
          };
        const mutateCampaign = async (): Promise<RecordGqlNode> => {
          assertCampaignCreationCurrent(operationContext('read'));
          const currentMetadata = context.store
            .get(objectMetadataItemsSelector.atom)
            .find((item) => item.id === context.objectMetadataId);
          if (!currentMetadata) throw new CampaignCreationBoundaryError();
          const currentPermissions = getObjectPermissionsForObject(
            Object.fromEntries(
              (
                context.store.get(currentUserWorkspaceState.atom)
                  ?.objectsPermissions ?? []
              ).map((item) => [item.objectMetadataId, item]),
            ),
            context.objectMetadataId,
          );
          if (
            !canCreateRecordsForObjectMetadataItem({
              objectMetadataItem: currentMetadata,
              objectPermissions: currentPermissions,
            })
          ) {
            throw new Error(
              t`You no longer have permission to create Campaigns.`,
            );
          }
          const createContext = operationContext('create');
          assertCampaignCreationCurrent(createContext);
          updateAttempt({ phase: 'creating' });
          try {
            const result = await apolloCoreClient.mutate<
              Record<string, RecordGqlNode>
            >({
              mutation: campaignMutation,
              variables: { input: JSON.parse(attempt.inputJson!) },
              fetchPolicy: 'no-cache',
              errorPolicy: 'none',
              context: {
                campaignCreation: createContext,
                queryDeduplication: false,
              },
            });
            return validateCampaignNode(
              result.data?.createCampaign,
              createContext,
              campaignMutation,
            );
          } catch (error) {
            assertCampaignCreationCurrent(createContext);
            if (
              getAttempt()?.uncertain &&
              (isCampaignCreationTransportUncertain(error) ||
                isCampaignCreationDuplicate(error))
            ) {
              const recovered = await readRetainedCampaign();
              if (recovered.kind === 'found') return recovered.node;
              throw new CampaignCreationUnconfirmedError();
            }
            if (
              error instanceof CampaignCreationUnconfirmedError ||
              (createContext.transport.dispatched &&
                !CombinedGraphQLErrors.is(error) &&
                !ServerError.is(error))
            ) {
              updateAttempt({ phase: 'unconfirmed', uncertain: true });
              throw new CampaignCreationUnconfirmedError();
            }
            throw error;
          }
        };
        let node: RecordGqlNode;
        if (intent === 'open-saved') {
          if (attempt.savedBoundaryGeneration === context.boundaryGeneration) {
            if (!attempt.savedNode)
              throw new CampaignCreationUnconfirmedError();
            node = attempt.savedNode;
          } else {
            const saved = await readRetainedCampaign();
            if (saved.kind !== 'found')
              throw new CampaignCreationUnconfirmedError();
            node = saved.node;
          }
        } else if (intent === 'retry') {
          const checked = await readRetainedCampaign();
          if (checked.kind === 'found') node = checked.node;
          else {
            if (getAttempt()?.phase === 'saved')
              throw new CampaignCreationUnconfirmedError();
            node = await mutateCampaign();
          }
        } else {
          node = await mutateCampaign();
        }
        assertCampaignCreationCurrent(context);
        updateAttempt({
          phase: 'saved',
          savedNode: node,
          savedBoundaryGeneration: context.boundaryGeneration,
        });
        const record = getRecordFromRecordNode<CreatedObjectRecord>({
          recordNode: node,
        });
        if (getAttempt()?.completionAttempted) return record;
        updateAttempt({ completionAttempted: true });
        const warnings: CampaignCreationWarning[] = [];
        try {
          let normalized = false;
          try {
            assertCampaignCreationCurrent(context);
            normalized = isDefined(createOneRecordInCache(record));
            if (!normalized) warnings.push('cache');
          } catch (error) {
            if (error instanceof CampaignCreationBoundaryError) throw error;
            warnings.push('cache');
          }
          if (normalized) {
            try {
              assertCampaignCreationCurrent(context);
              triggerCreateRecordsOptimisticEffect({
                cache: apolloCoreClient.cache,
                objectMetadataItem,
                objectMetadataItems,
                recordsToCreate: [node],
                checkForRecordInCache: false,
                shouldMatchRootQueryFilter: true,
                objectPermissionsByObjectMetadataId,
                upsertRecordsInStore,
                creationPosition: attempt.origin.position ?? undefined,
              });
            } catch (error) {
              if (error instanceof CampaignCreationBoundaryError) throw error;
              warnings.push('cache');
            }
          }
          try {
            assertCampaignCreationCurrent(context);
            upsertRecordsInStore({ partialRecords: [record] });
          } catch (error) {
            if (error instanceof CampaignCreationBoundaryError) throw error;
            warnings.push('store');
          }
          try {
            assertCampaignCreationCurrent(context);
            await refetchAggregateQueries({
              objectMetadataNamePlural: 'campaigns',
              campaignCreation: context,
            });
            assertCampaignCreationCurrent(context);
          } catch (error) {
            if (error instanceof CampaignCreationBoundaryError) throw error;
            warnings.push('aggregate');
          }
          try {
            assertCampaignCreationCurrent(context);
            dispatchObjectRecordOperationBrowserEvent({
              objectMetadataItem,
              operation: {
                type: 'create-one',
                createdRecord: { ...node, position: attempt.origin.position },
              },
            });
          } catch (error) {
            if (error instanceof CampaignCreationBoundaryError) throw error;
            warnings.push('event');
          }
        } finally {
          updateAttempt({ warnings: [...new Set(warnings)] });
        }
        return record;
      }

      const idForCreation = recordInput.id ?? v4();

      const sanitizedInput = {
        ...sanitizeRecordInput({
          objectMetadataItem,
          recordInput,
        }),
        id: idForCreation,
      };

      const optimisticRecordInput = computeOptimisticRecordFromInput({
        cache: apolloCoreClient.cache,
        currentWorkspaceMember: currentWorkspaceMember,
        objectMetadataItem,
        objectMetadataItems,
        recordInput: {
          ...computeOptimisticCreateRecordBaseRecordInput(objectMetadataItem),
          ...sanitizedInput,
        },
        objectPermissionsByObjectMetadataId,
      });
      const recordCreatedInCache = createOneRecordInCache({
        ...optimisticRecordInput,
        id: idForCreation,
        __typename: getObjectTypename(objectMetadataItem.nameSingular),
      });

      if (isDefined(recordCreatedInCache)) {
        const optimisticRecordNode = getRecordNodeFromRecord({
          objectMetadataItem,
          objectMetadataItems,
          record: recordCreatedInCache,
          recordGqlFields: computedRecordGqlFields,
          computeReferences: false,
        });

        if (
          skipPostOptimisticEffect === false &&
          optimisticRecordNode !== null
        ) {
          triggerCreateRecordsOptimisticEffect({
            cache: apolloCoreClient.cache,
            objectMetadataItem,
            recordsToCreate: [optimisticRecordNode],
            objectMetadataItems,
            shouldMatchRootQueryFilter,
            objectPermissionsByObjectMetadataId,
            upsertRecordsInStore,
          });
        }
      }

      const mutationResponseField =
        getCreateOneRecordMutationResponseField(objectNameSingular);

      const createdObject = await apolloCoreClient
        .mutate<ObjectRecord>({
          mutation: createOneRecordMutation,
          variables: {
            input: sanitizedInput,
          },
          update: (cache, { data }) => {
            const record = data?.[mutationResponseField];
            if (skipPostOptimisticEffect === false && isDefined(record)) {
              triggerCreateRecordsOptimisticEffect({
                cache,
                objectMetadataItem,
                recordsToCreate: [record],
                objectMetadataItems,
                shouldMatchRootQueryFilter,
                checkForRecordInCache: true,
                objectPermissionsByObjectMetadataId,
                upsertRecordsInStore,
              });
            }
          },
        })
        .catch((error: Error) => {
          if (!isDefined(recordCreatedInCache)) {
            throw error;
          }

          deleteRecordFromCache({
            objectMetadataItems,
            objectMetadataItem,
            cache: apolloCoreClient.cache,
            recordToDestroy: recordCreatedInCache,
            upsertRecordsInStore,
            objectPermissionsByObjectMetadataId,
          });

          triggerDestroyRecordsOptimisticEffect({
            cache: apolloCoreClient.cache,
            objectMetadataItem,
            recordsToDestroy: [recordCreatedInCache],
            objectMetadataItems,
            upsertRecordsInStore,
            objectPermissionsByObjectMetadataId,
          });

          throw error;
        });

      await refetchAggregateQueries({
        objectMetadataNamePlural: objectMetadataItem.namePlural,
      });

      const positionToUse =
        recordInput.position === 'first'
          ? 'first'
          : recordInput.position === 'last'
            ? 'last'
            : null;

      const createdRecord = createdObject.data?.[
        mutationResponseField
      ] as ObjectRecordShared & BaseObjectRecord;

      dispatchObjectRecordOperationBrowserEvent({
        objectMetadataItem,
        operation: {
          type: 'create-one',
          createdRecord: { ...createdRecord, position: positionToUse },
        },
      });

      if (!isDefined(createdRecord)) {
        throw new CustomError('Failed to create record');
      }

      return getRecordFromRecordNode<CreatedObjectRecord>({
        recordNode: createdRecord,
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    createOneRecord,
    loading,
  };
};
