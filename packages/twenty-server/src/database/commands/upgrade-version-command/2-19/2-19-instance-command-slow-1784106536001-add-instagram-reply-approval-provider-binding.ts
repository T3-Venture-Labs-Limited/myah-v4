import { QueryRunner } from 'typeorm';
import { ensureInstagramReplyApprovalSchema } from './ensure-instagram-reply-approval-schema';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

const LEGACY_BINDING = '"core"."instagramReplyApprovalRequest"';
const BINDING = '"core"."actionApprovalBinding"';

const tableExists = async (queryRunner: QueryRunner, table: string) => {
  const rows: unknown = await queryRunner.query(
    'SELECT to_regclass($1) IS NOT NULL AS "exists"',
    [table],
  );

  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !rows[0] ||
    typeof rows[0] !== 'object' ||
    !('exists' in rows[0]) ||
    typeof rows[0].exists !== 'boolean'
  ) {
    throw new Error('Unexpected table existence query result');
  }

  return rows[0].exists;
};

@RegisteredInstanceCommand('2.19.0', 1784106536001, { type: 'slow' })
export class AddInstagramReplyApprovalProviderBindingSlowInstanceCommand
  implements SlowInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const binding = (await tableExists(queryRunner, BINDING))
      ? BINDING
      : LEGACY_BINDING;

    if (binding === LEGACY_BINDING) {
      await ensureInstagramReplyApprovalSchema(queryRunner);
    }

    await queryRunner.query(
      `ALTER TABLE ${binding} ADD COLUMN IF NOT EXISTS "providerConversationId" text`,
    );
    await queryRunner.query(
      `ALTER TABLE ${binding} ADD COLUMN IF NOT EXISTS "recipientIgsid" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const binding = (await tableExists(queryRunner, BINDING))
      ? BINDING
      : (await tableExists(queryRunner, LEGACY_BINDING))
        ? LEGACY_BINDING
        : undefined;

    if (!binding) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE ${binding} DROP COLUMN IF EXISTS "recipientIgsid"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${binding} DROP COLUMN IF EXISTS "providerConversationId"`,
    );
  }

  public runDataMigration(): Promise<void> {
    return Promise.resolve();
  }
}
