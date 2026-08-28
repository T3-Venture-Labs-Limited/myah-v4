import { plainToClass } from 'class-transformer';

import { validateSync } from 'class-validator';

import { ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { ConfigVariableType } from 'src/engine/core-modules/twenty-config/enums/config-variable-type.enum';
import { ConfigVariablesGroup } from 'src/engine/core-modules/twenty-config/enums/config-variables-group.enum';
import { TypedReflect } from 'src/utils/typed-reflect';

describe('ConfigVariables', () => {
  it('registers exact Myah Team email allowlisting as an env-only hidden string', () => {
    const metadata = TypedReflect.getMetadata(
      'config-variables',
      ConfigVariables,
    );

    expect(metadata?.MYAH_TEAM_ALLOWED_EMAILS).toEqual({
      group: ConfigVariablesGroup.ADVANCED_SETTINGS,
      description:
        'Comma-separated exact email addresses authorized for Myah platform operations',
      isEnvOnly: true,
      isHiddenInAdminPanel: true,
      type: ConfigVariableType.STRING,
    });
  });
});

describe('managed provider billing configuration', () => {
  it('requires the Metronome API key and rate-card alias when enabled', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), {
        METRONOME_ENABLED: true,
      }),
      { strictGroups: true },
    );

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'METRONOME_API_KEY',
        'METRONOME_RATE_CARD_ALIAS',
      ]),
    );
  });

  it('rejects blank Metronome API key and rate-card alias values when enabled', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), {
        METRONOME_ENABLED: true,
        METRONOME_API_KEY: ' ',
        METRONOME_RATE_CARD_ALIAS: ' ',
      }),
      { strictGroups: true },
    );

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'METRONOME_API_KEY',
        'METRONOME_RATE_CARD_ALIAS',
      ]),
    );
  });

  it('rejects a settlement delay below ten seconds', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), {
        METRONOME_USAGE_SETTLEMENT_DELAY_MS: 9_999,
      }),
      { strictGroups: true },
    );

    expect(errors.map(({ property }) => property)).toContain(
      'METRONOME_USAGE_SETTLEMENT_DELAY_MS',
    );
  });

  it('casts a valid environment settlement delay to an integer', () => {
    const config = plainToClass(ConfigVariables, {
      METRONOME_USAGE_SETTLEMENT_DELAY_MS: '10000',
    });

    expect(config.METRONOME_USAGE_SETTLEMENT_DELAY_MS).toBe(10_000);
  });

  it('rejects a nonnumeric environment settlement delay', () => {
    const config = plainToClass(ConfigVariables, {
      METRONOME_USAGE_SETTLEMENT_DELAY_MS: 'not-a-number',
    });
    const errors = validateSync(config, { strictGroups: true });

    expect(errors.map(({ property }) => property)).toContain(
      'METRONOME_USAGE_SETTLEMENT_DELAY_MS',
    );
  });

  it('allows empty Metronome credentials while disabled', () => {
    const errors = validateSync(new ConfigVariables(), {
      strictGroups: true,
    });

    expect(errors.map(({ property }) => property)).not.toEqual(
      expect.arrayContaining([
        'METRONOME_API_KEY',
        'METRONOME_RATE_CARD_ALIAS',
      ]),
    );
  });
  it('requires managed OpenRouter credentials and product mappings when enabled', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), {
        MANAGED_OPENROUTER_ENABLED: true,
      }),
      { strictGroups: true },
    );

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'OPENROUTER_API_KEY',
        'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID',
        'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID',
      ]),
    );
  });

  it('bounds sponsored managed provider credit lifetimes to 30 days', () => {
    const validErrors = validateSync(
      Object.assign(new ConfigVariables(), {
        MANAGED_OPENROUTER_MAX_GRANT_LIFETIME_MS: 2_592_000_000,
      }),
      { strictGroups: true },
    );
    const invalidErrors = validateSync(
      Object.assign(new ConfigVariables(), {
        MANAGED_OPENROUTER_MAX_GRANT_LIFETIME_MS: 2_592_000_001,
      }),
      { strictGroups: true },
    );

    expect(
      validErrors.some(
        ({ property }) =>
          property === 'MANAGED_OPENROUTER_MAX_GRANT_LIFETIME_MS',
      ),
    ).toBe(false);
    expect(invalidErrors.map(({ property }) => property)).toContain(
      'MANAGED_OPENROUTER_MAX_GRANT_LIFETIME_MS',
    );
  });

  it('allows empty managed OpenRouter configuration while disabled', () => {
    const errors = validateSync(new ConfigVariables(), {
      strictGroups: true,
    });

    expect(errors.map(({ property }) => property)).not.toEqual(
      expect.arrayContaining([
        'OPENROUTER_API_KEY',
        'MANAGED_OPENROUTER_CHARGE_PRODUCT_ID',
        'MANAGED_OPENROUTER_CREDIT_PRODUCT_ID',
        'MANAGED_OPENROUTER_CASH_PAID_MICROUSD',
        'MANAGED_OPENROUTER_USABLE_CREDITS_MICROUSD',
        'MANAGED_OPENROUTER_MULTIPLIER_EVIDENCE_VERSION',
      ]),
    );
  });
});

