import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MyahBrandBrainStoreService } from 'src/modules/myah-brand-brain/services/myah-brand-brain-store.service';

describe('MyahBrandBrainStoreService', () => {
  it('reads Brand Brain pages through the current workspace repository', async () => {
    const pageRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'page-id',
          title: 'Acme',
          slug: 'acme',
          canonicalPath: 'acme',
          pageType: 'BRAND_ROOT',
          status: 'APPROVED',
        },
      ]),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback: () => unknown) =>
        callback(),
      ),
      getRepository: jest.fn().mockResolvedValue(pageRepository),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new MyahBrandBrainStoreService(globalWorkspaceOrmManager);

    const store = service.createStore({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });

    await expect(
      store.listPagesByBrandSlug({ brandSlug: 'acme' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'page-id', canonicalPath: 'acme' }),
    ]);
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workspace-id',
      'brandBrainPage',
      { shouldBypassPermissionChecks: true },
    );
  });
  it('runs page queries inside the workspace context', async () => {
    let isWorkspaceContextActive = false;
    const pageRepository = {
      find: jest.fn().mockImplementation(async () => {
        if (!isWorkspaceContextActive) {
          throw new Error('workspace context is not active');
        }

        return [
          {
            id: 'page-id',
            title: 'Acme',
            slug: 'acme',
            canonicalPath: 'acme',
            pageType: 'BRAND_ROOT',
            status: 'APPROVED',
          },
        ];
      }),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(
        async (callback: () => Promise<unknown> | unknown) => {
          isWorkspaceContextActive = true;
          try {
            return await callback();
          } finally {
            isWorkspaceContextActive = false;
          }
        },
      ),
      getRepository: jest.fn().mockResolvedValue(pageRepository),
    } as unknown as GlobalWorkspaceOrmManager;
    const service = new MyahBrandBrainStoreService(globalWorkspaceOrmManager);
    const store = service.createStore({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });

    await expect(
      store.listPagesByBrandSlug({ brandSlug: 'acme' }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'page-id', canonicalPath: 'acme' }),
    ]);
  });
});
