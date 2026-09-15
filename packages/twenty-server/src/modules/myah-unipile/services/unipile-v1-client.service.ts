import { Inject, Injectable } from '@nestjs/common';

import { resolveInstagramRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  unipileAccountDeletedSchema,
  unipileChatListSchema,
  unipileChatStartedSchema,
  unipileHostedAuthUrlSchema,
  unipileInstagramAccountSchema,
  unipileInstagramChatSchema,
  unipileInstagramMessageSchema,
  unipileInstagramMessagingProfileSchema,
  unipileMessageListSchema,
  unipileMessageSentSchema,
} from 'src/modules/myah-unipile/schemas/unipile-v1.schema';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import {
  type UnipileCreateHostedAuthLinkInput,
  type UnipileDeleteAccountOptions,
  type UnipileDeleteAccountOutcome,
  type UnipileGetChatInput,
  type UnipileGetInstagramMessagingProfileInput,
  type UnipileInstagramMessagingProfile,
  type UnipileInstagramAccount,
  type UnipileGetMessageInput,
  type UnipileInstagramChat,
  type UnipileListChatsInput,
  type UnipileListChatsOutput,
  type UnipileListMessagesInput,
  type UnipileListMessagesOutput,
  type UnipileSendMessageInput,
  type UnipileSendMessageOptions,
  type UnipileSendMessageOutcome,
  type UnipileStartChatInput,
  type UnipileStartChatOptions,
  type UnipileStartChatOutcome,
} from 'src/modules/myah-unipile/types/unipile-v1.type';

export const UNIPILE_FETCH = Symbol('UNIPILE_FETCH');
const DETERMINISTIC_WRITE_REJECTION_STATUS: Record<number, true> = {
  400: true,
  401: true,
  403: true,
  404: true,
  409: true,
  422: true,
};

export class UnipileReadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'UnipileReadError';
  }
}

@Injectable()
export class UnipileV1ClientService {
  constructor(
    private readonly availabilityService: UnipileInstagramAvailabilityService,
    private readonly twentyConfigService: TwentyConfigService,
    @Inject(UNIPILE_FETCH) private readonly fetch: typeof globalThis.fetch,
  ) {}

  async createHostedAuthLink(
    input: UnipileCreateHostedAuthLinkInput,
  ): Promise<{ url: string }> {
    this.availabilityService.assertEnabled();

    const apiBaseUrl = this.availabilityService.config.apiBaseUrl;
    const apiUrl = new URL(apiBaseUrl).origin;
    const payload =
      input.operation === 'RECONNECT'
        ? {
            type: 'reconnect',
            reconnect_account: input.reconnectAccountId,
            single_use: true,
            api_url: apiUrl,
            expiresOn: input.expiresOn.toISOString(),
            success_redirect_url: input.successRedirectUrl,
            failure_redirect_url: input.failureRedirectUrl,
            notify_url: input.notifyUrl,
            name: input.name,
          }
        : {
            type: 'create',
            providers: ['INSTAGRAM'],
            single_use: true,
            api_url: apiUrl,
            expiresOn: input.expiresOn.toISOString(),
            success_redirect_url: input.successRedirectUrl,
            failure_redirect_url: input.failureRedirectUrl,
            notify_url: input.notifyUrl,
            name: input.name,
          };
    const response = await this.read(
      `${apiBaseUrl}hosted/accounts/link`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        body: JSON.stringify(payload),
        redirect: 'error',
      },
      'UNIPILE_HOSTED_AUTH_LINK_UNAVAILABLE',
      'Unable to create an Instagram Hosted Auth link',
    );

