import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import crypto from 'node:crypto';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { IsNull, Repository } from 'typeorm';

import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';

const SHOPIFY_API_VERSION = '2026-01';
const SHOPIFY_CONNECTED_ACCOUNT_NAME = 'Shopify';
const ALLOWED_READ_ONLY_SCOPES = [
  'read_analytics',
  'read_customer_events',
  'read_channels',
  'read_checkouts',
  'read_customers',
  'read_price_rules',
  'read_discounts',
  'read_draft_orders',
  'read_files',
  'read_inventory',
  'read_locales',
  'read_metaobject_definitions',
  'read_metaobjects',
  'read_orders',
  'read_product_listings',
  'read_products',
  'read_reports',
  'read_content',
] as const;
const DEFAULT_READ_ONLY_SCOPES = ALLOWED_READ_ONLY_SCOPES.join(',');
const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SHOPIFY_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const SHOPIFY_ACCESS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const SHOPIFY_CUSTOMER_DATA_UNAVAILABLE =
  'Shopify customer data is currently unavailable.';

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();

  return value ? value : undefined;
};

const getClientId = () =>
  getEnv('MYAH_SHOPIFY_CLIENT_ID') ?? getEnv('SHOPIFY_CLIENT_ID');

const getClientSecret = () =>
  getEnv('MYAH_SHOPIFY_CLIENT_SECRET') ?? getEnv('SHOPIFY_CLIENT_SECRET');

const parseScopes = (scopes: string) =>
  scopes
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

const assertAllowedReadOnlyScopes = ({
  label,
  scopes,
}: {
  label: string;
  scopes: string[];
}) => {
  if (scopes.some((scope) => scope.startsWith('write_'))) {
    throw new InternalServerErrorException(
      `${label} must stay read-only for this Shopify connection spike.`,
    );
  }

  const supportedScopes = new Set<string>(ALLOWED_READ_ONLY_SCOPES);
  const unsupportedScopes = scopes.filter(
    (scope) => !supportedScopes.has(scope),
  );

  if (unsupportedScopes.length > 0) {
    throw new InternalServerErrorException(
      `${label} includes unsupported Shopify scopes: ${unsupportedScopes.join(', ')}`,
    );
  }
};

const getScopes = () => {
  const scopes =
    getEnv('MYAH_SHOPIFY_SCOPES') ??
    getEnv('SHOPIFY_SCOPES') ??
    DEFAULT_READ_ONLY_SCOPES;
  const requestedScopes = parseScopes(scopes);

  assertAllowedReadOnlyScopes({
    label: 'MYAH_SHOPIFY_SCOPES',
    scopes: requestedScopes,
  });

  return requestedScopes.join(',');
};

const base64UrlEncode = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64url');

const base64UrlDecode = (value: string) =>
  Buffer.from(value, 'base64url').toString('utf8');

const normalizeShopDomain = (shop: string): string => {
  const trimmedShop = shop.trim().toLowerCase();
  const shopWithoutProtocol = trimmedShop
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const shopDomain = shopWithoutProtocol.endsWith('.myshopify.com')
    ? shopWithoutProtocol
    : `${shopWithoutProtocol}.myshopify.com`;

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
    throw new BadRequestException(
      'Enter a valid Shopify store subdomain or .myshopify.com domain.',
    );
  }

  return shopDomain;
};

const normalizeProductHandle = (
  handle: string | undefined,
): string | undefined => {
  const normalizedHandle = handle?.trim().toLowerCase() || undefined;

  if (!normalizedHandle) {
    return undefined;
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalizedHandle)) {
    throw new BadRequestException('Enter a valid Shopify product handle.');
  }

  return normalizedHandle;
};

const normalizeProductId = (
  productId: string | undefined,
): string | undefined => {
  const normalizedProductId = productId?.trim() || undefined;

  if (!normalizedProductId) {
    return undefined;
  }

  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(normalizedProductId)) {
    throw new BadRequestException('Enter a valid Shopify product id.');
  }

  return normalizedProductId;
};

type ShopifyOAuthStatePayload = {
  workspaceId: string;
  userId: string;
  shopDomain: string;
  issuedAt: number;
  nonce: string;
};

export type StartShopifyOAuthInput = {
  shop: string;
  workspaceId: string;
  userId: string;
  callbackUrl: string;
};

export type StartShopifyOAuthResult = {
  authorizationUrl: string;
  shopDomain: string;
  state: string;
};

