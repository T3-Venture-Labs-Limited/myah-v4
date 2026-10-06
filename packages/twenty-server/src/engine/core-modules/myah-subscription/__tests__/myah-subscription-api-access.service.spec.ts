import { type ArgumentsHost } from '@nestjs/common';
import {
  GUARDS_METADATA,
  EXCEPTION_FILTERS_METADATA,
} from '@nestjs/common/constants';
import { McpCoreController } from 'src/engine/api/mcp/controllers/mcp-core.controller';
import { HttpExceptionHandlerService } from 'src/engine/core-modules/exception-handler/http-exception-handler.service';
import {
  MyahSubscriptionApiAccessService,
  MyahSubscriptionApiGuard,
  MyahUsageRestApiExceptionFilter,
  isMyahSubscriptionMetadataAllowed,
} from 'src/engine/core-modules/myah-subscription/myah-subscription-api-access.service';
import { MiddlewareService } from 'src/engine/middlewares/middleware.service';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import {
  MyahUnipileInstagramController,
  MyahUnipileInstagramPublicController,
} from 'src/modules/myah-unipile/controllers/myah-unipile-instagram.controller';

describe('unsubscribed metadata allowlist', () => {
  it.each([
    '{ currentUser { id } myahWorkspaceUsage { state } }',
    'query Current { ...Bootstrap } fragment Bootstrap on Query { alias: currentUser { id } minimalMetadata { objectMetadataItems { id } } }',
    'mutation { createMyahCheckoutSession }',
    'mutation { deleteCurrentWorkspace { id } }',
    'query { ... on Query { myahCheckoutPrice { amountCents } } }',
  ])('allows required root fields: %s', (query) => {
    expect(isMyahSubscriptionMetadataAllowed({ query })).toBe(true);
  });

  it.each([
    'mutation GetCurrentUser { sendEmail(input: {}) }',
    'mutation { currentUser: sendEmail(input: {}) }',
    'mutation { createMyahCheckoutSession sendEmail(input: {}) }',
    'query { ...Forbidden } fragment Forbidden on Query { myahCampaigns { id } }',
    'query { ...Loop } fragment Loop on Query { ...Loop }',
    '{ unknownFutureOperation }',
    'not graphql',
  ])(
    'refuses operation-name, alias, fragment and mixed-request bypasses: %s',
    (query) => {
      expect(isMyahSubscriptionMetadataAllowed({ query })).toBe(false);
    },
  );

  it('checks the selected operation and every batched operation', () => {
    const query =
      'query Safe { currentUser { id } } mutation Unsafe { sendEmail(input: {}) }';
    expect(
      isMyahSubscriptionMetadataAllowed({ query, operationName: 'Safe' }),
    ).toBe(true);
    expect(
      isMyahSubscriptionMetadataAllowed({ query, operationName: 'Unsafe' }),
    ).toBe(false);
    expect(isMyahSubscriptionMetadataAllowed({ query })).toBe(false);
    expect(
      isMyahSubscriptionMetadataAllowed([
        { query: '{ currentUser { id } }' },
        { query: 'mutation { sendEmail(input: {}) }' },
      ]),
    ).toBe(false);
  });
});

describe('request gate', () => {
  const refusal = () =>
    new AiException(
      'This workspace has no active subscription.',
      AiExceptionCode.SUBSCRIPTION_REQUIRED,
    );
  const request = (body: unknown) =>
    ({
      workspace: { id: 'workspace' },
      path: '/metadata/',
      method: 'POST',
      body,
    }) as never;

  it('does not parse GraphQL documents for workspaces with access', async () => {
    const assertCanAct = jest.fn().mockResolvedValue('ACTIVE');
    const service = new MyahSubscriptionApiAccessService({
      assertCanAct,
    } as never);
    // A malformed document would fail closed if it were parsed.
    await expect(
      service.assertRequestAllowed(request({ query: '{ broken' })),
    ).resolves.toBeUndefined();
    expect(assertCanAct).toHaveBeenCalledWith('workspace');
  });

  it('lets refused workspaces use only allowlisted metadata operations', async () => {
    const service = new MyahSubscriptionApiAccessService({
      assertCanAct: jest.fn().mockRejectedValue(refusal()),
    } as never);
    await expect(
      service.assertRequestAllowed(
        request({ query: '{ myahWorkspaceUsage { state } }' }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.assertRequestAllowed(request({ query: '{ broken' })),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
  });

  it('does not hide unrelated access-check failures behind the allowlist', async () => {
    const service = new MyahSubscriptionApiAccessService({
      assertCanAct: jest.fn().mockRejectedValue(new Error('database down')),
    } as never);
    await expect(
      service.assertRequestAllowed(
        request({ query: '{ myahWorkspaceUsage { state } }' }),
      ),
    ).rejects.toThrow('database down');
  });

  it('adds the subscription code to REST middleware refusals so the app can show Resubscribe', () => {
    const res = { writeHead: jest.fn(), write: jest.fn(), end: jest.fn() };
    const middleware = new MiddlewareService(
      null as never,
      null as never,
      null as never,
      { captureExceptions: jest.fn() } as never,
      null as never,
      null as never,
    );
    middleware.writeRestResponseOnExceptionCaught(res as never, refusal());
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    expect(JSON.parse(res.write.mock.calls[0][0])).toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });
});

describe('REST subscription adapters', () => {
  it.each([McpCoreController, MyahUnipileInstagramController])(
    'guards %p and serializes domain errors',
    (Controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, Controller)).toContain(
        MyahSubscriptionApiGuard,
      );
      expect(
        Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, Controller),
      ).toContain(MyahUsageRestApiExceptionFilter);
    },
  );

  it('does not block authenticated provider notifications when the workspace lapses', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        MyahUnipileInstagramPublicController,
      ),
    ).not.toContain(MyahSubscriptionApiGuard);
  });

  it('returns 403 and SUBSCRIPTION_REQUIRED without masking the code', () => {
    const response = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const captureExceptions = jest.fn();
    const handler = new HttpExceptionHandlerService(
      { captureExceptions } as never,
      null,
    );
    const filter = new MyahUsageRestApiExceptionFilter(handler);
    filter.catch(
      new AiException(
        'This workspace has no active subscription.',
        AiExceptionCode.SUBSCRIPTION_REQUIRED,
      ),
      {
        switchToHttp: () => ({ getResponse: () => response }),
      } as ArgumentsHost,
    );
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SUBSCRIPTION_REQUIRED' }),
    );
    expect(captureExceptions).not.toHaveBeenCalled();
  });
});
