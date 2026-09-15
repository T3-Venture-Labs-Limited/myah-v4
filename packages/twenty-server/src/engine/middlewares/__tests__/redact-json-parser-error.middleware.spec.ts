import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Param,
  Post,
  Req,
  type RawBodyRequest,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { captureException } from '@sentry/nestjs';
import bytes from 'bytes';
import {
  type NextFunction,
  type Request,
  type Response as ExpressResponse,
} from 'express';

import { settings } from 'src/engine/constants/settings';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { redactJsonParserErrorMiddleware } from 'src/engine/middlewares/redact-json-parser-error.middleware';
import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const businessResponse = {
  message: ['A business field is required'],
  code: 'BUSINESS_VALIDATION',
};
const routeReached = jest.fn();

class RejectUnauthenticatedGuard {
  canActivate() {
    throw new UnauthorizedException('Authentication required');
  }
}

@Controller()
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
class ParserTestController {
  @Post('echo')
  echo(@Body() body: unknown, @Req() request: RawBodyRequest<Request>) {
    routeReached();

    return { body, rawBody: request.rawBody?.toString() };
  }

  @Post('error/:kind')
  fail(@Param('kind') kind: string) {
    routeReached();

    if (kind === 'business') {
      throw new BadRequestException(businessResponse);
    }
    if (kind === 'conflict') {
      throw new HttpException({ message: 'Existing conflict' }, 409);
    }

    throw new Error('Unrelated failure');
  }

  @Post('protected')
  @UseGuards(RejectUnauthenticatedGuard)
  protectedRoute() {
    routeReached();

    return { ok: true };
  }
}

