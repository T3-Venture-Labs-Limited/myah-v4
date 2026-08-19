import { useLayoutEffect, useRef } from 'react';

import { isUndefined } from '@sniptt/guards';
import { Key } from 'ts-key-enum';
import { isDefined } from 'twenty-shared/utils';

import { SelectableList } from '@/ui/layout/selectable-list/components/SelectableList';
import { useSelectableList } from '@/ui/layout/selectable-list/hooks/useSelectableList';

import { RecordPickerInitialLoadingEmptyContainer } from '@/object-record/record-picker/components/RecordPickerInitialLoadingEmptyContainer';
import { RecordPickerLoadingSkeletonList } from '@/object-record/record-picker/components/RecordPickerLoadingSkeletonList';
import { RecordPickerNoRecordFoundMenuItem } from '@/object-record/record-picker/components/RecordPickerNoRecordFoundMenuItem';
import { SingleRecordPickerMenuItem } from '@/object-record/record-picker/single-record-picker/components/SingleRecordPickerMenuItem';
import { SingleRecordPickerComponentInstanceContext } from '@/object-record/record-picker/single-record-picker/states/contexts/SingleRecordPickerComponentInstanceContext';
import { singleRecordPickerSelectedIdComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerSelectedIdComponentState';
import { singleRecordPickerShouldShowInitialLoadingComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerShouldShowInitialLoadingComponentState';
import { singleRecordPickerShouldShowSkeletonComponentState } from '@/object-record/record-picker/single-record-picker/states/singleRecordPickerShouldShowSkeletonComponentState';
import { getSingleRecordPickerSelectableListId } from '@/object-record/record-picker/single-record-picker/utils/getSingleRecordPickerSelectableListId';
import { type RecordPickerPickableMorphItem } from '@/object-record/record-picker/types/RecordPickerPickableMorphItem';
import { SelectableListItem } from '@/ui/layout/selectable-list/components/SelectableListItem';
import { isSelectedItemIdComponentFamilyState } from '@/ui/layout/selectable-list/states/isSelectedItemIdComponentFamilyState';
import { selectedItemIdComponentState } from '@/ui/layout/selectable-list/states/selectedItemIdComponentState';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { useAvailableComponentInstanceIdOrThrow } from '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow';
import { useAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomComponentFamilyStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateValue';
import { type IconComponent } from 'twenty-ui/icon';
import { MenuItemSelect } from 'twenty-ui/navigation';

export type SingleRecordPickerMenuItemsProps = {
  EmptyIcon?: IconComponent;
  emptyLabel?: string;
  pickableMorphItems: RecordPickerPickableMorphItem[];
  onCancel?: () => void;
  onMorphItemSelected: (morphItem?: RecordPickerPickableMorphItem) => void;
  focusId: string;
  getOptionId: (recordId: string) => string;
  shouldShowNoRecordFound?: boolean;
};

export const SingleRecordPickerMenuItems = ({
  EmptyIcon,
  emptyLabel,
  pickableMorphItems,
  onCancel,
  onMorphItemSelected,
  getOptionId,
  focusId,
  shouldShowNoRecordFound = true,
}: SingleRecordPickerMenuItemsProps) => {
  const recordPickerComponentInstanceId =
    useAvailableComponentInstanceIdOrThrow(
      SingleRecordPickerComponentInstanceContext,
    );

  const selectableListComponentInstanceId =
    getSingleRecordPickerSelectableListId(recordPickerComponentInstanceId);

  const noRecordOptionContainerRef = useRef<HTMLDivElement>(null);
  const noRecordOptionId = getOptionId('select-none');

  useLayoutEffect(() => {
    noRecordOptionContainerRef.current
      ?.querySelector('[role="option"]')
      ?.setAttribute('id', noRecordOptionId);
  }, [noRecordOptionId]);

  const { resetSelectedItem } = useSelectableList(
    selectableListComponentInstanceId,
  );

  const isSelectedItemId = useAtomComponentFamilyStateValue(
    isSelectedItemIdComponentFamilyState,
    'select-none',
    selectableListComponentInstanceId,
  );

  useHotkeysOnFocusedElement({
    keys: Key.Escape,
    callback: () => {
      resetSelectedItem();
      onCancel?.();
    },
    focusId,
    dependencies: [onCancel, resetSelectedItem],
  });

  const itemsMatchingSearchFilter = pickableMorphItems.filter(
    (morphItem) => morphItem.isMatchingSearchFilter,
  );
  const selectableItemIds = [
    ...(emptyLabel ? ['select-none'] : []),
    ...itemsMatchingSearchFilter.map((morphItem) => morphItem.recordId),
  ];
  const [singleRecordPickerSelectedId, setSingleRecordPickerSelectedId] =
    useAtomComponentState(singleRecordPickerSelectedIdComponentState);

  const singleRecordPickerShouldShowSkeleton = useAtomComponentStateValue(
    singleRecordPickerShouldShowSkeletonComponentState,
  );

  const singleRecordPickerShouldShowInitialLoading = useAtomComponentStateValue(
    singleRecordPickerShouldShowInitialLoadingComponentState,
  );

  const searchHasNoResults = itemsMatchingSearchFilter.length === 0;

  const selectedItemId = useAtomComponentStateValue(
    selectedItemIdComponentState,
    selectableListComponentInstanceId,
  );
  const activeMorphItem = itemsMatchingSearchFilter.find(
    (morphItem) => morphItem.recordId === selectedItemId,
  );
  const canSelectActiveItem =
    (selectedItemId === 'select-none' && Boolean(emptyLabel)) ||
    isDefined(activeMorphItem);

  useHotkeysOnFocusedElement({
    keys: ['space'],
    callback: () => {
      if (!canSelectActiveItem) {
        return;
      }

      if (selectedItemId === 'select-none') {
        setSingleRecordPickerSelectedId(undefined);
        onMorphItemSelected();

        return;
      }

      onMorphItemSelected(activeMorphItem);
    },
    focusId,
    dependencies: [
      canSelectActiveItem,
      activeMorphItem,
      onMorphItemSelected,
      selectedItemId,
      setSingleRecordPickerSelectedId,
    ],
    options: { preventDefault: canSelectActiveItem },
  });

  return (
    <SelectableList
      selectableListInstanceId={selectableListComponentInstanceId}
      selectableItemIdArray={selectableItemIds}
      focusId={focusId}
    >
      {emptyLabel && (
        <div ref={noRecordOptionContainerRef}>
          <SelectableListItem
            key="select-none"
            itemId="select-none"
            onEnter={() => {
              setSingleRecordPickerSelectedId(undefined);
              onMorphItemSelected();
            }}
          >
            <MenuItemSelect
              onClick={() => {
                setSingleRecordPickerSelectedId(undefined);
                onMorphItemSelected();
              }}
              LeftIcon={EmptyIcon}
              text={emptyLabel}
              selected={isUndefined(singleRecordPickerSelectedId)}
              focused={isSelectedItemId}
            />
          </SelectableListItem>
        </div>
      )}
      {singleRecordPickerShouldShowInitialLoading ? (
        <RecordPickerInitialLoadingEmptyContainer />
      ) : singleRecordPickerShouldShowSkeleton ? (
        <RecordPickerLoadingSkeletonList />
      ) : (
        itemsMatchingSearchFilter.map((morphItem) => (
          <SingleRecordPickerMenuItem
            key={morphItem.recordId}
            getOptionId={getOptionId}
            morphItem={morphItem}
            onMorphItemSelected={onMorphItemSelected}
            isRecordSelected={
              singleRecordPickerSelectedId === morphItem.recordId
            }
          />
        ))
      )}
      {shouldShowNoRecordFound && searchHasNoResults && (
        <RecordPickerNoRecordFoundMenuItem />
      )}
    </SelectableList>
  );
};
