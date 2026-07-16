import { CoreApiClient } from 'twenty-client-sdk/core';

type SocialConversationRecord = {
  id: string;
  providerConversationId?: string | null;
  recipientIgsid?: string | null;
  lastInboundAt?: string | null;
  replyWindowEndsAt?: string | null;
};

type CoreApiClientLike = {
  query: (
    selection: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  mutation: (
    selection: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};

type CoreApiClientConstructor = new (options: {
  headers: { Authorization: string };
}) => CoreApiClientLike;

export const createSocialConversationStore = () => {
  const appAccessToken = process.env.TWENTY_APP_ACCESS_TOKEN;

  if (!appAccessToken) {
    throw new Error(
      'Instagram reply-window refresh requires TWENTY_APP_ACCESS_TOKEN.',
    );
  }

  const RuntimeCoreApiClient =
    CoreApiClient as unknown as CoreApiClientConstructor;
  const client = new RuntimeCoreApiClient({
    headers: { Authorization: `Bearer ${appAccessToken}` },
  });

  return {
    findById: async (
      id: string,
    ): Promise<SocialConversationRecord | undefined> => {
      const data = await client.query({
        myahSocialConversation: {
          __args: { filter: { id: { eq: id } } },
          id: true,
          providerConversationId: true,
          recipientIgsid: true,
          lastInboundAt: true,
          replyWindowEndsAt: true,
        },
      });

      return data.myahSocialConversation as
        | SocialConversationRecord
        | undefined;
    },
    updateReplyWindow: async ({
      id,
      lastInboundAt,
      replyWindowEndsAt,
    }: {
      id: string;
      lastInboundAt: string;
      replyWindowEndsAt: string;
    }): Promise<boolean> => {
      const data = await client.mutation({
        updateMyahSocialConversations: {
          __args: {
            data: { lastInboundAt, replyWindowEndsAt },
            filter: {
              and: [
                { id: { eq: id } },
                {
                  or: [
                    { lastInboundAt: { is: 'NULL' } },
                    { lastInboundAt: { lt: lastInboundAt } },
                  ],
                },
                {
                  or: [
                    { replyWindowEndsAt: { is: 'NULL' } },
                    { replyWindowEndsAt: { lt: replyWindowEndsAt } },
                  ],
                },
              ],
            },
          },
          id: true,
        },
      });

      return (
        (data.updateMyahSocialConversations as unknown[] | undefined)
          ?.length === 1
      );
    },
  };
};