const managedEmailCatalogFixture = {
  version: 'test-managed-email-catalog',
  products: [],
};

describe('managed email execution safety', () => {
  const required = {
    MANAGED_EMAIL_ENABLED: true,
    MANAGED_EMAIL_CATALOG: managedEmailCatalogFixture,
    MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY: 'sandbox-provider-configuration',
    ICEMAIL_API_KEY: 'sandbox-icemail-key',
    WARMUP_INBOX_API_KEY: 'sandbox-warmup-key',
    MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS: 'sandbox-rate-card',
    METRONOME_STRIPE_DELIVERY_METHOD_ID:
      '123e4567-e89b-42d3-a456-426614174000',
    MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS: [
      '123e4567-e89b-42d3-a456-426614174000',
    ],
    MANAGED_EMAIL_READINESS_POLICY_VERSION: 'sandbox-v1',
    METRONOME_API_KEY: 'metronome-managed-email-test-key',
    MANAGED_EMAIL_METRONOME_ENVIRONMENT: 'PRODUCTION',
    METRONOME_BASE_URL_ENVIRONMENT: 'PRODUCTION',
    METRONOME_BASE_URL: 'https://api.metronome.com',
    BILLING_STRIPE_API_KEY: 'sk_live_managed_email_test',
    BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_live_managed_email_test',
  };

  const sandboxBilling = {
    MANAGED_EMAIL_METRONOME_ENVIRONMENT: 'SANDBOX',
    METRONOME_BASE_URL_ENVIRONMENT: 'SANDBOX',
    METRONOME_BASE_URL: 'http://127.0.0.1:18084',
    BILLING_STRIPE_API_KEY: 'sk_test_managed_email_test',
    BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_test_managed_email_test',
  };

  const validateManagedEmail = (overrides: Record<string, unknown>) =>
    validateSync(
      Object.assign(new ConfigVariables(), {
        ...required,
        ICEMAIL_API_BASE_URL: 'https://ice.example',
        WARMUP_INBOX_API_BASE_URL: 'https://warm.example',
        ...overrides,
      }),
      { strictGroups: true },
    );

  it('allows the official Metronome origin for an explicitly identified sandbox account', () => {
    const errors = validateManagedEmail({
      MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
      NODE_ENV: 'development',
      ...sandboxBilling,
      METRONOME_BASE_URL: 'https://api.metronome.com',
    });

    expect(errors.map(({ property }) => property)).not.toContain(
      'METRONOME_BASE_URL',
    );
  });

  it('preserves standalone Metronome configuration when managed email is disabled', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), {
        METRONOME_API_KEY: 'standalone-metronome-test-key',
        METRONOME_ENABLED: true,
        METRONOME_RATE_CARD_ALIAS: 'standalone-rate-card',
      }),
      { strictGroups: true },
    );

    const properties = errors.map(({ property }) => property);

    expect(properties).not.toContain('METRONOME_BASE_URL');
    expect(properties).not.toContain('METRONOME_BASE_URL_ENVIRONMENT');
  });

  it('requires the Metronome URL identity to match the billing environment', () => {
    const errors = validateManagedEmail({
      METRONOME_BASE_URL_ENVIRONMENT: 'SANDBOX',
      MANAGED_EMAIL_METRONOME_ENVIRONMENT: 'PRODUCTION',
    });

    expect(errors.map(({ property }) => property)).toContain(
      'METRONOME_BASE_URL',
    );
  });

  it('rejects sandbox execution in production', () => {
    const errors = validateManagedEmail({
      MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
      NODE_ENV: 'production',
      ...sandboxBilling,
    });

    expect(errors.map(({ property }) => property)).toContain(
      'MANAGED_EMAIL_EXECUTION_MODE',
    );
  });

  it('rejects loopback provider URLs outside sandbox execution', () => {
    const errors = validateManagedEmail({
      MANAGED_EMAIL_EXECUTION_MODE: 'PRODUCTION',
      ICEMAIL_API_BASE_URL: 'http://127.0.0.1:18081/api',
      WARMUP_INBOX_API_BASE_URL: 'http://localhost:18082',
    });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'ICEMAIL_API_BASE_URL',
        'WARMUP_INBOX_API_BASE_URL',
      ]),
    );
  });

  it.each([
    ['http://127.0.0.1:18081/api', 'http://localhost:18082'],
    ['http://localhost:18081/api', 'http://127.0.0.1:18082'],
    ['http://[::1]:18081/api', 'http://[::1]:18082'],
  ])(
    'accepts loopback provider URLs in sandbox (%s, %s)',
    (icemailUrl, warmupUrl) => {
      expect(
        validateManagedEmail({
          MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
          NODE_ENV: 'development',
          ...sandboxBilling,
          ICEMAIL_API_BASE_URL: icemailUrl,
          WARMUP_INBOX_API_BASE_URL: warmupUrl,
        }),
      ).toEqual([]);
    },
  );
  it.each([
    ['https://app.icemail.ai/api/v1', 'https://api.warmupinbox.com'],
    ['https://production.icemail.example/api', 'https://api.warmupinbox.com'],
    ['https://app.icemail.ai/api/v1', 'https://production.warmup.example'],
  ])(
    'rejects third-party production provider URLs in sandbox (%s, %s)',
    (icemailUrl, warmupUrl) => {
      const errors = validateManagedEmail({
        MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
        NODE_ENV: 'development',
        ...sandboxBilling,
        ICEMAIL_API_BASE_URL: icemailUrl,
        WARMUP_INBOX_API_BASE_URL: warmupUrl,
      });

      expect(errors.map(({ property }) => property)).toEqual(
        expect.arrayContaining([
          ...(icemailUrl.includes('icemail') ? ['ICEMAIL_API_BASE_URL'] : []),
          ...(warmupUrl.includes('warmup')
            ? ['WARMUP_INBOX_API_BASE_URL']
            : []),
        ]),
      );
    },
  );

  it('rejects Metronome configuration without explicit environment identity', () => {
    const errors = validateManagedEmail({
      MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
      NODE_ENV: 'development',
      ...sandboxBilling,
      METRONOME_BASE_URL_ENVIRONMENT: undefined,
    });

    expect(errors.map(({ property }) => property)).toContain(
      'METRONOME_BASE_URL',
    );
  });
  it.each([
    [
      'a production Metronome environment in sandbox',
      {
        MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
        MANAGED_EMAIL_METRONOME_ENVIRONMENT: 'PRODUCTION',
        NODE_ENV: 'development',
      },
      'METRONOME_BASE_URL',
    ],
    [
      'a live Stripe secret key in sandbox',
      {
        ...sandboxBilling,
        BILLING_STRIPE_API_KEY: 'sk_live_wrong_environment',
        MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
        NODE_ENV: 'development',
      },
      'BILLING_STRIPE_API_KEY',
    ],
    [
      'a live Stripe publishable key in sandbox',
      {
        ...sandboxBilling,
        BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_live_wrong_environment',
        MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
        NODE_ENV: 'development',
      },
      'BILLING_STRIPE_PUBLISHABLE_KEY',
    ],
    [
      'test Stripe keys in production',
      {
        BILLING_STRIPE_API_KEY: 'rk_test_wrong_environment',
        BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_test_wrong_environment',
      },
      'BILLING_STRIPE_API_KEY',
    ],
  ])('rejects %s', (_reason, overrides, expectedProperty) => {
    expect(
      validateManagedEmail(overrides).map(({ property }) => property),
    ).toContain(expectedProperty);
  });

  it('keeps commercial provider/catalog facts required in sandbox', () => {
    const errors = validateManagedEmail({
      MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
      NODE_ENV: 'development',
      ...sandboxBilling,
      ICEMAIL_API_KEY: '',
      WARMUP_INBOX_API_KEY: '',
      MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS: '',
      METRONOME_STRIPE_DELIVERY_METHOD_ID: '',
      MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS: [],
      MANAGED_EMAIL_READINESS_POLICY_VERSION: '',
    });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'ICEMAIL_API_KEY',
        'WARMUP_INBOX_API_KEY',
        'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS',
        'METRONOME_STRIPE_DELIVERY_METHOD_ID',
        'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS',
        'MANAGED_EMAIL_READINESS_POLICY_VERSION',
      ]),
    );
  });
});

