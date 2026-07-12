import { BadGatewayException } from '@nestjs/common';
import { type Request } from 'express';

import { DomainServerConfigService } from 'src/engine/core-modules/domain/domain-server-config/services/domain-server-config.service';
import { MYAH_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-shopify/constants/myah-shopify-application-universal-identifier.constant';
import { MyahShopifyController } from 'src/modules/myah-shopify/controllers/myah-shopify.controller';
import { type MyahShopifyService } from 'src/modules/myah-shopify/services/myah-shopify.service';

describe('MyahShopifyController', () => {
  const originalEnv = process.env;
  const domainServerConfigService = {
    getBaseUrl: jest.fn(() => new URL('http://localhost:2022')),
  } as unknown as DomainServerConfigService;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SERVER_URL: 'http://localhost:2022',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('redirects Shopify callback failures back to frontend settings instead of surfacing a 502 page', async () => {
    jest
      .mocked(domainServerConfigService.getBaseUrl)
      .mockReturnValue(new URL('https://app.example.com'));
    const service = {
      completeOAuthCallback: jest
        .fn()
        .mockRejectedValue(new BadGatewayException('Shopify probe failed')),
    } as unknown as MyahShopifyService;
    const controller = new MyahShopifyController(
      service,
      domainServerConfigService,
    );

    const result = await controller.completeOAuthCallback({
      code: 'temporary-code',
      hmac: 'hmac',
      shop: 'myah-9821.myshopify.com',
      state: 'state',
      timestamp: '1780000000',
    });

    expect(result.url).toBe(
      'https://app.example.com/settings/accounts/shopify?connection=error',
    );
    expect(service.completeOAuthCallback).toHaveBeenCalled();
  });

  it('disconnects Shopify for the authenticated request workspace', async () => {
    const service = {
      disconnect: jest.fn().mockResolvedValue({ connected: false }),
    } as unknown as MyahShopifyService;
    const controller = new MyahShopifyController(
      service,
      domainServerConfigService,
    );
    const request = {
      workspace: { id: 'workspace-id' },
    } as Request;

    await expect(controller.disconnect(request)).resolves.toEqual({
      connected: false,
    });
    expect(service.disconnect).toHaveBeenCalledWith({
      workspaceId: 'workspace-id',
    });
  });

  it('rejects normal workspace users on agent broker routes', async () => {
    const service = {
      getStoreContext: jest.fn(),
    } as unknown as MyahShopifyService;
    const controller = new MyahShopifyController(
      service,
      domainServerConfigService,
    );
    const request = {
      workspace: { id: 'workspace-id' },
      userWorkspaceId: 'user-workspace-id',
    } as Request;

    await expect(controller.getAgentStoreContext('1', request)).rejects.toThrow(
      'only available to Twenty app executions',
    );
    expect(service.getStoreContext).not.toHaveBeenCalled();
  });

  it('rejects non-Shopify Twenty app executions on agent broker routes', async () => {
    const service = {
      getStoreContext: jest.fn(),
    } as unknown as MyahShopifyService;
    const controller = new MyahShopifyController(
      service,
      domainServerConfigService,
    );
    const request = {
      application: {
        id: 'other-application-id',
        universalIdentifier: '3f4bcf70-3d56-4c44-a4f0-1f34bb9d93e1',
      },
      workspace: { id: 'workspace-id' },
    } as Request;

    await expect(controller.getAgentStoreContext('1', request)).rejects.toThrow(
      'only available to the Myah Shopify app',
    );
    expect(service.getStoreContext).not.toHaveBeenCalled();
  });

  it('allows Twenty app executions to call agent broker routes', async () => {
    const service = {
      getStoreContext: jest.fn().mockResolvedValue({ connected: true }),
    } as unknown as MyahShopifyService;
    const controller = new MyahShopifyController(
      service,
      domainServerConfigService,
    );
    const request = {
      application: {
        id: 'application-id',
        universalIdentifier: MYAH_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
      },
      workspace: { id: 'workspace-id' },
    } as Request;

    await expect(
      controller.getAgentStoreContext('1', request),
    ).resolves.toEqual({
      connected: true,
    });
    expect(service.getStoreContext).toHaveBeenCalledWith({
      productsFirst: 1,
      workspaceId: 'workspace-id',
    });
  });
});
