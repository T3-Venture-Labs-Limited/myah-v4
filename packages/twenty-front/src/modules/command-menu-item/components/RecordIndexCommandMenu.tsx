import { RecordIndexCommandMenuDropdown } from '@/command-menu-item/components/RecordIndexCommandMenuDropdown';
import { CommandMenuContextProvider } from '@/command-menu-item/contexts/CommandMenuContextProvider';
import { CommandMenuContext } from '@/command-menu-item/contexts/CommandMenuContext';
import { PinnedCommandMenuItemButtons } from '@/command-menu-item/display/components/PinnedCommandMenuItemButtons';
import { CommandMenuItemEditButton } from '@/command-menu-item/edit/components/CommandMenuItemEditButton';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useIsMobile } from 'twenty-ui/utilities';
import { useContext, type ReactNode } from 'react';
import { EngineComponentKey } from '~/generated-metadata/graphql';

const WithoutCreateNewRecord = ({ children }: { children: ReactNode }) => {
  const context = useContext(CommandMenuContext);
  return (
    <CommandMenuContext.Provider
      value={{
        ...context,
        commandMenuItems: context.commandMenuItems.filter(
          (item) =>
            item.engineComponentKey !== EngineComponentKey.CREATE_NEW_RECORD,
        ),
      }}
    >
      {children}
    </CommandMenuContext.Provider>
  );
};

export const RecordIndexCommandMenu = ({
  hideCreateNewRecord = false,
}: {
  hideCreateNewRecord?: boolean;
}) => {
  const contextStoreCurrentObjectMetadataItemId = useAtomComponentStateValue(
    contextStoreCurrentObjectMetadataItemIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );

  const isMobile = useIsMobile();
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  return (
    <>
      {contextStoreCurrentObjectMetadataItemId && (
        <>
          <CommandMenuContextProvider
            isInSidePanel={false}
            displayType="button"
            containerType="index-page-header"
            isInPreviewMode={isLayoutCustomizationModeEnabled}
          >
            {!isMobile &&
              (hideCreateNewRecord ? (
                <WithoutCreateNewRecord>
                  <PinnedCommandMenuItemButtons />
                </WithoutCreateNewRecord>
              ) : (
                <PinnedCommandMenuItemButtons />
              ))}
          </CommandMenuContextProvider>
          <CommandMenuContextProvider
            isInSidePanel={false}
            displayType="dropdownItem"
            containerType="index-page-dropdown"
          >
            {hideCreateNewRecord ? (
              <WithoutCreateNewRecord>
                <RecordIndexCommandMenuDropdown />
              </WithoutCreateNewRecord>
            ) : (
              <RecordIndexCommandMenuDropdown />
            )}
          </CommandMenuContextProvider>
          <CommandMenuItemEditButton />
        </>
      )}
    </>
  );
};
