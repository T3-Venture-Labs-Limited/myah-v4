import { Injectable } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

export type SafeUnipileInstagramConfig = {
  apiBaseUrl: string;
  hostedAuthOrigin: string;
};

@Injectable()
export class UnipileInstagramAvailabilityService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  assertEnabled(): void {
    if (this.twentyConfigService.get('UNIPILE_INSTAGRAM_ENABLED') !== true) {
      throw new Error('Unipile Instagram is disabled');
    }
  }

  get config(): SafeUnipileInstagramConfig {
    this.assertEnabled();

    const apiBaseUrl = this.twentyConfigService.get('UNIPILE_DSN_BASE_URL');

    return {
      apiBaseUrl,
      hostedAuthOrigin: new URL(apiBaseUrl).origin,
    };
  }
}
