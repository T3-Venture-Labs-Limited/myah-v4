import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { type Request } from 'express';
import { isDefined } from 'twenty-shared/utils';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024;

// Ad blockers drop browser requests to sentry.io, so the frontend sends its
// error envelopes here (same origin) and we forward them. Only the configured
// frontend project is accepted, so this cannot be used as an open proxy.
@Controller('tunnel')
export class SentryTunnelController {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  async tunnel(@Req() request: Request): Promise<void> {
    const frontDsn = this.twentyConfigService.get('SENTRY_FRONT_DSN');

    if (!isDefined(frontDsn) || frontDsn === '') {
      return;
    }

    const envelope = await readBody(request);
    const allowed = new URL(frontDsn);
    const requested = parseEnvelopeDsn(envelope);
    const projectId = allowed.pathname.replace(/\//g, '');

    if (
      requested.host !== allowed.host ||
      requested.pathname.replace(/\//g, '') !== projectId
    ) {
      throw new BadRequestException('Unknown Sentry project');
    }

    await fetch(`https://${allowed.host}/api/${projectId}/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: new Uint8Array(envelope),
    });
  }
}

const parseEnvelopeDsn = (envelope: Buffer): URL => {
  const headerEnd = envelope.indexOf('\n');
  const header = envelope.subarray(0, headerEnd === -1 ? undefined : headerEnd);

  try {
    const { dsn } = JSON.parse(header.toString('utf8')) as { dsn?: unknown };

    if (typeof dsn === 'string') {
      return new URL(dsn);
    }
  } catch {
    // Fall through to the error below.
  }

  throw new BadRequestException('Invalid Sentry envelope');
};

// The SDK posts text/plain envelopes (already parsed into rawBody) or binary
// ones with no content type (still unread on the request stream).
const readBody = async (request: Request): Promise<Buffer> => {
  const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;

  if (Buffer.isBuffer(rawBody)) {
    return rawBody;
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += (chunk as Buffer).length;

    if (size > MAX_ENVELOPE_BYTES) {
      throw new BadRequestException('Sentry envelope too large');
    }

    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
};
