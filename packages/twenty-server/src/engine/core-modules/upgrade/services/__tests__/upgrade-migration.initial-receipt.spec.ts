import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';

it('uses the bound runner latest attempt and rejects an initial checkpoint only for execution recovery', async () => {
  const latest = { status: 'completed', isInitial: true };
  const findOne = jest.fn(async () => latest);
  const boundRepository = { findOne };
  const getRepository = jest.fn(() => boundRepository);
  const service = new UpgradeMigrationService({
    findOne: jest.fn(() => {
      throw new Error('pooled repository must not be read');
    }),
  } as never);
  const args = {
    name: '2.20.0_SynchronizeInstagramSourceControlledMetadataCommand_1790491923604',
    workspaceId: 'workspace',
    queryRunner: { manager: { getRepository } } as never,
  };

  await expect(service.isLastAttemptCompleted(args)).resolves.toBe(true);
  await expect(
    service.isLastAttemptCompleted({ ...args, requireNonInitial: true }),
  ).resolves.toBe(false);
  latest.isInitial = false;
  await expect(
    service.isLastAttemptCompleted({ ...args, requireNonInitial: true }),
  ).resolves.toBe(true);
  latest.status = 'failed';
  await expect(
    service.isLastAttemptCompleted({ ...args, requireNonInitial: true }),
  ).resolves.toBe(false);
  expect(findOne).toHaveBeenCalledTimes(4);
  expect(findOne).toHaveBeenCalledWith({
    where: { name: args.name, workspaceId: args.workspaceId },
    order: { attempt: 'DESC' },
  });
  expect(getRepository).toHaveBeenCalledTimes(4);
});

it('inspects the exact durable activation initial receipt on an independent repository', async () => {
  const exists = jest.fn().mockResolvedValue(true);
  const service = new UpgradeMigrationService({ exists } as never);
  await expect(
    service.hasWorkspaceInitialReceipt({
      workspaceId: 'workspace',
      name: 'native',
      status: 'failed',
    }),
  ).resolves.toBe(true);
  expect(exists).toHaveBeenCalledWith({
    where: {
      workspaceId: 'workspace',
      name: 'native',
      status: 'failed',
      attempt: 1,
      isInitial: true,
    },
  });
});
