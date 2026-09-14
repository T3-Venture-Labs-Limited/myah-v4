import { VerifyInstagramSecurityCutoverWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789313971534-verify-instagram-security-cutover.command';
import { CreateUnipileInstagramFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1789307619348-create-unipile-instagram-foundation';
import { InvalidateComposioInstagramAuthoritiesSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1789307619363-invalidate-composio-instagram-authorities';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { DiscoveryService } from '@nestjs/core';

import {
  type UpgradeStep,
  UpgradeSequenceReaderService,
} from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { UpgradeCommandRegistryService } from 'src/engine/core-modules/upgrade/services/upgrade-command-registry.service';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';

const VERSION = TWENTY_CURRENT_VERSION;

@RegisteredWorkspaceCommand(VERSION, 1770000000000)
class MinimalWorkspaceCommand {
  async runOnWorkspace(): Promise<void> {}
}

const buildProviderWrapper = (instance: object) => ({
  instance,
  metatype: instance.constructor,
});

const buildServiceWithMockedSequence = async (
  mockSequence: UpgradeStep[],
): Promise<UpgradeSequenceReaderService> => {
  const module = await Test.createTestingModule({
    providers: [
      UpgradeSequenceReaderService,
      UpgradeCommandRegistryService,
      {
        provide: DiscoveryService,
        useValue: {
          getProviders: () =>
            [new MinimalWorkspaceCommand()].map(buildProviderWrapper),
        },
      },
    ],
  }).compile();

  const registryService = module.get(UpgradeCommandRegistryService);

  registryService.onModuleInit();

  const service = module.get(UpgradeSequenceReaderService);

  jest.spyOn(service, 'getUpgradeSequence').mockReturnValue(mockSequence);

  return service;
};

const noopAsync = async () => {};

const makeStep = (kind: UpgradeStep['kind'], name: string): UpgradeStep => {
  const command =
    kind === 'workspace'
      ? { runOnWorkspace: noopAsync }
      : kind === 'slow-instance'
        ? { up: noopAsync, down: noopAsync, runDataMigration: noopAsync }
        : { up: noopAsync, down: noopAsync };

  return {
    kind,
    name,
    command,
    version: VERSION,
    timestamp: 0,
  } as unknown as UpgradeStep;
};

const makeFastInstance = (name: string) => makeStep('fast-instance', name);
const makeWorkspace = (name: string) => makeStep('workspace', name);

describe('UpgradeSequenceReaderService', () => {
  describe('getInitialCursorForNewWorkspace', () => {
    it('should return last workspace command of segment following completed instance command', async () => {
      const sequence = [
        makeFastInstance('Ic0'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
        makeWorkspace('Wc2'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Wc2', status: 'completed' });
    });

    it('should return the instance command itself when next step is another instance command', async () => {
      const sequence = [
        makeWorkspace('Wc-1'),
        makeFastInstance('Ic0'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Ic0', status: 'completed' });
    });

    it('should return last workspace command when all instance commands in batch are completed', async () => {
      const sequence = [
        makeWorkspace('Wc-1'),
        makeFastInstance('Ic0'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic1',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Wc1', status: 'completed' });
    });

    it('should stop at next instance command boundary', async () => {
      const sequence = [
        makeFastInstance('Ic0'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc2'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Wc1', status: 'completed' });
    });

    it('should return the instance command itself when at end of sequence', async () => {
      const sequence = [makeWorkspace('Wc0'), makeFastInstance('Ic0')];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Ic0', status: 'completed' });
    });

    it('should return the instance command itself when no workspace command exists before it', async () => {
      const sequence = [
        makeFastInstance('Ic0'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc0'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Ic0', status: 'completed' });
    });

    it('should return final segment when last instance command is completed', async () => {
      const sequence = [
        makeWorkspace('Wc0'),
        makeFastInstance('Ic0'),
        makeWorkspace('Wc1'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc2'),
        makeWorkspace('Wc3'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic1',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Wc3', status: 'completed' });
    });

    it('should handle single workspace command in segment', async () => {
      const sequence = [
        makeFastInstance('Ic0'),
        makeWorkspace('Wc0'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc1'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Wc0', status: 'completed' });
    });

    it('should return the instance command itself when sequence ends with instance commands batch', async () => {
      const sequence = [
        makeFastInstance('Ic0'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
        makeFastInstance('Ic1'),
        makeFastInstance('Ic2'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic2',
        status: 'completed',
      });

      expect(result).toEqual({ name: 'Ic2', status: 'completed' });
    });

    it('should return the failed instance command when IC failed — not skip forward to WC segment', async () => {
      // Sequence: Ic0 → Ic1 → Wc0 → Wc1
      // Ic1 failed → cursor stays at Ic1:failed (does NOT skip to Wc1)
      const sequence = [
        makeFastInstance('Ic0'),
        makeFastInstance('Ic1'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic1',
        status: 'failed',
      });

      expect(result).toEqual({ name: 'Ic1', status: 'failed' });
    });

    it('should return the failed instance command even when next step is a workspace command', async () => {
      // Sequence: Ic0 → Wc0 → Wc1
      // Ic0 failed → cursor stays at Ic0:failed
      const sequence = [
        makeFastInstance('Ic0'),
        makeWorkspace('Wc0'),
        makeWorkspace('Wc1'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic0',
        status: 'failed',
      });

      expect(result).toEqual({ name: 'Ic0', status: 'failed' });
    });

    it('should return the failed mid-segment instance command', async () => {
      // Sequence: Ic0 → Ic1 → Ic2 → Wc0
      // Ic1 failed (Ic0 completed but Ic1 is the last attempted) → cursor at Ic1:failed
      const sequence = [
        makeFastInstance('Ic0'),
        makeFastInstance('Ic1'),
        makeFastInstance('Ic2'),
        makeWorkspace('Wc0'),
      ];

      const service = await buildServiceWithMockedSequence(sequence);

      const result = service.getInitialCursorForNewWorkspace({
        name: 'Ic1',
        status: 'failed',
      });

      expect(result).toEqual({ name: 'Ic1', status: 'failed' });
    });
  });
});

const INSTAGRAM_FAST_D =
  '2.20.0_CreateUnipileInstagramFoundationFastInstanceCommand_1799201000000';
const INSTAGRAM_SLOW_D =
  '2.20.0_InvalidateComposioInstagramAuthoritiesSlowInstanceCommand_1799201004000';
const INSTAGRAM_WORKSPACE_D =
  '2.20.0_BackfillComposioInstagramHistoryWorkspaceCommand_1799201012000';

// Reflect real command prototypes only; these fixtures never invoke production command bodies.
const buildInstagramSequenceReader = () => {
  const providers = [
    CreateUnipileInstagramFoundationFastInstanceCommand,
    InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
    BackfillComposioInstagramHistoryWorkspaceCommand,
  ].map((metatype) => ({
    metatype,
    instance: Object.create(metatype.prototype),
  }));
  const registry = new UpgradeCommandRegistryService({
    getProviders: () => providers,
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  const reader = new UpgradeSequenceReaderService(registry);
  expect(reader.getUpgradeSequence().map(({ timestamp }) => timestamp)).toEqual(
    [1789307619348, 1789307619363, 1789307619373],
  );
  return reader;
};

describe('Instagram durable sequence cursors', () => {
  it('resolves old instance/workspace names and rejects corrected source names as history', () => {
    const reader = buildInstagramSequenceReader();
    const sequence = reader.getUpgradeSequence();
    expect(sequence.map(({ name }) => name)).toEqual([
      INSTAGRAM_FAST_D,
      INSTAGRAM_SLOW_D,
      INSTAGRAM_WORKSPACE_D,
    ]);
    sequence.forEach((step, index) => {
      expect(
        reader.locateStepInSequenceOrThrow({ sequence, stepName: step.name }),
      ).toBe(index);
      expect(() =>
        reader.locateStepInSequenceOrThrow({
          sequence,
          stepName: `${step.version}_${step.command.constructor.name}_${step.timestamp}`,
        }),
      ).toThrow('not found');
    });
    expect(
      reader.getInitialCursorForNewWorkspace({
        name: INSTAGRAM_SLOW_D,
        status: 'completed',
      }),
    ).toEqual({ name: INSTAGRAM_WORKSPACE_D, status: 'completed' });
    expect(
      reader.getInitialCursorForNewWorkspace({
        name: INSTAGRAM_SLOW_D,
        status: 'failed',
      }),
    ).toEqual({ name: INSTAGRAM_SLOW_D, status: 'failed' });
  });
  it.each(['completed', 'failed'] as const)(
    'preserves %s workspace pending slices at old D',
    (status) => {
      const reader = buildInstagramSequenceReader();
      const workspaceCommands = reader
        .getUpgradeSequence()
        .filter((step) => step.kind === 'workspace');
      const pending = reader.getPendingWorkspaceCommands({
        workspaceCommands,
        workspaceCursor: { name: INSTAGRAM_WORKSPACE_D, status },
      });
      expect(pending.map(({ name }) => name)).toEqual(
        status === 'completed' ? [] : [INSTAGRAM_WORKSPACE_D],
      );
    },
  );
});

const VERIFIER_E9 =
  '2.20.0_VerifyInstagramSecurityCutoverWorkspaceCommand_1789313971534';
const buildForwardReader = () => {
  const providers = [
    CreateUnipileInstagramFoundationFastInstanceCommand,
    InvalidateComposioInstagramAuthoritiesSlowInstanceCommand,
    BackfillComposioInstagramHistoryWorkspaceCommand,
    VerifyInstagramSecurityCutoverWorkspaceCommand,
  ].map((metatype) => ({
    metatype,
    instance: Object.create(metatype.prototype),
  }));
  const registry = new UpgradeCommandRegistryService({
    getProviders: () => providers,
  } as unknown as DiscoveryService);
  registry.onModuleInit();
  return new UpgradeSequenceReaderService(registry);
};

describe('Instagram appended forward verifier cursors', () => {
  it.each([
    {
      name: INSTAGRAM_WORKSPACE_D,
      status: 'completed' as const,
      pending: [VERIFIER_E9],
    },
    {
      name: INSTAGRAM_WORKSPACE_D,
      status: 'failed' as const,
      pending: [INSTAGRAM_WORKSPACE_D, VERIFIER_E9],
    },
    { name: VERIFIER_E9, status: 'failed' as const, pending: [VERIFIER_E9] },
    { name: VERIFIER_E9, status: 'completed' as const, pending: [] },
    {
      name: INSTAGRAM_SLOW_D,
      status: 'completed' as const,
      pending: [INSTAGRAM_WORKSPACE_D, VERIFIER_E9],
    },
  ])(
    'resolves $name $status without alias or replay',
    ({ name, status, pending }) => {
      const reader = buildForwardReader();
      expect(
        reader
          .getPendingWorkspaceCommands({
            workspaceCommands: reader
              .getUpgradeSequence()
              .filter((step) => step.kind === 'workspace'),
            workspaceCursor: { name, status },
          })
          .map((step) => step.name),
      ).toEqual(pending);
      expect(
        reader.getUpgradeSequence()[reader.getUpgradeSequence().length - 1]
          ?.timestamp,
      ).toBe(1789313971534);
    },
  );

  it('new initial cursor may skip physical verification, requiring the operational sweep', () => {
    const reader = buildForwardReader();
    expect(
      reader.getInitialCursorForNewWorkspace({
        name: INSTAGRAM_SLOW_D,
        status: 'completed',
      }),
    ).toEqual({ name: VERIFIER_E9, status: 'completed' });
    expect(
      reader.getInitialCursorForNewWorkspace({
        name: INSTAGRAM_SLOW_D,
        status: 'failed',
      }),
    ).toEqual({ name: INSTAGRAM_SLOW_D, status: 'failed' });
  });
});
