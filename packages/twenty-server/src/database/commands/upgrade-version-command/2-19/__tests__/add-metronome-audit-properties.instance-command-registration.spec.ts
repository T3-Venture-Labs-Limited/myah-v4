import { INSTANCE_COMMANDS } from 'src/database/commands/upgrade-version-command/instance-commands.constant';

import { AddMetronomeAuditPropertiesFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784487000000-add-metronome-audit-properties';

describe('managed provider metronome audit migration registration', () => {
  it('registers the repair command in the instance command registry', () => {
    expect(
      INSTANCE_COMMANDS.some(
        (command) =>
          command.name === AddMetronomeAuditPropertiesFastInstanceCommand.name,
      ),
    ).toBe(true);
  });
});