export type CompleteShopifyOAuthCallbackInput = {
  code?: string;
  hmac?: string;
  shop?: string;
  state?: string;
  timestamp?: string;
};

export type ShopifyConnectionStatus = {
  connected: boolean;
  shopDomain?: string;
  shopName?: string;
  scopes?: string[];
};

type ShopifyProductSummary = {
  id?: string;
  title?: string;
  handle?: string;
  status?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  totalInventory?: number | null;
  onlineStoreUrl?: string | null;
};

export type ShopifyStoreContext = {
  success: boolean;
  connected: boolean;
  error?: string;
  shop?: {
    name?: string;
    myshopifyDomain?: string;
    primaryDomain?: { host?: string; url?: string } | null;
    currencyCode?: string;
    contactEmail?: string | null;
  };
  products?: ShopifyProductSummary[];
  scopes?: string[];
};

export type ShopifyProductSearch = {
  success: boolean;
  connected: boolean;
  error?: string;
  products?: ShopifyProductSummary[];
  query?: string;
  scopes?: string[];
};

export type ShopifyAgentReadResult = {
  success: boolean;
  connected: boolean;
  error?: string;
  data?: Record<string, unknown>;
  query?: Record<string, string | number | undefined>;
  scopes?: string[];
};

type ShopifyGraphqlResponse<TData extends Record<string, unknown>> = {
  data?: TData;
  errors?: unknown[];
};

type ShopifyAgentReadContext = {
  accessToken: string;
  shopDomain: string;
};

type ShopifyAccessTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

type ShopifyPlaintextTokens = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
};

type ShopifyShopResponse = {
  data?: {
    shop?: {
      name?: string;
      myshopifyDomain?: string;
    };
  };
  errors?: unknown[];
};

type ShopifyStoreContextResponse = {
  data?: {
    shop?: ShopifyStoreContext['shop'];
    products?: {
      nodes?: ShopifyProductSummary[];
    };
  };
  errors?: unknown[];
};

type ShopifyProductSearchResponse = {
  data?: {
    products?: {
      nodes?: ShopifyProductSummary[];
    };
  };
  errors?: unknown[];
};

const formatShopifyErrors = (errors: unknown): string => {
  if (!errors) {
    return '';
  }

  const errorList = Array.isArray(errors) ? errors : [errors];
  const messages = errorList
    .map((error) => {
      if (typeof error === 'string') {
        return error;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
      ) {
        return error.message;
      }

      return undefined;
    })
    .filter(Boolean)
    .slice(0, 3);

  return messages.length ? ` ${messages.join('; ')}` : '';
};

