import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useQueryExistingCreatorSocialProfiles } from '@/myah/creator-crm/spreadsheet-import/hooks/useQueryExistingCreatorSocialProfiles';
import { buildCreatorSpreadsheetImportSession } from '@/myah/creator-crm/spreadsheet-import/utils/buildCreatorSpreadsheetImportSession';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useGenerateDepthRecordGqlFieldsFromObject } from '@/object-record/graphql/record-gql-fields/hooks/useGenerateDepthRecordGqlFieldsFromObject';
import { useBatchCreateManyRecords } from '@/object-record/hooks/useBatchCreateManyRecords';
import { useBuildSpreadsheetImportFields } from '@/object-record/spreadsheet-import/hooks/useBuildSpreadSheetImportFields';
import { buildRecordFromImportedStructuredRow } from '@/object-record/spreadsheet-import/utils/buildRecordFromImportedStructuredRow';
import { spreadsheetImportFilterAvailableFieldMetadataItems } from '@/object-record/spreadsheet-import/utils/spreadsheetImportFilterAvailableFieldMetadataItems';
import { spreadsheetImportGetUnicityTableHook } from '@/object-record/spreadsheet-import/utils/spreadsheetImportGetUnicityTableHook';
import { SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE } from '@/spreadsheet-import/constants/SpreadsheetImportCreateRecordsBatchSize';
import { useOpenSpreadsheetImportDialog } from '@/spreadsheet-import/hooks/useOpenSpreadsheetImportDialog';
import { spreadsheetImportCreatedRecordsProgressState } from '@/spreadsheet-import/states/spreadsheetImportCreatedRecordsProgressState';
import { type SpreadsheetImportDialogOptions } from '@/spreadsheet-import/types';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { gql } from '@apollo/client';
import { useApolloClient } from '@apollo/client/react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useLingui } from '@lingui/react/macro';

const COMMIT_CREATOR_IMPORT = gql`
  mutation CommitCreatorImport($input: CommitCreatorImportInput!) {
    commitCreatorImport(input: $input) {
      receiptId
      creatorId
      socialProfileIds
      noteId
      noteTargetId
      replayed
    }
  }
`;

