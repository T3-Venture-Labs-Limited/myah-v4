import { ForbiddenException } from '@nestjs/common';

import { WorkspaceCommandRunner } from 'src/database/commands/command-runners/workspace.command-runner';
import { DropFavoriteObjectsCommand } from 'src/database/commands/upgrade-version-command/2-7/2-7-workspace-command-1798000030000-drop-favorite-objects.command';
import { AddWorkflowRunStepLogsFieldCommand } from 'src/database/commands/upgrade-version-command/2-9/2-9-workspace-command-1799000035000-add-workflow-run-step-logs-field.command';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  getRegisteredWorkspaceCommandMetadata,
  RegisteredWorkspaceCommand,
} from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { ApplicationSyncService } from 'src/engine/core-modules/application/application-manifest/application-sync.service';

const workspaceId = 'workspace-a';
const otherWorkspaceId = 'workspace-b';
const objectService = Object.create(
  ObjectMetadataService.prototype,
) as ObjectMetadataService;
const fieldService = Object.create(
  FieldMetadataService.prototype,
) as FieldMetadataService;
const applicationService = Object.create(
  ApplicationSyncService.prototype,
) as ApplicationSyncService;

@RegisteredWorkspaceCommand('2.9.0', 1799000035000)
class ProbeCommand extends WorkspaceCommandRunner {
  execute!: () => Promise<void>;
  async runOnWorkspace(): Promise<void> {
    await this.execute();
  }
}

const createCommand = (
  execute: () => Promise<void>,
  iterator?: WorkspaceIteratorService,
) => {
  const command = new ProbeCommand(
    iterator ?? ({} as WorkspaceIteratorService),
    [],
  );
  command.execute = execute;
  return command;
};

const deleteObject = (id = workspaceId) =>
  objectService.deleteOneObject({
    workspaceId: id,
    deleteObjectInput: {} as never,
  });
const createFields = (id = workspaceId) =>
  fieldService.createManyFields({
    workspaceId: id,
    createFieldInputs: [],
  });

const expectDenied = async (action: () => Promise<unknown>) =>
  expect(action()).rejects.toBeInstanceOf(ForbiddenException);

