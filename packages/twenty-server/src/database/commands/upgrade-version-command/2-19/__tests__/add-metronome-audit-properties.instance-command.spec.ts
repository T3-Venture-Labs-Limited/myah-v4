import { type QueryRunner } from 'typeorm';

import { AddMetronomeAuditPropertiesFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784487000000-add-metronome-audit-properties';

describe('AddMetronomeAuditPropertiesFastInstanceCommand', () => {
  it('adds both audit property columns idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new AddMetronomeAuditPropertiesFastInstanceCommand().up(
      { query } as unknown as QueryRunner,
    );

    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      'ALTER TABLE "core"."managedProviderOperation" ADD COLUMN IF NOT EXISTS "maximumMetronomeProperties" jsonb',
      'ALTER TABLE "core"."managedProviderOperation" ADD COLUMN IF NOT EXISTS "actualMetronomeProperties" jsonb',
    ]);
  });

  it('does not remove columns also owned by the amended foundation', async () => {
    const query = jest.fn();

    await new AddMetronomeAuditPropertiesFastInstanceCommand().down({
      query,
    } as unknown as QueryRunner);

    expect(query).not.toHaveBeenCalled();
  });
});
