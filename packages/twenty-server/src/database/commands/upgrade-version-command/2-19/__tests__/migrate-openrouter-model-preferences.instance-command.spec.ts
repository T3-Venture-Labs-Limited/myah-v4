import { type DataSource, type QueryRunner } from 'typeorm';

import { MigrateOpenRouterModelPreferencesSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784485121001-migrate-openrouter-model-preferences';

describe('MigrateOpenRouterModelPreferencesSlowInstanceCommand', () => {
  it.each([
    'AI_MODELS_DEFAULT_FAST',
    'AI_MODELS_DEFAULT_SMART',
    'AI_MODELS_DEFAULT_RECOMMENDED',
    'AI_MODELS_DEFAULT_DISABLED',
  ])('migrates suffixed OpenRouter IDs for %s', async (key) => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new MigrateOpenRouterModelPreferencesSlowInstanceCommand();

    await command.runDataMigration({ query } as unknown as DataSource);

    const matchingCall = query.mock.calls.find((call) => call[1]?.[0] === key);
    expect(matchingCall).toBeDefined();
    const statement = matchingCall?.[0] as string;

    expect(statement).toContain("model_id LIKE 'openrouter/%'");
    expect(statement).toContain("'openrouter-custom/' || substring(model_id");
    expect(statement).toContain('jsonb_agg(');
    expect(statement).toContain('ORDER BY ordinal');
    expect(statement).toContain("jsonb_typeof(\"value\") = 'array'");
    expect(statement).toContain('"type" = \'CONFIG_VARIABLE\'');
    expect(statement).toContain('"key" = $1');
  });

  it('registers an idempotent transformation that preserves unrelated and already-custom IDs', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const command = new MigrateOpenRouterModelPreferencesSlowInstanceCommand();

    await command.runDataMigration({ query } as unknown as DataSource);

    expect(query).toHaveBeenCalledTimes(4);
    for (const [statement] of query.mock.calls) {
      expect(statement).toContain('WHERE model_id LIKE \'openrouter/%\'');
      expect(statement).toContain('ELSE model_id');
      expect(statement).toContain('EXISTS');
      expect(statement).toContain('ORDER BY ordinal');
    }
  });

  it('has no destructive down migration', async () => {
    const query = jest.fn();
    const command = new MigrateOpenRouterModelPreferencesSlowInstanceCommand();

    await command.down({ query } as unknown as QueryRunner);

    expect(query).not.toHaveBeenCalled();
  });
});
