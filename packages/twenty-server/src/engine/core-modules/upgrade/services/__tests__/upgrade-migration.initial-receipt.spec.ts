import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';

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