describe('real registered workspace upgrade schema writes', () => {
  const owner = { universalIdentifier: 'standard-app' } as never;
  const application = {
    findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
      .fn()
      .mockResolvedValue({ twentyStandardFlatApplication: owner }),
  } as never;
  const iterator = {
    iterate: async ({
      callback,
    }: {
      callback: (context: {
        workspaceId: string;
        index: number;
        total: number;
      }) => Promise<void>;
    }) => callback({ workspaceId, index: 0, total: 1 }),
  } as unknown as WorkspaceIteratorService;
  const receipt = jest.fn().mockResolvedValue(undefined);
  const invalidate = jest.fn().mockResolvedValue(undefined);
  const runner = new WorkspaceCommandRunnerService(
    { get: () => '2.9.0' } as never,
    { recordUpgradeMigration: receipt } as never,
    { invalidateInstanceAndAllWorkspacesStatus: invalidate } as never,
  );
  const entry = (
    command: WorkspaceCommandRunner,
    version: string,
    timestamp: number,
  ) => {
    expect(getRegisteredWorkspaceCommandMetadata(command.constructor)).toEqual({
      version,
      timestamp,
    });
    return {
      name: `${version}_${command.constructor.name}_${timestamp}`,
      command,
    };
  };
  const context = { workspaceId, index: 0, total: 1 };

  beforeEach(() => {
    receipt.mockClear();
    invalidate.mockClear();
  });

  it('runs the actual 2-7 deletion through the registered sequence with a completed receipt', async () => {
    const deleted = [{ id: 'favorite-id' }, { id: 'folder-id' }];
    const cache = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatObjectMetadataMaps: {
          byUniversalIdentifier: {
            '20202020-ab56-4e05-92a3-e2414a499860': deleted[0],
            '20202020-7cf8-401f-8211-a9587d27fd2d': deleted[1],
          },
        },
      }),
    } as never;
    const deleteMany = jest
      .fn()
      .mockImplementation(async ({ deleteObjectInputs }) => [
        deleted.find(({ id }) => id === deleteObjectInputs[0].id),
      ]);
    const service = Object.create(
      ObjectMetadataService.prototype,
    ) as ObjectMetadataService;
    // Stub the migration/DDL below the real public authority check, not deleteOneObject.
    Object.assign(service, { deleteManyObjectMetadatas: deleteMany });
    const command = new DropFavoriteObjectsCommand(
      iterator,
      application,
      service,
      cache,
    );
    const registered = entry(command, '2.7.0', 1798000030000);

    await expect(
      command.runOnWorkspace({ ...context, options: {} }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleteMany).not.toHaveBeenCalled();
    await runner.runWorkspaceCommands({
      iteratorContext: context,
      options: {},
      workspaceCommands: [registered],
    });
    expect(
      deleteMany.mock.calls.map(([args]) => args.deleteObjectInputs[0].id),
    ).toEqual(['favorite-id', 'folder-id']);
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        ownerFlatApplication: owner,
        isSystemBuild: true,
      }),
    );
    expect(receipt).toHaveBeenCalledWith({
      name: registered.name,
      workspaceIds: [workspaceId],
      isInstance: false,
      status: 'completed',
      executedByVersion: '2.9.0',
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('runs the actual 2-9 field body through the standalone iterator, with a guarded downstream failure', async () => {
    const downstream = new Error('synthetic cache boundary');
    const cache = {
      getOrRecompute: jest
        .fn()
        .mockImplementation(async (_id: string, keys: string[]) => {
          if (keys.includes('flatViewMaps')) throw downstream;
          return {
            flatObjectMetadataMaps: {
              byUniversalIdentifier: {
                [STANDARD_OBJECTS.workflowRun.universalIdentifier]: {
                  id: 'workflow-run-id',
                },
              },
            },
            flatFieldMetadataMaps: { byUniversalIdentifier: {} },
          };
        }),
    };
    const service = Object.create(
      FieldMetadataService.prototype,
    ) as FieldMetadataService;
    (
      service as never as { workspaceCacheService: unknown }
    ).workspaceCacheService = cache;
    const createFieldsSpy = jest.spyOn(service, 'createManyFields');
    const command = new AddWorkflowRunStepLogsFieldCommand(
      iterator,
      application,
      cache as never,
      service,
    );
    entry(command, '2.9.0', 1799000035000);
    await expect(
      command.runOnWorkspace({ ...context, options: {} }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(cache.getOrRecompute).toHaveBeenCalledTimes(1);
    cache.getOrRecompute.mockClear();
    // The second cache call belongs to the real FieldMetadataService after its authority assertion.
    await expect(command.run([], {})).rejects.toBe(downstream);
    expect(createFieldsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        ownerFlatApplication: owner,
        isSystemBuild: true,
        createFieldInputs: [
          expect.objectContaining({
            objectMetadataId: 'workflow-run-id',
            name: 'stepLogs',
            universalIdentifier:
              STANDARD_OBJECTS.workflowRun.fields.stepLogs.universalIdentifier,
          }),
        ],
      }),
    );
    expect(cache.getOrRecompute).toHaveBeenCalledWith(
      workspaceId,
      expect.arrayContaining(['flatViewMaps']),
    );
    await expect(
      command.runOnWorkspace({ ...context, options: {} }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('registered workspace upgrade schema-write scope', () => {
  it('permits only the matching workspace during the awaited sequence body and revokes after completion', async () => {
    let detached!: Promise<unknown>;
    let releaseDetached!: () => void;
    const command = createCommand(async () => {
      await expect(createFields()).resolves.toEqual([]);
      await expectDenied(() =>
        fieldService.createManyFields({
          workspaceId,
          createFieldInputs: [],
          schemaWriteAuthority: Symbol('forged') as never,
        }),
      );
      await expectDenied(() => createFields(otherWorkspaceId));
      await expectDenied(() => deleteObject(otherWorkspaceId));
      await expectDenied(() =>
        applicationService.synchronizeFromManifest({
          workspaceId,
          manifest: { objects: [{}], fields: [] } as never,
        }),
      );
      await expectDenied(() =>
        Promise.resolve().then(() => createFields(otherWorkspaceId)),
      );
      detached = new Promise<void>((resolve) => {
        releaseDetached = resolve;
      }).then(() => createFields());
    });
    const metadata = getRegisteredWorkspaceCommandMetadata(
      command.constructor,
    )!;
    const runner = new WorkspaceCommandRunnerService(
      { get: () => '2.9.0' } as never,
      {
        recordUpgradeMigration: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invalidateInstanceAndAllWorkspacesStatus: jest
          .fn()
          .mockResolvedValue(undefined),
      } as never,
    );
    await expectDenied(() => createFields());
    await runner.runWorkspaceCommands({
      iteratorContext: { workspaceId, index: 0, total: 1 },
      options: {},
      workspaceCommands: [
        {
          name: `${metadata.version}_${command.constructor.name}_${metadata.timestamp}`,
          command,
        },
      ],
    });
    releaseDetached();
    await expect(detached).rejects.toBeInstanceOf(ForbiddenException);
    await expectDenied(() => createFields());
  });

  it('revokes on throw and does not leak to unrelated concurrent context', async () => {
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const iterator = {
      iterate: async ({
        callback,
      }: {
        callback: (context: {
          workspaceId: string;
          index: number;
          total: number;
        }) => Promise<void>;
      }) => callback({ workspaceId, index: 0, total: 1 }),
    } as unknown as WorkspaceIteratorService;
    const command = createCommand(async () => {
      started();
      await pending;
      await expect(createFields()).resolves.toEqual([]);
      throw new Error('command failed');
    }, iterator);
    const run = command.run([], {});
    await entered;
    await expectDenied(() => createFields());
    release();
    await expect(run).rejects.toThrow('command failed');
    await expectDenied(() => createFields());
  });

  it('does not authorize an unregistered standalone CLI command', async () => {
    class UnregisteredCommand extends WorkspaceCommandRunner {
      async runOnWorkspace(): Promise<void> {
        await createFields();
      }
    }
    const iterator = {
      iterate: async ({
        callback,
      }: {
        callback: (context: {
          workspaceId: string;
          index: number;
          total: number;
        }) => Promise<void>;
      }) => callback({ workspaceId, index: 0, total: 1 }),
    } as unknown as WorkspaceIteratorService;
    await expect(
      new UnregisteredCommand(iterator, []).run([], {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