    return this.parseReadResponse(
      response,
      (body) => unipileHostedAuthUrlSchema.parse(body),
      'UNIPILE_HOSTED_AUTH_LINK_UNAVAILABLE',
      'Unable to create an Instagram Hosted Auth link',
    );
  }

  async startChat(
    input: UnipileStartChatInput,
    { beforeDispatch }: UnipileStartChatOptions,
  ): Promise<UnipileStartChatOutcome> {
    this.availabilityService.assertEnabled();

    const formData = new FormData();

    formData.append('account_id', input.accountId);
    formData.append('attendees_ids', input.attendeeId);
    formData.append('text', input.text);

    const responseUrl = `${this.availabilityService.config.apiBaseUrl}chats`;
    const apiKey = this.twentyConfigService.get('UNIPILE_API_KEY');

    await beforeDispatch();

    let status: number | null = null;

    try {
      const response = await this.fetch(
        responseUrl,
        this.withWriteAbortSignal({
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'X-API-KEY': apiKey,
          },
          body: formData,
          redirect: 'error',
        }),
      );

      status = response.status;

      if (DETERMINISTIC_WRITE_REJECTION_STATUS[status] === true) {
        return {
          kind: 'KNOWN_REJECTION',
          status,
          code: 'UNIPILE_CHAT_START_REJECTED',
        };
      }

      if (status !== 201) {
        return {
          kind: 'UNKNOWN',
          status,
          code: 'UNIPILE_CHAT_START_UNKNOWN',
        };
      }

      const chat = unipileChatStartedSchema.safeParse(await response.json());

      if (!chat.success) {
        return {
          kind: 'UNKNOWN',
          status,
          code: 'UNIPILE_CHAT_START_UNKNOWN',
        };
      }

      return {
        kind: 'ACCEPTED',
        value: {
          chatId: chat.data.chat_id,
          messageId: chat.data.message_id,
        },
      };
    } catch {
      return {
        kind: 'UNKNOWN',
        status,
        code: 'UNIPILE_CHAT_START_UNKNOWN',
      };
    }
  }

  async sendMessage(
    input: UnipileSendMessageInput,
    { beforeDispatch }: UnipileSendMessageOptions,
  ): Promise<UnipileSendMessageOutcome> {
    this.availabilityService.assertEnabled();

    const formData = new FormData();

    formData.append('account_id', input.accountId);
    formData.append('text', input.text);

    const responseUrl = `${this.availabilityService.config.apiBaseUrl}chats/${input.chatId}/messages`;
    const apiKey = this.twentyConfigService.get('UNIPILE_API_KEY');

    await beforeDispatch();

    let status: number | null = null;

    try {
      const response = await this.fetch(
        responseUrl,
        this.withWriteAbortSignal({
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'X-API-KEY': apiKey,
          },
          body: formData,
          redirect: 'error',
        }),
      );

      status = response.status;

      if (DETERMINISTIC_WRITE_REJECTION_STATUS[status] === true) {
        return {
          kind: 'KNOWN_REJECTION',
          status,
          code: 'UNIPILE_MESSAGE_SEND_REJECTED',
        };
      }

      if (status !== 201) {
        return {
          kind: 'UNKNOWN',
          status,
          code: 'UNIPILE_MESSAGE_SEND_UNKNOWN',
        };
      }

      const message = unipileMessageSentSchema.safeParse(await response.json());

      if (!message.success) {
        return {
          kind: 'UNKNOWN',
          status,
          code: 'UNIPILE_MESSAGE_SEND_UNKNOWN',
        };
      }

      return {
        kind: 'ACCEPTED',
        value: { messageId: message.data.message_id },
      };
    } catch {
      return {
        kind: 'UNKNOWN',
        status,
        code: 'UNIPILE_MESSAGE_SEND_UNKNOWN',
      };
    }
  }

  async listChats(
    input: UnipileListChatsInput,
  ): Promise<UnipileListChatsOutput> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 250
    ) {
      throw new Error(
        'Unipile chat list limit must be an integer between 1 and 250',
      );
    }

    this.availabilityService.assertEnabled();

    const query = new URLSearchParams({
      account_id: input.accountId,
      account_type: 'INSTAGRAM',
    });

    if (input.cursor !== null) {
      query.set('cursor', input.cursor);
    }

    if (input.after !== null) {
      query.set('after', input.after);
    }

    query.set('limit', String(input.limit));

    const response = await this.read(
      `${this.availabilityService.config.apiBaseUrl}chats?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        redirect: 'error',
      },
      'UNIPILE_CHAT_LIST_UNAVAILABLE',
      'Unable to retrieve the requested Instagram chats',
    );
    const chatList = await this.parseReadResponse(
      response,
      (body) => unipileChatListSchema.parse(body),
      'UNIPILE_CHAT_LIST_UNAVAILABLE',
      'Unable to retrieve the requested Instagram chats',
    );

    if (chatList.items.some((chat) => chat.account_id !== input.accountId)) {
      throw this.readError(
        response.status,
        'UNIPILE_CHAT_LIST_UNAVAILABLE',
        'Unable to retrieve the requested Instagram chats',
      );
    }

    return {
      chats: chatList.items
        .filter((chat) => chat.type === 0)
        .map((chat) => ({
          chatId: chat.id,
          accountId: chat.account_id,
          accountType: chat.account_type,
          type: 'ONE_TO_ONE',
          attendeeProviderId: chat.attendee_provider_id,
          name: chat.name,
          timestamp: chat.timestamp,
        })),
      nextCursor: chatList.cursor,
    };
  }

  async listMessages(
    input: UnipileListMessagesInput,
  ): Promise<UnipileListMessagesOutput> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 250
    ) {
      throw new Error(
        'Unipile message list limit must be an integer between 1 and 250',
      );
    }

    this.availabilityService.assertEnabled();

    const query = new URLSearchParams();

    if (input.cursor !== null) {
      query.set('cursor', input.cursor);
    }

    if (input.after !== null) {
      query.set('after', input.after);
    }
    query.set('limit', String(input.limit));

    const response = await this.read(
      `${this.availabilityService.config.apiBaseUrl}chats/${input.chatId}/messages?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        redirect: 'error',
      },
      'UNIPILE_MESSAGE_LIST_UNAVAILABLE',
      'Unable to retrieve the requested Instagram messages',
    );
    const messageList = await this.parseReadResponse(
      response,
      (body) => unipileMessageListSchema.parse(body),
      'UNIPILE_MESSAGE_LIST_UNAVAILABLE',
      'Unable to retrieve the requested Instagram messages',
    );

    if (
      messageList.items.some(
        (message) =>
          message.account_id !== input.accountId ||
          message.chat_id !== input.chatId,
      )
    ) {
      throw this.readError(
        response.status,
        'UNIPILE_MESSAGE_LIST_UNAVAILABLE',
        'Unable to retrieve the requested Instagram messages',
      );
    }

    return {
      messages: messageList.items.map((message) => ({
        messageId: message.id,
        accountId: message.account_id,
        chatId: message.chat_id,
        senderId: message.sender_id,
        ...(message.is_sender === undefined
          ? {}
          : { isSender: message.is_sender }),
        text: message.text,
        timestamp: message.timestamp,
        seen: message.seen,
        delivered: message.delivered,
        hidden: message.hidden,
        deleted: message.deleted,
        isEvent: message.is_event,
        hasAttachments: message.attachments.length > 0,
        attachmentCount: message.attachments.length,
      })),
      nextCursor: messageList.cursor,
    };
  }

  async getMessage(
    input: UnipileGetMessageInput,
  ): Promise<UnipileInstagramMessage> {
    this.availabilityService.assertEnabled();

    const response = await this.read(
      `${this.availabilityService.config.apiBaseUrl}messages/${input.messageId}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        redirect: 'error',
      },
      'UNIPILE_MESSAGE_UNAVAILABLE',
      'Unable to retrieve the requested Instagram message',
    );
    const message = await this.parseReadResponse(
      response,
      (body) => unipileInstagramMessageSchema.safeParse(body),
      'UNIPILE_MESSAGE_UNAVAILABLE',
      'Unable to retrieve the requested Instagram message',
    );

    if (
      !message.success ||
      message.data.id !== input.messageId ||
      message.data.account_id !== input.accountId ||
      message.data.chat_id !== input.chatId
    ) {
      throw this.readError(
        response.status,
        'UNIPILE_MESSAGE_UNAVAILABLE',
        'Unable to retrieve the requested Instagram message',
      );
    }

    return {
      messageId: message.data.id,
      accountId: message.data.account_id,
      chatId: message.data.chat_id,
      senderId: message.data.sender_id,
      ...(message.data.is_sender === undefined
        ? {}
        : { isSender: message.data.is_sender }),
      text: message.data.text,
      timestamp: message.data.timestamp,
      seen: message.data.seen,
      delivered: message.data.delivered,
      hidden: message.data.hidden,
      deleted: message.data.deleted,
      isEvent: message.data.is_event,
      hasAttachments: message.data.attachments.length > 0,
      attachmentCount: message.data.attachments.length,
    };
  }

  async getChat(input: UnipileGetChatInput): Promise<UnipileInstagramChat> {
    this.availabilityService.assertEnabled();

    const response = await this.read(
      `${this.availabilityService.config.apiBaseUrl}chats/${input.chatId}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        redirect: 'error',
      },
      'UNIPILE_CHAT_UNAVAILABLE',
      'Unable to retrieve the requested Instagram chat',
    );
    const chat = await this.parseReadResponse(
      response,
      (body) => unipileInstagramChatSchema.safeParse(body),
      'UNIPILE_CHAT_UNAVAILABLE',
      'Unable to retrieve the requested Instagram chat',
    );

    if (
      !chat.success ||
      chat.data.id !== input.chatId ||
      chat.data.account_id !== input.accountId ||
      chat.data.type !== 0 ||
      chat.data.attendee_provider_id !== input.expectedAttendeeId
    ) {
      throw this.readError(
        response.status,
        'UNIPILE_CHAT_UNAVAILABLE',
        'Unable to retrieve the requested Instagram chat',
      );
    }

    return {
      chatId: chat.data.id,
      accountId: chat.data.account_id,
      accountType: chat.data.account_type,
      type: 'ONE_TO_ONE',
      attendeeProviderId: chat.data.attendee_provider_id,
      name: chat.data.name,
      timestamp: chat.data.timestamp,
    };
  }

  async getInstagramMessagingProfile(
    input: UnipileGetInstagramMessagingProfileInput,
  ): Promise<UnipileInstagramMessagingProfile> {
    this.availabilityService.assertEnabled();

    const code = 'UNIPILE_INSTAGRAM_MESSAGING_PROFILE_UNAVAILABLE';
    const message =
      'Unable to retrieve the requested Instagram messaging profile';
    let normalizedUsername: string;

    try {
      normalizedUsername = resolveInstagramRecipient({
        instagramUsername: input.username,
        instagramUrl: null,
        instagramLink: null,
      }).normalizedUsername;
    } catch {
      throw this.readError(400, code, message);
    }

    // Validate using the existing Creator rules without rewriting the requested
    // identity. Returned public_identifier must match these canonical bytes too.
    if (
      normalizedUsername !== input.username ||
      typeof input.accountId !== 'string' ||
      input.accountId.trim().length === 0
    ) {
      throw this.readError(400, code, message);
    }

    const query = new URLSearchParams({ account_id: input.accountId });

    if (query.get('account_id') !== input.accountId) {
      throw this.readError(400, code, message);
    }

    const response = await this.read(
      `${this.availabilityService.config.apiBaseUrl}users/${encodeURIComponent(input.username)}?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        redirect: 'error',
      },
      code,
      message,
    );
    const profile = await this.parseReadResponse(
      response,
      (body) => unipileInstagramMessagingProfileSchema.parse(body),
      code,
      message,
    );

    if (profile.public_identifier !== input.username) {
      throw this.readError(response.status, code, message);
    }

    return {
      providerId: profile.provider_id,
      providerMessagingId: profile.provider_messaging_id,
      username: profile.public_identifier,
    };
  }

  async getAccount(accountId: string): Promise<UnipileInstagramAccount> {
    this.availabilityService.assertEnabled();

    const response = await this.read(
      `${this.availabilityService.config.apiBaseUrl}accounts/${accountId}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-KEY': this.twentyConfigService.get('UNIPILE_API_KEY'),
        },
        redirect: 'error',
      },
      'UNIPILE_ACCOUNT_UNAVAILABLE',
      'Unable to retrieve the requested Instagram account',
      'UNIPILE_ACCOUNT_NOT_FOUND',
    );
    const account = await this.parseReadResponse(
      response,
      (body) => unipileInstagramAccountSchema.parse(body),
      'UNIPILE_ACCOUNT_UNAVAILABLE',
      'Unable to retrieve the requested Instagram account',
    );

    if (account.id !== accountId) {
      throw this.readError(
        response.status,
        'UNIPILE_ACCOUNT_UNAVAILABLE',
        'Unable to retrieve the requested Instagram account',
      );
    }

    return {
      accountId: account.id,
      instagramUserId: account.connection_params.im.id,
      username: account.connection_params.im.username ?? null,
      sourceStatus: account.sources[0].status,
    };
  }

  async deleteAccount(
    accountId: string,
    { beforeDispatch }: UnipileDeleteAccountOptions,
  ): Promise<UnipileDeleteAccountOutcome> {
    this.availabilityService.assertEnabled();

    const apiKey = this.twentyConfigService.get('UNIPILE_API_KEY');

    await beforeDispatch();

    let status: number | null = null;

    try {
      const response = await this.fetch(
        `${this.availabilityService.config.apiBaseUrl}accounts/${accountId}`,
        this.withWriteAbortSignal({
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            'X-API-KEY': apiKey,
          },
          redirect: 'error',
        }),
      );

      status = response.status;

      if (status >= 400 && status < 500) {
        return {
          kind: 'KNOWN_REJECTION',
          status,
          code: 'UNIPILE_ACCOUNT_DELETE_REJECTED',
        };
      }

      if (status !== 200) {
        return {
          kind: 'UNKNOWN',
          status,
          code: 'UNIPILE_ACCOUNT_DELETE_UNKNOWN',
        };
      }

      const deletion = unipileAccountDeletedSchema.safeParse(
        await response.json(),
      );

      if (!deletion.success) {
        return {
          kind: 'UNKNOWN',
          status,
          code: 'UNIPILE_ACCOUNT_DELETE_UNKNOWN',
        };
      }

      return {
        kind: 'ACCEPTED',
        value: { deleted: true },
      };
    } catch {
      return {
        kind: 'UNKNOWN',
        status,
        code: 'UNIPILE_ACCOUNT_DELETE_UNKNOWN',
      };
    }
  }

  private async read(
    url: string,
    request: RequestInit,
    code: string,
    message: string,
    notFoundCode?: string,
  ): Promise<Response> {
    try {
      const response = await this.fetch(url, {
        ...request,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw this.readError(
          response.status,
          response.status === 404 && notFoundCode ? notFoundCode : code,
          message,
        );
      }

      return response;
    } catch (error) {
      if (error instanceof UnipileReadError) {
        throw error;
      }

      throw this.readError(0, code, message);
    }
  }

  private async parseReadResponse<T>(
    response: Response,
    parse: (body: unknown) => T,
    code: string,
    message: string,
  ): Promise<T> {
    try {
      return parse(await response.json());
    } catch {
      throw this.readError(response.status, code, message);
    }
  }

  private readError(status: number, code: string, message: string) {
    return new UnipileReadError(
      status,
      code,
      message,
      status === 0 ||
        status === 429 ||
        (status >= 500 && status < 600) ||
        (status === 404 && code === 'UNIPILE_ACCOUNT_NOT_FOUND'),
    );
  }

  private withWriteAbortSignal(request: RequestInit): RequestInit {
    Object.defineProperty(request, 'signal', {
      value: AbortSignal.timeout(10_000),
    });

    return request;
  }
}
