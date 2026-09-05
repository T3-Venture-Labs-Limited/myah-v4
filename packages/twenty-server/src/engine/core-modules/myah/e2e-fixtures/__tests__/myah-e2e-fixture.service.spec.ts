import { MyahE2eFixtureRegistryService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture-registry.service';
import { MyahE2eFixtureService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.service';

const workspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000001';
const userWorkspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000002';
const campaignId = 'a1a3b7a6-b1c2-4a75-9b01-100000000003';
const bindingId = 'a1a3b7a6-b1c2-4a75-9b01-100000000004';

describe('MyahE2eFixtureService', () => {
  const createService = () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const dataSource = {
      transaction: jest.fn(async (operation) => operation(manager)),
      query: jest.fn().mockResolvedValue([]),
    };
    const workspaceDataSource = {
      query: jest.fn().mockResolvedValue([{ id: campaignId }]),
      transaction: jest.fn(async (operation) => operation(manager)),
    };
    const proposal = {
      expectedActionBinding: { actionName: 'send_outreach_email' },
    };
    const actionApprovalService = {
      createPendingBinding: jest.fn().mockResolvedValue({ id: bindingId }),
    };
    const outreachEmailActionDefinition = {
      propose: jest.fn().mockResolvedValue(proposal),
      recordApprovalBinding: jest.fn().mockResolvedValue(undefined),
    };
    const registry = new MyahE2eFixtureRegistryService();
    const service = new MyahE2eFixtureService(
      dataSource as never,
      {
        getGlobalWorkspaceDataSource: jest
          .fn()
          .mockResolvedValue(workspaceDataSource),
      } as never,
      actionApprovalService as never,
      outreachEmailActionDefinition as never,
      registry,
    );

    return {
      actionApprovalService,
      dataSource,
      manager,
      outreachEmailActionDefinition,
      registry,
      service,
      workspaceDataSource,
    };
  };

  it('creates only fixed .test mailboxes and an opaque pending approval without a provider call', async () => {
    const {
      actionApprovalService,
      manager,
      outreachEmailActionDefinition,
      service,
    } = createService();

    const fixture = await service.createCampaignMailboxFixture(
      { workspaceId, userWorkspaceId },
      campaignId,
    );

    expect(fixture).toMatchObject({
      availableAccountIds: [expect.any(String), expect.any(String)],
      unavailableAccountId: expect.any(String),
      actionApprovalBindingId: bindingId,
      expectedTo: 'MYAH-270 fixture creator <creator@myah-e2e.fixture.test>',
      expectedSubject: 'MYAH-270 fixture subject',
      expectedBody: 'MYAH-270 fixture body',
    });
    expect(fixture.expectedFrom).toBe('myah-e2e-sender@fixture.test');
    expect(outreachEmailActionDefinition.propose).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
      }),
    );
    expect(actionApprovalService.createPendingBinding).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"authFailedAt"'),
      expect.arrayContaining([expect.any(Date)]),
    );
    expect(JSON.stringify(manager.query.mock.calls)).not.toContain(
      'accessToken',
    );
    expect(JSON.stringify(manager.query.mock.calls)).not.toContain('sendDraft');
  });

  it('fails closed for foreign cleanup ids and retains fixtures when deletion fails', async () => {
    const { registry, service, workspaceDataSource } = createService();
    const fixture = registry.register(workspaceId, { connectedAccountIds: [] });

    await expect(
      service.cleanup(
        {
          workspaceId: 'a1a3b7a6-b1c2-4a75-9b01-100000000099',
          userWorkspaceId,
        },
        fixture.id,
      ),
    ).resolves.toBe(false);

    workspaceDataSource.transaction.mockRejectedValueOnce(
      new Error('delete failed'),
    );
    await expect(
      service.cleanup({ workspaceId, userWorkspaceId }, fixture.id),
    ).rejects.toThrow('delete failed');
    expect(registry.get(workspaceId, fixture.id)).not.toBeNull();

    await expect(
      service.cleanup({ workspaceId, userWorkspaceId }, fixture.id),
    ).resolves.toBe(true);
    await expect(
      service.cleanup({ workspaceId, userWorkspaceId }, fixture.id),
    ).resolves.toBe(false);
  });

  it('returns a same-origin Operations callback path for a fixture-owned campaign', async () => {
    const { registry, service } = createService();
    const fixture = registry.register(workspaceId, {
      connectedAccountIds: [],
      messageChannelIds: [],
    });

    const callback = await service.createCallbackFixture(
      { workspaceId, userWorkspaceId },
      fixture.id,
      campaignId,
    );

    expect(callback.callbackPath).toBe(
      `/object/campaign/${campaignId}?linkConnectedAccount=1&connectedAccountId=${callback.connectedAccountId}#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba`,
    );
    expect(callback.connectedAccountId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
