import { useOpenMyahInboxContextInSidePanel } from '@/myah/inbox/hooks/useOpenMyahInboxContextInSidePanel';
import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { type MyahInboxThread } from '@/myah/inbox/hooks/useMyahInboxThreads';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

import { FormDateTimeFieldInput } from '@/object-record/record-field/ui/form-types/components/FormDateTimeFieldInput';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { Select } from '@/ui/input/components/Select';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { styled } from '@linaria/react';
import {
  IconClock,
  IconInfoCircle,
  IconStatusChange,
  IconTarget,
  IconUser,
  IconUserCircle,
} from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/input';
import { AppTooltip, TooltipDelay, TooltipPosition } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  MyahInboxState,
  type UpdateMyahInboxThreadInput,
} from '~/generated/graphql';
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

const INBOX_STATE_OPTIONS = [
  { label: 'Needs reply', value: 'NEEDS_REPLY' },
  { label: 'Waiting on creator', value: 'WAITING_ON_CREATOR' },
  { label: 'Closed', value: 'CLOSED' },
];

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
  const { objectMetadataItems } = useObjectMetadataItems();
  const { updateThread } = useMyahInboxThreadMutations();
  const { openMyahInboxContextInSidePanel } =
    useOpenMyahInboxContextInSidePanel();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const creatorPickerTriggerRef = useRef<HTMLDivElement>(null);
  const campaignPickerTriggerRef = useRef<HTMLDivElement>(null);

  const areRecordPickersReady = [
    'creator',
    'campaign',
    'workspaceMember',
  ].every((nameSingular) =>
    objectMetadataItems.some((item) => item.nameSingular === nameSingular),
  );

  const update = async (
    input: UpdateMyahInboxThreadInput,
    successMessage: string,
  ) => {
    try {
      await updateThread(input);
      onThreadUpdated(successMessage);
    } catch {
      onUpdateFailed?.('Could not update the conversation. Try again.');
    }
  };

  const handleSnoozeChange = (snoozedUntil: string | null) => {
    const snoozedAt = snoozedUntil ? Date.parse(snoozedUntil) : null;

    if (
      snoozedAt !== null &&
      (!Number.isFinite(snoozedAt) || snoozedAt <= Date.now())
    ) {
      onUpdateFailed?.('Choose a future snooze time.');

      return;
    }

    void update(
      {
        threadId: thread.id,
        inboxState: snoozedUntil
          ? MyahInboxState.SNOOZED
          : MyahInboxState.NEEDS_REPLY,
        snoozedUntil,
      },
      'Snooze updated',
    );
  };

  if (!areRecordPickersReady) {
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
      <Dropdown
        dropdownRole="dialog"
        dropdownId={`myah-inbox-campaign-${thread.id}`}
        dropdownAriaLabel="Campaign selector"
        clickableComponentAriaLabel="Campaign selector"
        isClickableComponentKeyboardAccessible
        onClickableComponentRef={(element) => {
          campaignPickerTriggerRef.current = element;
        }}
        onClose={() => {
          campaignPickerTriggerRef.current?.focus();
        }}
        clickableComponent={
          <IconButton
            Icon={IconTarget}
            ariaHidden
            ariaLabel="Campaign"
            dataTestId="myah-inbox-thread-campaign-action"
            size="small"
            tabIndex={-1}
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              <FormSingleRecordPicker
                label="Campaign"
                objectNameSingulars={['campaign']}
                defaultValue={thread.campaign?.id ?? null}
                shouldPreventRecordNavigation
                shouldAutoFocusPickerTrigger
                onChange={(campaignId) =>
                  void update(
                    { threadId: thread.id, campaignId },
                    'Campaign updated',
                  )
                }
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      <IconButton
        Icon={IconInfoCircle}
        ariaLabel="Conversation details"
        dataTestId="myah-inbox-thread-details-action"
        size="small"
        variant="tertiary"
        onClick={() => openMyahInboxContextInSidePanel({ thread })}
      />
      <AppTooltip
        anchorSelect="[data-testid='myah-inbox-thread-details-action']"
        content="Open Inbox context"
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
      <Dropdown
        dropdownId={`myah-inbox-owner-${thread.id}`}
        clickableComponent={
          <IconButton
            Icon={IconUserCircle}
            ariaLabel="Owner"
            dataTestId="myah-inbox-thread-owner-action"
            size="small"
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              <FormSingleRecordPicker
                label="Owner"
                objectNameSingulars={['workspaceMember']}
                defaultValue={thread.inboxOwner?.id ?? null}
                onChange={(inboxOwnerId) =>
                  void update(
                    { threadId: thread.id, inboxOwnerId },
                    'Owner updated',
                  )
                }
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      <Dropdown
        dropdownId={`myah-inbox-state-${thread.id}`}
        clickableComponent={
          <IconButton
            Icon={IconStatusChange}
            ariaLabel="State"
            dataTestId="myah-inbox-thread-state-action"
            size="small"
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              <Select
                dropdownId={`myah-inbox-state-select-${thread.id}`}
                label="State"
                fullWidth
                value={thread.state}
                options={INBOX_STATE_OPTIONS}
                onChange={(inboxState) =>
                  void update(
                    {
                      threadId: thread.id,
                      inboxState:
                        inboxState as UpdateMyahInboxThreadInput['inboxState'],
                    },
                    'State updated',
                  )
                }
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      <Dropdown
        dropdownId={`myah-inbox-snooze-${thread.id}`}
        clickableComponent={
          <IconButton
            Icon={IconClock}
            ariaLabel="Snooze"
            dataTestId="myah-inbox-thread-snooze-action"
            size="small"
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              <FormDateTimeFieldInput
                label="Snooze"
                defaultValue={thread.snoozedUntil ?? undefined}
                onChange={handleSnoozeChange}
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
      <AppTooltip
        anchorSelect="[data-testid='myah-inbox-thread-campaign-action']"
        content="Change campaign"
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
      <AppTooltip
        anchorSelect="[data-testid='myah-inbox-thread-owner-action']"
        content="Change owner"
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
      <AppTooltip
        anchorSelect="[data-testid='myah-inbox-thread-state-action']"
        content="Change state"
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
      <AppTooltip
        anchorSelect="[data-testid='myah-inbox-thread-snooze-action']"
        content="Set snooze"
        delay={TooltipDelay.shortDelay}
        place={TooltipPosition.Top}
      />
    </StyledActions>
  );
};
