import { listInstagramMessagesHandler } from 'src/logic-functions/handlers/list-instagram-messages-handler';
import type { RefreshInstagramReplyWindowInput } from 'src/logic-functions/types/refresh-instagram-reply-window-input.type';
import { createSocialConversationStore } from 'src/logic-functions/utils/create-social-conversation-store';
import { getNewestInstagramInboundAt } from 'src/logic-functions/utils/get-newest-instagram-inbound-at';
import { getInstagramReplyWindowEndsAt } from 'src/logic-functions/utils/get-instagram-reply-window-ends-at';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const refreshInstagramReplyWindowHandler = async (
  input: RefreshInstagramReplyWindowInput = {},
) => {
  const conversationRecordId = input.conversationRecordId?.trim();

  if (!conversationRecordId || !UUID_PATTERN.test(conversationRecordId)) {
    return {
      success: false,
      error: 'conversationRecordId must be a UUID.',
    };
  }

  const store = createSocialConversationStore();
  let conversation;

  try {
    conversation = await store.findById(conversationRecordId);
  } catch {
    return {
      success: false,
      error: 'Unable to read the conversation record.',
    };
  }

  if (!conversation) {
    return {
      success: false,
      error: 'Conversation record was not found.',
    };
  }

  if (!conversation.providerConversationId?.trim()) {
    return {
      success: false,
      error: 'Conversation record is missing a provider conversation ID.',
    };
  }

  const recipientIgsid = conversation.recipientIgsid?.trim();

  if (!recipientIgsid) {
    return {
      success: false,
      error: 'Conversation record is missing a recipient IGSID.',
    };
  }

  const messageInput = {
    conversationId: conversation.providerConversationId,
    ...(input.connectedAccountId?.trim()
      ? { connectedAccountId: input.connectedAccountId.trim() }
      : {}),
  };
  let messageResult = await listInstagramMessagesHandler(messageInput);

  if (!messageResult.success) {
    return messageResult;
  }

  if (!('messages' in messageResult)) {
    return {
      success: false,
      error: 'Instagram message lookup returned no messages.',
    };
  }

  const messages = [...messageResult.messages];
  const visitedCursors = new Set<string>();
  let after = messageResult.paging?.cursors?.after;

  while (after) {
    if (visitedCursors.has(after)) {
      return {
        success: false,
        error: 'Instagram message pagination cursor repeated.',
      };
    }

    visitedCursors.add(after);
    messageResult = await listInstagramMessagesHandler({
      ...messageInput,
      after,
    });

    if (!messageResult.success) {
      return messageResult;
    }

    if (!('messages' in messageResult)) {
      return {
        success: false,
        error: 'Instagram message lookup returned no messages.',
      };
    }

    messages.push(...messageResult.messages);
    after = messageResult.paging?.cursors?.after;
  }

  const lastInboundAt = getNewestInstagramInboundAt({
    messages,
    recipientIgsid,
  });

  if (!lastInboundAt) {
    return {
      success: true,
      updated: false,
      reason: 'NO_INBOUND_MESSAGE',
    };
  }

  if (conversation.lastInboundAt) {
    const storedInboundAt = new Date(conversation.lastInboundAt).getTime();

    if (Number.isNaN(storedInboundAt)) {
      return {
        success: false,
        error: 'Conversation record has an invalid last inbound timestamp.',
      };
    }

    if (new Date(lastInboundAt).getTime() <= storedInboundAt) {
      return {
        success: true,
        updated: false,
        reason: 'NOT_NEWER_THAN_STORED',
      };
    }
  }

  const replyWindowEndsAt = getInstagramReplyWindowEndsAt(lastInboundAt);

  try {
    const updated = await store.updateReplyWindow({
      id: conversation.id,
      lastInboundAt,
      replyWindowEndsAt,
    });

    if (!updated) {
      return {
        success: true,
        updated: false,
        reason: 'NOT_NEWER_THAN_STORED',
      };
    }
  } catch {
    return {
      success: false,
      error: 'Unable to update the reply window.',
    };
  }

  return {
    success: true,
    updated: true,
    lastInboundAt,
    replyWindowEndsAt,
    isReplyWindowOpen: new Date(replyWindowEndsAt) > new Date(),
  };
};
