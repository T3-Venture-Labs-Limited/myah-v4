import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { type KeyboardEvent } from 'react';
import { Avatar } from 'twenty-ui/data-display';
import { IconBrandInstagram, IconMail } from 'twenty-ui/icon';
import { themeCssVariables, useTheme } from 'twenty-ui/theme-constants';

const StyledContactRow = styled.button<{ isSelected: boolean }>`
  align-items: flex-start;
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.light
      : 'transparent'};
  border: 0;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: ${themeCssVariables.font.family};
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: left;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.lighter};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.border.color.medium};
    outline-offset: -2px;
  }
`;

const StyledAvatar = styled.span`
  flex-shrink: 0;
`;

const StyledDetails = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledHeader = styled.span`
  align-items: baseline;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  width: 100%;
`;

const StyledDisplayName = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTimestamp = styled.time`
  color: ${themeCssVariables.font.color.secondary};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledPreview = styled.span`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: ${themeCssVariables.font.color.secondary};
  display: -webkit-box;
  font-size: ${themeCssVariables.font.size.xs};
  line-clamp: 2;
  overflow: hidden;
`;

const StyledMeta = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledChannel = styled.span<{ isLatest: boolean }>`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-weight: ${({ isLatest }) =>
    isLatest ? themeCssVariables.font.weight.medium : 'inherit'};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledAttention = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
  margin-left: auto;
`;

const StyledAttentionDot = styled.span`
  background: ${themeCssVariables.font.color.danger};
  border-radius: ${themeCssVariables.border.radius.rounded};
  height: ${themeCssVariables.spacing[1]};
  width: ${themeCssVariables.spacing[1]};
`;

export type MyahInboxContactRowProps = {
  contact: MyahInboxContact;
  isSelected: boolean;
  tabIndex: number;
  rowRef: (element: HTMLButtonElement | null) => void;
  onSelect: (contactId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export const MyahInboxContactRow = ({
  contact,
  isSelected,
  tabIndex,
  rowRef,
  onSelect,
  onKeyDown,
}: MyahInboxContactRowProps) => {
  const theme = useTheme();

  return (
    <StyledContactRow
      ref={rowRef}
      type="button"
      role="option"
      aria-selected={isSelected}
      isSelected={isSelected}
      tabIndex={tabIndex}
      onClick={() => onSelect(contact.id)}
      onKeyDown={onKeyDown}
    >
      <StyledAvatar aria-label={`${contact.displayName} avatar`} role="img">
        <Avatar
          avatarUrl={null}
          placeholder={contact.displayName}
          placeholderColorSeed={contact.id}
          size="md"
          type="rounded"
        />
      </StyledAvatar>
      <StyledDetails>
        <StyledHeader>
          <StyledDisplayName>{contact.displayName}</StyledDisplayName>
          <StyledTimestamp dateTime={contact.lastActivityAt}>
            {new Date(contact.lastActivityAt).toLocaleDateString()}
          </StyledTimestamp>
        </StyledHeader>
        <StyledPreview>{contact.preview || 'No message preview'}</StyledPreview>
        <StyledMeta>
          {contact.email.isAvailable ? (
            <StyledChannel
              aria-label="Email available"
              isLatest={contact.latestChannel === 'EMAIL'}
            >
              <IconMail
                aria-hidden="true"
                size={theme.icon.size.sm}
                stroke={theme.icon.stroke.sm}
              />
              Email
            </StyledChannel>
          ) : null}
          {contact.instagram.isAvailable ? (
            <StyledChannel
              aria-label="Instagram available"
              isLatest={contact.latestChannel === 'INSTAGRAM'}
            >
              <IconBrandInstagram
                aria-hidden="true"
                size={theme.icon.size.sm}
                stroke={theme.icon.stroke.sm}
              />
              Instagram
            </StyledChannel>
          ) : null}
          {contact.needsAttention ? (
            <StyledAttention>
              <StyledAttentionDot aria-hidden="true" />
              Needs attention
            </StyledAttention>
          ) : null}
        </StyledMeta>
      </StyledDetails>
    </StyledContactRow>
  );
};
