import { MyahE2eFixtureRegistryService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture-registry.service';

describe('MyahE2eFixtureRegistryService', () => {
  const workspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000001';
  const otherWorkspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000002';

  it('keeps opaque fixture ids private to their authenticated workspace', () => {
    const registry = new MyahE2eFixtureRegistryService();
    const fixture = registry.register(workspaceId, {
      connectedAccountIds: ['a1a3b7a6-b1c2-4a75-9b01-100000000003'],
    });

    expect(registry.get(workspaceId, fixture.id)).toMatchObject({
      workspaceId,
      records: fixture.records,
    });
    expect(registry.get(otherWorkspaceId, fixture.id)).toBeNull();
    expect(
      registry.get(workspaceId, 'a1a3b7a6-b1c2-4a75-9b01-100000000004'),
    ).toBeNull();
  });

  it('caps active process-lifetime fixtures and releases an entry only after cleanup', () => {
    const registry = new MyahE2eFixtureRegistryService(2);
    const first = registry.register(workspaceId, { connectedAccountIds: [] });
    registry.register(workspaceId, { connectedAccountIds: [] });

    expect(() =>
      registry.register(workspaceId, { connectedAccountIds: [] }),
    ).toThrow('E2E fixture capacity has been reached');

    registry.release(workspaceId, first.id);

    expect(() =>
      registry.register(workspaceId, { connectedAccountIds: [] }),
    ).not.toThrow();
  });
});
