import { Injectable, Logger } from '@nestjs/common';

import { google } from 'googleapis';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

export type GoogleApisServiceAvailability = {
  isMessagingAvailable: boolean;
};

@Injectable()
export class GoogleApisServiceAvailabilityService {
  private readonly logger = new Logger(
    GoogleApisServiceAvailabilityService.name,
  );

  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  async checkServicesAvailability(
    accessToken: string,
  ): Promise<GoogleApisServiceAvailability> {
    const oAuth2Client = new google.auth.OAuth2({
      clientId: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_ID'),
      clientSecret: this.twentyConfigService.get('AUTH_GOOGLE_CLIENT_SECRET'),
      transporterOptions: { fetchImplementation: fetch },
    });

    oAuth2Client.setCredentials({
      access_token: accessToken,
    });

    return {
      isMessagingAvailable: await this.checkMessagingAvailability(oAuth2Client),
    };
  }

  private async checkMessagingAvailability(
    oAuth2Client: InstanceType<typeof google.auth.OAuth2>,
  ): Promise<boolean> {
    if (!this.twentyConfigService.get('MESSAGING_PROVIDER_GMAIL_ENABLED')) {
      return false;
    }

    try {
      const gmailClient = google.gmail({
        version: 'v1',
        auth: oAuth2Client,
      });

      await gmailClient.users.getProfile({ userId: 'me' });

      return true;
    } catch (error) {
      if (this.isServiceNotEnabledError(error)) {
        this.logger.log(
          'Messaging service is not enabled for this Google Workspace account',
        );

        return false;
      }

      this.logger.error('Error checking messaging availability', error);

      throw error;
    }
  }

  private isServiceNotEnabledError(error: unknown): boolean {
    const errorResponse = (
      error as { response?: { data?: { error?: unknown } } }
    )?.response?.data?.error;

    if (!errorResponse || typeof errorResponse !== 'object') {
      return false;
    }

    const gmailError = errorResponse as {
      errors?: Array<{ reason?: string; message?: string }>;
    };

    const firstError = gmailError.errors?.[0];

    if (!firstError) {
      return false;
    }

    const isFailedPrecondition = firstError.reason === 'failedPrecondition';

    const isServiceNotEnabled =
      firstError.message?.toLowerCase()?.includes('service not enabled') ??
      false;

    const isPreconditionCheckFailed =
      firstError.message
        ?.toLowerCase()
        ?.includes('precondition check failed') ?? false;

    return (
      isFailedPrecondition && (isServiceNotEnabled || isPreconditionCheckFailed)
    );
  }
}
