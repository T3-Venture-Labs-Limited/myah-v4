import { Injectable } from '@nestjs/common';

import { Gaxios } from 'gaxios';
import { google } from 'googleapis';
import { isDefined } from 'twenty-shared/utils';

import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  ConnectedAccountRefreshAccessTokenException,
  ConnectedAccountRefreshAccessTokenExceptionCode,
} from 'src/engine/metadata-modules/connected-account/exceptions/connected-account-refresh-tokens.exception';
import { parseGoogleOAuthError } from 'src/modules/connected-account/refresh-tokens-manager/drivers/google/utils/parse-google-oauth-error.util';
import {
  type ConnectedAccountPlaintextTokens,
  type ConnectedAccountTokenResolutionOptions,
} from 'src/modules/connected-account/refresh-tokens-manager/services/connected-account-refresh-tokens.service';

@Injectable()
export class GoogleAPIRefreshAccessTokenService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  async refreshTokens(
    refreshToken: PlaintextString,
    options?: ConnectedAccountTokenResolutionOptions,
  ): Promise<ConnectedAccountPlaintextTokens> {
    options?.abortSignal?.throwIfAborted();

    const clientOptions = {
      clientId: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
    };
    const oAuth2Client = options?.abortSignal
      ? new google.auth.OAuth2({
          ...clientOptions,
          transporter: this.createOutboundTransport(options.abortSignal),
        })
      : new google.auth.OAuth2({
          ...clientOptions,
          transporterOptions: { fetchImplementation: fetch },
        });

    oAuth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    try {
      const { token } = await oAuth2Client.getAccessToken();

      options?.abortSignal?.throwIfAborted();

      if (!isDefined(token)) {
        throw new ConnectedAccountRefreshAccessTokenException(
          'Error refreshing Google tokens: Invalid refresh token',
          ConnectedAccountRefreshAccessTokenExceptionCode.INVALID_REFRESH_TOKEN,
        );
      }

      return {
        accessToken: token as PlaintextString,
        refreshToken,
      };
    } catch (error) {
      if (error instanceof ConnectedAccountRefreshAccessTokenException) {
        throw error;
      }

      throw parseGoogleOAuthError(error);
    }
  }

  private createOutboundTransport(abortSignal: AbortSignal): Gaxios {
    const transporter = new Gaxios({ fetchImplementation: fetch });

    transporter.interceptors.request.add({
      resolved: async (requestOptions) => ({
        ...requestOptions,
        signal: abortSignal,
        retry: false,
        retryConfig: {
          ...requestOptions.retryConfig,
          retry: 0,
          noResponseRetries: 0,
        },
      }),
    });

    return transporter;
  }
}
