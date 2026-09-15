import { HttpStatus, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

type WebhookBody = {
  account_id: string;
  account_info: { user_id: string };
  account_type: 'INSTAGRAM';
  attachments: Array<{ url: string }>;
  attendees: Array<{ attendee_provider_id: string }>;
  chat_id: string;
  event: 'message_received';
  message: string;
  message_id: string;
  sender: { attendee_provider_id: string };
  timestamp: string;
  webhook_name: string;
};

type WebhookController = {
  receiveWebhook(
    secret: string | undefined,
    body: WebhookBody,
  ): Promise<{ ok: true; duplicate: boolean }>;
};

type WebhookControllerModule = {
  MyahUnipileInstagramWebhookController: new (intakeService: {
    intake: jest.Mock;
  }) => WebhookController;
};

const loadWebhookControllerModule = (): WebhookControllerModule | undefined => {
  try {
    return require('src/modules/myah-unipile/controllers/myah-unipile-instagram-webhook.controller') as WebhookControllerModule;
  } catch {
    return undefined;
  }
};

describe('MyahUnipileInstagramWebhookController', () => {
  const body: WebhookBody = {
    account_id: 'unipile-account-id',
    account_info: { user_id: 'instagram-owner-id' },
    account_type: 'INSTAGRAM',
    attachments: [{ url: 'https://cdn.unipile.example/attachment.jpg' }],
    attendees: [
      { attendee_provider_id: 'instagram-owner-id' },
      { attendee_provider_id: 'instagram-remote-id' },
    ],
    chat_id: 'unipile-chat-id',
    event: 'message_received',
    message: 'raw inbound message',
    message_id: 'unipile-message-id',
    sender: { attendee_provider_id: 'instagram-sender-id' },
    timestamp: '2026-09-04T12:00:00.000Z',
    webhook_name: 'message_received',
  };

  it('passes only the secret header and request body to webhook intake', async () => {
    const controllerModule = loadWebhookControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const intakeService = {
      intake: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
    };
    const controller =
      new controllerModule.MyahUnipileInstagramWebhookController(intakeService);

    await expect(
      controller.receiveWebhook('shared-webhook-secret', body),
    ).resolves.toEqual({ ok: true, duplicate: false });
    expect(intakeService.intake).toHaveBeenCalledWith({
      body,
      secret: 'shared-webhook-secret',
    });
  });

  it('rejects a stalled intake at the hard twenty-second deadline', async () => {
    const controllerModule = loadWebhookControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    jest.useFakeTimers();

    try {
      const intakeService = {
        intake: jest.fn(() => new Promise<never>(() => undefined)),
      };
      const controller =
        new controllerModule.MyahUnipileInstagramWebhookController(
          intakeService,
        );
      const response = controller.receiveWebhook('shared-webhook-secret', body);
      const rejection = expect(response).rejects.toThrow(/timed out/i);

      await jest.advanceTimersByTimeAsync(20_000);
      await rejection;
      expect(intakeService.intake).toHaveBeenCalledWith({
        body,
        secret: 'shared-webhook-secret',
      });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the deadline after immediate intake succeeds', async () => {
    const controllerModule = loadWebhookControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    jest.useFakeTimers();

    try {
      const intakeService = {
        intake: jest.fn().mockResolvedValue({ ok: true, duplicate: false }),
      };
      const controller =
        new controllerModule.MyahUnipileInstagramWebhookController(
          intakeService,
        );

      await expect(
        controller.receiveWebhook('shared-webhook-secret', body),
      ).resolves.toEqual({ ok: true, duplicate: false });

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('registers the exact public Instagram webhook endpoint', () => {
    const controllerModule = loadWebhookControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const Controller = controllerModule.MyahUnipileInstagramWebhookController;

    expect(Reflect.getMetadata(PATH_METADATA, Controller)).toBe(
      'webhooks/unipile/instagram',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, Controller.prototype.receiveWebhook),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        Controller.prototype.receiveWebhook,
      ),
    ).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(GUARDS_METADATA, Controller)).toEqual([
      PublicEndpointGuard,
      NoPermissionGuard,
    ]);
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      Controller,
      'receiveWebhook',
    ) as Record<string, { data?: string; index: number }>;

    expect(Object.values(routeArguments)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: 'x-myah-unipile-secret',
          index: 0,
        }),
      ]),
    );
  });
});
