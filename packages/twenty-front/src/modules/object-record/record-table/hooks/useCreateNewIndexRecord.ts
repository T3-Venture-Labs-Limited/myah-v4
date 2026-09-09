import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { getNonReadableFieldMetadataIdsFromObjectPermissions } from '@/object-metadata/utils/getNonReadableFieldMetadataIdsFromObjectPermissions';
import { t } from '@lingui/core/macro';
import { ServerError } from '@apollo/client/errors';
import { useNavigate } from 'react-router-dom';
import { getTokenPair } from '@/apollo/utils/getTokenPair';
import {
  assertCampaignCreationCurrent,
  assertCampaignCreationIdentityCurrent,
  CampaignCreationBoundaryError,
  CampaignCreationUnconfirmedError,
  campaignCreationActorKey,
  campaignCreationAttemptKey,
  campaignCreationIdentityKey,
  decodeCampaignCreationIdentity,
} from '@/apollo/utils/campaignCreationOperation';
import { isValidReturnToPath } from '@/auth/utils/isValidReturnToPath';
import { campaignCreationState } from '@/object-record/record-index/states/campaignCreationState';
import {
  type CampaignCreationAttempt,
  type CampaignCreationOperationContext,
} from '@/object-record/record-index/types/CampaignCreationAttempt';
import { sanitizeRecordInput } from '@/object-record/utils/sanitizeRecordInput';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { snackBarInternalComponentState } from '@/ui/feedback/snack-bar-manager/states/snackBarInternalComponentState';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useOptionalRecordIndexContext } from '@/object-record/record-index/contexts/RecordIndexContext';
import { recordGroupDefinitionsComponentSelector } from '@/object-record/record-group/states/selectors/recordGroupDefinitionsComponentSelector';
import { getFieldMetadataItemGqlFieldName } from '@/object-metadata/utils/getFieldMetadataItemGqlFieldName';
import { recordIndexGroupFieldMetadataItemComponentState } from '@/object-record/record-index/states/recordIndexGroupFieldMetadataComponentState';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';
import { recordIndexCreationOptionsComponentState } from '@/object-record/record-index/states/recordIndexCreationOptionsComponentState';
import { recordIndexRecordIdsByGroupComponentFamilyState } from '@/object-record/record-index/states/recordIndexRecordIdsByGroupComponentFamilyState';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { useBuildRecordInputFromFilters } from '@/object-record/record-table/hooks/useBuildRecordInputFromFilters';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { canOpenObjectInSidePanel } from '@/object-record/utils/canOpenObjectInSidePanel';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { useAtomComponentFamilyStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateCallbackState';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';
import { useStore } from 'jotai';
import { useCallback, useContext } from 'react';
import { AppPath } from 'twenty-shared/types';
import { findByProperty, isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';
import { useNavigateApp } from '~/hooks/useNavigateApp';

type UseCreateNewIndexRecordProps = {
  objectMetadataItem: EnrichedObjectMetadataItem;
  instanceId?: string;
};

export const useCreateNewIndexRecord = ({
  objectMetadataItem,
  instanceId,
}: UseCreateNewIndexRecordProps) => {
  const recordGroupDefinitions = useAtomComponentSelectorValue(
    recordGroupDefinitionsComponentSelector,
    instanceId,
  );

  const store = useStore();
  const contextStoreInstance = useContext(ContextStoreComponentInstanceContext);
  const { currentView } = useGetCurrentViewOnly();
  const recordIndexRecordIdsByGroupCallbackState =
    useAtomComponentFamilyStateCallbackState(
      recordIndexRecordIdsByGroupComponentFamilyState,
      instanceId,
    );

  const recordIndexGroupFieldMetadataItem = useAtomComponentStateValue(
    recordIndexGroupFieldMetadataItemComponentState,
    instanceId,
  );

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const { closeSidePanelMenu } = useSidePanelMenu();

  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: objectMetadataItem.nameSingular,
    shouldMatchRootQueryFilter: true,
  });

  const { upsertRecordsInStore } = useUpsertRecordsInStore();

  const navigate = useNavigateApp();
  const navigateToOrigin = useNavigate();
  const snackBarContext = useContext(SnackBarComponentInstanceContext);
  const {
    enqueueInfoSnackBar,
    enqueueErrorSnackBar,
    enqueueWarningSnackBar,
    handleSnackBarClose,
  } = useSnackBar();

  const { buildRecordInputFromFilters } = useBuildRecordInputFromFilters({
    objectMetadataItem,
    instanceId,
  });

  const { buildRecordInputFromRLSPredicates } =
    useBuildRecordInputFromRLSPredicates({
      objectMetadataItem,
    });
  const recordIndexContext = useOptionalRecordIndexContext();
  const recordIndexId = instanceId ?? recordIndexContext?.recordIndexId;

  const createNewIndexRecord = useCallback(
    async (
      recordInput?: Partial<ObjectRecord>,
    ): Promise<ObjectRecord | undefined> => {
      const creationOptions = isDefined(recordIndexId)
        ? store.get(
            recordIndexCreationOptionsComponentState.atomFamily({
              instanceId: recordIndexId,
            }),
          )
        : undefined;
      if (objectMetadataItem.nameSingular === 'campaign') {
        const identity = decodeCampaignCreationIdentity(
          getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
        );
        if (!identity || !recordIndexId) return undefined;
        const initial = store.get(campaignCreationState.atom);
        if (initial.actorKey !== campaignCreationActorKey(identity))
          return undefined;
        const attemptKey = campaignCreationAttemptKey(identity);
        const existing = initial.attempts[attemptKey];
        const returnPath =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        const contextStoreInstanceId =
          contextStoreInstance?.instanceId ?? MAIN_CONTEXT_STORE_INSTANCE_ID;
        const isOriginalOrigin = (attempt: CampaignCreationAttempt) =>
          attempt.origin.recordIndexId === recordIndexId &&
          attempt.origin.contextStoreInstanceId === contextStoreInstanceId &&
          attempt.origin.returnPath ===
            window.location.pathname +
              window.location.search +
              window.location.hash &&
          (store.get(campaignCreationState.atom).mountedOrigins[
            attempt.origin.recordIndexId
          ] ?? 0) > 0;
        const returnToOrigin = (attempt: CampaignCreationAttempt) => {
          enqueueInfoSnackBar({
            message:
              attempt.origin.returnPath === returnPath &&
              !(
                store.get(campaignCreationState.atom).mountedOrigins[
                  attempt.origin.recordIndexId
                ] > 0
              )
                ? t`Reopen the original Campaign view to continue this creation.`
                : t`A Campaign creation is pending in another view. Return there to continue.`,
            options: {
              dedupeKey: `campaign-origin-${attempt.recordId}`,
              buttonLabel: t`Return to original view`,
              buttonOnClick: () => {
                const current = store.get(campaignCreationState.atom);
                const currentIdentity = decodeCampaignCreationIdentity(
                  getTokenPair()?.accessOrWorkspaceAgnosticToken.token,
                );
                if (
                  current.sessionGeneration !== initial.sessionGeneration ||
                  current.boundaryGeneration !== initial.boundaryGeneration ||
                  !currentIdentity ||
                  campaignCreationIdentityKey(currentIdentity) !==
                    campaignCreationIdentityKey(identity) ||
                  !isDefined(current.attempts[attemptKey]) ||
                  !isValidReturnToPath(attempt.origin.returnPath)
                )
                  return;
                navigateToOrigin(attempt.origin.returnPath);
              },
            },
          });
        };
        if (isDefined(existing) && !isOriginalOrigin(existing)) {
          returnToOrigin(existing);
          return undefined;
        }
        if (existing?.runId !== undefined && existing.runId !== null) {
          enqueueInfoSnackBar({
            message: t`Campaign creation is already in progress.`,
            options: { dedupeKey: `campaign-create-${existing.recordId}` },
          });
          return undefined;
        }
        if (!isValidReturnToPath(returnPath)) return undefined;
        const recordId = existing?.recordId ?? v4();
        const runId = initial.nextRunId + 1;
        const attempt: CampaignCreationAttempt = isDefined(existing)
          ? { ...existing, runId }
          : {
              identity,
              recordId,
              objectMetadataId: objectMetadataItem.id,
              inputJson: null,
              origin: {
                recordIndexId,
                contextStoreInstanceId,
                returnPath,
                openRecordIn:
                  contextStoreInstanceId !== MAIN_CONTEXT_STORE_INSTANCE_ID
                    ? (currentView?.openRecordIn ?? ViewOpenRecordIn.SIDE_PANEL)
                    : store.get(recordIndexOpenRecordInState.atom),
                shouldCloseAfterCreation:
                  creationOptions?.shouldCloseAfterCreation ?? false,
                position:
                  recordInput?.position === 'first'
                    ? 'first'
                    : recordInput?.position === 'last'
                      ? 'last'
                      : null,
                groupFieldMetadataId: recordIndexGroupFieldMetadataItem?.id,
              },
              phase: 'preparing',
              runId,
              uncertain: false,
              completionAttempted: false,
              warnings: [],
            };
        store.set(campaignCreationState.atom, {
          ...initial,
          nextRunId: runId,
          attempts: { ...initial.attempts, [attemptKey]: attempt },
        });
        const context: CampaignCreationOperationContext = {
          store,
          attemptKey,
          runId,
          identity,
          objectMetadataId: objectMetadataItem.id,
          sessionGeneration: initial.sessionGeneration,
          boundaryGeneration: initial.boundaryGeneration,
          kind: isDefined(existing) ? 'read' : 'create',
          transport: { dispatched: false, uncertain: false },
          invalidated: false,
        };
        const changeAttempt = (
          change: Partial<CampaignCreationAttempt> | null,
        ) => {
          const state = store.get(campaignCreationState.atom);
          const current = state.attempts[attemptKey];
          if (
            state.sessionGeneration !== context.sessionGeneration ||
            current?.runId !== runId
          )
            return;
          const attempts = { ...state.attempts };
          if (change === null) delete attempts[attemptKey];
          else attempts[attemptKey] = { ...current, ...change };
          store.set(campaignCreationState.atom, { ...state, attempts });
        };
        let pendingId: string | undefined;
        try {
          if (isDefined(existing)) {
            // Explanatory preflight only; all operations still require the full guard below.
            assertCampaignCreationIdentityCurrent(context);
            const currentMetadata = store
              .get(objectMetadataItemsSelector.atom)
              .find((item) => item.id === context.objectMetadataId);
            const currentPermissions = getObjectPermissionsForObject(
              Object.fromEntries(
                (
                  store.get(currentUserWorkspaceState.atom)
                    ?.objectsPermissions ?? []
                ).map((item) => [item.objectMetadataId, item]),
              ),
              context.objectMetadataId,
            );
            const unreadable =
              getNonReadableFieldMetadataIdsFromObjectPermissions({
                objectPermissions: currentPermissions,
              });
            if (
              !currentPermissions.canReadObjectRecords ||
              !['id', 'deletedAt'].every((name) =>
                currentMetadata?.readableFields.some(
                  (field) =>
                    field.name === name && !unreadable.includes(field.id),
                ),
              )
            ) {
              throw new Error(
                t`You no longer have permission to confirm this Campaign creation.`,
              );
            }
          }
          assertCampaignCreationCurrent(context);
          if (!isDefined(existing)) {
            const merged = {
              ...buildRecordInputFromRLSPredicates(),
              ...buildRecordInputFromFilters(),
              ...recordInput,
            };
            const inputJson = JSON.stringify({
              ...sanitizeRecordInput({
                objectMetadataItem,
                recordInput: merged,
              }),
              id: recordId,
            });
            changeAttempt({ inputJson, phase: 'creating' });
          }
          const pendingKey = `campaign-create-${recordId}`;
          enqueueInfoSnackBar({
            message: t`Creating Campaign…`,
            options: { dedupeKey: pendingKey, progress: 0 },
          });
          if (snackBarContext)
            pendingId = store
              .get(
                snackBarInternalComponentState.atomFamily({
                  instanceId: snackBarContext.instanceId,
                }),
              )
              .queue.find((snack) => snack.dedupeKey === pendingKey)?.id;
          const frozen = store.get(campaignCreationState.atom).attempts[
            attemptKey
          ];
          const createdRecord = await createOneRecord(
            JSON.parse(frozen.inputJson!),
            {
              campaignCreation: {
                context,
                intent:
                  existing?.phase === 'saved'
                    ? 'open-saved'
                    : isDefined(existing)
                      ? 'retry'
                      : 'create',
              },
            },
          );
          assertCampaignCreationCurrent(context);
          const saved = store.get(campaignCreationState.atom).attempts[
            attemptKey
          ];
          if (!isOriginalOrigin(saved)) {
            returnToOrigin(saved);
            return undefined;
          }
          const warnings = [...saved.warnings];
          if (
            !existing?.completionAttempted &&
            saved.origin.groupFieldMetadataId
          ) {
            try {
              const currentGroupField = store.get(
                recordIndexGroupFieldMetadataItemComponentState.atomFamily({
                  instanceId: saved.origin.recordIndexId,
                }),
              );
              if (currentGroupField?.id !== saved.origin.groupFieldMetadataId)
                warnings.push('group');
              else {
                const group = recordGroupDefinitions.find(
                  findByProperty(
                    'value',
                    createdRecord[
                      getFieldMetadataItemGqlFieldName(currentGroupField)
                    ],
                  ),
                );
                if (group) {
                  const groupState = recordIndexRecordIdsByGroupCallbackState(
                    group.id,
                  );
                  const withoutCreated = store
                    .get(groupState)
                    .filter((id) => id !== createdRecord.id);
                  store.set(
                    groupState,
                    saved.origin.position === 'first'
                      ? [createdRecord.id, ...withoutCreated]
                      : [...withoutCreated, createdRecord.id],
                  );
                }
              }
            } catch {
              warnings.push('group');
            }
          }
          changeAttempt({ warnings: [...new Set(warnings)] });
          assertCampaignCreationCurrent(context);
          if (
            (saved.origin.shouldCloseAfterCreation ||
              saved.origin.openRecordIn === ViewOpenRecordIn.SIDE_PANEL) &&
            canOpenObjectInSidePanel('campaign')
          ) {
            openRecordInSidePanel({
              recordId,
              objectNameSingular: 'campaign',
              isNewRecord: true,
              shouldCloseAfterCreation: saved.origin.shouldCloseAfterCreation,
            });
          } else {
            closeSidePanelMenu();
            assertCampaignCreationCurrent(context);
            navigate(
              AppPath.RecordShowPage,
              { objectNameSingular: 'campaign', objectRecordId: recordId },
              undefined,
              {
                state: {
                  isNewRecord: true,
                  objectRecordId: recordId,
                  labelIdentifierFieldName:
                    getLabelIdentifierFieldMetadataItem(objectMetadataItem)
                      ?.name,
                },
              },
            );
          }
          assertCampaignCreationCurrent(context);
          if (warnings.length)
            enqueueWarningSnackBar({
              message: warnings.every((warning) => warning === 'aggregate')
                ? t`Campaign saved, but counts could not refresh.`
                : t`Campaign saved, but some data could not refresh. Reopen the Campaign or refresh this view.`,
            });
          changeAttempt(null);
          return createdRecord;
        } catch (error) {
          const current = store.get(campaignCreationState.atom).attempts[
            attemptKey
          ];
          if (current?.phase !== 'saved') {
            if (
              current?.uncertain ||
              isDefined(existing) ||
              error instanceof CampaignCreationUnconfirmedError
            )
              changeAttempt({ phase: 'unconfirmed' });
            else changeAttempt(null);
          }
          if (error instanceof CampaignCreationBoundaryError) return undefined;
          // A later boundary transition cannot display this invocation's error in a new UI.
          const state = store.get(campaignCreationState.atom);
          if (
            state.sessionGeneration !== context.sessionGeneration ||
            state.boundaryGeneration !== context.boundaryGeneration
          )
            return undefined;
          if (current?.phase === 'saved')
            enqueueWarningSnackBar({
              message: t`Campaign saved, but could not open. Choose New in the original view to open it.`,
            });
          else if (error instanceof CampaignCreationUnconfirmedError)
            enqueueErrorSnackBar({
              message: t`Could not confirm whether the Campaign was saved. Choose New to check again and retry the same creation. If this keeps happening, check your Campaign access.`,
            });
          else if (!ServerError.is(error) || error.statusCode !== 413)
            enqueueErrorSnackBar({
              apolloError:
                error instanceof Error
                  ? error
                  : new Error(t`Could not create Campaign.`),
            });
          return undefined;
        } finally {
          const current = store.get(campaignCreationState.atom).attempts[
            attemptKey
          ];
          // A restored-boundary retry can share this notice while the old request settles.
          const hasReplacementNoticeOwner =
            current?.recordId === recordId &&
            isDefined(current.runId) &&
            current.runId !== runId;
          if (pendingId && !hasReplacementNoticeOwner)
            handleSnackBarClose(pendingId);
          changeAttempt({ runId: null });
        }
      }
      const recordId = v4();
      const recordInputFromRLSPredicates = buildRecordInputFromRLSPredicates();
      const recordInputFromFilters = buildRecordInputFromFilters();

      const mergedRecordInput = {
        ...recordInputFromRLSPredicates,
        ...recordInputFromFilters,
        ...recordInput,
      };

      const recordIndexOpenRecordIn =
        contextStoreInstance?.instanceId &&
        contextStoreInstance.instanceId !== MAIN_CONTEXT_STORE_INSTANCE_ID
          ? (currentView?.openRecordIn ?? ViewOpenRecordIn.SIDE_PANEL)
          : store.get(recordIndexOpenRecordInState.atom);

      const createdRecord = await createOneRecord({
        id: recordId,
        ...mergedRecordInput,
      });

      await creationOptions?.onRecordCreated?.(createdRecord);

      if (
        (creationOptions?.shouldCloseAfterCreation ||
          recordIndexOpenRecordIn === ViewOpenRecordIn.SIDE_PANEL) &&
        canOpenObjectInSidePanel(objectMetadataItem.nameSingular)
      ) {
        openRecordInSidePanel({
          recordId,
          objectNameSingular: objectMetadataItem.nameSingular,
          isNewRecord: true,
          shouldCloseAfterCreation: creationOptions?.shouldCloseAfterCreation,
        });
      } else {
        const labelIdentifierFieldMetadataItem =
          getLabelIdentifierFieldMetadataItem(objectMetadataItem);

        closeSidePanelMenu();
        navigate(
          AppPath.RecordShowPage,
          {
            objectNameSingular: objectMetadataItem.nameSingular,
            objectRecordId: recordId,
          },
          undefined,
          {
            state: {
              isNewRecord: true,
              objectRecordId: recordId,
              labelIdentifierFieldName: labelIdentifierFieldMetadataItem?.name,
            },
          },
        );
      }

      if (isDefined(recordIndexGroupFieldMetadataItem)) {
        const recordGroup = recordGroupDefinitions.find(
          findByProperty(
            'value',
            createdRecord[
              getFieldMetadataItemGqlFieldName(
                recordIndexGroupFieldMetadataItem,
              )
            ],
          ),
        );

        if (isDefined(recordGroup)) {
          const currentRecordIds = store.get(
            recordIndexRecordIdsByGroupCallbackState(recordGroup.id),
          );

          if (recordInput?.position === 'first') {
            const newRecordIds = [createdRecord.id, ...currentRecordIds];

            store.set(
              recordIndexRecordIdsByGroupCallbackState(recordGroup.id),
              newRecordIds,
            );
          } else {
            const newRecordIds = [...currentRecordIds, createdRecord.id];

            store.set(
              recordIndexRecordIdsByGroupCallbackState(recordGroup.id),
              newRecordIds,
            );
          }
        }
      }

      upsertRecordsInStore({ partialRecords: [createdRecord] });

      return createdRecord;
    },
    [
      store,
      navigateToOrigin,
      snackBarContext,
      enqueueInfoSnackBar,
      enqueueErrorSnackBar,
      enqueueWarningSnackBar,
      handleSnackBarClose,
      buildRecordInputFromRLSPredicates,
      buildRecordInputFromFilters,
      createOneRecord,
      navigate,
      objectMetadataItem,
      openRecordInSidePanel,
      recordGroupDefinitions,
      recordIndexGroupFieldMetadataItem,
      recordIndexRecordIdsByGroupCallbackState,
      upsertRecordsInStore,
      closeSidePanelMenu,
      currentView?.openRecordIn,
      recordIndexId,
      contextStoreInstance?.instanceId,
    ],
  );

  return {
    createNewIndexRecord,
  };
};
