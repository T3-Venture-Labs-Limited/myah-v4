import { ObjectOptionsDropdown } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdown';
import { RecordIndexViewBarEffect } from '@/object-record/record-index/components/RecordIndexViewBarEffect';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useHasCurrentViewNonReadableFields } from '@/object-record/record-index/hooks/useHasCurrentViewNonReadableFields';
import { recordIndexViewTypeState } from '@/object-record/record-index/states/recordIndexViewTypeState';
import { SpreadsheetImportProvider } from '@/spreadsheet-import/provider/components/SpreadsheetImportProvider';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { ViewBar } from '@/views/components/ViewBar';
import { ViewType } from '@/views/types/ViewType';

type RecordIndexViewBarProps = {
  recordIndexViewTypeOverride?: ViewType;
};

export const RecordIndexViewBar = ({
  recordIndexViewTypeOverride,
}: RecordIndexViewBarProps) => {
  const recordIndexViewType = useAtomStateValue(recordIndexViewTypeState);
  const resolvedRecordIndexViewType =
    recordIndexViewTypeOverride ?? recordIndexViewType;

  const isLayoutLocked = recordIndexViewTypeOverride !== undefined;

  const { objectNamePlural, recordIndexId, objectMetadataItem, onViewChange } =
    useRecordIndexContextOrThrow();

  const { hasCurrentViewNonReadableFields } =
    useHasCurrentViewNonReadableFields(objectMetadataItem);

  return (
    <SpreadsheetImportProvider>
      <ViewBar
        isReadOnly={hasCurrentViewNonReadableFields}
        viewBarId={recordIndexId}
        onViewChange={onViewChange}
        optionsDropdownButton={
          <ObjectOptionsDropdown
            recordIndexId={recordIndexId}
            onViewChange={onViewChange}
            objectMetadataItem={objectMetadataItem}
            viewType={resolvedRecordIndexViewType ?? ViewType.TABLE}
            isLayoutLocked={isLayoutLocked}
          />
        }
      />
      <RecordIndexViewBarEffect
        objectNamePlural={objectNamePlural}
        viewBarId={recordIndexId}
      />
    </SpreadsheetImportProvider>
  );
};
