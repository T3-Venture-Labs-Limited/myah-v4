import { type QueryRunner } from 'typeorm';

import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';
import { AddInstagramMessageV3SnapshotFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789633748004-add-instagram-message-v3-snapshot';
import { getRegisteredInstanceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';

describe('AddInstagramMessageV3SnapshotFastInstanceCommand', () => {
  it('registers and creates an immutable, fail-closed v3 snapshot contract', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new AddInstagramMessageV3SnapshotFastInstanceCommand().up({
      query,
    } as unknown as QueryRunner);
    const sql = query.mock.calls
      .map(([statement]) => statement as string)
      .join('\n');

    expect(
      INSTANCE_COMMANDS.filter(
        (command) =>
          command === AddInstagramMessageV3SnapshotFastInstanceCommand,
      ),
    ).toHaveLength(1);
    expect(
      getRegisteredInstanceCommandMetadata(
        AddInstagramMessageV3SnapshotFastInstanceCommand,
      ),
    ).toEqual({
      version: '2.20.0',
      timestamp: 1789633748004,
      type: 'fast',
      runAfterWorkspace: false,
    });
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "instagramMessageSnapshot" jsonb',
    );
    expect(sql).toContain(
      "jsonb_typeof(\"instagramMessageSnapshot\"->'providerMessagingId') = 'string'",
    );
    expect(sql).toContain(
      "\"instagramMessageSnapshot\"->>'publicIdentifier' ~ '^[a-z0-9._]{1,30}$'",
    );
    expect(sql).toContain(
      "position('..' in \"instagramMessageSnapshot\"->>'publicIdentifier') = 0",
    );
    expect(
      sql.match(/"interactionContextType" = 'MYAH_INBOX_INSTAGRAM_DRAFT'/g),
    ).toHaveLength(1);
    expect(sql).toContain(
      '"interactionContextType" = \'MYAH_INSTAGRAM_MESSAGE_DRAFT\'',
    );
    expect(sql).toContain('"composerInputDigest" IS NULL');
    expect(sql).toContain('"actionVersion" = 3');
    expect(sql).toContain('"actionKind" = \'START_CHAT\'');
    expect(sql).toContain('"actionKind" = \'REPLY\'');
    expect(sql).toContain(') IS TRUE)');
    expect(sql).toContain('Instagram message identity snapshot is immutable');
  });

  it('restores the v2-only interaction context constraint on an empty rollback and remains reentrant', async () => {
    const query = jest.fn().mockResolvedValue([{ count: 0 }]);
    const command = new AddInstagramMessageV3SnapshotFastInstanceCommand();

    await command.up({ query } as unknown as QueryRunner);
    await command.down({ query } as unknown as QueryRunner);
    await command.up({ query } as unknown as QueryRunner);
    await command.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement as string);
    const rollbackContextConstraints = sql.filter(
      (statement) =>
        statement.includes(
          'DROP CONSTRAINT IF EXISTS "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"',
        ) &&
        statement.includes(
          'ADD CONSTRAINT "CHK_ACTION_APPROVAL_BINDING_INTERACTION_CONTEXT"',
        ) &&
        statement.includes('"actionVersion" = 2'),
    );
    expect(rollbackContextConstraints).toHaveLength(2);
    expect(
      rollbackContextConstraints.every(
        (statement) => !statement.includes('"actionVersion" = 3'),
      ),
    ).toBe(true);
  });

  it('does not remove populated v3 snapshots on rollback', async () => {
    const query = jest.fn().mockResolvedValue([{ count: 1 }]);
    await expect(
      new AddInstagramMessageV3SnapshotFastInstanceCommand().down({
        query,
      } as unknown as QueryRunner),
    ).rejects.toThrow('Cannot roll back populated Instagram v3 snapshots');
  });
});
