import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';

import { DomainServerConfigService } from 'src/engine/core-modules/domain/domain-server-config/services/domain-server-config.service';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { MYAH_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/modules/myah-shopify/constants/myah-shopify-application-universal-identifier.constant';
import { MyahShopifyService } from 'src/modules/myah-shopify/services/myah-shopify.service';
import { PermissionFlagType } from 'twenty-shared/constants';

class StartShopifyOAuthBody {
  shop!: string;
}

@Controller('rest/myah/shopify')
export class MyahShopifyController {
  constructor(
    private readonly myahShopifyService: MyahShopifyService,
    private readonly domainServerConfigService: DomainServerConfigService,
  ) {}

  @Post('oauth/start')
  @UseGuards(
    JwtAuthGuard,
    WorkspaceAuthGuard,
    SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
  )
  async startOAuth(
    @Body() body: StartShopifyOAuthBody,
    @Req() request: Request,
  ) {
    if (!request.workspace || !request.userWorkspaceId) {
      throw new ForbiddenException(
        'Shopify OAuth must be started by a workspace user.',
      );
    }

    const normalizeShopHost = (shop: string) =>
      shop
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
    const requestedHost = normalizeShopHost(body.shop);
    const existing = await this.myahShopifyService.getStatus({
      workspaceId: request.workspace.id,
    });
    if (existing.connected && existing.shopDomain) {
      const ownedHost = normalizeShopHost(existing.shopDomain);
      if (requestedHost !== ownedHost) {
        throw new ForbiddenException(
          'The requested Shopify store is not connected to this workspace.',
        );
      }
    }

    const serverUrl = process.env.SERVER_URL?.trim() ?? 'http://localhost:2022';

    return this.myahShopifyService.startOAuth({
      shop: body.shop,
      workspaceId: request.workspace.id,
      userId: request.userWorkspaceId,
      callbackUrl: `${serverUrl}/rest/myah/shopify/oauth/callback`,
    });
  }

  @Get('oauth/callback')
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @Redirect()
  async completeOAuthCallback(@Query() query: Record<string, string>) {
    const redirectUrl = new URL(
      '/settings/accounts/shopify',
      this.domainServerConfigService.getBaseUrl(),
    );

    try {
      const result = await this.myahShopifyService.completeOAuthCallback(query);

      redirectUrl.searchParams.set('connection', 'success');

      if (result.shopDomain) {
        redirectUrl.searchParams.set('shop', result.shopDomain);
      }
    } catch {
      redirectUrl.searchParams.set('connection', 'error');
    }

    return { url: redirectUrl.toString() };
  }

  @Get('status')
  @UseGuards(
    JwtAuthGuard,
    WorkspaceAuthGuard,
    SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
  )
  async getStatus(@Req() request: Request) {
    if (!request.workspace) {
      throw new ForbiddenException(
        'Shopify status must be loaded by a workspace user.',
      );
    }

    return await this.myahShopifyService.getStatus({
      workspaceId: request.workspace.id,
    });
  }

  @Get('agent/store-context')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentStoreContext(
    @Query('productsFirst') productsFirst: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    const parsedProductsFirst = Number.parseInt(productsFirst ?? '10', 10);
    const cappedProductsFirst = Math.min(
      Math.max(
        Number.isFinite(parsedProductsFirst) ? parsedProductsFirst : 10,
        1,
      ),
      25,
    );

    return await this.myahShopifyService.getStoreContext({
      productsFirst: cappedProductsFirst,
      workspaceId,
    });
  }

  @Get('agent/products')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async searchAgentProducts(
    @Query('productsFirst') productsFirst: string | undefined,
    @Query('query') query: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    const parsedProductsFirst = Number.parseInt(productsFirst ?? '10', 10);
    const cappedProductsFirst = Math.min(
      Math.max(
        Number.isFinite(parsedProductsFirst) ? parsedProductsFirst : 10,
        1,
      ),
      25,
    );

    return await this.myahShopifyService.searchProducts({
      productsFirst: cappedProductsFirst,
      query,
      workspaceId,
    });
  }

  @Get('agent/product-detail')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentProductDetail(
    @Query('handle') handle: string | undefined,
    @Query('productId') productId: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getProductDetail({
      handle,
      productId,
      workspaceId,
    });
  }

  @Get('agent/brand-content')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentBrandContent(
    @Query('first') first: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getBrandContent({
      first: this.parseBoundedFirst(first),
      workspaceId,
    });
  }

  @Get('agent/custom-data')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentCustomData(
    @Query('first') first: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getCustomData({
      first: this.parseBoundedFirst(first),
      workspaceId,
    });
  }

  @Get('agent/commerce-summary')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentCommerceSummary(
    @Query('first') first: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getCommerceSummary({
      first: this.parseBoundedFirst(first),
      workspaceId,
    });
  }

  @Get('agent/customer-summary')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentCustomerSummary(
    @Query('first') first: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getCustomerSummary({
      first: this.parseBoundedFirst(first),
      workspaceId,
    });
  }

  @Get('agent/promotions-summary')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentPromotionsSummary(
    @Query('first') first: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getPromotionsSummary({
      first: this.parseBoundedFirst(first),
      workspaceId,
    });
  }

  @Get('agent/channel-context')
  @UseGuards(JwtAuthGuard, WorkspaceAuthGuard, NoPermissionGuard)
  async getAgentChannelContext(
    @Query('first') first: string | undefined,
    @Req() request: Request,
  ) {
    const workspaceId = this.getAppBrokerWorkspaceId(request);

    return await this.myahShopifyService.getChannelContext({
      first: this.parseBoundedFirst(first),
      workspaceId,
    });
  }

  @Post('disconnect')
  @UseGuards(
    JwtAuthGuard,
    WorkspaceAuthGuard,
    SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
  )
  async disconnect(@Req() request: Request) {
    if (!request.workspace) {
      throw new ForbiddenException(
        'Shopify must be disconnected by a workspace user.',
      );
    }

    return await this.myahShopifyService.disconnect({
      workspaceId: request.workspace.id,
    });
  }

  private getAppBrokerWorkspaceId(request: Request) {
    if (!request.workspace) {
      throw new ForbiddenException(
        'Shopify agent tools must be loaded in a workspace.',
      );
    }

    if (!request.application) {
      throw new ForbiddenException(
        'Shopify agent tool broker routes are only available to Twenty app executions.',
      );
    }

    if (
      request.application.universalIdentifier !==
      MYAH_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER
    ) {
      throw new ForbiddenException(
        'Shopify agent tool broker routes are only available to the Myah Shopify app.',
      );
    }

    return request.workspace.id;
  }

  private parseBoundedFirst(first: string | undefined) {
    const parsedFirst = Number.parseInt(first ?? '10', 10);

    return Math.min(
      Math.max(Number.isFinite(parsedFirst) ? parsedFirst : 10, 1),
      25,
    );
  }
}
