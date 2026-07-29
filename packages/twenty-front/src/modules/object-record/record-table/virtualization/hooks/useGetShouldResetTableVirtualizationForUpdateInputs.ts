import { useActiveFieldMetadataItems } from '@/object-metadata/hooks/useActiveFieldMetadataItems';
import { useEffectiveRecordFilters } from '@/object-record/record-filter/hooks/useEffectiveRecordFilters';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { currentRecordSortsComponentState } from '@/object-record/record-sort/states/currentRecordSortsComponentState';
import { type ObjectRecordOperationUpdateInput } from '@/object-record/types/ObjectRecordOperationUpdateInput';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { FieldMetadataType } from 'twenty-shared/types';
import { mapById } from 'twenty-shared/utils';

export const useGetShouldResetTableVirtualizationForUpdateInputs = () => {
  const { objectMetadataItem } = useRecordIndexContextOrThrow();

  const { activeFieldMetadataItems } = useActiveFieldMetadataItems({
    objectMetadataItem,
  });

  const currentRecordSorts = useAtomComponentStateValue(
    currentRecordSortsComponentState,
  );

  const effectiveRecordFilters = useEffectiveRecordFilters();

  const getShouldResetTableVirtualizationForUpdateInputs = (
    updateInputs: ObjectRecordOperationUpdateInput[],
  ) => {
    const updatedFieldNames = new Set<string>();

    let thereIsAnUpdateOnAFilteredField = false;
    let thereIsAnUpdateOnASortedField = false;

    for (const updateInput of updateInputs) {
      const fieldNamesForUpdateInput = updateInput.updatedFields.flatMap(
        (updatedField) => Object.keys(updatedField ?? {}),
      );

      for (const fieldName of fieldNamesForUpdateInput) {
        updatedFieldNames.add(fieldName);
      }

      const updatedFieldMetadataItems = activeFieldMetadataItems.filter(
        (fieldMetadataItemToFilter) =>
          fieldNamesForUpdateInput.includes(fieldMetadataItemToFilter.name) ||
          (fieldMetadataItemToFilter.type === FieldMetadataType.RELATION &&
            fieldNamesForUpdateInput.includes(
              `${fieldMetadataItemToFilter.name}Id`,
            )),
      );

      const updatedFieldMetadataItemIds =
        updatedFieldMetadataItems.map(mapById);

      const updateOnAFilteredField = effectiveRecordFilters.some((recordFilter) =>
        updatedFieldMetadataItemIds.includes(recordFilter.fieldMetadataId));

      const updateOnASortedField = currentRecordSorts.some((recordSort) =>
        updatedFieldMetadataItemIds.includes(recordSort.fieldMetadataId),
      );

      if (updateOnAFilteredField) {
        thereIsAnUpdateOnAFilteredField = true;
      }

      if (updateOnASortedField) {
        thereIsAnUpdateOnASortedField = true;
      }
    }

    if (updatedFieldNames.has('position')) {
      return true;
    }

    return thereIsAnUpdateOnAFilteredField || thereIsAnUpdateOnASortedField;
  };

  return {
    getShouldResetTableVirtualizationForUpdateInputs,
  };
};
