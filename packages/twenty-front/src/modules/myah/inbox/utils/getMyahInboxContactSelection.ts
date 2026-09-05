import { type MyahInboxContactSelection } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
} from '@/myah/inbox/types/MyahInboxContact';

type ContactSelectionInput = {
  workspaceId: string;
  contact: MyahInboxContact;
  previousSelection: MyahInboxContactSelection | null;
};

type ChannelSelectionInput = ContactSelectionInput & {
  channel: MyahInboxChannel;
};

const resolveAvailableChannel = (
  contact: MyahInboxContact,
  preferredChannel: MyahInboxChannel,
): MyahInboxChannel | null => {
  const instagramAvailable =
    contact.instagram.isAvailable ||
    Boolean(contact.creator && contact.instagramUsername);

  if (
    (preferredChannel === 'EMAIL' && contact.email.isAvailable) ||
    (preferredChannel === 'INSTAGRAM' && instagramAvailable)
  ) {
    return preferredChannel;
  }

  if (contact.email.isAvailable) {
    return 'EMAIL';
  }

  if (instagramAvailable) {
    return 'INSTAGRAM';
  }

  return null;
};

export const getMyahInboxSelectionForChannel = ({
  workspaceId,
  contact,
  channel,
  previousSelection,
}: ChannelSelectionInput): MyahInboxContactSelection => {
  const selectedChannel = resolveAvailableChannel(contact, channel);
  const canReusePreviousTarget =
    previousSelection?.workspaceId === workspaceId &&
    previousSelection.contactId === contact.id;
  const emailThreadId =
    selectedChannel === 'EMAIL'
      ? canReusePreviousTarget &&
        previousSelection.emailThreadId !== null &&
        contact.email.threadIds.includes(previousSelection.emailThreadId)
        ? previousSelection.emailThreadId
        : (contact.email.latestThreadId ?? contact.email.threadIds[0] ?? null)
      : null;
  const instagramConversationId =
    selectedChannel === 'INSTAGRAM' &&
    contact.instagram.state === 'READY' &&
    contact.instagram.conversations.length === 1
      ? contact.instagram.conversations[0].id
      : null;

  return {
    workspaceId,
    contactId: contact.id,
    channel: selectedChannel,
    emailThreadId,
    instagramConversationId,
  };
};

export const getMyahInboxContactSelection = ({
  workspaceId,
  contact,
  previousSelection,
}: ContactSelectionInput): MyahInboxContactSelection => {
  const previousChannel =
    previousSelection?.workspaceId === workspaceId &&
    previousSelection.contactId === contact.id
      ? previousSelection.channel
      : null;

  return getMyahInboxSelectionForChannel({
    workspaceId,
    contact,
    channel: previousChannel ?? contact.latestChannel,
    previousSelection,
  });
};

export const getMyahInboxRegroupedContactSelection = ({
  workspaceId,
  contact,
  previousSelection,
}: ContactSelectionInput): MyahInboxContactSelection =>
  getMyahInboxContactSelection({
    workspaceId,
    contact,
    previousSelection:
      previousSelection?.workspaceId === workspaceId
        ? { ...previousSelection, contactId: contact.id }
        : null,
  });
