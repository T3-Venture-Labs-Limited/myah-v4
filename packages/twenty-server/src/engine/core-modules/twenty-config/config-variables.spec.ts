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
  it('requires all managed OpenRouter credentials and product mappings when enabled', () => {
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
        'MANAGED_OPENROUTER_CASH_PAID_MICROUSD',
        'MANAGED_OPENROUTER_USABLE_CREDITS_MICROUSD',
        'MANAGED_OPENROUTER_MULTIPLIER_EVIDENCE_VERSION',
      ]),
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