export const useOpenObjectRecordsSpreadsheetImportDialog = (
  objectNameSingular: string,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const apolloMetadataClient = useApolloClient();
  const [creatorImportAttemptKey, setCreatorImportAttemptKey] = useState<
    string | null
  >(null);
  const { openSpreadsheetImportDialog } = useOpenSpreadsheetImportDialog();
  const { buildSpreadsheetImportFields } = useBuildSpreadsheetImportFields();

  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const { t } = useLingui();
  const { queryExistingCreatorSocialProfiles } =
    useQueryExistingCreatorSocialProfiles();

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

  const setSpreadsheetImportCreatedRecordsProgress = useSetAtomState(
    spreadsheetImportCreatedRecordsProgressState,
  );

  const abortController = new AbortController();

  const { recordGqlFields } = useGenerateDepthRecordGqlFieldsFromObject({
    objectNameSingular,
    depth: 0,
  });

  const { batchCreateManyRecords } = useBatchCreateManyRecords({
    objectNameSingular,
    recordGqlFields,
    mutationBatchSize: SPREADSHEET_IMPORT_CREATE_RECORDS_BATCH_SIZE,
    setBatchedRecordsCount: setSpreadsheetImportCreatedRecordsProgress,
    abortController,
  });

  const openObjectRecordsSpreadsheetImportDialog = (
    options?: Omit<
      SpreadsheetImportDialogOptions,
      'fields' | 'isOpen' | 'onClose'
    >,
  ) => {
    const availableFieldMetadataItemsToImport =
      spreadsheetImportFilterAvailableFieldMetadataItems(
        objectMetadataItem.updatableFields,
      );

    const spreadsheetImportFields = buildSpreadsheetImportFields(
      availableFieldMetadataItemsToImport,
    );

    const creatorSession =
      objectMetadataItem.nameSingular === 'creator'
        ? buildCreatorSpreadsheetImportSession({
            availableFieldMetadataItems: availableFieldMetadataItemsToImport,
            spreadsheetImportFields,
            queryExistingCreators: queryExistingCreatorSocialProfiles,
          })
        : undefined;
    const currentCreatorImportAttemptKey = creatorSession
      ? (creatorImportAttemptKey ?? uuidv4())
      : null;

    if (creatorSession && !creatorImportAttemptKey) {
      setCreatorImportAttemptKey(currentCreatorImportAttemptKey);
    }
    const nativeTableHook =
      spreadsheetImportGetUnicityTableHook(objectMetadataItem);
    const tableHook = creatorSession
      ? (
          table: Parameters<typeof nativeTableHook>[0],
          addError: Parameters<typeof nativeTableHook>[1],
        ) =>
          creatorSession.tableHook(nativeTableHook(table, addError), addError)
      : nativeTableHook;

    openSpreadsheetImportDialog({
      ...options,
      onSubmit: async (data) => {
        const createInputs = creatorSession
          ? []
          : data.validStructuredRows.map((record) =>
              buildRecordFromImportedStructuredRow({
                importedStructuredRow: record,
                fieldMetadataItems: availableFieldMetadataItemsToImport,
                spreadsheetImportFields,
              }),
            );

        try {
          if (creatorSession && currentCreatorImportAttemptKey) {
            for (const [rowIndex, row] of data.validStructuredRows.entries()) {
              const sourceRowIndex = data.validStructuredRowIndexes[rowIndex];
              if (!sourceRowIndex) {
                throw new Error('Creator import row identity is unavailable');
              }

              await apolloMetadataClient.mutate({
                mutation: COMMIT_CREATOR_IMPORT,
                variables: {
                  input: {
                    attemptKey: currentCreatorImportAttemptKey,
                    operationKey: `row-${sourceRowIndex}`,
                    ...creatorSession.buildRowCommitPlan(row),
                  },
                },
              });
              setSpreadsheetImportCreatedRecordsProgress(rowIndex + 1);
            }
            setCreatorImportAttemptKey(null);
            // Same table-reload signal the native batch-create path emits.
            dispatchObjectRecordOperationBrowserEvent({
              objectMetadataItem,
              operation: { type: 'create-many' },
            });
          } else if (createInputs.length > 0) {
            await batchCreateManyRecords({
              recordsToCreate: createInputs,
              upsert: true,
            });
          }
          await apolloCoreClient.refetchQueries({
            updateCache: (cache) => {
              cache.evict({ fieldName: objectMetadataItem.namePlural });
            },
          });

          if (creatorSession) {
            const { existing, conflicts } = creatorSession.getSummary(
              data.allStructuredRows,
            );
            const invalid = Math.max(
              0,
              data.invalidStructuredRows.length - existing,
            );

            enqueueSuccessSnackBar({
              message: t`Imported ${data.validStructuredRows.length} creators. ${existing} already existed, ${conflicts} conflicted, and ${invalid} had validation errors.`,
            });
          }
        } catch (error: any) {
          enqueueErrorSnackBar({
            apolloError: error,
          });
          throw error;
        }
      },
      ...(creatorSession
        ? {
            headerAliases: creatorSession.headerAliases,
            headerProfile: creatorSession.headerProfile,
            matchColumnsStepHook: creatorSession.matchColumnsStepHook,
            beforeSubmitHook: creatorSession.beforeSubmitHook,
            getSubmissionBlockReason: creatorSession.getSubmissionBlockReason,
            getValidationPreview: (row) => {
              const preview = creatorSession.getRowPreview(row);

              return {
                title: t`First row preview`,
                sections: [
                  {
                    label: t`Creator`,
                    items: preview.creatorFields,
                  },
                  {
                    label: t`Social profiles`,
                    items: preview.socialProfiles.map(
                      ({ platform, fields }) =>
                        `${platform} (${fields.join(', ')})`,
                    ),
                  },
                  {
                    label: t`Supplementary note`,
                    items: preview.supplementaryNoteFields,
                  },
                  {
                    label: t`Excluded`,
                    items: preview.excludedFields,
                  },
                ],
              };
            },
          }
        : {}),
      spreadsheetImportFields:
        creatorSession?.spreadsheetImportFields ?? spreadsheetImportFields,
      availableFieldMetadataItems: availableFieldMetadataItemsToImport,
      onAbortSubmit: () => {
        abortController.abort();
        setCreatorImportAttemptKey(null);
      },
      tableHook,
    });
  };

  return {
    openObjectRecordsSpreadsheetImportDialog,
  };
};
