import { useMyahInboxContactCreatorLink } from '@/myah/inbox/hooks/useMyahInboxContactCreatorLink';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { styled } from '@linaria/react';
import { useRef } from 'react';
import { IconUserPlus } from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { v4 } from 'uuid';

const StyledDropdownForm = styled.div`
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatus = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export type MyahInboxContactLinkActionProps = {
  contactId: string;
  disabled?: boolean;
  onLinked: (resultingContactId: string) => void | Promise<void>;
  onError?: (message: string) => void;
};

export const MyahInboxContactLinkAction = ({
  contactId,
  disabled = false,
  onLinked,
  onError,
}: MyahInboxContactLinkActionProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { linkCreator, linking, error } =
    useMyahInboxContactCreatorLink(onLinked);
  // oxlint-disable-next-line twenty/no-state-useref -- The dialog must return focus to its opener.
  const pickerTriggerRef = useRef<HTMLDivElement>(null);
  const isCreatorMetadataReady = objectMetadataItems.some(
    (item) => item.nameSingular === 'creator',
  );
  const isDisabled = disabled || linking;

  const handleCreatorSelected = async (creatorId: string | null) => {
    if (creatorId === null) {
      return;
    }

    try {
      await linkCreator({ contactId, creatorId });
    } catch (reason: unknown) {
      onError?.(
        reason instanceof Error
          ? reason.message
          : 'Could not link the Inbox contact.',
      );
    }
  };

  if (!isCreatorMetadataReady) {
    return <StyledStatus role="status">Loading Creator picker</StyledStatus>;
  }

  return (
    <>
      <Dropdown
        dropdownId={`myah-inbox-contact-creator-${contactId}`}
        dropdownRole="dialog"
        dropdownAriaLabel="Creator selector"
        clickableComponentAriaLabel="Creator selector"
        isClickableComponentKeyboardAccessible={!isDisabled}
        disableClickForClickableComponent={isDisabled}
        onClickableComponentRef={(element) => {
          pickerTriggerRef.current = element;
        }}
        onClose={() => {
          pickerTriggerRef.current?.focus();
        }}
        clickableComponent={
          <IconButton
            Icon={IconUserPlus}
            ariaHidden
            ariaLabel="Link Creator"
            dataTestId="myah-inbox-contact-link-action"
            disabled={isDisabled}
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
                defaultValue={null}
                disabled={isDisabled}
                shouldPreventRecordNavigation
                shouldAutoFocusPickerTrigger
                onChange={(creatorId) => {
                  if (typeof creatorId === 'string') {
                    void handleCreatorSelected(creatorId);
                  }
                }}
                onCreate={() => {
                  openRecordInSidePanel({
                    recordId: v4(),
                    objectNameSingular: 'creator',
                    isNewRecord: true,
                    resetNavigationStack: true,
                  });
                }}
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      {linking ? (
        <StyledStatus role="status">Linking Creator</StyledStatus>
      ) : null}
      {error ? <StyledStatus role="alert">{error.message}</StyledStatus> : null}
    </>
  );
};
