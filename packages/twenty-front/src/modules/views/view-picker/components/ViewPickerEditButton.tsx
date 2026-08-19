import { useContextStoreObjectMetadataItemOrThrow } from '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { viewsFromObjectMetadataItemFamilySelector } from '@/views/states/selectors/viewsFromObjectMetadataItemFamilySelector';
import { ViewType } from '@/views/types/ViewType';
import { useCreateViewFromCurrentState } from '@/views/view-picker/hooks/useCreateViewFromCurrentState';
import { useDestroyViewFromCurrentState } from '@/views/view-picker/hooks/useDestroyViewFromCurrentState';
import { useGetAvailableFieldsToGroupRecordsBy } from '@/views/view-picker/hooks/useGetAvailableFieldsToGroupRecordsBy';
import { useViewPickerMode } from '@/views/view-picker/hooks/useViewPickerMode';
import { viewPickerIsPersistingComponentState } from '@/views/view-picker/states/viewPickerIsPersistingComponentState';
import { viewPickerMainGroupByFieldMetadataIdComponentState } from '@/views/view-picker/states/viewPickerMainGroupByFieldMetadataIdComponentState';
import { viewPickerTypeComponentState } from '@/views/view-picker/states/viewPickerTypeComponentState';
import { t } from '@lingui/core/macro';
import { Button } from 'twenty-ui/input';

type ViewPickerEditButtonProps = {
  forcedViewType?: ViewType;
  onViewChange?: (viewId: string) => void;
};

export const ViewPickerEditButton = ({
  onViewChange,
  forcedViewType,
}: ViewPickerEditButtonProps) => {
  const { availableFieldsForGrouping, navigateToSelectSettings } =
    useGetAvailableFieldsToGroupRecordsBy();

  const { objectMetadataItem } = useContextStoreObjectMetadataItemOrThrow();

  const viewsOnCurrentObject = useAtomFamilySelectorValue(
    viewsFromObjectMetadataItemFamilySelector,
    { objectMetadataItemId: objectMetadataItem.id },
  );

  const isLastView = viewsOnCurrentObject.length <= 1;

  const { viewPickerMode } = useViewPickerMode();
  const viewPickerType = useAtomComponentStateValue(
    viewPickerTypeComponentState,
  );
  const viewPickerIsPersisting = useAtomComponentStateValue(
    viewPickerIsPersistingComponentState,
  );
  const viewPickerMainGroupByFieldMetadataId = useAtomComponentStateValue(
    viewPickerMainGroupByFieldMetadataIdComponentState,
  );
  const resolvedViewPickerType = forcedViewType ?? viewPickerType;

  const { createViewFromCurrentState } = useCreateViewFromCurrentState(
    onViewChange,
    forcedViewType,
  );
  const { destroyViewFromCurrentState } = useDestroyViewFromCurrentState(
    undefined,
    onViewChange,
  );

  if (viewPickerMode === 'edit') {
    return (
      <Button
        title={t`Delete`}
        onClick={destroyViewFromCurrentState}
        accent="danger"
        fullWidth
        size="small"
        justify="center"
        focus={false}
        variant="secondary"
        disabled={viewPickerIsPersisting || isLastView}
      />
    );
  }

  if (
    resolvedViewPickerType === ViewType.KANBAN &&
    availableFieldsForGrouping.length === 0
  ) {
    return (
      <Button
        title={t`Go to Settings`}
        onClick={navigateToSelectSettings}
        size="small"
        accent="brand"
        fullWidth
        justify="center"
      />
    );
  }

  if (
    resolvedViewPickerType === ViewType.TABLE ||
    viewPickerMainGroupByFieldMetadataId !== ''
  ) {
    return (
      <Button
        title={t`Create`}
        onClick={createViewFromCurrentState}
        accent="brand"
        fullWidth
        size="small"
        justify="center"
        disabled={
          viewPickerIsPersisting ||
          (resolvedViewPickerType === ViewType.KANBAN &&
            viewPickerMainGroupByFieldMetadataId === '')
        }
      />
    );
  }
};
