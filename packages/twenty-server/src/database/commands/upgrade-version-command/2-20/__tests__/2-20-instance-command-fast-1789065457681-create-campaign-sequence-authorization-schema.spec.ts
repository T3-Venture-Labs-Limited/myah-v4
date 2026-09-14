import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { CreateCampaignSequenceAuthorizationSchemaFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789065457681-create-campaign-sequence-authorization-schema';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

const run = async (direction: 'up' | 'down') => {
  const query = jest.fn().mockResolvedValue(undefined);
  const command = new CreateCampaignSequenceAuthorizationSchemaFastInstanceCommand();

  await command[direction]({ query } as never);

  return query.mock.calls.map(([sql]) => sql as string);
};

describe('CreateCampaignSequenceAuthorizationSchemaFastInstanceCommand', () => {
  it('registers the allocated 2.20 fast command', () => {
    expect(
      getRegisteredInstanceCommandMetadata(
        CreateCampaignSequenceAuthorizationSchemaFastInstanceCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789065457681 });
    expect(INSTANCE_COMMANDS).toContain(
      CreateCampaignSequenceAuthorizationSchemaFastInstanceCommand,
    );
  });

  it('creates only the campaign sequence authorization entity schema', async () => {
    const queries = await run('up');
    const sql = queries.join('\n');

    expect(queries).toHaveLength(4);
    expect(sql).toContain(
      'CREATE TABLE "core"."campaignSequenceAuthorization"',
    );
    expect(sql).toContain('"PK_CAMPAIGN_SEQUENCE_AUTHORIZATION"');
    for (const constraint of [
      'UQ_CSA_SCOPE_AUTHORIZATION',
      'UQ_CSA_SCOPE_AUTH_VERSION',
      'UQ_CSA_SCOPE_START_KEY',
      'UQ_CSA_SCOPE_GENERATION',
      'CHK_CSA_GENERATION_POSITIVE',
      'CHK_CSA_PREPARED_FINGERPRINT',
      'CHK_CSA_STATE',
      'CHK_CSA_REVOCATION_SHAPE',
      'UQ_CSA_ONE_ACTIVE_SCOPE',
    ]) {
      expect(sql).toContain(constraint);
    }
    expect(queries.filter((query) => query.startsWith('CREATE TABLE'))).toEqual([
      expect.stringContaining('"core"."campaignSequenceAuthorization"'),
    ]);
  });

  it('removes the index, table, and enums in dependency order', async () => {
    const queries = await run('down');

    expect(queries).toEqual([
      'DROP INDEX "core"."UQ_CSA_ONE_ACTIVE_SCOPE"',
      'DROP TABLE "core"."campaignSequenceAuthorization"',
      'DROP TYPE "core"."campaignSequenceAuthorization_revocationReason_enum"',
      'DROP TYPE "core"."campaignSequenceAuthorization_state_enum"',
    ]);
  });
});
