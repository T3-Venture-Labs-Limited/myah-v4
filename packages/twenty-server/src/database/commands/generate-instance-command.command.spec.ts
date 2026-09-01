import * as fs from 'fs';

import { GenerateInstanceCommandCommand } from 'src/database/commands/generate-instance-command.command';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const mockReadFileSync = jest.mocked(fs.readFileSync);
const mockWriteFileSync = jest.mocked(fs.writeFileSync);

describe('GenerateInstanceCommandCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not create a command file when its class is already registered', async () => {
    const className = 'PendingMigrationCheckFastInstanceCommand';
    mockReadFileSync.mockReturnValue(
      `import { ${className} } from './existing-command';`,
    );
    const command = new GenerateInstanceCommandCommand({
      generateInstanceCommand: jest.fn().mockResolvedValue({
        className,
        fileName: '2-20-instance-command-fast-1-pending-migration-check.ts',
        fileTemplate: 'generated command',
      }),
    } as never);

    await expect(
      command.run([], {
        name: 'pending-migration-check',
        type: 'fast',
        version: '2.20.0',
      }),
    ).rejects.toThrow(
      `${className} is already registered in instance-commands.constant.ts`,
    );
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
