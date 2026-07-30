import { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

const PREFERENCE_KEYS = [
  'AI_MODELS_DEFAULT_FAST',
  'AI_MODELS_DEFAULT_SMART',
  'AI_MODELS_DEFAULT_RECOMMENDED',
  'AI_MODELS_DEFAULT_DISABLED',
] as const;

@RegisteredInstanceCommand('2.19.0', 1784485121001, { type: 'slow' })
export class MigrateOpenRouterModelPreferencesSlowInstanceCommand
  implements SlowInstanceCommand
{
  public async runDataMigration(dataSource: DataSource): Promise<void> {
    for (const key of PREFERENCE_KEYS) {
      await dataSource.query(
        `UPDATE "core"."keyValuePair"
         SET "value" = (
           SELECT jsonb_agg(
             to_jsonb(
               CASE
                 WHEN model_id LIKE 'openrouter/%'
                   THEN 'openrouter-custom/' || substring(model_id FROM length('openrouter/') + 1)
                 ELSE model_id
               END
             ) ORDER BY ordinal
           )
           FROM jsonb_array_elements_text("value") WITH ORDINALITY AS models(model_id, ordinal)
         )
         WHERE "type" = 'CONFIG_VARIABLE'
           AND "key" = $1
           AND jsonb_typeof("value") = 'array'
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements_text("value") AS models(model_id)
             WHERE model_id LIKE 'openrouter/%'
           )`,
        [key],
      );
    }
  }

  public async up(_queryRunner: QueryRunner): Promise<void> {}

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
