import { getMyahInboxSafeEmailSubject } from '@/myah/inbox/components/MyahInboxEmailSubjectSeparator';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
} from '@/myah/inbox/types/MyahInboxContact';
import { Select } from '@/ui/input/components/Select';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledHeader = styled.header`
  align-items: flex-start;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledIdentity = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledContactName = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledChannel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEmailTarget = styled.div`
  flex: 1;
  min-width: 0;
`;

export type MyahInboxEmailThreadOption = {
  id: string;
  subject: string | null;
  detail: string;
};

export type MyahInboxContactHeaderProps = {
  contact: MyahInboxContact;
  channel: MyahInboxChannel;
  selectedEmailThreadId: string | null;
  emailThreadOptions: MyahInboxEmailThreadOption[];
  onSelectEmailThread: (threadId: string) => void;
};

export const MyahInboxContactHeader = ({
  contact,
  channel,
  selectedEmailThreadId,
  emailThreadOptions,
  onSelectEmailThread,
}: MyahInboxContactHeaderProps) => {
  const selectOptions = emailThreadOptions.map((thread) => ({
    label: `${getMyahInboxSafeEmailSubject(thread.subject)} · ${thread.detail}`,
    value: thread.id,
  }));

  return (
    <StyledHeader aria-label="Contact conversation header">
      <StyledIdentity>
        <StyledContactName>{contact.displayName}</StyledContactName>
        <StyledChannel>
          {channel === 'EMAIL' ? 'Email' : 'Instagram'}
        </StyledChannel>
      </StyledIdentity>
      {channel === 'EMAIL' ? (
        <StyledEmailTarget>
          <Select
            dropdownWidthAuto
            fullWidth
            dropdownId={`myah-inbox-email-thread-${contact.id}`}
            label="Email thread"
            value={selectedEmailThreadId ?? ''}
            emptyOption={{ label: 'Select a thread', value: '' }}
            options={selectOptions}
            onChange={(threadId) => {
              if (threadId !== '') {
                onSelectEmailThread(threadId);
              }
            }}
          />
        </StyledEmailTarget>
      ) : null}
    </StyledHeader>
  );
};
