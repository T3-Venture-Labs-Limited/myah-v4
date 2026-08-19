import { useObjectLabel } from '@/object-metadata/hooks/useObjectLabel';
import { useOptionalRecordIndexContext } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableEmptyStateDisplay } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateDisplay';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { t } from '@lingui/core/macro';
import { IconPlus } from 'twenty-ui/icon';

export const RecordTableEmptyStateNoRecordFoundForFilter = () => {
  const { objectMetadataItem } = useRecordTableContextOrThrow();
  const recordIndexContext = useOptionalRecordIndexContext();

  const { createNewIndexRecord } = useCreateNewIndexRecord({
    objectMetadataItem,
  });

  const handleButtonClick = () => {
    createNewIndexRecord();
  };

  const objectLabelSingular = useObjectLabel(objectMetadataItem);

  const buttonTitle = t`Add a ${objectLabelSingular}`;

  const title = t`No ${objectLabelSingular} found`;

  const subTitle = t`No records matching the filter criteria were found.`;

  if (recordIndexContext?.embeddedSurfaceOptions?.hideAddNew) {
    return (
      <RecordTableEmptyStateDisplay
        animatedPlaceholderType="noMatchRecord"
        subTitle={subTitle}
        title={title}
      />
    );
  }

  return (
    <RecordTableEmptyStateDisplay
      animatedPlaceholderType="noMatchRecord"
      ButtonIcon={IconPlus}
      buttonTitle={buttonTitle}
      subTitle={subTitle}
      title={title}
      onClick={handleButtonClick}
    />
  );
};
