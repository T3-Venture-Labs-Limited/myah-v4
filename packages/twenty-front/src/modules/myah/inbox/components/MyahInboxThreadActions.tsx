import { useStore } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { styled } from '@linaria/react';
import { IconUser } from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/input';
import { AppTooltip, TooltipDelay, TooltipPosition } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type UpdateMyahInboxThreadInput } from '~/generated/graphql';
import { useRef } from 'react';
import { v4 } from 'uuid';

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledDropdownForm = styled.div`
  padding: ${themeCssVariables.spacing[3]};
`;

export type MyahInboxThreadActionsProps = {
  thread: MyahInboxThread;
  onThreadUpdated: (message: string) => void;
  onUpdateFailed?: (message: string) => void;
};

export const MyahInboxThreadActions = ({
  thread,
  onThreadUpdated,
  onUpdateFailed,
}: MyahInboxThreadActionsProps) => {
  const store = useStore();
  const workspaceId = useAtomStateValue(currentWorkspaceState)?.id;
  // oxlint-disable-next-line twenty/no-state-useref
  const targetRef = useRef({ workspaceId, threadId: thread.id });
  targetRef.current = { workspaceId, threadId: thread.id };
  const { objectMetadataItems } = useObjectMetadataItems();
  const { updateThread } = useMyahInboxThreadMutations();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const creatorPickerTriggerRef = useRef<HTMLDivElement>(null);

  const isCreatorPickerReady = objectMetadataItems.some(
    (item) => item.nameSingular === 'creator',
  );

  const update = async (
    input: UpdateMyahInboxThreadInput,
    successMessage: string,
  ) => {
    const isCurrent = () =>
      Boolean(workspaceId) &&
      store.get(currentWorkspaceState.atom)?.id === workspaceId &&
      targetRef.current.workspaceId === workspaceId &&
      targetRef.current.threadId === input.threadId;
    if (!workspaceId || !isCurrent()) return;
    try {
      await updateThread({ ...input, expectedWorkspaceId: workspaceId });
      if (isCurrent()) onThreadUpdated(successMessage);
    } catch {
      if (isCurrent())
        onUpdateFailed?.('Could not update the conversation. Try again.');
    }
  };

  if (!isCreatorPickerReady) {
    return (
      <StyledStatus role="status">Loading conversation actions</StyledStatus>
    );
  }

  return (
    <StyledActions aria-label="Thread actions">
      <Dropdown
        dropdownId={`myah-inbox-creator-${thread.id}`}
        dropdownRole="dialog"
        dropdownAriaLabel="Creator selector"
        clickableComponentAriaLabel="Creator selector"
        isClickableComponentKeyboardAccessible
        onClickableComponentRef={(element) => {
          creatorPickerTriggerRef.current = element;
        }}
        onClose={() => {
          creatorPickerTriggerRef.current?.focus();
        }}
        clickableComponent={
          <IconButton
            Icon={IconUser}
            ariaHidden
            ariaLabel="Creator"
            dataTestId="myah-inbox-thread-creator-action"
            size="small"
            tabIndex={-1}
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              <FormSingleRecordPicker
                label="Creator"
                objectNameSingulars={['creator']}
                defaultValue={thread.creator?.id ?? null}
                shouldPreventRecordNavigation
                shouldAutoFocusPickerTrigger
                onChange={(creatorId) =>
                  void update(
                    { threadId: thread.id, creatorId },
                    'Creator updated',
                  )
                }
                onCreate={() =>
                  openRecordInSidePanel({
                    recordId: v4(),
                    objectNameSingular: 'creator',
                    isNewRecord: true,
                    resetNavigationStack: true,
                  })
                }
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      <AppTooltip
        anchorSelect="[data-testid='myah-inbox-thread-creator-action']"
        content="Change creator"
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
    </StyledActions>
  );
};