const withHttpApp = async (
  normalize: boolean,
  run: (
    post: (
      path: string,
      body: string,
      contentType?: string,
    ) => Promise<Response>,
  ) => Promise<void>,
) => {
  jest.useRealTimers();

  const module = await Test.createTestingModule({
    controllers: [ParserTestController],
  }).compile();
  const app = module.createNestApplication<NestExpressApplication>({
    logger: false,
    rawBody: true,
  });

  app.useGlobalFilters(new UnhandledExceptionFilter());
  app.use(
    '/external-error',
    (_request: Request, _response: ExpressResponse, next: NextFunction) => {
      next(new SyntaxError('Unclassified syntax failure'));
    },
  );
  app.useBodyParser('json', { limit: settings.storage.maxFileSize });
  app.useBodyParser('urlencoded', {
    limit: settings.storage.maxFileSize,
    extended: true,
  });
  app.useBodyParser('text', { type: 'text/plain', limit: '1024kb' });
  if (normalize) {
    app.use(redactJsonParserErrorMiddleware);
  }

  try {
    await app.listen(0, '127.0.0.1');

    // Nest init must not append a second default parser after the normalizer.
    const expressApp = app.getHttpAdapter().getInstance() as unknown as {
      router: { stack: Array<{ handle: { name: string } }> };
    };
    const names = expressApp.router.stack.map(({ handle }) => handle.name);

    expect(names.filter((name) => name === 'jsonParser')).toHaveLength(1);
    expect(names.filter((name) => name === 'urlencodedParser')).toHaveLength(1);
    if (normalize) {
      expect(names.indexOf('redactJsonParserErrorMiddleware')).toBeGreaterThan(
        names.indexOf('textParser'),
      );
    }

    const baseUrl = await app.getUrl();

    await run((path, body, contentType = 'application/json') =>
      fetch(`${baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      }),
    );
  } finally {
    await app.close();
    jest.useFakeTimers();
  }
};

describe('redactJsonParserErrorMiddleware', () => {
  it('replaces classified JSON SyntaxError without retaining its body, message, stack or cause', () => {
    const error = Object.assign(new SyntaxError('SYN'), {
      type: 'entity.parse.failed',
      status: 400,
      body: 'SYN',
      cause: new Error('SYN'),
    });
    const next = jest.fn();

    redactJsonParserErrorMiddleware(
      error,
      {} as Request,
      {} as ExpressResponse,
      next,
    );

    const replacement = next.mock.calls[0][0];

    expect(next).toHaveBeenCalledTimes(1);
    expect(replacement).toBeInstanceOf(BadRequestException);
    expect(replacement).not.toBe(error);
    expect(replacement.getResponse()).toEqual({
      statusCode: 400,
      message: 'Invalid JSON body',
      error: 'Bad Request',
    });
    expect(replacement.body).toBeUndefined();
    expect(replacement.cause).toBeUndefined();
    expect(replacement.stack).not.toContain('SYN');
    expect(JSON.stringify(replacement)).not.toContain('SYN');
  });

  it.each([
    new BadRequestException(businessResponse),
    new HttpException('Conflict', 409),
    new Error('Unrelated failure'),
    new SyntaxError('Unclassified syntax failure'),
    new URIError('Unrelated URI failure'),
    Object.assign(new SyntaxError('Wrong status'), {
      type: 'entity.parse.failed',
      status: 422,
    }),
    Object.assign(new SyntaxError('Wrong type'), {
      type: 'entity.verify.failed',
      status: 400,
    }),
    Object.assign(new Error('Too large'), {
      type: 'entity.too.large',
      status: 413,
    }),
    Object.assign(new Error('Unsupported charset'), {
      type: 'charset.unsupported',
      status: 415,
    }),
    { type: 'entity.parse.failed', status: 400 },
    null,
    undefined,
    'Unrelated failure',
  ])('passes unrelated errors through unchanged (%#)', (error) => {
    const next = jest.fn();

    redactJsonParserErrorMiddleware(
      error,
      {} as Request,
      {} as ExpressResponse,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('registers in main after all explicit parsers and before listen initializes Nest exception mapping', () => {
    const main = readFileSync(resolve(__dirname, '../../../main.ts'), 'utf8');
    const registration = main.indexOf(
      'app.use(redactJsonParserErrorMiddleware)',
    );

    expect(registration).toBeGreaterThan(
      main.lastIndexOf('app.useBodyParser('),
    );
    expect(registration).toBeLessThan(main.indexOf('await app.listen('));
  });

  describe.each([false, true])(
    'HTTP preservation (normalizer enabled: %s)',
    (normalize) => {
      it.each([
        ['business', 400, businessResponse],
        ['conflict', 409, { message: 'Existing conflict' }],
        ['unrelated', 500, 'Unrelated failure'],
      ])('preserves %s response and status', async (kind, status, body) => {
        await withHttpApp(normalize, async (post) => {
          const response = await post(`error/${kind}`, '{}');

          expect(response.status).toBe(status);
          expect(await response.json()).toEqual(body);
          expect(routeReached).toHaveBeenCalledTimes(1);
        });
      });

      it('preserves Nest mapping of unclassified middleware SyntaxError', async () => {
        await withHttpApp(normalize, async (post) => {
          const response = await post('external-error', '{}');

          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({
            statusCode: 400,
            message: 'Unclassified syntax failure',
            error: 'Bad Request',
          });
          expect(routeReached).not.toHaveBeenCalled();
        });
      });

      it('preserves authentication rejection', async () => {
        await withHttpApp(normalize, async (post) => {
          const response = await post('protected', '{}');

          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({
            statusCode: 401,
            message: 'Authentication required',
            error: 'Unauthorized',
          });
          expect(routeReached).not.toHaveBeenCalled();
        });
      });

      it.each([
        [
          'JSON above the default 100kb limit',
          JSON.stringify({ value: 'x'.repeat(150_000) }),
          'application/json',
          { value: 'x'.repeat(150_000) },
        ],
        [
          'URL-encoded',
          'value[nested]=ok',
          'application/x-www-form-urlencoded',
          { value: { nested: 'ok' } },
        ],
        ['text', 'unchanged text', 'text/plain', 'unchanged text'],
      ])(
        'preserves successful %s parsing and raw body',
        async (_label, body, contentType, parsed) => {
          await withHttpApp(normalize, async (post) => {
            const response = await post('echo', body, contentType);

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
              body: parsed,
              rawBody: body,
            });
            expect(routeReached).toHaveBeenCalledTimes(1);
          });
        },
      );

      it.each([
        [
          'JSON size',
          JSON.stringify({
            value: 'x'.repeat(bytes(settings.storage.maxFileSize)!),
          }),
          'application/json',
          'request entity too large',
        ],
        [
          'text size',
          'x'.repeat(1024 * 1024 + 1),
          'text/plain',
          'request entity too large',
        ],
        [
          'charset',
          '{}',
          'application/json; charset=iso-8859-1',
          'unsupported charset "ISO-8859-1"',
        ],
      ])(
        'preserves existing %s failure status and response',
        async (_label, body, contentType, message) => {
          await withHttpApp(normalize, async (post) => {
            const response = await post('echo', body, contentType);

            // Existing global filter maps non-HttpException transport errors to 500,
            // despite body-parser's 413/415 metadata. This fix does not change that policy.
            expect(response.status).toBe(500);
            expect(await response.json()).toBe(message);
            expect(routeReached).not.toHaveBeenCalled();
            expect(captureException).toHaveBeenCalled();
          });
        },
      );
    },
  );
});