describe('managed email configuration', () => {
  it('defaults disabled and accepts missing facts', () => {
    const config = new ConfigVariables();
    expect(config.MANAGED_EMAIL_ENABLED).toBe(false);
    expect(config.ICEMAIL_API_BASE_URL).toBe('https://app.icemail.ai/api/v1');
    expect(config.WARMUP_INBOX_API_BASE_URL).toBe(
      'https://api.warmupinbox.com',
    );
    expect(
      validateSync(config, { strictGroups: true }).map(
        ({ property }) => property,
      ),
    ).not.toEqual(
      expect.arrayContaining(['ICEMAIL_API_KEY', 'WARMUP_INBOX_API_KEY']),
    );
  });
  it('uses one shared Metronome Stripe delivery method configuration', () => {
    const config = new ConfigVariables();

    expect(config.METRONOME_STRIPE_DELIVERY_METHOD_ID).toBe('');
    expect(config).not.toHaveProperty(
      'MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID',
    );
  });
  it('registers metadata for every managed email variable', () => {
    const metadata = TypedReflect.getMetadata(
      'config-variables',
      ConfigVariables,
    );
    for (const key of [
      'ICEMAIL_API_BASE_URL',
      'ICEMAIL_API_KEY',
      'WARMUP_INBOX_API_BASE_URL',
      'WARMUP_INBOX_API_KEY',
      'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS',
      'METRONOME_STRIPE_DELIVERY_METHOD_ID',
      'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS',
      'MANAGED_EMAIL_READINESS_POLICY_VERSION',
      'MANAGED_EMAIL_METRONOME_ENVIRONMENT',
    ]) {
      expect(metadata?.[key]).toEqual(
        expect.objectContaining({
          group: ConfigVariablesGroup.MANAGED_PROVIDER_BILLING_CONFIG,
          isEnvOnly: true,
          isHiddenInAdminPanel: true,
        }),
      );
    }
    expect(metadata?.ICEMAIL_API_KEY?.isSensitive).toBe(true);
    expect(metadata?.WARMUP_INBOX_API_KEY?.isSensitive).toBe(true);
  });
  it('casts an env-shaped workspace allowlist', () => {
    const config = plainToClass(ConfigVariables, {
      MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS:
        '123e4567-e89b-42d3-a456-426614174000',
    });
    expect(config.MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS).toEqual([
      '123e4567-e89b-42d3-a456-426614174000',
    ]);
  });
  it('accepts complete syntactically valid enabled configuration', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), {
        MANAGED_EMAIL_ENABLED: true,
        MANAGED_EMAIL_CATALOG: managedEmailCatalogFixture,
        MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY:
          'production-provider-configuration',
        ICEMAIL_API_BASE_URL: 'https://ice.example',
        ICEMAIL_API_KEY: 'key',
        WARMUP_INBOX_API_BASE_URL: 'https://warm.example',
        WARMUP_INBOX_API_KEY: 'key',
        MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS: 'rate-card',
        METRONOME_STRIPE_DELIVERY_METHOD_ID:
          '123e4567-e89b-42d3-a456-426614174000',
        MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS: [
          '123e4567-e89b-42d3-a456-426614174000',
        ],
        MANAGED_EMAIL_READINESS_POLICY_VERSION: 'v1',
        MANAGED_EMAIL_METRONOME_ENVIRONMENT: 'PRODUCTION',
        METRONOME_BASE_URL_ENVIRONMENT: 'PRODUCTION',
        METRONOME_BASE_URL: 'https://api.metronome.com',
        BILLING_STRIPE_API_KEY: 'sk_live_managed_email_test',
        METRONOME_API_KEY: 'metronome-managed-email-test-key',
        BILLING_STRIPE_PUBLISHABLE_KEY: 'pk_live_managed_email_test',
      }),
      { strictGroups: true },
    );
    expect(errors).toEqual([]);
  });
  it('rejects incomplete enabled configuration', () => {
    const errors = validateSync(
      Object.assign(new ConfigVariables(), { MANAGED_EMAIL_ENABLED: true }),
      { strictGroups: true },
    );
    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining([
        'ICEMAIL_API_KEY',
        'WARMUP_INBOX_API_KEY',
        'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS',
        'METRONOME_STRIPE_DELIVERY_METHOD_ID',
        'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS',
        'MANAGED_EMAIL_READINESS_POLICY_VERSION',
        'METRONOME_BASE_URL',
        'METRONOME_API_KEY',
        'BILLING_STRIPE_API_KEY',
        'BILLING_STRIPE_PUBLISHABLE_KEY',
      ]),
    );
  });
});

