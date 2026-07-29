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
      'MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID',
      'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS',
      'MANAGED_EMAIL_READINESS_POLICY_VERSION',
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
        ICEMAIL_API_BASE_URL: 'https://ice.example',
        ICEMAIL_API_KEY: 'key',
        WARMUP_INBOX_API_BASE_URL: 'https://warm.example',
        WARMUP_INBOX_API_KEY: 'key',
        MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS: 'rate-card',
        MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID:
          '123e4567-e89b-42d3-a456-426614174000',
        MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS: [
          '123e4567-e89b-42d3-a456-426614174000',
        ],
        MANAGED_EMAIL_READINESS_POLICY_VERSION: 'v1',
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
        'MANAGED_EMAIL_METRONOME_STRIPE_DELIVERY_METHOD_ID',
        'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS',
        'MANAGED_EMAIL_READINESS_POLICY_VERSION',
      ]),
    );
  });
});
