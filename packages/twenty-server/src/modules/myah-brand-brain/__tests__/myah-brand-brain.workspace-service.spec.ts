import { MyahBrandBrainWorkspaceService } from 'src/modules/myah-brand-brain/services/myah-brand-brain.workspace-service';

describe('MyahBrandBrainWorkspaceService', () => {
  it('generates the four source-compatible Brand Brain tool descriptors', () => {
    const createStore = jest.fn();
    const service = new MyahBrandBrainWorkspaceService({
      createStore,
    } as never);

    const tools = service.generateBrandBrainTools({
      workspaceId: 'workspace-id',
      rolePermissionConfig: { shouldBypassPermissionChecks: true },
    });

    expect(Object.keys(tools)).toEqual([
      'brand-brain-get-context',
      'brand-brain-search-or-read',
      'brand-brain-seed-or-update-from-brief',
      'brand-brain-update-page-content',
    ]);
  });
});
