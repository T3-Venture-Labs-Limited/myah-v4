import { type MyahInboxChannel } from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { useRef, type KeyboardEvent } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const MYAH_INBOX_EMAIL_TAB_ID = 'myah-inbox-channel-tab-email';
export const MYAH_INBOX_EMAIL_PANEL_ID = 'myah-inbox-channel-panel-email';
export const MYAH_INBOX_INSTAGRAM_TAB_ID = 'myah-inbox-channel-tab-instagram';
export const MYAH_INBOX_INSTAGRAM_PANEL_ID =
  'myah-inbox-channel-panel-instagram';

const CHANNELS: Array<{
  id: MyahInboxChannel;
  label: string;
  tabId: string;
  panelId: string;
}> = [
  {
    id: 'EMAIL',
    label: 'Email',
    tabId: MYAH_INBOX_EMAIL_TAB_ID,
    panelId: MYAH_INBOX_EMAIL_PANEL_ID,
  },
  {
    id: 'INSTAGRAM',
    label: 'Instagram',
    tabId: MYAH_INBOX_INSTAGRAM_TAB_ID,
    panelId: MYAH_INBOX_INSTAGRAM_PANEL_ID,
  },
];

const StyledTabList = styled.div`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledTab = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.transparent.lighter
      : 'transparent'};
  border: 0;
  border-bottom: 2px solid
    ${({ isSelected }) =>
      isSelected ? themeCssVariables.font.color.primary : 'transparent'};
  border-radius: ${themeCssVariables.border.radius.sm}
    ${themeCssVariables.border.radius.sm} 0 0;
  color: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: ${themeCssVariables.font.family};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  &:hover:not(:disabled) {
    background: ${themeCssVariables.background.transparent.lighter};
  }

  &:disabled {
    color: ${themeCssVariables.font.color.tertiary};
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.border.color.medium};
    outline-offset: 2px;
  }
`;

export type MyahInboxChannelTabsProps = {
  activeChannel: MyahInboxChannel;
  emailAvailable: boolean;
  instagramAvailable: boolean;
  onChannelChange: (channel: MyahInboxChannel) => void;
};

export const MyahInboxChannelTabs = ({
  activeChannel,
  emailAvailable,
  instagramAvailable,
  onChannelChange,
}: MyahInboxChannelTabsProps) => {
  // oxlint-disable-next-line twenty/no-state-useref -- DOM refs coordinate roving keyboard focus.
  const tabRefs = useRef<
    Partial<Record<MyahInboxChannel, HTMLButtonElement | null>>
  >({});
  const availability: Record<MyahInboxChannel, boolean> = {
    EMAIL: emailAvailable,
    INSTAGRAM: instagramAvailable,
  };
  const enabledChannels = CHANNELS.filter(
    (channel) => availability[channel.id],
  );
  const focusableChannel = availability[activeChannel]
    ? activeChannel
    : enabledChannels[0]?.id;

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentChannel: MyahInboxChannel,
  ) => {
    const currentIndex = enabledChannels.findIndex(
      (channel) => channel.id === currentChannel,
    );

    if (currentIndex === -1 || enabledChannels.length === 0) {
      return;
    }

    const lastIndex = enabledChannels.length - 1;
    const nextIndexByKey: Partial<Record<string, number>> = {
      ArrowLeft: currentIndex === 0 ? lastIndex : currentIndex - 1,
      ArrowRight: (currentIndex + 1) % enabledChannels.length,
      End: lastIndex,
      Home: 0,
    };
    const nextIndex = nextIndexByKey[event.key];

    if (nextIndex === undefined) {
      return;
    }

    event.preventDefault();
    const nextChannel = enabledChannels[nextIndex].id;

    tabRefs.current[nextChannel]?.focus();

    if (nextChannel !== currentChannel) {
      onChannelChange(nextChannel);
    }
  };

  return (
    <StyledTabList role="tablist" aria-label="Conversation channels">
      {CHANNELS.map((channel) => {
        const isAvailable = availability[channel.id];
        const isSelected = isAvailable && channel.id === activeChannel;

        return (
          <StyledTab
            key={channel.id}
            ref={(element) => {
              tabRefs.current[channel.id] = element;
            }}
            id={channel.tabId}
            type="button"
            role="tab"
            aria-controls={channel.panelId}
            aria-disabled={!isAvailable}
            aria-selected={isSelected}
            disabled={!isAvailable}
            isSelected={isSelected}
            tabIndex={channel.id === focusableChannel ? 0 : -1}
            onClick={() => onChannelChange(channel.id)}
            onKeyDown={(event) => handleKeyDown(event, channel.id)}
          >
            {channel.label}
          </StyledTab>
        );
      })}
    </StyledTabList>
  );
};
