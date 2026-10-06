import { MYAH_HIDDEN_OBJECT_NAME_SINGULARS } from '@/myah/navigation/constants/MyahHiddenObjectNameSingulars';
import {
  CommandMenuContext,
  type CommandMenuContextType,
} from '@/command-menu-item/contexts/CommandMenuContext';
import { commandMenuItemsDraftState } from '@/command-menu-item/edit/states/commandMenuItemsDraftState';
import { commandMenuItemsSelector } from '@/command-menu-item/states/commandMenuItemsSelector';
import { isInternalInstagramNavigationCommandMenuItem } from '@/command-menu-item/utils/isInternalInstagramNavigationCommandMenuItem';
import { isMyahHiddenSettingsNavigationCommandMenuItem } from '@/command-menu-item/utils/isMyahHiddenSettingsNavigationCommandMenuItem';
import { doesCommandMenuItemMatchObjectMetadataId } from '@/command-menu-item/utils/doesCommandMenuItemMatchObjectMetadataId';
import { doesCommandMenuItemMatchPageLayoutId } from '@/command-menu-item/utils/doesCommandMenuItemMatchPageLayoutId';
import { doesCommandMenuItemMatchPageType } from '@/command-menu-item/utils/doesCommandMenuItemMatchPageType';
import { doesCommandMenuItemMatchSelectionState } from '@/command-menu-item/utils/doesCommandMenuItemMatchSelectionState';
import { currentPageLayoutIdState } from '@/page-layout/states/currentPageLayoutIdState';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMemo } from 'react';
import { type CommandMenuContextApi } from 'twenty-shared/types';
import { evaluateConditionalAvailabilityExpression } from 'twenty-shared/utils';
import { EngineComponentKey } from '~/generated-metadata/graphql';

type CommandMenuContextProviderContentProps = {
  displayType: CommandMenuContextType['displayType'];
  containerType: CommandMenuContextType['containerType'];
  children: React.ReactNode;
  commandMenuContextApi: CommandMenuContextApi;
  isInPreviewMode: boolean;
};

export const CommandMenuContextProviderContent = ({
  displayType,
  containerType,
  children,
  commandMenuContextApi,
  isInPreviewMode,
}: CommandMenuContextProviderContentProps) => {
  const commandMenuItems = useAtomStateValue(commandMenuItemsSelector);
  const commandMenuItemsDraft = useAtomStateValue(commandMenuItemsDraftState);
  const currentPageLayoutId = useAtomStateValue(currentPageLayoutIdState);
  const { objectMetadataItems } = useObjectMetadataItems();

  const filteredCommandMenuItems = useMemo(() => {
    const internalInstagramObjectIds = new Set(
      objectMetadataItems.flatMap(({ id, nameSingular }) =>
        nameSingular === 'myahInstagramAccount' ||
        nameSingular === 'myahInstagramReplyDraft' ||
        MYAH_HIDDEN_OBJECT_NAME_SINGULARS.includes(nameSingular)
          ? [id]
          : [],
      ),
    );
    const isInstagramAccountIndex =
      commandMenuContextApi.objectMetadataItem.nameSingular ===
      'myahInstagramAccount';
    // Importing "Creator Lists" records isn't useful; creators are imported
    // into a List from its Members section instead (MYAH-457).
    const isCreatorListIndex =
      commandMenuContextApi.objectMetadataItem.nameSingular === 'creatorList';
    const currentObjectMetadataItemId =
      commandMenuContextApi.objectMetadataItem.id;
    const hasSelectedRecords =
      commandMenuContextApi.numberOfSelectedRecords > 0;
    const commandMenuItemsToDisplay = isInPreviewMode
      ? (commandMenuItemsDraft ?? commandMenuItems)
      : commandMenuItems;

    return commandMenuItemsToDisplay
      .filter((item) => {
        if (
          isInstagramAccountIndex &&
          (item.engineComponentKey === EngineComponentKey.CREATE_NEW_RECORD ||
            item.engineComponentKey === EngineComponentKey.IMPORT_RECORDS ||
            item.engineComponentKey === EngineComponentKey.SEE_DELETED_RECORDS)
        ) {
          return false;
        }
        if (
          isCreatorListIndex &&
          item.engineComponentKey === EngineComponentKey.IMPORT_RECORDS
        ) {
          return false;
        }
        return (
          !isMyahHiddenSettingsNavigationCommandMenuItem(item) &&
          !isInternalInstagramNavigationCommandMenuItem(
            item,
            internalInstagramObjectIds,
          )
        );
      })
      .filter(
        doesCommandMenuItemMatchObjectMetadataId(currentObjectMetadataItemId),
      )
      .filter(doesCommandMenuItemMatchPageType(commandMenuContextApi.pageType))
      .filter(doesCommandMenuItemMatchSelectionState(hasSelectedRecords))
      .filter(doesCommandMenuItemMatchPageLayoutId(currentPageLayoutId))
      .filter((item) =>
        evaluateConditionalAvailabilityExpression(
          item.conditionalAvailabilityExpression,
          commandMenuContextApi,
        ),
      )
      .sort(
        (firstItem, secondItem) => firstItem.position - secondItem.position,
      );
  }, [
    commandMenuContextApi,
    commandMenuItems,
    commandMenuItemsDraft,
    currentPageLayoutId,
    isInPreviewMode,
    objectMetadataItems,
  ]);

  return (
    <CommandMenuContext.Provider
      value={{
        displayType,
        containerType,
        commandMenuItems: filteredCommandMenuItems,
        commandMenuContextApi,
        isInPreviewMode,
      }}
    >
      {children}
    </CommandMenuContext.Provider>
  );
};
