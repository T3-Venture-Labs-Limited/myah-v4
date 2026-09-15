import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { DiscoveryService } from '@nestjs/core';

import { type DataSource } from 'typeorm';

import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';
import { AddInstagramReplyApprovalProviderBindingSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-slow-1784106536001-add-instagram-reply-approval-provider-binding';
import { TWENTY_PREVIOUS_VERSIONS } from 'src/engine/core-modules/upgrade/constants/twenty-previous-versions.constant';

const VERSION_A = TWENTY_CURRENT_VERSION;
const VERSION_B = TWENTY_PREVIOUS_VERSIONS[0];

@RegisteredInstanceCommand(VERSION_A, 1770000000000)
class MigrationA1770000000000 implements FastInstanceCommand {
  name = 'MigrationA1770000000000';

  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

@RegisteredInstanceCommand(VERSION_A, 1771000000000)
class MigrationB1771000000000 implements FastInstanceCommand {
  name = 'MigrationB1771000000000';

  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

@RegisteredInstanceCommand(VERSION_A, 1772000000000)
class MigrationC1772000000000 implements FastInstanceCommand {
  name = 'MigrationC1772000000000';

  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

@RegisteredInstanceCommand(VERSION_B, 1769000000000)
class MigrationD1769000000000 implements FastInstanceCommand {
  name = 'MigrationD1769000000000';

  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

class UndecoratedMigration1768000000000 implements FastInstanceCommand {
  name = 'UndecoratedMigration1768000000000';

  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

@RegisteredWorkspaceCommand(VERSION_A, 1773000000000)
class WorkspaceCommandA {
  async runOnWorkspace(): Promise<void> {}
}

@RegisteredWorkspaceCommand(VERSION_A, 1774000000000)
class WorkspaceCommandB {
  async runOnWorkspace(): Promise<void> {}
}

const buildProviderWrapper = (instance: object) => ({
  instance,
  metatype: instance.constructor,
});

const buildRegistryService = async (
  instances: object[],
): Promise<UpgradeCommandRegistryService> => {
  const module = await Test.createTestingModule({
    providers: [
      UpgradeCommandRegistryService,
      {
        provide: DiscoveryService,
        useValue: {
          getProviders: () => instances.map(buildProviderWrapper),
        },
      },
    ],
  }).compile();

  const service = module.get(UpgradeCommandRegistryService);

  service.onModuleInit();

  return service;
};

describe('UpgradeCommandRegistryService', () => {
  it('should group instance migrations by version', async () => {
    const service = await buildRegistryService([
      new MigrationD1769000000000(),
      new MigrationA1770000000000(),
      new MigrationB1771000000000(),
      new MigrationC1772000000000(),
      new WorkspaceCommandA(),
    ]);

    const bundleB = service.getBundleForVersion(VERSION_B);
    const bundleA = service.getBundleForVersion(VERSION_A);

    expect(
      bundleB.fastInstanceCommands.map(
        (entry) => entry.command.constructor.name,
      ),
    ).toStrictEqual(['MigrationD1769000000000']);

    expect(
      bundleA.fastInstanceCommands.map(
        (entry) => entry.command.constructor.name,
      ),
    ).toStrictEqual([
      'MigrationA1770000000000',
      'MigrationB1771000000000',
      'MigrationC1772000000000',
    ]);
  });

  it('should sort migrations by timestamp within a version bucket', async () => {
    const service = await buildRegistryService([
      new MigrationC1772000000000(),
      new MigrationA1770000000000(),
      new MigrationB1771000000000(),
      new WorkspaceCommandA(),
    ]);

    const names = service
      .getBundleForVersion(VERSION_A)
      .fastInstanceCommands.map((entry) => entry.command.constructor.name);

    expect(names).toStrictEqual([
      'MigrationA1770000000000',
      'MigrationB1771000000000',
      'MigrationC1772000000000',
    ]);
  });

  it('should skip undecorated providers', async () => {
    const service = await buildRegistryService([
      new UndecoratedMigration1768000000000(),
      new MigrationA1770000000000(),
      new WorkspaceCommandA(),
    ]);

    const bundleA = service.getBundleForVersion(VERSION_A);

    expect(bundleA.fastInstanceCommands).toHaveLength(1);
    expect(bundleA.fastInstanceCommands[0].command.constructor.name).toBe(
      'MigrationA1770000000000',
    );
  });

  it('should throw when no workspace commands are discovered', async () => {
    await expect(buildRegistryService([])).rejects.toThrow(
      'Upgrade sequence must contain at least one workspace command',
    );
  });

  it('should return empty array for unsupported version', async () => {
    const service = await buildRegistryService([new WorkspaceCommandA()]);

    expect(
      service.getBundleForVersion('99.0.0' as typeof VERSION_A)
        .fastInstanceCommands,
    ).toStrictEqual([]);
  });

  it('should discover workspace commands and sort by timestamp', async () => {
    const service = await buildRegistryService([
      new WorkspaceCommandB(),
      new WorkspaceCommandA(),
    ]);

    const { workspaceCommands } = service.getBundleForVersion(VERSION_A);

    expect(
      workspaceCommands.map((entry) => entry.command.constructor.name),
    ).toStrictEqual(['WorkspaceCommandA', 'WorkspaceCommandB']);
  });

  it('should discover both instance and workspace commands for the same version', async () => {
    const service = await buildRegistryService([
      new MigrationA1770000000000(),
      new WorkspaceCommandA(),
      new MigrationB1771000000000(),
      new WorkspaceCommandB(),
    ]);

    const bucket = service.getBundleForVersion(VERSION_A);

    expect(bucket.fastInstanceCommands).toHaveLength(2);
    expect(bucket.workspaceCommands).toHaveLength(2);
  });

  it('should allow same timestamp across different kinds', async () => {
    @RegisteredWorkspaceCommand(VERSION_A, 1770000000000)
    class WorkspaceCommandSameTimestamp {
      async runOnWorkspace(): Promise<void> {}
    }

    const service = await buildRegistryService([
      new MigrationA1770000000000(),
      new WorkspaceCommandSameTimestamp(),
    ]);

    const bucket = service.getBundleForVersion(VERSION_A);

    expect(bucket.fastInstanceCommands).toHaveLength(1);
    expect(bucket.workspaceCommands).toHaveLength(1);
  });

  it('should throw on duplicate timestamps within the same kind', async () => {
    @RegisteredInstanceCommand(VERSION_A, 1770000000000)
    class DuplicateInstanceTimestamp implements FastInstanceCommand {
      name = 'DuplicateInstanceTimestamp';

      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    await expect(
      buildRegistryService([
        new MigrationA1770000000000(),
        new DuplicateInstanceTimestamp(),
      ]),
    ).rejects.toThrow(
      'Duplicate fast-instance command timestamp 1770000000000',
    );
  });

  it('should throw on duplicate computed names across kinds', async () => {
    @RegisteredWorkspaceCommand(VERSION_A, 1770000000000)
    class MigrationA1770000000000_WS {
      async runOnWorkspace(): Promise<void> {}
    }

    Object.defineProperty(MigrationA1770000000000_WS, 'name', {
      value: 'MigrationA1770000000000',
    });

    await expect(
      buildRegistryService([
        new MigrationA1770000000000(),
        new MigrationA1770000000000_WS(),
      ]),
    ).rejects.toThrow(
      `Duplicate upgrade command name "${VERSION_A}_MigrationA1770000000000_1770000000000"`,
    );
  });

  it('should return all instance commands across versions sorted by timestamp', async () => {
    const service = await buildRegistryService([
      new MigrationC1772000000000(),
      new MigrationD1769000000000(),
      new MigrationA1770000000000(),
      new MigrationB1771000000000(),
      new WorkspaceCommandA(),
    ]);

    const allCommands = service.getCrossUpgradeSupportedFastInstanceCommands();

    expect(allCommands.map((entry) => entry.name)).toStrictEqual([
      `${VERSION_B}_MigrationD1769000000000_1769000000000`,
      `${VERSION_A}_MigrationA1770000000000_1770000000000`,
      `${VERSION_A}_MigrationB1771000000000_1771000000000`,
      `${VERSION_A}_MigrationC1772000000000_1772000000000`,
    ]);
  });

  it('should return empty array from getCrossUpgradeSupportedFastInstanceCommands when no instance commands registered', async () => {
    const service = await buildRegistryService([new WorkspaceCommandA()]);

    expect(
      service.getCrossUpgradeSupportedFastInstanceCommands(),
    ).toStrictEqual([]);
  });

  it('should allow same class name with different timestamps across kinds', async () => {
    @RegisteredWorkspaceCommand(VERSION_A, 1790000000000)
    class MigrationA1770000000000_WS {
      async runOnWorkspace(): Promise<void> {}
    }

    Object.defineProperty(MigrationA1770000000000_WS, 'name', {
      value: 'MigrationA1770000000000',
    });

    const service = await buildRegistryService([
      new MigrationA1770000000000(),
      new MigrationA1770000000000_WS(),
    ]);

    const bucket = service.getBundleForVersion(VERSION_A);

    expect(bucket.fastInstanceCommands).toHaveLength(1);
    expect(bucket.workspaceCommands).toHaveLength(1);
  });

  it('should discover slow instance commands and sort by timestamp', async () => {
    @RegisteredInstanceCommand(VERSION_A, 1780000000000, { type: 'slow' })
    class SlowMigrationB1780000000000 implements SlowInstanceCommand {
      name = 'SlowMigrationB1780000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    @RegisteredInstanceCommand(VERSION_A, 1779000000000, { type: 'slow' })
    class SlowMigrationA1779000000000 implements SlowInstanceCommand {
      name = 'SlowMigrationA1779000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    const service = await buildRegistryService([
      new SlowMigrationB1780000000000(),
      new SlowMigrationA1779000000000(),
      new WorkspaceCommandA(),
    ]);

    const { slowInstanceCommands } = service.getBundleForVersion(VERSION_A);

    expect(
      slowInstanceCommands.map((entry) => entry.command.constructor.name),
    ).toStrictEqual([
      'SlowMigrationA1779000000000',
      'SlowMigrationB1780000000000',
    ]);
  });

  it('should separate fast and slow instance commands in the same version', async () => {
    @RegisteredInstanceCommand(VERSION_A, 1780000000000, { type: 'slow' })
    class SlowMigration1780000000000 implements SlowInstanceCommand {
      name = 'SlowMigration1780000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    const service = await buildRegistryService([
      new MigrationA1770000000000(),
      new SlowMigration1780000000000(),
      new WorkspaceCommandA(),
    ]);

    const bucket = service.getBundleForVersion(VERSION_A);

    expect(bucket.fastInstanceCommands).toHaveLength(1);
    expect(bucket.slowInstanceCommands).toHaveLength(1);
  });

  it('should throw on duplicate timestamps within slow instance commands', async () => {
    @RegisteredInstanceCommand(VERSION_A, 1780000000000, { type: 'slow' })
    class SlowMigrationA1780000000000 implements SlowInstanceCommand {
      name = 'SlowMigrationA1780000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    @RegisteredInstanceCommand(VERSION_A, 1780000000000, { type: 'slow' })
    class SlowMigrationB1780000000000 implements SlowInstanceCommand {
      name = 'SlowMigrationB1780000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    await expect(
      buildRegistryService([
        new SlowMigrationA1780000000000(),
        new SlowMigrationB1780000000000(),
      ]),
    ).rejects.toThrow(
      'Duplicate slow-instance command timestamp 1780000000000',
    );
  });

  it('should allow same timestamp across fast and slow instance commands', async () => {
    @RegisteredInstanceCommand(VERSION_A, 1770000000000, { type: 'slow' })
    class SlowMigrationSameTimestamp implements SlowInstanceCommand {
      name = 'SlowMigrationSameTimestamp';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    const service = await buildRegistryService([
      new MigrationA1770000000000(),
      new SlowMigrationSameTimestamp(),
      new WorkspaceCommandA(),
    ]);

    const bucket = service.getBundleForVersion(VERSION_A);

    expect(bucket.fastInstanceCommands).toHaveLength(1);
    expect(bucket.slowInstanceCommands).toHaveLength(1);
  });

  it('should return all slow instance commands across versions', async () => {
    @RegisteredInstanceCommand(VERSION_A, 1780000000000, { type: 'slow' })
    class SlowMigration1780000000000 implements SlowInstanceCommand {
      name = 'SlowMigration1780000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    @RegisteredInstanceCommand(VERSION_B, 1768000000000, { type: 'slow' })
    class SlowMigration1768000000000 implements SlowInstanceCommand {
      name = 'SlowMigration1768000000000';

      async runDataMigration(_dataSource: DataSource): Promise<void> {}
      async up(): Promise<void> {}
      async down(): Promise<void> {}
    }

    const service = await buildRegistryService([
      new SlowMigration1780000000000(),
      new SlowMigration1768000000000(),
      new WorkspaceCommandA(),
    ]);

    const allSlowCommands =
      service.getCrossUpgradeSupportedSlowInstanceCommands();

    expect(allSlowCommands.map((entry) => entry.name)).toStrictEqual([
      `${VERSION_B}_SlowMigration1768000000000_1768000000000`,
      `${VERSION_A}_SlowMigration1780000000000_1780000000000`,
    ]);
  });

  it('keeps the Instagram reply provider binding in the pre-workspace slow segment', async () => {
    const service = await buildRegistryService([
      new AddInstagramReplyApprovalProviderBindingSlowInstanceCommand(),
      new WorkspaceCommandA(),
    ]);

    const bundle = service.getBundleForVersion('2.19.0');

    expect(
      bundle.slowInstanceCommands.map(
        (entry) => entry.command.constructor.name,
      ),
    ).toStrictEqual([
      'AddInstagramReplyApprovalProviderBindingSlowInstanceCommand',
    ]);
  });
});

const INSTAGRAM_IDENTITIES = [
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'CreateUnipileInstagramFoundationFastInstanceCommand',
    timestamp: 1789307619348,
    durableName:
      '2.20.0_CreateUnipileInstagramFoundationFastInstanceCommand_1799201000000',
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'AddUnipileInstagramSyncStateFastInstanceCommand',
    timestamp: 1789307619352,
    durableName:
      '2.20.0_AddUnipileInstagramSyncStateFastInstanceCommand_1799201001000',
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'CreateInstagramActionBudgetFastInstanceCommand',
    timestamp: 1789307619356,
    durableName:
      '2.20.0_CreateInstagramActionBudgetFastInstanceCommand_1799201002000',
  },
  {
    version: '2.20.0',
    kind: 'fast-instance',
    className: 'AddInstagramDirectActionContextFastInstanceCommand',
    timestamp: 1789307619359,
    durableName:
      '2.20.0_AddInstagramDirectActionContextFastInstanceCommand_1799201003000',
  },
  {
    version: '2.20.0',
    kind: 'slow-instance',
    className: 'InvalidateComposioInstagramAuthoritiesSlowInstanceCommand',
    timestamp: 1789307619363,
    durableName:
      '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000',
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'SynchronizeInstagramMessagePermissionsCommand',
    timestamp: 1789307619366,
    durableName:
      '2.20.0_SynchronizeInstagramMessagePermissionsCommand_1799201011000',
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'InvalidateComposioInstagramAuthoritiesWorkspaceCommand',
    timestamp: 1789307619370,
    durableName:
      '2.20.0_InvalidateComposioInstagramAuthoritiesWorkspaceCommand_1799201011500',
  },
  {
    version: '2.20.0',
    kind: 'workspace',
    className: 'BackfillComposioInstagramHistoryWorkspaceCommand',
    timestamp: 1789307619373,
    durableName:
      '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000',
  },
] as const;

const buildInstagramProvider = (entry: {
  version: string;
  kind: string;
  className: string;
  timestamp: number;
}) => {
  class MetadataOnlyCommand {}
  Object.defineProperty(MetadataOnlyCommand, 'name', {
    value: entry.className,
  });
  if (entry.kind === 'workspace') {
    RegisteredWorkspaceCommand(
      entry.version as typeof VERSION_A,
      entry.timestamp,
    )(MetadataOnlyCommand);
  } else {
    RegisteredInstanceCommand(
      entry.version as typeof VERSION_A,
      entry.timestamp,
      {
        type: entry.kind === 'slow-instance' ? 'slow' : 'fast',
      },
    )(MetadataOnlyCommand);
  }
  return new MetadataOnlyCommand();
};

describe('Instagram 2.20 durable identities', () => {
  it('substitutes all eight exact tuples, keeping corrected scheduling and old durable order', async () => {
    const registry = await buildRegistryService([
      ...[...INSTAGRAM_IDENTITIES].reverse().map(buildInstagramProvider),
      new MigrationA1770000000000(),
      new WorkspaceCommandA(),
    ]);
    const bundle = registry.getBundleForVersion('2.20.0');
    const entries = [
      ...bundle.fastInstanceCommands,
      ...bundle.slowInstanceCommands,
      ...bundle.workspaceCommands,
    ];
    const mapped = entries.filter((entry) =>
      INSTAGRAM_IDENTITIES.some(
        (identity) => identity.className === entry.command.constructor.name,
      ),
    );
    expect(mapped.map(({ name }) => name)).toEqual(
      INSTAGRAM_IDENTITIES.map(({ durableName }) => durableName),
    );
    expect(mapped.map(({ timestamp }) => timestamp)).toEqual(
      INSTAGRAM_IDENTITIES.map(({ timestamp }) => timestamp),
    );
    expect(mapped.map(({ version }) => version)).toEqual(
      INSTAGRAM_IDENTITIES.map(({ version }) => version),
    );
    expect(bundle.fastInstanceCommands.slice(-1)[0]?.name).toBe(
      INSTAGRAM_IDENTITIES[3].durableName,
    );
    expect(bundle.slowInstanceCommands.slice(-1)[0]?.name).toBe(
      INSTAGRAM_IDENTITIES[4].durableName,
    );
    expect(bundle.workspaceCommands.slice(-1)[0]?.name).toBe(
      INSTAGRAM_IDENTITIES[7].durableName,
    );
  });

  it.each(INSTAGRAM_IDENTITIES)(
    'permits partial discovery of $className',
    async (entry) => {
      const registry = await buildRegistryService([
        buildInstagramProvider(entry),
        new WorkspaceCommandA(),
      ]);
      const bundle = registry.getBundleForVersion('2.20.0');
      expect(
        [
          ...bundle.fastInstanceCommands,
          ...bundle.slowInstanceCommands,
          ...bundle.workspaceCommands,
        ].map(({ name }) => name),
      ).toContain(entry.durableName);
    },
  );

  it.each(
    INSTAGRAM_IDENTITIES.flatMap((entry) => [
      { ...entry, version: '99.0.0' },
      { ...entry, version: '2.19.0' },
      { ...entry, timestamp: entry.timestamp + 1 },
      {
        ...entry,
        timestamp: Number(entry.durableName.split('_').slice(-1)[0]),
      },
      {
        ...entry,
        kind: entry.kind === 'workspace' ? 'fast-instance' : 'workspace',
      },
      {
        ...entry,
        kind:
          entry.kind === 'slow-instance' ? 'fast-instance' : 'slow-instance',
      },
    ]),
  )(
    'rejects reserved $className with $version / $kind / $timestamp',
    async (entry) => {
      await expect(
        buildRegistryService([
          buildInstagramProvider(entry),
          new WorkspaceCommandA(),
        ]),
      ).rejects.toThrow('Instagram upgrade');
    },
  );

  it.each(INSTAGRAM_IDENTITIES)(
    'rejects duplicate corrected $className',
    async (entry) => {
      await expect(
        buildRegistryService([
          buildInstagramProvider(entry),
          buildInstagramProvider(entry),
          new WorkspaceCommandA(),
        ]),
      ).rejects.toThrow('Duplicate');
    },
  );

  it.each(INSTAGRAM_IDENTITIES)(
    'rejects old and corrected $className together',
    async (entry) => {
      await expect(
        buildRegistryService([
          buildInstagramProvider(entry),
          buildInstagramProvider({
            ...entry,
            timestamp: Number(entry.durableName.split('_').slice(-1)[0]),
          }),
          new WorkspaceCommandA(),
        ]),
      ).rejects.toThrow('Instagram upgrade');
    },
  );

  it('retains the no-workspace requirement with a valid partial mapped instance', async () => {
    await expect(
      buildRegistryService([buildInstagramProvider(INSTAGRAM_IDENTITIES[0])]),
    ).rejects.toThrow(
      'Upgrade sequence must contain at least one workspace command',
    );
  });

  it.each([
    [
      'missing entry',
      (entries: Array<Record<string, unknown>>) => entries.slice(1),
    ],
    [
      'extra entry',
      (entries: Array<Record<string, unknown>>) => [...entries, entries[0]],
    ],
    ...['version', 'kind', 'className', 'timestamp', 'durableName'].map(
      (key) =>
        [
          `invalid ${key}`,
          (entries: Array<Record<string, unknown>>) =>
            entries.map((entry, index) =>
              index === 0
                ? { ...entry, [key]: key === 'timestamp' ? NaN : 'invalid' }
                : entry,
            ),
        ] as const,
    ),
    [
      'duplicate source',
      (entries: Array<Record<string, unknown>>) =>
        entries.map((entry, index) =>
          index === 1 ? { ...entries[0] } : entry,
        ),
    ],
    [
      'duplicate durable',
      (entries: Array<Record<string, unknown>>) =>
        entries.map((entry, index) =>
          index === 1
            ? { ...entry, durableName: entries[0].durableName }
            : entry,
        ),
    ],
    [
      'source-durable overlap',
      (entries: Array<Record<string, unknown>>) =>
        entries.map((entry, index) =>
          index === 0 ? { ...entry, timestamp: 1799201000000 } : entry,
        ),
    ],
    [
      'wrong old epoch',
      (entries: Array<Record<string, unknown>>) =>
        entries.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                durableName:
                  '2.20.0_CreateUnipileInstagramFoundationFastInstanceCommand_1799201000001',
              }
            : entry,
        ),
    ],
  ] as const)(
    'rejects malformed fixed configuration: %s even in unrelated discovery',
    (_label, change) => {
      const modulePath =
        'src/engine/core-modules/upgrade/constants/instagram-2-20-upgrade-name-compatibility.constant';
      try {
        jest.doMock(
          modulePath,
          () => ({
            INSTAGRAM_2_20_UPGRADE_NAME_COMPATIBILITY: change(
              INSTAGRAM_IDENTITIES.map((entry) => ({ ...entry })),
            ),
          }),
          { virtual: true },
        );
        jest.isolateModules(() => {
          const {
            UpgradeCommandRegistryService: Registry,
          } = require('src/engine/core-modules/upgrade/services/upgrade-command-registry.service');
          const registry = new Registry({
            getProviders: () => [buildProviderWrapper(new WorkspaceCommandA())],
          });
          expect(() => registry.onModuleInit()).toThrow(
            'Instagram upgrade compatibility',
          );
        });
      } finally {
        jest.dontMock(modulePath);
      }
    },
  );
});
