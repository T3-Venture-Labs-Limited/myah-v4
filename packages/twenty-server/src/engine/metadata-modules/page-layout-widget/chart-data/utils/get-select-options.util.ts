import { isFieldMetadataSelectKind } from 'twenty-shared/utils';

import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FieldMetadataOption } from 'src/engine/metadata-modules/page-layout-widget/chart-data/types/field-metadata-option.type';

export const getSelectOptions = (
  fieldMetadata: FlatFieldMetadata,
): FieldMetadataOption[] | null => {
  if (!isFieldMetadataSelectKind(fieldMetadata.type)) {
    return null;
  }

  const options = fieldMetadata.options as FieldMetadataOption[] | undefined;

  return options ?? null;
};
