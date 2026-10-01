import { type ApolloClient } from '@apollo/client';
import { GET_INSTAGRAM_MESSAGE_SEND_STATUS } from '@/myah/inbox/graphql/operations';

export type InstagramMessageSendResult = {
  status: string;
  receiptId: string | null;
  code: string | null;
  nextEligibleAt: string | null;
  error: string | null;
  providerMessageId?: string | null;
  creatorRecordId?: string | null;
  conversationRecordId?: string | null;
};

export const unconfirmedInstagramMessageResult = (
  receiptId: string | null,
): InstagramMessageSendResult => ({
  status: 'UNKNOWN',
  receiptId,
  code: null,
  nextEligibleAt: null,
  error:
    "We couldn't confirm whether the Instagram message was sent. Check the conversation before trying again.",
});

// Shared with Inbox replies: receipt state, never free-text outcome, controls completion.
export const pollInstagramMessageSendStatus = async (
  client: ApolloClient,
  receiptId: string,
  isCurrent: () => boolean = () => true,
  alreadyAccepted = false,
): Promise<InstagramMessageSendResult> => {
  let accepted: InstagramMessageSendResult | null = alreadyAccepted
    ? {
        status: 'PROVIDER_ACCEPTED',
        receiptId,
        code: null,
        nextEligibleAt: null,
        error: null,
        providerMessageId: null,
      }
    : null;
  for (let poll = 0; poll < 15; poll++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    if (!isCurrent()) return unconfirmedInstagramMessageResult(receiptId);
    try {
      const response = await client.query<{
        instagramMessageSendStatus: {
          receiptId: string;
          state: string;
          providerCode: string | null;
          providerMessageId: string | null;
          creatorRecordId?: string | null;
          conversationRecordId?: string | null;
        };
      }>({
        query: GET_INSTAGRAM_MESSAGE_SEND_STATUS,
        variables: { input: { receiptId } },
        fetchPolicy: 'network-only',
      });
      const status = response.data?.instagramMessageSendStatus;
      if (!status || status.state === 'UNKNOWN')
        return accepted ?? unconfirmedInstagramMessageResult(receiptId);
      if (status.state === 'PROVIDER_ACCEPTED') {
        accepted = {
          status: 'PROVIDER_ACCEPTED',
          receiptId: status.receiptId,
          code: status.providerCode,
          nextEligibleAt: null,
          error: null,
          providerMessageId: status.providerMessageId ?? null,
        };
        continue;
      }
      if (['PENDING', 'PROCESSING'].includes(status.state)) continue;
      return {
        status: status.state,
        receiptId: status.receiptId,
        code: status.providerCode,
        nextEligibleAt: null,
        error: status.state === 'BLOCKED' ? status.providerCode : null,
        providerMessageId: status.providerMessageId ?? null,
        ...(status.creatorRecordId !== undefined
          ? { creatorRecordId: status.creatorRecordId }
          : {}),
        ...(status.conversationRecordId !== undefined
          ? { conversationRecordId: status.conversationRecordId }
          : {}),
      };
    } catch {
      return accepted ?? unconfirmedInstagramMessageResult(receiptId);
    }
  }
  return accepted ?? unconfirmedInstagramMessageResult(receiptId);
};
