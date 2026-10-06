import { BadRequestException } from '@nestjs/common';

import { type Request } from 'express';

import { SentryTunnelController } from 'src/engine/core-modules/sentry/sentry-tunnel.controller';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

const FRONT_DSN = 'https://publickey@o123.ingest.us.sentry.io/4567';

const envelope = (dsn: string) =>
  Buffer.from(
    `${JSON.stringify({ dsn, sent_at: '2026-10-06T00:00:00Z' })}\n{"type":"event"}\n{"message":"boom"}`,
  );

const requestWith = (body: Buffer) => ({ rawBody: body }) as unknown as Request;

describe('SentryTunnelController', () => {
  let fetchSpy: jest.SpyInstance;

  const controllerWith = (dsn: string | undefined) =>
    new SentryTunnelController({
      get: jest.fn(() => dsn),
    } as unknown as TwentyConfigService);

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => fetchSpy.mockRestore());

  it('forwards an envelope for the configured frontend DSN to its Sentry project', async () => {
    const body = envelope(FRONT_DSN);

    await controllerWith(FRONT_DSN).tunnel(requestWith(body));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://o123.ingest.us.sentry.io/api/4567/envelope/',
      expect.objectContaining({ method: 'POST', body: new Uint8Array(body) }),
    );
  });

  it('refuses envelopes for any other Sentry project, so it is not an open proxy', async () => {
    await expect(
      controllerWith(FRONT_DSN).tunnel(
        requestWith(envelope('https://other@evil.example.com/4567')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controllerWith(FRONT_DSN).tunnel(
        requestWith(envelope('https://publickey@o123.ingest.us.sentry.io/999')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drops envelopes silently when no frontend DSN is configured', async () => {
    await controllerWith(undefined).tunnel(requestWith(envelope(FRONT_DSN)));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
