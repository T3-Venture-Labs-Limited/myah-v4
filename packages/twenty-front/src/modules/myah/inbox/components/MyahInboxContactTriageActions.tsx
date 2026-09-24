import { useEffect, useState } from 'react';
import { useStore } from 'jotai';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { FormDateTimeFieldInput } from '@/object-record/record-field/ui/form-types/components/FormDateTimeFieldInput';
import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import {
  MyahInboxContactTriageMutationError,
  useMyahInboxContactTriageMutation,
} from '@/myah/inbox/hooks/useMyahInboxContactTriageMutation';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
} from '@/myah/inbox/types/MyahInboxContact';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { Select } from '@/ui/input/components/Select';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownContent } from '@/ui/layout/dropdown/components/DropdownContent';
import { styled } from '@linaria/react';
import { IconClock, IconStatusChange, IconUserCircle } from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledDropdownForm = styled.div`
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const INBOX_STATE_OPTIONS = [
  { label: 'New message', value: 'NEEDS_REPLY' },
  { label: 'Waiting on creator', value: 'WAITING_ON_CREATOR' },
  { label: 'Closed', value: 'CLOSED' },
];

const MAX_TIMEOUT_DELAY = 2_147_483_647;

export type MyahInboxContactTriageActionsProps = {
  contact: MyahInboxContact;
  channel?: MyahInboxChannel;
  onUpdated: () => void | Promise<void>;
};

export const MyahInboxContactTriageActions = ({
  contact,
  onUpdated,
}: MyahInboxContactTriageActionsProps) => {
  const store = useStore();
  const workspaceId = store.get(currentWorkspaceState.atom)?.id;
  const { objectMetadataItems } = useObjectMetadataItems();
  const { updateTriage } = useMyahInboxContactTriageMutation();
  const [pendingContactIds, setPendingContactIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isPending = pendingContactIds.has(contact.id);
  const errorMessage = errors[contact.id];
  const triage = contact.triage;

  useEffect(() => {
    if (
      triage.inboxState !== 'SNOOZED' ||
      !triage.snoozedUntil ||
      !triage.isAvailable
    ) {
      return;
    }

    const snoozedUntil = triage.snoozedUntil;
    let timeout: number | undefined;
    const scheduleRefresh = () => {
      const delay = Date.parse(snoozedUntil) - Date.now();

      timeout = window.setTimeout(
        () => {
          if (Date.parse(snoozedUntil) <= Date.now()) {
            void onUpdated();
          } else {
            scheduleRefresh();
          }
        },
        Math.min(Math.max(0, delay), MAX_TIMEOUT_DELAY),
      );
    };

    scheduleRefresh();

    return () => {
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [
    contact.id,
    onUpdated,
    triage.inboxState,
    triage.isAvailable,
    triage.snoozedUntil,
  ]);

  if (!triage.isAvailable || !workspaceId) {
    return (
      <StyledStatus role="status">
        Triage is unavailable with your current Inbox access.
      </StyledStatus>
    );
  }

  if (
    triage.inboxState === null ||
    triage.revision === null ||
    triage.identityGeneration === null
  ) {
    return (
      <StyledStatus role="status">
        Triage is unavailable with your current Inbox access.
      </StyledStatus>
    );
  }

  const expectedRevision = triage.revision;
  const expectedIdentityGeneration = triage.identityGeneration;

  const update = async (
    patch:
      | { inboxOwnerId: string | null }
      | { inboxState: 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'CLOSED' }
      | { inboxState: 'SNOOZED'; snoozedUntil: string }
      | { inboxState: 'NEEDS_REPLY'; snoozedUntil: null },
  ) => {
    const operationContactId = contact.id;
    setPendingContactIds((currentPendingContactIds) =>
      new Set(currentPendingContactIds).add(operationContactId),
    );
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[operationContactId];

      return nextErrors;
    });

    try {
      await updateTriage({
        expectedWorkspaceId: workspaceId,
        contactId: contact.id,
        expectedRevision,
        expectedIdentityGeneration,
        ...patch,
      });
      await onUpdated();
    } catch (reason) {
      if (
        reason instanceof MyahInboxContactTriageMutationError &&
        reason.triage
      ) {
        await onUpdated();
      }
      setErrors((currentErrors) => ({
        ...currentErrors,
        [operationContactId]:
          reason instanceof Error
            ? reason.message
            : 'Triage is unavailable with your current Inbox access.',
      }));
    } finally {
      setPendingContactIds((currentPendingContactIds) => {
        const nextPendingContactIds = new Set(currentPendingContactIds);
        nextPendingContactIds.delete(operationContactId);

        return nextPendingContactIds;
      });
    }
  };

  const handleSnoozeChange = (snoozedUntil: string | null) => {
    if (!snoozedUntil) {
      void update({ inboxState: 'NEEDS_REPLY', snoozedUntil: null });

      return;
    }

    const snoozedAt = Date.parse(snoozedUntil);
    if (!Number.isFinite(snoozedAt) || snoozedAt <= Date.now()) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [contact.id]: 'Choose a future snooze time.',
      }));

      return;
    }

    void update({ inboxState: 'SNOOZED', snoozedUntil });
  };

  const canSelectOwner = objectMetadataItems.some(
    (item) => item.nameSingular === 'workspaceMember',
  );

  return (
    <StyledActions aria-label="Contact triage" role="group">
      {errorMessage ? (
        <StyledStatus role="alert">{errorMessage}</StyledStatus>
      ) : null}
      <Dropdown
        dropdownId={`myah-inbox-contact-owner-${contact.id}`}
        clickableComponent={
          <IconButton
            Icon={IconUserCircle}
            ariaLabel="Owner"
            disabled={isPending || !canSelectOwner}
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
                defaultValue={triage.inboxOwnerId}
                disabled={isPending}
                onChange={(inboxOwnerId) => void update({ inboxOwnerId })}
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      <Dropdown
        dropdownId={`myah-inbox-contact-state-${contact.id}`}
        clickableComponent={
          <IconButton
            Icon={IconStatusChange}
            ariaLabel="State"
            disabled={isPending}
            size="small"
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              <Select
                dropdownId={`myah-inbox-contact-state-select-${contact.id}`}
                label="State"
                fullWidth
                disabled={isPending}
                value={triage.inboxState}
                options={INBOX_STATE_OPTIONS}
                onChange={(inboxState) =>
                  void update({
                    inboxState: inboxState as
                      | 'NEEDS_REPLY'
                      | 'WAITING_ON_CREATOR'
                      | 'CLOSED',
                  })
                }
              />
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
      <Dropdown
        dropdownId={`myah-inbox-contact-snooze-${contact.id}`}
        clickableComponent={
          <IconButton
            Icon={IconClock}
            ariaLabel="Snooze"
            disabled={isPending}
            size="small"
            variant="tertiary"
          />
        }
        dropdownComponents={
          <DropdownContent>
            <StyledDropdownForm>
              {isPending ? null : (
                <FormDateTimeFieldInput
                  label="Snooze"
                  defaultValue={triage.snoozedUntil ?? undefined}
                  onChange={handleSnoozeChange}
                />
              )}
            </StyledDropdownForm>
          </DropdownContent>
        }
        dropdownPlacement="bottom-end"
      />
    </StyledActions>
  );
};
