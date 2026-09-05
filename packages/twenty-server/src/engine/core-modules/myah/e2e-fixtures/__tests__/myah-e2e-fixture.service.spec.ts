import { MyahE2eFixtureRegistryService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture-registry.service';
import { MyahE2eFixtureService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.service';
import { E2eFixtureGmailMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/gmail/services/e2e-fixture-gmail-message-outbound.service';

const workspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000001';
const userWorkspaceId = 'a1a3b7a6-b1c2-4a75-9b01-100000000002';
const campaignId = 'a1a3b7a6-b1c2-4a75-9b01-100000000003';
const bindingId = 'a1a3b7a6-b1c2-4a75-9b01-100000000004';
const operationsTabId = 'a1a3b7a6-b1c2-4a75-9b01-100000000005';
const outreachActionId = 'a1a3b7a6-b1c2-4a75-9b01-100000000006';
const workspace = {
  id: workspaceId,
  subdomain: 'apple',
  customDomain: null,
  isCustomDomainEnabled: false,
};
const fixtureContext = { workspaceId, userWorkspaceId, workspace };

describe('MyahE2eFixtureService', () => {
  const createService = () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const dataSource = {
      transaction: jest.fn(async (operation) => operation(manager)),
      query: jest.fn().mockResolvedValue([]),
    };
    const workspaceQueryRunner = {
      query: manager.query,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const workspaceDataSource = {
      query: jest.fn().mockResolvedValue([{ id: campaignId }]),
      createQueryRunner: jest.fn().mockReturnValue(workspaceQueryRunner),
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
    const prepareOutreachEmailDraftTool = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        message: 'Outreach email draft prepared for approval.',
        result: { outreachActionId },
      }),
    };
    const workspaceDomainsService = {
      buildWorkspaceURL: jest.fn(
        ({
          pathname,
          searchParams,
        }: {
          pathname: string;
          searchParams: Record<string, unknown>;
        }) =>
          new URL(
            `${pathname}?${new URLSearchParams(searchParams as Record<string, string>).toString()}`,
            'http://apple.localhost:3001',
          ),
      ),
    };
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
      workspaceDomainsService as never,
      prepareOutreachEmailDraftTool as never,
    );

    return {
      actionApprovalService,
      dataSource,
      manager,
      outreachEmailActionDefinition,
      prepareOutreachEmailDraftTool,
      registry,
      service,
      workspaceDomainsService,
      workspaceDataSource,
      workspaceQueryRunner,
    };
  };

  it('creates only fixed .test mailboxes and an opaque pending approval without a provider call', async () => {
    const {
      actionApprovalService,
      manager,
      outreachEmailActionDefinition,
      prepareOutreachEmailDraftTool,
      service,
      workspaceDataSource,
    } = createService();

    const fixture = await service.createCampaignMailboxFixture(
      fixtureContext,
      campaignId,
    );

    expect(fixture).toMatchObject({
      availableAccountIds: [expect.any(String), expect.any(String)],
      unavailableAccountId: expect.any(String),
      actionApprovalBindingId: bindingId,
      approvalThreadTitle: expect.stringMatching(
        /^MYAH-270 E2E fixture [0-9a-f-]{36}$/,
      ),
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
    expect(workspaceDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('"campaign" WHERE "id" = $1'),
      [campaignId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    expect(
      manager.query.mock.calls.some(
        ([sql]: [string]) =>
          sql.includes('INSERT INTO') && sql.includes('"outreachAction"'),
      ),
    ).toBe(false);
    expect(prepareOutreachEmailDraftTool.execute).toHaveBeenCalledTimes(1);
    expect(prepareOutreachEmailDraftTool.execute).toHaveBeenCalledWith(
      {
        campaignCreatorId: expect.any(String),
        connectedAccountId: expect.any(String),
        subject: 'MYAH-270 fixture subject',
        body: 'MYAH-270 fixture body',
      },
      {
        workspaceId,
        userWorkspaceId,
        threadId: expect.any(String),
      },
    );
    expect(outreachEmailActionDefinition.propose).toHaveBeenCalledWith(
      expect.objectContaining({ input: { outreachActionId } }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"pendingQuestionMessageId"'),
      expect.arrayContaining([expect.any(String)]),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"authFailedAt"'),
      expect.arrayContaining([expect.any(Date)]),
    );
    expect(JSON.stringify(manager.query.mock.calls)).not.toContain(
      'accessToken',
    );
    expect(JSON.stringify(manager.query.mock.calls)).not.toContain('sendDraft');
  });

  it('extends only the fixture approval to a bounded 24-hour review lifetime', async () => {
    const { actionApprovalService, dataSource, service } = createService();

    await service.createCampaignMailboxFixture(fixtureContext, campaignId);

    expect(actionApprovalService.createPendingBinding).toHaveBeenCalledWith({
      actionName: 'send_outreach_email',
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringMatching(
        /UPDATE core\."actionApprovalBinding"\s+SET "expiresAt" = NOW\(\) \+ \(\$2 \* INTERVAL '1 millisecond'\)/,
      ),
      [bindingId, 24 * 60 * 60 * 1000, workspaceId],
    );
  });

  it('cleans mailboxes created before a later mailbox creation fails', async () => {
    const { dataSource, manager, service } = createService();
    dataSource.transaction
      .mockImplementationOnce(
        async (operation: (value: typeof manager) => unknown) =>
          operation(manager),
      )
      .mockRejectedValueOnce(new Error('second mailbox failed'));

    await expect(
      service.createCampaignMailboxFixture(fixtureContext, campaignId),
    ).rejects.toThrow('second mailbox failed');

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM core."messageChannel"'),
      [expect.arrayContaining([expect.any(String)])],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM core."connectedAccount"'),
      [expect.arrayContaining([expect.any(String)])],
    );
  });

  it('cleans a created approval binding after later fixture persistence fails', async () => {
    const { manager, outreachEmailActionDefinition, service } = createService();
    outreachEmailActionDefinition.recordApprovalBinding.mockRejectedValueOnce(
      new Error('record failed'),
    );

    await expect(
      service.createCampaignMailboxFixture(fixtureContext, campaignId),
    ).rejects.toThrow('record failed');

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"actionApprovalBindingEvidenceLink"'),
      [[bindingId]],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('"actionApprovalBinding"'),
      [[bindingId]],
    );
  });

  it('deletes only fixture-workspace receipts before their approval bindings and can retry cleanup', async () => {
    const { manager, registry, service } = createService();
    const fixture = registry.register(workspaceId, {
      actionApprovalBindingIds: [bindingId],
      campaignIds: [],
      connectedAccountIds: [],
    });

    await expect(service.cleanup(fixtureContext, fixture.id)).resolves.toBe(
      true,
    );

    const receiptCall = manager.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('core."actionExecutionReceipt"'),
    );
    const bindingCall = manager.query.mock.calls.find(([sql]: [string]) =>
      sql.includes('core."actionApprovalBinding"'),
    );
    expect(receiptCall).toEqual([
      expect.stringContaining('"workspaceId" = $2'),
      [[bindingId], workspaceId],
    ]);
    expect(manager.query.mock.calls.indexOf(receiptCall!)).toBeLessThan(
      manager.query.mock.calls.indexOf(bindingCall!),
    );
    await expect(service.cleanup(fixtureContext, fixture.id)).resolves.toBe(
      false,
    );
  });

  it('fails closed for foreign cleanup ids and retains fixtures when deletion fails', async () => {
    const { manager, registry, service, workspaceQueryRunner } =
      createService();
    const connectedAccountId = 'a1a3b7a6-b1c2-4a75-9b01-100000000005';
    const fixture = registry.register(workspaceId, {
      campaignIds: [],
      connectedAccountIds: [connectedAccountId],
    });

    await expect(
      service.cleanup(
        {
          workspaceId: 'a1a3b7a6-b1c2-4a75-9b01-100000000099',
          userWorkspaceId,
          workspace,
        },
        fixture.id,
      ),
    ).resolves.toBe(false);

    manager.query.mockRejectedValueOnce(new Error('delete failed'));
    await expect(service.cleanup(fixtureContext, fixture.id)).rejects.toThrow(
      'delete failed',
    );
    expect(registry.get(workspaceId, fixture.id)).not.toBeNull();
    expect(workspaceQueryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(workspaceQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);

    await expect(service.cleanup(fixtureContext, fixture.id)).resolves.toBe(
      true,
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        '"campaignAccount" WHERE "connectedAccountId" = ANY($1::text[])',
      ),
      [[connectedAccountId]],
    );
    expect(workspaceQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(workspaceQueryRunner.release).toHaveBeenCalledTimes(2);
    await expect(service.cleanup(fixtureContext, fixture.id)).resolves.toBe(
      false,
    );
  });

  it('returns the fixture-owned provider send count only to its workspace', async () => {
    const { registry, service } = createService();
    const connectedAccountId = 'a1a3b7a6-b1c2-4a75-9b01-100000000005';
    const fixture = registry.register(workspaceId, {
      campaignIds: [],
      connectedAccountIds: [connectedAccountId],
    });
    jest
      .spyOn(E2eFixtureGmailMessageOutboundService, 'getSendAttemptCount')
      .mockReturnValue(0);

    expect(
      service.getCampaignMailboxFixtureStatus(fixtureContext, fixture.id),
    ).toEqual({
      providerSendAttemptCount: 0,
      providerDraftPreparationCount: 0,
    });
    expect(() =>
      service.getCampaignMailboxFixtureStatus(
        {
          workspaceId: 'a1a3b7a6-b1c2-4a75-9b01-100000000099',
          userWorkspaceId,
          workspace,
        },
        fixture.id,
      ),
    ).toThrow('E2E fixture was not found');
  });

  it('returns one absolute frontend Operations callback mailbox for a fixture-owned campaign', async () => {
    const { dataSource, registry, service, workspaceDomainsService } =
      createService();
    const fixture = registry.register(workspaceId, {
      campaignIds: [campaignId],
      connectedAccountIds: [],
      messageChannelIds: [],
      callbackConnectedAccountIdsByCampaignId: {},
    });

    const callback = await service.createCallbackFixture(
      fixtureContext,
      fixture.id,
      campaignId,
      operationsTabId,
    );
    const repeatedCallback = await service.createCallbackFixture(
      fixtureContext,
      fixture.id,
      campaignId,
      operationsTabId,
    );

    expect(callback.callbackPath).toBe(
      `http://apple.localhost:3001/object/campaign/${campaignId}?linkConnectedAccount=1&connectedAccountId=${callback.connectedAccountId}#${operationsTabId}`,
    );
    expect(workspaceDomainsService.buildWorkspaceURL).toHaveBeenCalledWith({
      workspace,
      pathname: `/object/campaign/${campaignId}`,
      searchParams: {
        linkConnectedAccount: 1,
        connectedAccountId: callback.connectedAccountId,
      },
    });
    expect(callback.connectedAccountId).toMatch(/^[0-9a-f-]{36}$/);
    expect(repeatedCallback).toEqual(callback);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    await expect(
      service.createCallbackFixture(
        fixtureContext,
        fixture.id,
        'a1a3b7a6-b1c2-4a75-9b01-100000000099',
        operationsTabId,
      ),
    ).rejects.toThrow('E2E fixture was not found');
  });
});
