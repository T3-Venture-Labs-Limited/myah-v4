/* @license Enterprise */

import { isObject } from '@sniptt/guards';
import {
  FieldMetadataType,
  type ActorFilter,
  type AddressFilter,
  type AndObjectRecordFilter,
  type ArrayFilter,
  type BooleanFilter,
  type CurrencyFilter,
  type DateFilter,
  type EmailsFilter,
  type FloatFilter,
  type FullNameFilter,
  type IsFilter,
  type LeafObjectRecordFilter,
  type LinksFilter,
  type MultiSelectFilter,
  type NotObjectRecordFilter,
  type OrObjectRecordFilter,
  type ObjectRecord,
  type PhonesFilter,
  type RatingFilter,
  type RawJsonFilter,
  type RecordGqlOperationFilter,
  type RichTextFilter,
  type SelectFilter,
  type StringFilter,
  type TSVectorFilter,
  type UUIDFilter,
} from 'twenty-shared/types';
import {
  isDefined,
  isEmptyObject,
  isMatchingArrayFilter,
  isMatchingBooleanFilter,
  isMatchingCurrencyFilter,
  isMatchingDateFilter,
  isMatchingFloatFilter,
  isMatchingMultiSelectFilter,
  isMatchingRatingFilter,
  isMatchingRawJsonFilter,
  isMatchingRichTextFilter,
  isMatchingSelectFilter,
  isMatchingStringFilter,
  isMatchingTSVectorFilter,
  isMatchingUUIDFilter,
} from 'twenty-shared/utils';

import { computeMorphOrRelationFieldJoinColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-morph-or-relation-field-join-column-name.util';
import { getFlatFieldsFromFlatObjectMetadata } from 'src/engine/api/graphql/workspace-schema-builder/utils/get-flat-fields-for-flat-object-metadata.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const isLeafFilter = (
  filter: RecordGqlOperationFilter,
): filter is LeafObjectRecordFilter => {
  return !isAndFilter(filter) && !isOrFilter(filter) && !isNotFilter(filter);
};

const isAndFilter = (
  filter: RecordGqlOperationFilter,
): filter is AndObjectRecordFilter => 'and' in filter && !!filter.and;

const isImplicitAndFilter = (filter: RecordGqlOperationFilter) =>
  Object.keys(filter).length > 1;

const isOrFilter = (
  filter: RecordGqlOperationFilter,
): filter is OrObjectRecordFilter => 'or' in filter && !!filter.or;

const isNotFilter = (
  filter: RecordGqlOperationFilter,
): filter is NotObjectRecordFilter => 'not' in filter && !!filter.not;

const isUUIDFilter = (value: unknown): value is UUIDFilter => {
  if (!isObject(value)) {
    return false;
  }

  return (
    ('eq' in value && typeof value.eq === 'string') ||
    ('gt' in value && typeof value.gt === 'string') ||
    ('gte' in value && typeof value.gte === 'string') ||
    ('lt' in value && typeof value.lt === 'string') ||
    ('lte' in value && typeof value.lte === 'string') ||
    ('neq' in value && typeof value.neq === 'string') ||
    ('in' in value &&
      Array.isArray(value.in) &&
      value.in.every((item: unknown) => typeof item === 'string')) ||
    ('is' in value && (value.is === 'NULL' || value.is === 'NOT_NULL'))
  );
};

type RecordFilterMatchArgs = {
  record: ObjectRecord;
  filter: RecordGqlOperationFilter;
  flatObjectMetadata: FlatObjectMetadata;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  shouldIgnoreSoftDeleteDefaultFilter?: boolean;
};

type InMemoryRecordFilterMatchArgs = RecordFilterMatchArgs & {
  shouldSignalUnsupportedRelationFilter: boolean;
};

