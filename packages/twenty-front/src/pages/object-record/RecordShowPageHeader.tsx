import { getObjectMetadataIdentifierFields } from '@/object-metadata/utils/getObjectMetadataIdentifierFields';
import { ObjectRecordShowPageBreadcrumb } from '@/object-record/record-show/components/ObjectRecordShowPageBreadcrumb';
import { useRecordShowPagePagination } from '@/object-record/record-show/hooks/useRecordShowPagePagination';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';

export const RecordShowPageHeader = ({
  objectNameSingular,
  objectRecordId,
  children,
  compactOnMobile = false,
}: {
  objectNameSingular: string;
  objectRecordId: string;
  children?: React.ReactNode;
  compactOnMobile?: boolean;
}) => {
  const { objectMetadataItem } = useRecordShowPagePagination(
    objectNameSingular,
    objectRecordId,
  );

  const { labelIdentifierFieldMetadataItem } =
    getObjectMetadataIdentifierFields({ objectMetadataItem });

  return (
    <PageCardHeader
      breadcrumb={
        <ObjectRecordShowPageBreadcrumb
          objectNameSingular={objectNameSingular}
          objectRecordId={objectRecordId}
          objectLabel={objectMetadataItem.labelPlural}
          labelIdentifierFieldMetadataItem={labelIdentifierFieldMetadataItem}
          compactOnMobile={compactOnMobile}
        />
      }
      actionButton={children}
      reserveActionSpace={compactOnMobile}
    />
  );
};