@Injectable()
export class MyahShopifyService {
  private readonly logger = new Logger(MyahShopifyService.name);

  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    private readonly connectedAccountTokenEncryptionService: ConnectedAccountTokenEncryptionService,
  ) {}

  startOAuth({
    shop,
    workspaceId,
    userId,
    callbackUrl,
  }: StartShopifyOAuthInput): StartShopifyOAuthResult {
    const clientId = this.getRequiredClientId();
    const clientSecret = this.getRequiredClientSecret();
    const shopDomain = normalizeShopDomain(shop);
    const state = this.signState(
      {
        workspaceId,
        userId,
        shopDomain,
        issuedAt: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex'),
      },
      clientSecret,
    );
    const authorizationUrl = new URL(
      `https://${shopDomain}/admin/oauth/authorize`,
    );

    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('scope', getScopes());
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('state', state);

    return {
      authorizationUrl: authorizationUrl.toString(),
      shopDomain,
      state,
    };
  }

  async completeOAuthCallback(
    params: CompleteShopifyOAuthCallbackInput,
  ): Promise<ShopifyConnectionStatus> {
    const clientSecret = this.getRequiredClientSecret();
    const clientId = this.getRequiredClientId();

    if (
      !params.code ||
      !params.hmac ||
      !params.shop ||
      !params.state ||
      !params.timestamp
    ) {
      throw new BadRequestException(
        'Shopify OAuth callback is missing required parameters.',
      );
    }

    const shopDomain = normalizeShopDomain(params.shop);

    this.verifyShopifyHmac(params, clientSecret);

    const statePayload = this.verifyState(params.state, clientSecret);

    if (statePayload.shopDomain !== shopDomain) {
      throw new UnauthorizedException(
        'Shopify OAuth state does not match the callback shop.',
      );
    }

    const tokenResult = await this.exchangeCodeForAccessToken({
      code: params.code,
      shopDomain,
      clientId,
      clientSecret,
    });
    const scopes = parseScopes(tokenResult.scope);

    assertAllowedReadOnlyScopes({
      label: 'Shopify token response',
      scopes,
    });

    const status: ShopifyConnectionStatus = {
      connected: true,
      shopDomain,
      shopName: undefined,
      scopes,
    };

    await this.saveConnection({
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      scopes,
      shopDomain,
      shopName: undefined,
      userWorkspaceId: statePayload.userId,
      workspaceId: statePayload.workspaceId,
    });

    try {
      const shopName = await this.fetchShopName({
        shopDomain,
        accessToken: tokenResult.accessToken,
      });

      status.shopName = shopName;
      await this.saveConnection({
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        scopes,
        shopDomain,
        shopName,
        userWorkspaceId: statePayload.userId,
        workspaceId: statePayload.workspaceId,
      });
    } catch {
      // The Admin API token exchange is the connection contract. The shop
      // profile probe enriches the UI, but it must not discard a valid token.
    }

    return status;
  }

  async getStatus({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<ShopifyConnectionStatus> {
    const connection = await this.findActiveConnection({ workspaceId });

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      shopDomain: connection.handle,
      shopName: this.getPersistedShopName(connection),
      scopes: connection.scopes ?? undefined,
    };
  }

  async getStoreContext({
    productsFirst,
    workspaceId,
  }: {
    productsFirst: number;
    workspaceId: string;
  }): Promise<ShopifyStoreContext> {
    const connection = await this.findActiveConnection({ workspaceId });

    if (!connection?.accessToken) {
      return {
        success: false,
        connected: false,
        error: 'No active Shopify connection found for this workspace.',
      };
    }

    const { accessToken, scopes } = await this.resolveAccessTokenForRead({
      connection,
      workspaceId,
    });
    const body = await this.fetchStoreContext({
      accessToken,
      productsFirst,
      shopDomain: connection.handle,
    });

    return {
      success: true,
      connected: true,
      shop: body.data?.shop,
      products: body.data?.products?.nodes ?? [],
      scopes,
    };
  }

  async searchProducts({
    productsFirst,
    query,
    workspaceId,
  }: {
    productsFirst: number;
    query?: string;
    workspaceId: string;
  }): Promise<ShopifyProductSearch> {
    const connection = await this.findActiveConnection({ workspaceId });

    if (!connection?.accessToken) {
      return {
        success: false,
        connected: false,
        error: 'No active Shopify connection found for this workspace.',
      };
    }

    const normalizedQuery = query?.trim() || undefined;
    const { accessToken, scopes } = await this.resolveAccessTokenForRead({
      connection,
      workspaceId,
    });
    const body = await this.fetchProducts({
      accessToken,
      productsFirst,
      query: normalizedQuery,
      shopDomain: connection.handle,
    });

    return {
      success: true,
      connected: true,
      products: body.data?.products?.nodes ?? [],
      query: normalizedQuery,
      scopes,
    };
  }

  async getProductDetail({
    handle,
    productId,
    workspaceId,
  }: {
    handle?: string;
    productId?: string;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const normalizedHandle = normalizeProductHandle(handle);
    const normalizedProductId = normalizeProductId(productId);

    if (!normalizedHandle && !normalizedProductId) {
      throw new BadRequestException(
        'Provide a Shopify product handle or product id.',
      );
    }

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        const body = normalizedProductId
          ? await this.fetchShopifyGraphql({
              accessToken,
              errorMessage:
                'Shopify could not load the connected product detail.',
              query: `
              query MyahShopifyProductDetailById($productId: ID!) {
                product(id: $productId) {
                  ...MyahProductDetail
                }
              }
              fragment MyahProductDetail on Product {
                id
                title
                handle
                status
                vendor
                productType
                tags
                totalInventory
                onlineStoreUrl
                description
                descriptionHtml
                seo { title description }
                priceRangeV2 {
                  minVariantPrice { amount currencyCode }
                  maxVariantPrice { amount currencyCode }
                }
                options { name values }
                variants(first: 25) {
                  nodes {
                    id
                    title
                    sku
                    price
                    compareAtPrice
                    inventoryQuantity
                    selectedOptions { name value }
                  }
                }
                images(first: 10) {
                  nodes { id url altText width height }
                }
                collections(first: 10) {
                  nodes { id title handle }
                }
              }
            `,
              shopDomain,
              variables: { productId: normalizedProductId },
            })
          : await this.fetchShopifyGraphql({
              accessToken,
              errorMessage:
                'Shopify could not load the connected product detail.',
              query: `
              query MyahShopifyProductDetailByHandle($query: String!) {
                products(first: 1, query: $query) {
                  nodes {
                    id
                    title
                    handle
                    status
                    vendor
                    productType
                    tags
                    totalInventory
                    onlineStoreUrl
                    description
                    descriptionHtml
                    seo { title description }
                    priceRangeV2 {
                      minVariantPrice { amount currencyCode }
                      maxVariantPrice { amount currencyCode }
                    }
                    options { name values }
                    variants(first: 25) {
                      nodes {
                        id
                        title
                        sku
                        price
                        compareAtPrice
                        inventoryQuantity
                        selectedOptions { name value }
                      }
                    }
                    images(first: 10) {
                      nodes { id url altText width height }
                    }
                    collections(first: 10) {
                      nodes { id title handle }
                    }
                  }
                }
              }
            `,
              shopDomain,
              variables: { query: `handle:${normalizedHandle}` },
            });

        const data = body.data ?? {};
        const product =
          'product' in data
            ? data.product
            : ((data.products as { nodes?: unknown[] } | undefined)
                ?.nodes?.[0] ?? null);

        return { product };
      },
      query: { handle: normalizedHandle, productId: normalizedProductId },
      workspaceId,
    });
  }

  async getBrandContent({
    first,
    workspaceId,
  }: {
    first: number;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const cappedFirst = this.normalizeAgentFirst(first);

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        const body = await this.fetchShopifyGraphql({
          accessToken,
          errorMessage: 'Shopify could not load connected brand content.',
          query: `
            query MyahShopifyBrandContent($first: Int!) {
              shop {
                name
                myshopifyDomain
                primaryDomain { url host }
                currencyCode
                contactEmail
              }
              pages(first: $first, sortKey: UPDATED_AT, reverse: true) {
                nodes { id title handle bodySummary isPublished updatedAt }
              }
              blogs(first: $first) {
                nodes {
                  id
                  title
                  handle
                  articles(first: 5) {
                    nodes { id title handle summary publishedAt updatedAt }
                  }
                }
              }
              shopLocales {
                locale
                name
                primary
                published
              }
            }
          `,
          shopDomain,
          variables: { first: cappedFirst },
        });

        return body.data ?? {};
      },
      query: { first: cappedFirst },
      workspaceId,
    });
  }

  async getCustomData({
    first,
    workspaceId,
  }: {
    first: number;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const cappedFirst = this.normalizeAgentFirst(first);

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        const body = await this.fetchShopifyGraphql({
          accessToken,
          errorMessage: 'Shopify could not load connected custom data.',
          query: `
            query MyahShopifyCustomData($first: Int!) {
              metaobjectDefinitions(first: $first) {
                nodes {
                  id
                  type
                  name
                  description
                  fieldDefinitions { key name description required type { name } }
                }
              }
            }
          `,
          shopDomain,
          variables: { first: cappedFirst },
        });

        return body.data ?? {};
      },
      query: { first: cappedFirst },
      workspaceId,
    });
  }

  async getCommerceSummary({
    first,
    workspaceId,
  }: {
    first: number;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const cappedFirst = this.normalizeAgentFirst(first);

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        try {
          const body = await this.fetchShopifyGraphql({
            accessToken,
            errorMessage: 'Shopify could not load connected commerce summary.',
            query: `
              query MyahShopifyCommerceSummary($first: Int!) {
                orders(first: $first, sortKey: CREATED_AT, reverse: true) {
                  nodes {
                    id
                    name
                    createdAt
                    displayFinancialStatus
                    displayFulfillmentStatus
                    totalPriceSet { shopMoney { amount currencyCode } }
                    subtotalPriceSet { shopMoney { amount currencyCode } }
                    totalTaxSet { shopMoney { amount currencyCode } }
                  }
                }
              }
            `,
            shopDomain,
            variables: { first: cappedFirst },
          });

          return body.data ?? {};
        } catch (error) {
          return {
            unavailable: {
              commerce: this.getReadableError(error),
            },
          };
        }
      },
      query: { first: cappedFirst },
      workspaceId,
    });
  }

  async getCustomerSummary({
    first,
    workspaceId,
  }: {
    first: number;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const cappedFirst = this.normalizeAgentFirst(first);

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        try {
          const body = await this.fetchShopifyGraphql({
            accessToken,
            errorMessage: 'Shopify could not load connected customer summary.',
            query: `
              query MyahShopifyCustomerSummary($first: Int!) {
                customers(first: $first, sortKey: UPDATED_AT, reverse: true) {
                  nodes {
                    id
                    displayName
                    createdAt
                    updatedAt
                    numberOfOrders
                    state
                    tags
                    amountSpent { amount currencyCode }
                  }
                }
              }
            `,
            shopDomain,
            variables: { first: cappedFirst },
          });

          return body.data ?? {};
        } catch {
          this.logger.warn('shopify_customer_summary_unavailable');
          return {
            unavailable: {
              customers: SHOPIFY_CUSTOMER_DATA_UNAVAILABLE,
            },
          };
        }
      },
      query: { first: cappedFirst },
      workspaceId,
    });
  }

  async getPromotionsSummary({
    first,
    workspaceId,
  }: {
    first: number;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const cappedFirst = this.normalizeAgentFirst(first);

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        try {
          const body = await this.fetchShopifyGraphql({
            accessToken,
            errorMessage:
              'Shopify could not load connected promotions summary.',
            query: `
              query MyahShopifyPromotionsSummary($first: Int!) {
                discountNodes(first: $first) {
                  nodes {
                    id
                    discount {
                      __typename
                      ... on DiscountCodeBasic { title status startsAt endsAt summary }
                      ... on DiscountAutomaticBasic { title status startsAt endsAt summary }
                      ... on DiscountCodeBxgy { title status startsAt endsAt summary }
                      ... on DiscountAutomaticBxgy { title status startsAt endsAt summary }
                    }
                  }
                }
              }
            `,
            shopDomain,
            variables: { first: cappedFirst },
          });

          return {
            ...(body.data ?? {}),
            legacyPriceRules: {
              unavailable:
                'Shopify Admin GraphQL 2026-01 no longer exposes priceRules on QueryRoot; use modern discounts where available.',
            },
          };
        } catch (error) {
          return {
            unavailable: {
              discounts: this.getReadableError(error),
            },
          };
        }
      },
      query: { first: cappedFirst },
      workspaceId,
    });
  }

  async getChannelContext({
    first,
    workspaceId,
  }: {
    first: number;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const cappedFirst = this.normalizeAgentFirst(first);

    return await this.readAgentData({
      buildData: async ({ accessToken, shopDomain }) => {
        try {
          const body = await this.fetchShopifyGraphql({
            accessToken,
            errorMessage: 'Shopify could not load connected channel context.',
            query: `
              query MyahShopifyChannelContext($first: Int!) {
                channels(first: $first) {
                  nodes { id name handle }
                }
              }
            `,
            shopDomain,
            variables: { first: cappedFirst },
          });

          return {
            ...(body.data ?? {}),
            productListings: {
              unavailable:
                'Shopify Admin GraphQL 2026-01 does not expose productListings on QueryRoot for this app/runtime.',
            },
          };
        } catch (error) {
          return {
            unavailable: {
              channels: this.getReadableError(error),
            },
          };
        }
      },
      query: { first: cappedFirst },
      workspaceId,
    });
  }

  async disconnect({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<ShopifyConnectionStatus> {
    await this.connectedAccountRepository.update(
      {
        archivedAt: IsNull(),
        name: SHOPIFY_CONNECTED_ACCOUNT_NAME,
        provider: ConnectedAccountProvider.APP,
        workspaceId,
      },
      {
        accessToken: null,
        archivedAt: new Date(),
        authFailedAt: null,
        refreshToken: null,
        scopes: null,
      },
    );

    return { connected: false };
  }

  private async saveConnection({
    accessToken,
    refreshToken,
    scopes,
    shopDomain,
    shopName,
    userWorkspaceId,
    workspaceId,
  }: {
    accessToken: string;
    refreshToken: string | null;
    scopes: string[];
    shopDomain: string;
    shopName?: string;
    userWorkspaceId: string;
    workspaceId: string;
  }): Promise<void> {
    const existingConnection = await this.findLatestConnection({ workspaceId });
    const { encryptedAccessToken, encryptedRefreshToken } =
      this.connectedAccountTokenEncryptionService.encryptTokenPair({
        accessToken: accessToken as PlaintextString,
        refreshToken: refreshToken as PlaintextString | null,
        workspaceId,
      });

    await this.connectedAccountRepository.save({
      ...existingConnection,
      accessToken: encryptedAccessToken,
      archivedAt: null,
      authFailedAt: null,
      connectionParameters: shopName
        ? ({
            shopify: { shopName },
          } as ConnectedAccountEntity['connectionParameters'])
        : null,
      handle: shopDomain,
      lastCredentialsRefreshedAt: new Date(),
      name: SHOPIFY_CONNECTED_ACCOUNT_NAME,
      provider: ConnectedAccountProvider.APP,
      refreshToken: encryptedRefreshToken,
      scopes,
      userWorkspaceId,
      visibility: 'workspace',
      workspaceId,
    } as ConnectedAccountEntity);
  }

  private findActiveConnection({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<ConnectedAccountEntity | null> {
    return this.connectedAccountRepository.findOne({
      where: {
        archivedAt: IsNull(),
        name: SHOPIFY_CONNECTED_ACCOUNT_NAME,
        provider: ConnectedAccountProvider.APP,
        workspaceId,
      },
    });
  }

  private findLatestConnection({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<ConnectedAccountEntity | null> {
    return this.connectedAccountRepository.findOne({
      order: { updatedAt: 'DESC' },
      where: {
        name: SHOPIFY_CONNECTED_ACCOUNT_NAME,
        provider: ConnectedAccountProvider.APP,
        workspaceId,
      },
    });
  }

  private getPersistedShopName(
    connection: ConnectedAccountEntity,
  ): string | undefined {
    const connectionParameters = connection.connectionParameters as {
      shopify?: { shopName?: string };
    } | null;

    return connectionParameters?.shopify?.shopName;
  }

  private resolveAccessTokenForRead({
    connection,
    workspaceId,
  }: {
    connection: ConnectedAccountEntity;
    workspaceId: string;
  }): Promise<{ accessToken: string; scopes: string[] | undefined }> {
    if (this.shouldRefreshAccessToken(connection) && connection.refreshToken) {
      return this.refreshAccessToken({ connection, workspaceId });
    }

    return Promise.resolve({
      accessToken: this.connectedAccountTokenEncryptionService.decrypt({
        ciphertext: connection.accessToken as EncryptedString,
        workspaceId,
      }),
      scopes: connection.scopes ?? undefined,
    });
  }

  private shouldRefreshAccessToken(
    connection: ConnectedAccountEntity,
  ): boolean {
    if (!connection.refreshToken) {
      return false;
    }

    if (!connection.lastCredentialsRefreshedAt) {
      return true;
    }

    return (
      connection.lastCredentialsRefreshedAt.getTime() <
      Date.now() -
        (SHOPIFY_ACCESS_TOKEN_TTL_MS - SHOPIFY_ACCESS_TOKEN_REFRESH_BUFFER_MS)
    );
  }

  private async refreshAccessToken({
    connection,
    workspaceId,
  }: {
    connection: ConnectedAccountEntity;
    workspaceId: string;
  }): Promise<{ accessToken: string; scopes: string[] | undefined }> {
    const refreshToken = this.connectedAccountTokenEncryptionService.decrypt({
      ciphertext: connection.refreshToken as EncryptedString,
      workspaceId,
    });
    const tokenResult = await this.exchangeRefreshTokenForAccessToken({
      clientId: this.getRequiredClientId(),
      clientSecret: this.getRequiredClientSecret(),
      refreshToken,
      shopDomain: connection.handle,
    });
    const scopes = parseScopes(
      tokenResult.scope || (connection.scopes ?? []).join(','),
    );

    assertAllowedReadOnlyScopes({
      label: 'Shopify refresh token response',
      scopes,
    });

    const { encryptedAccessToken, encryptedRefreshToken } =
      this.connectedAccountTokenEncryptionService.encryptTokenPair({
        accessToken: tokenResult.accessToken as PlaintextString,
        refreshToken: (tokenResult.refreshToken ??
          refreshToken) as PlaintextString,
        workspaceId,
      });

    await this.connectedAccountRepository.update(
      { id: connection.id, workspaceId },
      {
        accessToken: encryptedAccessToken,
        authFailedAt: null,
        lastCredentialsRefreshedAt: new Date(),
        refreshToken: encryptedRefreshToken,
        scopes,
      },
    );

    return { accessToken: tokenResult.accessToken, scopes };
  }

  private getRequiredClientId(): string {
    const clientId = getClientId();

    if (!clientId) {
      throw new InternalServerErrorException(
        'MYAH_SHOPIFY_CLIENT_ID is not configured on the Twenty server.',
      );
    }

    return clientId;
  }

  private getRequiredClientSecret(): string {
    const clientSecret = getClientSecret();

    if (!clientSecret) {
      throw new InternalServerErrorException(
        'MYAH_SHOPIFY_CLIENT_SECRET is not configured on the Twenty server.',
      );
    }

    return clientSecret;
  }

  private signState(
    payload: ShopifyOAuthStatePayload,
    clientSecret: string,
  ): string {
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', clientSecret)
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }

  private verifyState(
    state: string,
    clientSecret: string,
  ): ShopifyOAuthStatePayload {
    const [encodedPayload, signature] = state.split('.');

    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Shopify OAuth state is invalid.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', clientSecret)
      .update(encodedPayload)
      .digest('base64url');

    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException(
        'Shopify OAuth state signature is invalid.',
      );
    }

    const payload = JSON.parse(
      base64UrlDecode(encodedPayload),
    ) as ShopifyOAuthStatePayload;

    if (Date.now() - payload.issuedAt > STATE_MAX_AGE_MS) {
      throw new UnauthorizedException('Shopify OAuth state expired.');
    }

    return payload;
  }

  private verifyShopifyHmac(
    params: CompleteShopifyOAuthCallbackInput,
    clientSecret: string,
  ): void {
    const { hmac, ...unsignedParams } = params;
    const message = Object.entries(unsignedParams)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      )
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const expectedHmac = crypto
      .createHmac('sha256', clientSecret)
      .update(message)
      .digest('hex');

    if (!hmac || !this.safeEqual(hmac, expectedHmac)) {
      throw new UnauthorizedException(
        'Shopify OAuth callback hmac is invalid.',
      );
    }
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async exchangeCodeForAccessToken({
    code,
    shopDomain,
    clientId,
    clientSecret,
  }: {
    code: string;
    shopDomain: string;
    clientId: string;
    clientSecret: string;
  }): Promise<ShopifyPlaintextTokens> {
    const response = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          expiring: '1',
        }),
      },
    );

    let body: ShopifyAccessTokenResponse;

    try {
      body = (await response.json()) as ShopifyAccessTokenResponse;
    } catch {
      throw new BadGatewayException(
        'Shopify returned a non-JSON OAuth token response.',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        body.error_description ?? 'Shopify rejected the OAuth callback code.',
      );
    }

    if (!body.access_token) {
      throw new BadGatewayException(
        'Shopify token response is missing an access token.',
      );
    }

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      scope: body.scope ?? '',
    };
  }

  private async exchangeRefreshTokenForAccessToken({
    clientId,
    clientSecret,
    refreshToken,
    shopDomain,
  }: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    shopDomain: string;
  }): Promise<ShopifyPlaintextTokens> {
    const response = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      },
    );

    let body: ShopifyAccessTokenResponse;

    try {
      body = (await response.json()) as ShopifyAccessTokenResponse;
    } catch {
      throw new BadGatewayException(
        'Shopify returned a non-JSON OAuth refresh response.',
      );
    }

    if (!response.ok) {
      throw new UnauthorizedException(
        body.error_description ?? 'Shopify rejected the refresh token.',
      );
    }

    if (!body.access_token) {
      throw new BadGatewayException(
        'Shopify refresh response is missing an access token.',
      );
    }

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      scope: body.scope ?? '',
    };
  }

  private async readAgentData({
    buildData,
    query,
    workspaceId,
  }: {
    buildData: (
      context: ShopifyAgentReadContext,
    ) => Promise<Record<string, unknown>>;
    query: Record<string, string | number | undefined>;
    workspaceId: string;
  }): Promise<ShopifyAgentReadResult> {
    const connection = await this.findActiveConnection({ workspaceId });

    if (!connection?.accessToken) {
      return {
        success: false,
        connected: false,
        error: 'No active Shopify connection found for this workspace.',
      };
    }

    const { accessToken, scopes } = await this.resolveAccessTokenForRead({
      connection,
      workspaceId,
    });
    const data = await buildData({
      accessToken,
      shopDomain: connection.handle,
    });

    return {
      success: true,
      connected: true,
      data,
      query,
      scopes,
    };
  }

  private normalizeAgentFirst(first: number): number {
    return Math.min(Math.max(Number.isFinite(first) ? first : 10, 1), 25);
  }

  private getReadableError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown Shopify API error.';
  }

  private async fetchShopifyGraphql<TData extends Record<string, unknown>>({
    accessToken,
    errorMessage,
    query,
    shopDomain,
    variables,
  }: {
    accessToken: string;
    errorMessage: string;
    query: string;
    shopDomain: string;
    variables?: Record<string, unknown>;
  }): Promise<ShopifyGraphqlResponse<TData>> {
    const response = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    let body: ShopifyGraphqlResponse<TData>;

    try {
      body = (await response.json()) as ShopifyGraphqlResponse<TData>;
    } catch {
      throw new BadGatewayException(
        `${errorMessage} Shopify returned non-JSON.`,
      );
    }

    if (!response.ok || body.errors) {
      throw new BadGatewayException(
        `${errorMessage}${formatShopifyErrors(body.errors)}`,
      );
    }

    return body;
  }

  private async fetchShopName({
    shopDomain,
    accessToken,
  }: {
    shopDomain: string;
    accessToken: string;
  }): Promise<string | undefined> {
    const response = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `
          query MyahShopifyConnectionProbe {
            shop {
              name
              myshopifyDomain
              primaryDomain { url host }
              currencyCode
              contactEmail
            }
          }
        `,
        }),
      },
    );

    let body: ShopifyShopResponse;

    try {
      body = (await response.json()) as ShopifyShopResponse;
    } catch {
      throw new BadGatewayException(
        'Shopify returned a non-JSON shop profile response.',
      );
    }

    if (!response.ok || body.errors) {
      throw new BadGatewayException(
        'Shopify could not verify the connected shop profile.',
      );
    }

    return body.data?.shop?.name;
  }

  private async fetchStoreContext({
    accessToken,
    productsFirst,
    shopDomain,
  }: {
    accessToken: string;
    productsFirst: number;
    shopDomain: string;
  }): Promise<ShopifyStoreContextResponse> {
    const response = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `
          query MyahShopifyStoreContext($productsFirst: Int!) {
            shop {
              name
              myshopifyDomain
              primaryDomain { url host }
              currencyCode
              contactEmail
            }
            products(first: $productsFirst, sortKey: UPDATED_AT, reverse: true) {
              nodes {
                id
                title
                handle
                status
                vendor
                productType
                tags
                totalInventory
                onlineStoreUrl
              }
            }
          }
        `,
          variables: { productsFirst },
        }),
      },
    );

    let body: ShopifyStoreContextResponse;

    try {
      body = (await response.json()) as ShopifyStoreContextResponse;
    } catch {
      throw new BadGatewayException(
        'Shopify returned a non-JSON store context response.',
      );
    }

    if (!response.ok || body.errors) {
      throw new BadGatewayException(
        `Shopify could not load the connected store context.${formatShopifyErrors(body.errors)}`,
      );
    }

    return body;
  }

  private async fetchProducts({
    accessToken,
    productsFirst,
    query,
    shopDomain,
  }: {
    accessToken: string;
    productsFirst: number;
    query?: string;
    shopDomain: string;
  }): Promise<ShopifyProductSearchResponse> {
    const response = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `
          query MyahShopifyProductSearch($productsFirst: Int!, $query: String) {
            products(first: $productsFirst, query: $query, sortKey: UPDATED_AT, reverse: true) {
              nodes {
                id
                title
                handle
                status
                vendor
                productType
                tags
                totalInventory
                onlineStoreUrl
              }
            }
          }
        `,
          variables: {
            productsFirst,
            query: query ?? null,
          },
        }),
      },
    );

    let body: ShopifyProductSearchResponse;

    try {
      body = (await response.json()) as ShopifyProductSearchResponse;
    } catch {
      throw new BadGatewayException(
        'Shopify returned a non-JSON product search response.',
      );
    }

    if (!response.ok || body.errors) {
      throw new BadGatewayException(
        `Shopify could not search connected store products.${formatShopifyErrors(body.errors)}`,
      );
    }

    return body;
  }
}
