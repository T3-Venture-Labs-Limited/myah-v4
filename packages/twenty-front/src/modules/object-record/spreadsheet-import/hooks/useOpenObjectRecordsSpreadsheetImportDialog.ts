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
import { useLingui } from '@lingui/react/macro';

export const useOpenObjectRecordsSpreadsheetImportDialog = (
  objectNameSingular: string,
) => {
  const apolloCoreClient = useApolloCoreClient();
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
        const createInputs = data.validStructuredRows.map((record) =>
          buildRecordFromImportedStructuredRow({
            importedStructuredRow: record,
            fieldMetadataItems: availableFieldMetadataItemsToImport,
            spreadsheetImportFields,
          }),
        );

        try {
          if (!creatorSession || createInputs.length > 0) {
            await batchCreateManyRecords({
              recordsToCreate: createInputs,
              upsert: !creatorSession,
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
              message: t`Imported ${createInputs.length} creators. ${existing} already existed, ${conflicts} conflicted, and ${invalid} had validation errors.`,
            });
          }
        } catch (error: any) {
          enqueueErrorSnackBar({
            apolloError: error,
          });
        }
      },
      ...(creatorSession
        ? {
            headerAliases: creatorSession.headerAliases,
            headerProfile: creatorSession.headerProfile,
            matchColumnsStepHook: creatorSession.matchColumnsStepHook,
            beforeSubmitHook: creatorSession.beforeSubmitHook,
            getSubmissionBlockReason: creatorSession.getSubmissionBlockReason,
          }
        : {}),
      spreadsheetImportFields,
      availableFieldMetadataItems: availableFieldMetadataItemsToImport,
      onAbortSubmit: () => {
        abortController.abort();
      },
      tableHook,
    });
  };

  return {
    openObjectRecordsSpreadsheetImportDialog,
  };
};
