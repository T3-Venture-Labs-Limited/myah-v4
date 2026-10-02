import { useLabelIdentifierFieldMetadataItem } from '@/object-metadata/hooks/useLabelIdentifierFieldMetadataItem';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { getLabelIdentifierFieldValue } from '@/object-metadata/utils/getLabelIdentifierFieldValue';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { PageTitleEffect } from '@/ui/utilities/page-title/components/PageTitleEffect';
import { useAtomFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue';
import { isDefined } from 'twenty-shared/utils';

export const RecordShowPageTitle = ({
  objectNameSingular,
  objectRecordId,
  isRecordAvailable = true,
}: {
  objectNameSingular: string;
  objectRecordId: string;
  isRecordAvailable?: boolean;
}) => {
  const { labelIdentifierFieldMetadataItem } =
    useLabelIdentifierFieldMetadataItem({ objectNameSingular });

  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });

  const { canReadObjectRecords, restrictedFields } =
    useObjectPermissionsForObject(objectMetadataItem.id);

  const recordStore = useAtomFamilyStateValue(
    recordStoreFamilyState,
    objectRecordId,
  );

  const pageName =
    isRecordAvailable &&
    (objectNameSingular !== 'campaign' ||
      (canReadObjectRecords &&
        labelIdentifierFieldMetadataItem?.id !== undefined &&
        restrictedFields[labelIdentifierFieldMetadataItem.id]?.canRead !==
          false)) &&
    isDefined(recordStore)
      ? getLabelIdentifierFieldValue(
          recordStore,
          labelIdentifierFieldMetadataItem,
        )
      : '';

  const pageTitle = pageName.trim()
    ? `${pageName} - ${objectMetadataItem.labelSingular}`
    : objectMetadataItem.labelSingular;

  return <PageTitleEffect title={pageTitle} />;
};
