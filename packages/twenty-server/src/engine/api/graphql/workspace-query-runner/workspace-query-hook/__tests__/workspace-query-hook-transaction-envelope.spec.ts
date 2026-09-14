import { WorkspaceQueryHookService } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.service';
import { WorkspaceQueryHookStorage } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/storage/workspace-query-hook.storage';

const hookRegistration = (instance: Record<string, unknown>) => ({
  host: {} as never,
  instance: instance as never,
  isRequestScoped: false,
});

describe('Workspace query hook transaction envelope opt-in', () => {
  it('defaults to the unchanged non-transactional path and opts in only marked hooks', () => {
    const storage = new WorkspaceQueryHookStorage();
    const service = new WorkspaceQueryHookService(storage, {} as never);

    storage.registerWorkspaceQueryPreHookInstance(
      'company.deleteOne',
      hookRegistration({ execute: jest.fn() }),
    );
    storage.registerWorkspaceQueryPreHookInstance(
      'campaign.deleteOne',
      hookRegistration({
        execute: jest.fn(),
        shouldRunInTransaction: true,
      }),
    );

    expect(
      service.shouldRunPreQueryHooksInTransaction('company', 'deleteOne'),
    ).toBe(false);
    expect(
      service.shouldRunPreQueryHooksInTransaction('campaign', 'deleteOne'),
    ).toBe(true);
    expect(
      service.shouldRunPreQueryHooksInTransaction('campaign', 'updateOne'),
    ).toBe(false);
  });

  it('passes the exact transaction manager context to every opted-in prehook', async () => {
    const storage = new WorkspaceQueryHookStorage();
    const hook = { execute: jest.fn(), shouldRunInTransaction: true };
    const explorer = {
      handlePreHook: jest.fn(async (parameters: unknown[]) => {
        await hook.execute(...parameters);

        return parameters[2];
      }),
    };
    const service = new WorkspaceQueryHookService(storage, explorer as never);
    const payload = { id: 'campaign-a' };
    const transactionContext = { entityManager: { id: 'manager-a' } as never };
    const authContext = {
      type: 'system',
      workspace: { id: 'workspace-a' },
    } as never;

    storage.registerWorkspaceQueryPreHookInstance(
      'campaign.deleteOne',
      hookRegistration(hook),
    );

    await service.executePreQueryHooks(
      authContext,
      'campaign',
      'deleteOne',
      payload,
      transactionContext,
    );

    expect(hook.execute).toHaveBeenCalledWith(
      authContext,
      'campaign',
      payload,
      transactionContext,
    );
  });
});
