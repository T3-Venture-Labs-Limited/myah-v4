import { Injectable } from '@nestjs/common';

import {
  ConfidentialClientApplication,
  type INetworkModule,
  type NetworkRequestOptions,
  type NetworkResponse,
} from '@azure/msal-node';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  ConnectedAccountRefreshAccessTokenException,
  ConnectedAccountRefreshAccessTokenExceptionCode,
} from 'src/engine/metadata-modules/connected-account/exceptions/connected-account-refresh-tokens.exception';
import { parseMsalError } from 'src/modules/connected-account/refresh-tokens-manager/drivers/microsoft/utils/parse-msal-error.util';
import type {
  ConnectedAccountPlaintextTokens,
  ConnectedAccountTokenResolutionOptions,
} from 'src/modules/connected-account/refresh-tokens-manager/services/connected-account-refresh-tokens.service';

@Injectable()
export class MicrosoftAPIRefreshAccessTokenService {
  constructor(private readonly config: TwentyConfigService) {}

  async refreshTokens(
    refreshToken: PlaintextString,
    options?: ConnectedAccountTokenResolutionOptions,
  ): Promise<ConnectedAccountPlaintextTokens> {
    options?.abortSignal?.throwIfAborted();

    const auth = {
      clientId: this.config.get('AUTH_MICROSOFT_CLIENT_ID'),
      clientSecret: this.config.get('AUTH_MICROSOFT_CLIENT_SECRET'),
      authority: 'https://login.microsoftonline.com/common',
    };
    const msalClient = options?.abortSignal
      ? new ConfidentialClientApplication({
          auth,
          system: {
            networkClient: this.createOutboundNetworkClient(
              options.abortSignal,
            ),
            disableInternalRetries: true,
          },
        })
      : new ConfidentialClientApplication({ auth });

    try {
      const response = await msalClient.acquireTokenByRefreshToken({
        refreshToken,
        scopes: ['https://graph.microsoft.com/.default'],
        forceCache: true,
      });

      options?.abortSignal?.throwIfAborted();

      if (!response) {
        throw new ConnectedAccountRefreshAccessTokenException(
          'No response received from Microsoft token endpoint',
          ConnectedAccountRefreshAccessTokenExceptionCode.INVALID_REFRESH_TOKEN,
        );
      }

      return {
        accessToken: response.accessToken as PlaintextString,
        refreshToken: this.extractRefreshTokenFromCache(msalClient),
      };
    } catch (error) {
      if (error instanceof ConnectedAccountRefreshAccessTokenException) {
        throw error;
      }

      throw parseMsalError(error);
    }
  }

  private createOutboundNetworkClient(
    abortSignal: AbortSignal,
  ): INetworkModule {
    return {
      sendGetRequestAsync: <T>(
        url: string,
        requestOptions?: NetworkRequestOptions,
      ) => this.sendOutboundRequest<T>(url, 'GET', requestOptions, abortSignal),
      sendPostRequestAsync: <T>(
        url: string,
        requestOptions?: NetworkRequestOptions,
      ) =>
        this.sendOutboundRequest<T>(url, 'POST', requestOptions, abortSignal),
    };
  }

  private async sendOutboundRequest<T>(
    url: string,
    method: 'GET' | 'POST',
    requestOptions: NetworkRequestOptions | undefined,
    abortSignal: AbortSignal,
  ): Promise<NetworkResponse<T>> {
    abortSignal.throwIfAborted();

    const response = await fetch(url, {
      method,
      headers: requestOptions?.headers,
      ...(method === 'POST' && requestOptions?.body
        ? { body: requestOptions.body }
        : {}),
      signal: abortSignal,
    });
    const headers: Record<string, string> = {};

    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      headers,
      body: (await response.json()) as T,
      status: response.status,
    };
  }

  private extractRefreshTokenFromCache(
    msalClient: ConfidentialClientApplication,
  ): PlaintextString {
    const tokenCache = JSON.parse(msalClient.getTokenCache().serialize());
    const refreshTokenKey = Object.keys(tokenCache.RefreshToken)[0];

    return tokenCache.RefreshToken[refreshTokenKey].secret;
  }
}
