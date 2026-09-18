import { type ReactNode } from 'react';
import { MyahInboxContactTriageActions } from '@/myah/inbox/components/MyahInboxContactTriageActions';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
} from '@/myah/inbox/types/MyahInboxContact';
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

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

export type MyahInboxContactHeaderProps = {
  contact: MyahInboxContact;
  channel: MyahInboxChannel;
  actions?: ReactNode;
  onTriageUpdated?: () => void | Promise<void>;
};

export const MyahInboxContactHeader = ({
  contact,
  channel,
  actions,
  onTriageUpdated = () => undefined,
}: MyahInboxContactHeaderProps) => {
  return (
    <StyledHeader aria-label="Contact conversation header">
      <StyledIdentity>
        <StyledContactName>{contact.displayName}</StyledContactName>
        <StyledChannel>
          {channel === 'EMAIL' ? 'Email' : 'Instagram'}
        </StyledChannel>
      </StyledIdentity>
      <StyledActions>
        <MyahInboxContactTriageActions
          key={contact.id}
          contact={contact}
          channel={channel}
          onUpdated={onTriageUpdated}
        />
        {actions}
      </StyledActions>
    </StyledHeader>
  );
};