// Undefined preserves an unevaluable relation through boolean composition.
const isRecordMatchingFilter = ({
  record,
  filter,
  flatObjectMetadata,
  flatFieldMetadataMaps,
  shouldIgnoreSoftDeleteDefaultFilter,
  shouldSignalUnsupportedRelationFilter,
}: InMemoryRecordFilterMatchArgs): boolean | undefined => {
  if (Object.keys(filter).length === 0 && record.deletedAt === null) {
    return true;
  }

  if (isImplicitAndFilter(filter)) {
    let hasUnknownMatch = false;
    const isMatching = Object.entries(filter).every(([filterKey, value]) => {
      const match = isRecordMatchingFilter({
        record,
        filter: { [filterKey]: value },
        flatObjectMetadata,
        flatFieldMetadataMaps,
        shouldIgnoreSoftDeleteDefaultFilter,
        shouldSignalUnsupportedRelationFilter,
      });

      hasUnknownMatch ||= match === undefined;

      return match !== false;
    });

    return isMatching ? (hasUnknownMatch ? undefined : true) : false;
  }

  if (isAndFilter(filter)) {
    const filterValue = filter.and;

    if (!Array.isArray(filterValue)) {
      throw new Error(
        'Unexpected value for "and" filter : ' + JSON.stringify(filterValue),
      );
    }

    let hasUnknownMatch = false;

    for (const andFilter of filterValue) {
      const match = isRecordMatchingFilter({
        record,
        filter: andFilter,
        flatObjectMetadata,
        flatFieldMetadataMaps,
        shouldIgnoreSoftDeleteDefaultFilter,
        shouldSignalUnsupportedRelationFilter,
      });

      if (match === false) {
        return false;
      }

      hasUnknownMatch ||= match === undefined;
    }

    return hasUnknownMatch ? undefined : true;
  }

  if (isOrFilter(filter)) {
    const filterValue = filter.or;

    if (Array.isArray(filterValue)) {
      if (filterValue.length === 0) {
        return true;
      }

      let hasUnknownMatch = false;

      for (const orFilter of filterValue) {
        const match = isRecordMatchingFilter({
          record,
          filter: orFilter,
          flatObjectMetadata,
          flatFieldMetadataMaps,
          shouldIgnoreSoftDeleteDefaultFilter,
          shouldSignalUnsupportedRelationFilter,
        });

        if (match === true) {
          return true;
        }

        hasUnknownMatch ||= match === undefined;
      }

      return hasUnknownMatch ? undefined : false;
    }

    if (isObject(filterValue)) {
      // The API considers "or" with an object as an "and"
      return isRecordMatchingFilter({
        record,
        filter: filterValue,
        flatObjectMetadata,
        flatFieldMetadataMaps,
        shouldIgnoreSoftDeleteDefaultFilter,
        shouldSignalUnsupportedRelationFilter,
      });
    }

    throw new Error('Unexpected value for "or" filter : ' + filterValue);
  }

  if (isNotFilter(filter)) {
    const filterValue = filter.not;

    if (!isDefined(filterValue)) {
      throw new Error('Unexpected value for "not" filter : ' + filterValue);
    }

    if (isEmptyObject(filterValue)) {
      return true;
    }

    const match = isRecordMatchingFilter({
      record,
      filter: filterValue,
      flatObjectMetadata,
      flatFieldMetadataMaps,
      shouldIgnoreSoftDeleteDefaultFilter,
      shouldSignalUnsupportedRelationFilter,
    });

    return match === undefined ? undefined : !match;
  }

  const shouldTakeDeletedAtIntoAccount =
    shouldIgnoreSoftDeleteDefaultFilter !== true;

  const shouldRejectMatchingBecauseRecordIsSoftDeleted =
    isLeafFilter(filter) &&
    shouldTakeDeletedAtIntoAccount &&
    isDefined(record.deletedAt);

  if (shouldRejectMatchingBecauseRecordIsSoftDeleted) {
    return false;
  }

  const objectFields = getFlatFieldsFromFlatObjectMetadata(
    flatObjectMetadata,
    flatFieldMetadataMaps,
  );

  let hasUnknownRelation = false;
  const isMatching = Object.entries(filter).every(
    ([filterKey, filterValue]) => {
      if (!isDefined(filterValue)) {
        throw new Error(
          'Unexpected value for filter key "' +
            filterKey +
            '" : ' +
            filterValue,
        );
      }

      if (isEmptyObject(filterValue)) return true;

      const objectMetadataField =
        objectFields.find((field) => field.name === filterKey) ??
        objectFields.find(
          (field) =>
            (field.type === FieldMetadataType.RELATION ||
              field.type === FieldMetadataType.MORPH_RELATION) &&
            computeMorphOrRelationFieldJoinColumnName({ name: field.name }) ===
              filterKey,
        );

      if (!isDefined(objectMetadataField)) {
        throw new Error(
          'Field metadata item "' +
            filterKey +
            '" not found for object metadata item ' +
            flatObjectMetadata.nameSingular,
        );
      }

      const isRelationField =
        objectMetadataField.type === FieldMetadataType.RELATION ||
        objectMetadataField.type === FieldMetadataType.MORPH_RELATION;
      const isRelationJoinColumn =
        isRelationField &&
        computeMorphOrRelationFieldJoinColumnName({
          name: objectMetadataField.name,
        }) === filterKey;

      if (
        shouldSignalUnsupportedRelationFilter &&
        isRelationField &&
        !isRelationJoinColumn &&
        !isUUIDFilter(filterValue)
      ) {
        hasUnknownRelation = true;

        return true;
      }

      const recordFieldValue = record[filterKey];

      if (!isDefined(recordFieldValue)) {
        if (isObject(filterValue)) {
          return (filterValue as { is?: IsFilter })?.is === 'NULL';
        }

        return false;
      }

      switch (objectMetadataField.type) {
        case FieldMetadataType.RATING:
          return isMatchingRatingFilter({
            ratingFilter: filterValue as RatingFilter,
            value: recordFieldValue,
          });
        case FieldMetadataType.TEXT: {
          return isMatchingStringFilter({
            stringFilter: filterValue as StringFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.RICH_TEXT: {
          return isMatchingRichTextFilter({
            richTextFilter: filterValue as RichTextFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.SELECT:
          return isMatchingSelectFilter({
            selectFilter: filterValue as SelectFilter,
            value: recordFieldValue,
          });
        case FieldMetadataType.MULTI_SELECT:
          return isMatchingMultiSelectFilter({
            multiSelectFilter: filterValue as MultiSelectFilter,
            value: recordFieldValue,
          });
        case FieldMetadataType.ARRAY: {
          return isMatchingArrayFilter({
            arrayFilter: filterValue as ArrayFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.RAW_JSON: {
          return isMatchingRawJsonFilter({
            rawJsonFilter: filterValue as RawJsonFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.FULL_NAME: {
          const fullNameFilter = filterValue as FullNameFilter;

          return (
            (fullNameFilter.firstName === undefined ||
              isMatchingStringFilter({
                stringFilter: fullNameFilter.firstName,
                value: recordFieldValue.firstName,
              })) &&
            (fullNameFilter.lastName === undefined ||
              isMatchingStringFilter({
                stringFilter: fullNameFilter.lastName,
                value: recordFieldValue.lastName,
              }))
          );
        }
        case FieldMetadataType.ADDRESS: {
          const addressFilter = filterValue as AddressFilter;

          const keys = [
            'addressStreet1',
            'addressStreet2',
            'addressCity',
            'addressState',
            'addressCountry',
            'addressPostcode',
          ] as const;

          return keys.some((key) => {
            const value = addressFilter[key];

            if (value === undefined) {
              return false;
            }

            return isMatchingStringFilter({
              stringFilter: value,
              value: recordFieldValue[key],
            });
          });
        }
        case FieldMetadataType.LINKS: {
          const linksFilter = filterValue as LinksFilter;

          const keys = ['primaryLinkLabel', 'primaryLinkUrl'] as const;

          return keys.some((key) => {
            const value = linksFilter[key];

            if (value === undefined) {
              return false;
            }

            return isMatchingStringFilter({
              stringFilter: value,
              value: recordFieldValue[key],
            });
          });
        }
        case FieldMetadataType.DATE:
        case FieldMetadataType.DATE_TIME: {
          return isMatchingDateFilter({
            dateFilter: filterValue as DateFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.NUMBER:
        case FieldMetadataType.NUMERIC: {
          return isMatchingFloatFilter({
            floatFilter: filterValue as FloatFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.UUID: {
          return isMatchingUUIDFilter({
            uuidFilter: filterValue as UUIDFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.BOOLEAN: {
          return isMatchingBooleanFilter({
            booleanFilter: filterValue as BooleanFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.CURRENCY: {
          return isMatchingCurrencyFilter({
            currencyFilter: filterValue as CurrencyFilter,
            value: recordFieldValue,
          });
        }
        case FieldMetadataType.ACTOR: {
          const actorFilter = filterValue as ActorFilter;

          if (isDefined(actorFilter.source)) {
            return isMatchingSelectFilter({
              selectFilter: actorFilter.source,
              value: recordFieldValue.source,
            });
          }

          return (
            actorFilter.name === undefined ||
            isMatchingStringFilter({
              stringFilter: actorFilter.name,
              value: recordFieldValue.name,
            })
          );
        }
        case FieldMetadataType.EMAILS: {
          const emailsFilter = filterValue as EmailsFilter;

          if (emailsFilter.primaryEmail === undefined) {
            return false;
          }

          return isMatchingStringFilter({
            stringFilter: emailsFilter.primaryEmail,
            value: recordFieldValue.primaryEmail,
          });
        }
        case FieldMetadataType.PHONES: {
          const phonesFilter = filterValue as PhonesFilter;

          const keys: (keyof PhonesFilter)[] = ['primaryPhoneNumber'];

          return keys.some((key) => {
            const value = phonesFilter[key];

            if (value === undefined) {
              return false;
            }

            return isMatchingStringFilter({
              stringFilter: value,
              value: recordFieldValue[key],
            });
          });
        }
        case FieldMetadataType.RELATION:
        case FieldMetadataType.MORPH_RELATION: {
          const isJoinColumn = isRelationJoinColumn;

          if (isJoinColumn) {
            return isMatchingUUIDFilter({
              uuidFilter: filterValue as UUIDFilter,
              value: recordFieldValue,
            });
          }

          return isMatchingUUIDFilter({
            uuidFilter: filterValue as UUIDFilter,
            value: recordFieldValue?.id ?? null,
          });
        }
        case FieldMetadataType.TS_VECTOR: {
          return isMatchingTSVectorFilter({
            tsVectorFilter: filterValue as TSVectorFilter,
            value: recordFieldValue,
          });
        }
        default: {
          throw new Error(
            `Not implemented yet for field type "${objectMetadataField.type}"`,
          );
        }
      }
    },
  );

  return isMatching ? (hasUnknownRelation ? undefined : true) : false;
};

export const isRecordMatchingRLSRowLevelPermissionPredicate = (
  args: RecordFilterMatchArgs,
): boolean =>
  isRecordMatchingFilter({
    ...args,
    shouldSignalUnsupportedRelationFilter: false,
  }) === true;

export const isRecordPotentiallyMatchingQueryFilter = (
  args: RecordFilterMatchArgs,
): boolean =>
  isRecordMatchingFilter({
    ...args,
    shouldSignalUnsupportedRelationFilter: true,
  }) !== false;
