import { type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import qs from 'qs';
import { isNonEmptyString } from '@sniptt/guards';
import { t } from '@lingui/core/macro';

import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { flattenedFieldMetadataItemsSelector } from '@/object-metadata/states/flattenedFieldMetadataItemsSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { viewFromViewIdFamilySelector } from '@/views/states/selectors/viewFromViewIdFamilySelector';
import { isCompositeFieldType } from '@/object-record/object-filter-dropdown/utils/isCompositeFieldType';
import { filterUrlQueryParamsSchema } from '@/views/schemas/filterUrlQueryParamsSchema';
import { sortUrlQueryParamsSchema } from '@/views/schemas/sortUrlQueryParamsSchema';
import { type UrlRecursiveFilterGroup } from '@/views/types/UrlRecursiveFilterGroup';
import { type View } from '@/views/types/View';
import { splitFieldNameIntoBaseAndSubField } from '@/views/utils/splitFieldNameIntoBaseAndSubField';
import { isExpectedSubFieldName } from 'twenty-shared/utils';
import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
} from 'twenty-ui/feedback';

const hasUnresolvedUrlFilterGroup = (
  group: UrlRecursiveFilterGroup,
  isUnresolved: (fieldName: string, subFieldName?: string) => boolean,
): boolean =>
  (group.filters ?? []).some((filter) =>
    isUnresolved(filter.field, filter.subField),
  ) ||
  (group.groups ?? []).some((child) =>
    hasUnresolvedUrlFilterGroup(child, isUnresolved),
  );

export const CreatorRecordIndexReferenceGate = ({
  children,
  objectMetadataItem,
  view,
  metadataReady,
  currentViewReady,
  checkUrl,
  fieldMetadataIds,
}: {
  children: ReactNode;
  objectMetadataItem: EnrichedObjectMetadataItem;
  view?: View;
  metadataReady: boolean;
  currentViewReady: boolean;
  checkUrl: boolean;
  fieldMetadataIds?: readonly string[];
}) => {
  const [searchParams] = useSearchParams();

  // The URL and saved view must be checked before mounting any record-query effect.
  if (!metadataReady || !currentViewReady || !view) return null;

  const knownFieldIds = new Set(
    fieldMetadataIds ?? objectMetadataItem.fields.map((field) => field.id),
  );
  const hasUnresolvedSavedReference =
    view.viewFilters.some(
      (filter) =>
        !objectMetadataItem.fields.some(
          (field) => field.id === filter.fieldMetadataId,
        ) ||
        (filter.relationTargetFieldMetadataId != null &&
          !knownFieldIds.has(filter.relationTargetFieldMetadataId)),
    ) ||
    view.viewSorts.some(
      (sort) =>
        !objectMetadataItem.fields.some(
          (field) => field.id === sort.fieldMetadataId,
        ),
    );

  let hasUnresolvedUrlReference = false;
  if (checkUrl) {
    const hasFilterParams = [...searchParams.keys()].some(
      (key) => key.startsWith('filter[') || key.startsWith('filterGroup['),
    );
    const hasSortParams = [...searchParams.keys()].some((key) =>
      key.startsWith('sort['),
    );
    // URL hydration uses qs's default 1,000-parameter limit too. Never validate
    // a truncated filter or sort and then mount record-query descendants.
    const exceedsParserLimit =
      searchParams.size > 1000 && (hasFilterParams || hasSortParams);
    const parsedParams = qs.parse(searchParams.toString(), { depth: 20 });
    const filters = filterUrlQueryParamsSchema.safeParse(parsedParams);
    const sorts = sortUrlQueryParamsSchema.safeParse(parsedParams);
    const isUnresolved = (fieldName: string, subFieldName?: string) => {
      const field = objectMetadataItem.fields.find(
        (item) => item.name === fieldName,
      );
      if (!field) return true;
      if (!isNonEmptyString(subFieldName)) return false;
      return (
        !isCompositeFieldType(field.type) ||
        !isExpectedSubFieldName(
          field.type as Parameters<typeof isExpectedSubFieldName>[0],
          subFieldName as Parameters<typeof isExpectedSubFieldName>[1],
          subFieldName,
        )
      );
    };

    hasUnresolvedUrlReference =
      exceedsParserLimit ||
      (hasFilterParams && !filters.success) ||
      (hasSortParams && !sorts.success) ||
      (filters.success &&
        (Object.keys(filters.data.filter ?? {}).some((fieldName) => {
          const { baseFieldName, subFieldName } =
            splitFieldNameIntoBaseAndSubField(fieldName);
          return isUnresolved(baseFieldName, subFieldName);
        }) ||
          (filters.data.filterGroup != null &&
            hasUnresolvedUrlFilterGroup(
              filters.data.filterGroup,
              isUnresolved,
            )))) ||
      (sorts.success &&
        Object.keys(sorts.data.sort ?? {}).some((name) => isUnresolved(name)));
  }

  if (hasUnresolvedSavedReference || hasUnresolvedUrlReference) {
    return (
      <AnimatedPlaceholderEmptyContainer>
        <AnimatedPlaceholder type="notShared" />
        <AnimatedPlaceholderEmptyTextContainer>
          <AnimatedPlaceholderEmptyTitle>
            {t`View needs repair`}
          </AnimatedPlaceholderEmptyTitle>
          <AnimatedPlaceholderEmptySubTitle>
            {t`A filter or sort cannot be validated. Remove obsolete references or excess URL parameters before loading records.`}
          </AnimatedPlaceholderEmptySubTitle>
        </AnimatedPlaceholderEmptyTextContainer>
      </AnimatedPlaceholderEmptyContainer>
    );
  }

  return <>{children}</>;
};

// Mount this *outside* the view bar, table and load effects: those effects can
// dispatch a reduced query before their lossy filter mappers finish hydrating.
export const ConnectedCreatorRecordIndexReferenceGate = ({
  objectMetadataItem,
  viewId,
  checkUrl,
  children,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  viewId: string;
  checkUrl: boolean;
  children: ReactNode;
}) => {
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
  );
  const view = useAtomFamilySelectorValue(viewFromViewIdFamilySelector, {
    viewId: contextStoreCurrentViewId ?? '',
  });
  const viewsStatus = useAtomValue(metadataStoreState.atomFamily('views'));
  const fieldsStatus = useAtomValue(
    metadataStoreState.atomFamily('fieldMetadataItems'),
  );
  const filtersStatus = useAtomValue(
    metadataStoreState.atomFamily('viewFilters'),
  );
  const sortsStatus = useAtomValue(metadataStoreState.atomFamily('viewSorts'));
  const objectStatus = useAtomValue(
    metadataStoreState.atomFamily('objectMetadataItems'),
  );
  const flattenedFieldMetadataItems = useAtomStateValue(
    flattenedFieldMetadataItemsSelector,
  );
  return (
    <CreatorRecordIndexReferenceGate
      objectMetadataItem={objectMetadataItem}
      view={view}
      currentViewReady={
        contextStoreCurrentViewId === viewId &&
        view?.objectMetadataId === objectMetadataItem.id
      }
      metadataReady={[
        viewsStatus,
        fieldsStatus,
        filtersStatus,
        sortsStatus,
        objectStatus,
      ].every((item) => item.status === 'up-to-date')}
      checkUrl={checkUrl}
      fieldMetadataIds={flattenedFieldMetadataItems.map((field) => field.id)}
    >
      {children}
    </CreatorRecordIndexReferenceGate>
  );
};
