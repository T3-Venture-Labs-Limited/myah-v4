type SafeUnipileInstagramConfig = {
  apiBaseUrl: string;
  hostedAuthOrigin: string;
};

type UnipileInstagramAvailabilityService = {
  assertEnabled: () => void;
  readonly config: SafeUnipileInstagramConfig;
};

type UnipileInstagramAvailabilityServiceModule = {
  UnipileInstagramAvailabilityService: new (twentyConfigService: {
    get: jest.Mock;
  }) => UnipileInstagramAvailabilityService;
};

const loadAvailabilityServiceModule = ():
  | UnipileInstagramAvailabilityServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-availability.service') as UnipileInstagramAvailabilityServiceModule;
  } catch {
    return undefined;
  }
};

const createAvailabilityService = (
  values: Record<string, boolean | string>,
):
  | {
      service: UnipileInstagramAvailabilityService;
      twentyConfigService: { get: jest.Mock };
    }
  | undefined => {
  const availabilityServiceModule = loadAvailabilityServiceModule();

  expect(availabilityServiceModule).toBeDefined();

  if (!availabilityServiceModule) {
    return undefined;
  }

  const twentyConfigService = {
    get: jest.fn((key: string) => values[key]),
  };

  return {
    service: new availabilityServiceModule.UnipileInstagramAvailabilityService(
      twentyConfigService,
    ),
    twentyConfigService,
  };
};

describe('UnipileInstagramAvailabilityService', () => {
  it('rejects disabled Unipile Instagram without reading provider secrets', () => {
    const subject = createAvailabilityService({
      UNIPILE_INSTAGRAM_ENABLED: false,
      UNIPILE_API_KEY: 'synthetic-api-key',
      UNIPILE_WEBHOOK_SECRET:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    if (!subject) {
      return;
    }

    expect(() => subject.service.assertEnabled()).toThrow();
    expect(subject.twentyConfigService.get).toHaveBeenCalledWith(
      'UNIPILE_INSTAGRAM_ENABLED',
    );
    expect(subject.twentyConfigService.get).not.toHaveBeenCalledWith(
      'UNIPILE_API_KEY',
    );
    expect(subject.twentyConfigService.get).not.toHaveBeenCalledWith(
      'UNIPILE_WEBHOOK_SECRET',
    );
  });

  it('returns the validated API base and Hosted Auth origin without exposing secrets when enabled', () => {
    const subject = createAvailabilityService({
      UNIPILE_INSTAGRAM_ENABLED: true,
      UNIPILE_DSN_BASE_URL: 'https://api49.unipile.com:17981/api/v1/',
      UNIPILE_API_KEY: 'synthetic-api-key',
      UNIPILE_WEBHOOK_SECRET:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    if (!subject) {
      return;
    }

    expect(subject.service.config).toEqual({
      apiBaseUrl: 'https://api49.unipile.com:17981/api/v1/',
      hostedAuthOrigin: 'https://api49.unipile.com:17981',
    });
    expect(subject.service.config).not.toHaveProperty('apiKey');
    expect(subject.service.config).not.toHaveProperty('webhookSecret');
    expect(subject.twentyConfigService.get).toHaveBeenCalledWith(
      'UNIPILE_INSTAGRAM_ENABLED',
    );
    expect(subject.twentyConfigService.get).toHaveBeenCalledWith(
      'UNIPILE_DSN_BASE_URL',
    );
    expect(subject.twentyConfigService.get).not.toHaveBeenCalledWith(
      'UNIPILE_API_KEY',
    );
    expect(subject.twentyConfigService.get).not.toHaveBeenCalledWith(
      'UNIPILE_WEBHOOK_SECRET',
    );
  });
});