describe('managed email catalog configuration', () => {
  const catalog = managedEmailCatalogFixture;

  it('requires a typed catalog and provider configuration key only when enabled', () => {
    const disabled = validateSync(new ConfigVariables(), {
      strictGroups: true,
    }).map(({ property }) => property);
    expect(disabled).not.toEqual(
      expect.arrayContaining([
        'MANAGED_EMAIL_CATALOG',
        'MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY',
      ]),
    );

    const enabled = validateSync(
      Object.assign(new ConfigVariables(), {
        MANAGED_EMAIL_ENABLED: true,
        MANAGED_EMAIL_CATALOG: undefined,
        MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY: '',
      }),
      { strictGroups: true },
    ).map(({ property }) => property);
    expect(enabled).toEqual(
      expect.arrayContaining([
        'MANAGED_EMAIL_CATALOG',
        'MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY',
      ]),
    );
  });

  it('parses an explicit test catalog into its typed value', () => {
    const config = plainToClass(ConfigVariables, {
      MANAGED_EMAIL_CATALOG: JSON.stringify(catalog),
    });

    expect(config.MANAGED_EMAIL_CATALOG).toEqual(catalog);
  });

  it('registers catalog and provider configuration metadata as hidden env-only values', () => {
    const metadata = TypedReflect.getMetadata(
      'config-variables',
      ConfigVariables,
    );

    expect(metadata?.MANAGED_EMAIL_CATALOG).toEqual(
      expect.objectContaining({
        group: ConfigVariablesGroup.MANAGED_PROVIDER_BILLING_CONFIG,
        isEnvOnly: true,
        isHiddenInAdminPanel: true,
      }),
    );
    expect(metadata?.MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY).toEqual(
      expect.objectContaining({
        group: ConfigVariablesGroup.MANAGED_PROVIDER_BILLING_CONFIG,
        isEnvOnly: true,
        isHiddenInAdminPanel: true,
      }),
    );
  });
});
