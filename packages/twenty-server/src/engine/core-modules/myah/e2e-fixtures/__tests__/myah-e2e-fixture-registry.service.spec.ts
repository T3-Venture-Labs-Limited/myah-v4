import { Test } from '@nestjs/testing';

import { MyahE2eFixtureRegistryService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture-registry.service';

describe('MyahE2eFixtureRegistryService', () => {
  const workspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000001';
  const otherWorkspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000002';

  it('keeps opaque fixture ids private to their authenticated workspace', () => {
    const registry = new MyahE2eFixtureRegistryService();
    const fixture = registry.register(workspaceId, {
      campaignIds: [],
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

  it('uses the default capacity when Nest constructs the registry', async () => {
    const module = await Test.createTestingModule({
      providers: [MyahE2eFixtureRegistryService],
    }).compile();

    const registry = module.get(MyahE2eFixtureRegistryService);

    expect(
      registry.register(workspaceId, {
        campaignIds: [],
        connectedAccountIds: [],
      }),
    ).toMatchObject({ workspaceId });
  });

  it('caps active process-lifetime fixtures and releases an entry only after cleanup', () => {
    const registry = new MyahE2eFixtureRegistryService();
    const records = { campaignIds: [], connectedAccountIds: [] };
    const first = registry.register(workspaceId, records);
    for (let index = 1; index < 100; index++) {
      registry.register(workspaceId, records);
    }

    expect(() => registry.register(workspaceId, records)).toThrow(
      'E2E fixture capacity has been reached',
    );

    registry.release(workspaceId, first.id);

    expect(() => registry.register(workspaceId, records)).not.toThrow();
  });
});
