import { useObjectLabel } from '@/object-metadata/hooks/useObjectLabel';
import { useOptionalRecordIndexContext } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableEmptyStateDisplay } from '@/object-record/record-table/empty-state/components/RecordTableEmptyStateDisplay';
import { getEmptyStateSubTitle } from '@/object-record/record-table/empty-state/utils/getEmptyStateSubTitle';
import { getEmptyStateTitle } from '@/object-record/record-table/empty-state/utils/getEmptyStateTitle';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { IconPlus } from 'twenty-ui/icon';

export const RecordTableEmptyStateNoGroupNoRecordAtAll = () => {
  const { objectMetadataItem } = useRecordTableContextOrThrow();
  const recordIndexContext = useOptionalRecordIndexContext();

  const { createNewIndexRecord } = useCreateNewIndexRecord({
    objectMetadataItem,
  });

  const handleButtonClick = () => {
    createNewIndexRecord();
  };

  const objectLabelSingular = useObjectLabel(objectMetadataItem);

  const buttonTitle = `Add a ${objectLabelSingular}`;

  const title = getEmptyStateTitle(
    objectMetadataItem.nameSingular,
    objectLabelSingular,
  );

  const subTitle = getEmptyStateSubTitle(
    objectMetadataItem.nameSingular,
    objectLabelSingular,
  );

  return (
    <RecordTableEmptyStateDisplay
      animatedPlaceholderType="noRecord"
      subTitle={
        recordIndexContext?.hideEmptyStateSubtitle ? undefined : subTitle
      }
      title={title}
      {...(recordIndexContext?.embeddedSurfaceOptions?.hideAddNew
        ? {}
        : {
            buttonTitle,
            ButtonIcon: IconPlus,
            onClick: handleButtonClick,
          })}
    />
  );
};
