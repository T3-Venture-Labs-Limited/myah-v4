import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { SingleRecordPickerLoadingEffect } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPickerLoadingEffect';
import {
  SingleRecordPickerMenuItems,
  type SingleRecordPickerMenuItemsProps,
} from '@/object-record/record-picker/single-record-picker/components/SingleRecordPickerMenuItems';
import { useSingleRecordPickerRecords } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerRecords';
import { useSingleRecordPickerSearch } from '@/object-record/record-picker/single-record-picker/hooks/useSingleRecordPickerSearch';
import { SingleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/single-record-picker/states/contexts/SingleRecordPickerComponentInstanceContext';
import { singleRecordPickerSearchFilterComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSearchFilterComponentState';
import { type RecordPickerLayoutDirection } from '@/object-record/record-picker/types/RecordPickerLayoutDirection';
import { canCreateRecordsForObjectMetadataItem } from '@/object-record/utils/canCreateRecordsForObjectMetadataItem';
import { CreateNewButton } from '@/ui/input/relation-picker/components/CreateNewButton';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSearchInput } from '@/ui/layout/dropdown/components/DropdownMenuSearchInput';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { getSingleRecordPickerSelectableListId } from '@/object-record/record-picker/single-record-picker/utils/getSingleRecordPickerSelectableListId';
import { selectedItemIdComponentState } from '@/ui/layout/selectable-list/states/selectedItemIdComponentState';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { isDefined } from 'twenty-shared/utils';
import { t } from '@lingui/core/macro';
import { IconPlus } from 'twenty-ui/icon';
import { styled } from '@linaria/react';

const StyledAccessibleStatus = styled.span`
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
`;

export type SingleRecordPickerMenuItemsWithSearchProps = {
  excludedRecordIds?: string[];
  onCreate?: ((searchInput?: string) => void) | (() => void);
  objectNameSingulars: string[];
  recordPickerInstanceId?: string;
  layoutDirection?: RecordPickerLayoutDirection;
  focusId: string;
} & Pick<
  SingleRecordPickerMenuItemsProps,
  'EmptyIcon' | 'emptyLabel' | 'onCancel' | 'onMorphItemSelected'
>;

export const SingleRecordPickerMenuItemsWithSearch = ({
  EmptyIcon,
  emptyLabel,
  excludedRecordIds,
  onCancel,
  onCreate,
  onMorphItemSelected,
  objectNameSingulars,
  layoutDirection = 'search-bar-on-top',
  focusId,
}: SingleRecordPickerMenuItemsWithSearchProps) => {
  const { handleSearchFilterChange } = useSingleRecordPickerSearch();

  const recordPickerInstanceId = useAvailableComponentInstanceIdOrThrow(
    SingleRecordPickerComponentInstanceContext,
  );

  const singleRecordPickerSearchFilter = useAtomComponentStateValue(
    singleRecordPickerSearchFilterComponentState,
    recordPickerInstanceId,
  );

  const { pickableMorphItems, loading, error } = useSingleRecordPickerRecords({
    objectNameSingulars,
    excludedRecordIds,
  });

  const { objectMetadataItems: allObjectMetadataItems } =
    useObjectMetadataItems();
  const objectMetadataItems = allObjectMetadataItems.filter(
    (objectMetadataItem) =>
      objectNameSingulars.includes(objectMetadataItem.nameSingular),
  );

  const objectLabelSingular =
    objectMetadataItems.length === 1
      ? (objectMetadataItems[0]?.labelSingular ?? t`Record`)
      : t`Record`;
  const searchAriaLabel =
    objectMetadataItems.length === 1
      ? t`Search ${objectLabelSingular}`
      : t`Search records`;
  const resultsAriaLabel =
    objectMetadataItems.length === 1
      ? t`${objectLabelSingular} results`
      : t`Record results`;
  const resultsId = `${recordPickerInstanceId}-results`;
  const getOptionId = (recordId: string) => `${resultsId}-option-${recordId}`;
  const selectableListComponentInstanceId =
    getSingleRecordPickerSelectableListId(recordPickerInstanceId);
  const selectedItemId = useAtomComponentStateValue(
    selectedItemIdComponentState,
    selectableListComponentInstanceId,
  );
  const shouldHideResults = loading || isDefined(error);
  const visiblePickableMorphItems = shouldHideResults ? [] : pickableMorphItems;
  const matchingResultsCount = pickableMorphItems.filter(
    (morphItem) => morphItem.isMatchingSearchFilter,
  ).length;
  const isActiveOptionRendered =
    Boolean(selectedItemId) &&
    (selectedItemId === 'select-none'
      ? Boolean(emptyLabel)
      : visiblePickableMorphItems.some(
          (morphItem) =>
            morphItem.recordId === selectedItemId &&
            morphItem.isMatchingSearchFilter,
        ));
  const resultsStatus = loading
    ? t`Loading ${objectLabelSingular} results`
    : isDefined(error)
      ? t`Unable to load ${objectLabelSingular} results`
      : matchingResultsCount === 0
        ? t`No ${objectLabelSingular} results`
        : t`${matchingResultsCount} ${objectLabelSingular} result${
            matchingResultsCount === 1 ? '' : 's'
          }`;

  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const canCreateRecords = objectMetadataItems.every((objectMetadataItem) => {
    const objectPermissions =
      objectPermissionsByObjectMetadataId[objectMetadataItem.id];

    return (
      isDefined(objectPermissions) &&
      canCreateRecordsForObjectMetadataItem({
        objectPermissions,
        objectMetadataItem,
      })
    );
  });

  const handleCreateNew = () => {
    onCreate?.(singleRecordPickerSearchFilter);
  };

  return (
    <>
      <SingleRecordPickerLoadingEffect loading={loading} />
      {layoutDirection === 'search-bar-on-bottom' && (
        <>
          {isDefined(onCreate) && canCreateRecords && (
            <>
              <DropdownMenuItemsContainer
                role="presentation"
                scrollable={false}
              >
                <CreateNewButton
                  onClick={handleCreateNew}
                  LeftIcon={IconPlus}
                  text={t`Add New`}
                />
              </DropdownMenuItemsContainer>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItemsContainer
            ariaLabel={resultsAriaLabel}
            hasMaxHeight
            id={resultsId}
            role="listbox"
          >
            <SingleRecordPickerMenuItems
              getOptionId={getOptionId}
              focusId={focusId}
              pickableMorphItems={visiblePickableMorphItems}
              onMorphItemSelected={onMorphItemSelected}
              {...{
                EmptyIcon,
                emptyLabel,
                onCancel,
              }}
              shouldShowNoRecordFound={!shouldHideResults}
            />
          </DropdownMenuItemsContainer>
          <DropdownMenuSeparator />
        </>
      )}
      <StyledAccessibleStatus aria-live="polite" role="status">
        {resultsStatus}
      </StyledAccessibleStatus>
      <DropdownMenuSearchInput
        aria-activedescendant={
          isActiveOptionRendered && selectedItemId
            ? getOptionId(selectedItemId)
            : undefined
        }
        aria-controls={resultsId}
        aria-expanded
        aria-label={searchAriaLabel}
        onChange={handleSearchFilterChange}
        autoFocus
        role="combobox"
      />
      {layoutDirection === 'search-bar-on-top' && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItemsContainer
            ariaLabel={resultsAriaLabel}
            hasMaxHeight
            id={resultsId}
            role="listbox"
          >
            <SingleRecordPickerMenuItems
              getOptionId={getOptionId}
              focusId={focusId}
              pickableMorphItems={visiblePickableMorphItems}
              onMorphItemSelected={onMorphItemSelected}
              {...{
                EmptyIcon,
                emptyLabel,
                onCancel,
              }}
              shouldShowNoRecordFound={!shouldHideResults}
            />
          </DropdownMenuItemsContainer>
          {isDefined(onCreate) && canCreateRecords && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItemsContainer
                role="presentation"
                scrollable={false}
              >
                <CreateNewButton
                  onClick={handleCreateNew}
                  LeftIcon={IconPlus}
                  text={t`Add New`}
                />
              </DropdownMenuItemsContainer>
            </>
          )}
        </>
      )}
    </>
  );
};
