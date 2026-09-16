import {
  getWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';

const ids = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  campaignId: '00000000-0000-4000-8000-000000000002',
  attemptId: '00000000-0000-4000-8000-000000000003',
  executionId: '00000000-0000-4000-8000-000000000004',
  authorizationId: '00000000-0000-4000-8000-000000000005',
  activationId: '00000000-0000-4000-8000-000000000006',
  enrollmentId: '00000000-0000-4000-8000-000000000007',
  occurrenceId: '00000000-0000-4000-8000-000000000008',
  accountId: '00000000-0000-4000-8000-000000000009',
  channelId: '00000000-0000-4000-8000-000000000010',
  versionId: '00000000-0000-4000-8000-000000000011',
};

describe('CampaignEmailRuntimeService', () => {
  const setup = (
    projectionResult: 'PROJECTED' | 'EXACT_REPLAY' | 'DEFERRED' = 'PROJECTED',
    work: Record<string, unknown>[] = [],
  ) => {
    const routingRow = {
      ...ids,
      campaignExecutionId: ids.executionId,
      authorizationGeneration: 1,
      authorizationId: ids.authorizationId,
      activationId: ids.activationId,
      workflowVersionId: ids.versionId,
      enrollmentId: ids.enrollmentId,
      occurrenceId: ids.occurrenceId,
      connectedAccountId: ids.accountId,
      messageChannelId: ids.channelId,
    };
    const query = jest.fn(async (sql: string) =>
      sql.includes('WITH pending') ? work : [routingRow],
    );
    const manager = { queryRunner: { isTransactionActive: true, query } };
    Object.assign(manager.queryRunner, { manager });
    const dataSource = {
      query,
      transaction: jest.fn(async (work) => work(manager)),
    };
    const progression = {
      claimAndReserveDueOccurrenceInTransaction: jest.fn(async () => ({
        status: 'SKIPPED',
        attemptId: ids.attemptId,
      })),
      holdOccurrenceInTransaction: jest.fn(),
      reconcileAcceptedInTransaction: jest.fn(),
      reconcileDefinitelyUnacceptedInTransaction: jest.fn(),
      reconcileUnknownInTransaction: jest.fn(),
    };
    const projection = { reconcile: jest.fn(async () => projectionResult) };
    const dispatch = { dispatch: jest.fn() };
    const orm = {
      getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
      executeInWorkspaceContext: jest.fn(
        async (callback: () => Promise<unknown>, authContext: unknown) =>
          withWorkspaceContext({ authContext } as never, callback),
      ),
    };
    return {
      query,
      service: new CampaignEmailRuntimeService(
        orm as never,
        progression as never,
        dispatch as never,
        projection as never,
      ),
      dispatch,
      orm,
      progression,
      projection,
    };
  };

  it.each(['PROJECTED', 'EXACT_REPLAY'] as const)(
    'replays accepted unprogressed evidence through projection and progression (%s)',
    async (status) => {
      const { service, projection, progression } = setup(status);
      await (service as any).reconcileAcceptedAttempt(
        ids.workspaceId,
        ids.campaignId,
        ids.attemptId,
      );
      expect(projection.reconcile).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: ids.attemptId }),
      );
      expect(progression.reconcileAcceptedInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId: ids.attemptId }),
        expect.anything(),
      );
    },
  );

  it('leaves deferred projection discoverable for a later tick', async () => {
    const { service, progression } = setup('DEFERRED');
    await (service as any).reconcileAcceptedAttempt(
      ids.workspaceId,
      ids.campaignId,
      ids.attemptId,
    );
    expect(progression.reconcileAcceptedInTransaction).not.toHaveBeenCalled();
  });

  it('reads due work through an active transaction runner without datasource queries', async () => {
    const { service, query } = setup('PROJECTED');

    await service.runDueOccurrences();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WITH pending'),
      [],
    );
  });

  it('routes persisted definite and unknown outcomes without provider redispatch', async () => {
    const { service, dispatch, progression } = setup('PROJECTED', [
      { ...ids, kind: 'DEFINITELY_UNACCEPTED' },
      { ...ids, kind: 'UNKNOWN' },
    ]);

    await service.runDueOccurrences();

    expect(
      progression.reconcileDefinitelyUnacceptedInTransaction,
    ).toHaveBeenCalledTimes(1);
    expect(progression.reconcileUnknownInTransaction).toHaveBeenCalledTimes(1);
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('keeps discovery outside context and every work route inside its workspace context', async () => {
    const work = [
      { ...ids, kind: 'ACCEPTED' },
      { ...ids, kind: 'RESERVED' },
      { ...ids, kind: 'PROCESSING' },
      { ...ids, kind: 'DEFINITELY_UNACCEPTED' },
      { ...ids, kind: 'UNKNOWN' },
      { ...ids, kind: 'BLOCKED' },
      { ...ids, kind: 'PENDING' },
    ];
    const { service, query, orm, progression } = setup('PROJECTED', work);
    const seen: string[] = [];
    const assertItemContext = (route: string) => {
      const authContext = getWorkspaceContext().authContext;

      expect(authContext.type).toBe('system');
      expect(authContext.workspace.id).toBe(ids.workspaceId);
      seen.push(route);
    };

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('WITH pending')) {
        expect(() => getWorkspaceContext()).toThrow(
          'Workspace context not set',
        );
        return work;
      }
      return [];
    });
    jest
      .spyOn(service as any, 'reconcileAcceptedAttempt')
      .mockImplementation(async () => assertItemContext('ACCEPTED'));
    jest
      .spyOn(service as any, 'dispatchAttempt')
      .mockImplementation(
        async (_workspaceId, _campaignId, _attemptId, state) =>
          assertItemContext(state === 'PROCESSING' ? 'PROCESSING' : 'RESERVED'),
      );
    jest
      .spyOn(service as any, 'reconcilePersistedOutcome')
      .mockImplementation(
        async (_workspaceId, _campaignId, _attemptId, state) =>
          assertItemContext(String(state)),
      );
    progression.holdOccurrenceInTransaction.mockImplementation(async () =>
      assertItemContext('BLOCKED'),
    );
    progression.claimAndReserveDueOccurrenceInTransaction.mockImplementation(
      async () => {
        assertItemContext('PENDING');
        return { status: 'SKIPPED', attemptId: ids.attemptId };
      },
    );

    await service.runDueOccurrences();

    expect(seen).toEqual([
      'ACCEPTED',
      'RESERVED',
      'PROCESSING',
      'DEFINITELY_UNACCEPTED',
      'UNKNOWN',
      'BLOCKED',
      'PENDING',
    ]);
    expect(orm.executeInWorkspaceContext).toHaveBeenCalledTimes(work.length);
    for (const call of orm.executeInWorkspaceContext.mock.calls)
      expect(call).toHaveLength(2);
  });

  it('loads the core mailbox through the active runner without a class repository', async () => {
    const account = {
      id: ids.accountId,
      workspaceId: ids.workspaceId,
      handle: 'sender@example.com',
      provider: 'imap_smtp_caldav',
      connectionParameters: {
        IMAP: {
          host: 'imap.example.com',
          port: 993,
          username: 'sender@example.com',
          password: 'enc:v2:imap-password',
          connectionSecurity: 'SSL_TLS',
        },
        SMTP: {
          host: 'smtp.example.com',
          port: 587,
          username: 'sender@example.com',
          password: 'enc:v2:smtp-password',
          connectionSecurity: 'STARTTLS',
        },
      },
    };
    const row = {
      attemptNumber: 1,
      authorizationGeneration: 1,
      authorizationId: ids.authorizationId,
      activationId: ids.activationId,
      campaignExecutionId: ids.executionId,
      campaignId: ids.campaignId,
      claimedAt: '2026-09-16T12:00:00.000Z',
      connectedAccountId: ids.accountId,
      enrollmentId: ids.enrollmentId,
      html: '<p>Body</p>',
      localDate: '2026-09-16',
      messageChannelId: ids.channelId,
      messageId: '00000000-0000-4000-8000-000000000012',
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
      occurrenceId: ids.occurrenceId,
      provider: 'imap_smtp_caldav',
      renderDigest: 'render-digest',
      senderPoolFingerprint: 'sender-pool-fingerprint',
      slotAt: '2026-09-16T12:00:00.000Z',
      subject: 'Subject',
      text: 'Body',
      toRecipient: 'recipient@example.com',
      unknownAfter: '2026-09-16T12:05:00.000Z',
      workflowVersionId: ids.versionId,
      references: [],
      inReplyTo: null,
      threadExternalId: null,
      selectionConstraintKind: 'EXPLICIT',
      priorAcceptedEvidenceId: null,
    };
    const { service, query, dispatch } = setup();
    let accountRows: Record<string, unknown>[] = [account];

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM core."connectedAccount"')) return accountRows;
      return [row];
    });
    dispatch.dispatch.mockResolvedValue({ status: 'CONTRACT_CONFLICT' });

    await (service as any).dispatchAttempt(
      ids.workspaceId,
      ids.campaignId,
      ids.attemptId,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'SELECT id, "workspaceId", handle, provider, "connectionParameters"',
      ),
      [ids.accountId, ids.workspaceId],
    );
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        material: expect.objectContaining({
          connectedAccount: account,
        }),
      }),
    );

    for (const rows of [
      [],
      [{ ...account, handle: '' }],
      [{ ...account, provider: 'invalid-provider' }],
      [{ ...account, workspaceId: 'other-workspace' }],
      [account, account],
    ]) {
      accountRows = rows;
      dispatch.dispatch.mockClear();

      await expect(
        (service as any).dispatchAttempt(
          ids.workspaceId,
          ids.campaignId,
          ids.attemptId,
        ),
      ).rejects.toThrow('Campaign runtime account was invalid');
      expect(dispatch.dispatch).not.toHaveBeenCalled();
    }
  });

  it.each(['RESERVED', 'DISPATCHABLE_REPLAY'] as const)(
    'keeps pending claim dispatch inside context for %s',
    async (status) => {
      const { service, progression } = setup('PROJECTED', [
        { ...ids, kind: 'PENDING' },
      ]);
      const dispatchAttempt = jest
        .spyOn(service as any, 'dispatchAttempt')
        .mockImplementation(async () => {
          expect(getWorkspaceContext().authContext.workspace.id).toBe(
            ids.workspaceId,
          );
        });

      progression.claimAndReserveDueOccurrenceInTransaction.mockResolvedValue({
        status,
        attemptId: ids.attemptId,
      });

      await service.runDueOccurrences();

      expect(dispatchAttempt).toHaveBeenCalledWith(
        ids.workspaceId,
        ids.campaignId,
        ids.attemptId,
      );
    },
  );

  it('isolates a failed workspace item and enters the next item workspace', async () => {
    const secondWorkspaceId = '00000000-0000-4000-8000-000000000012';
    const { service, progression } = setup('PROJECTED', [
      { ...ids, kind: 'PENDING' },
      { ...ids, workspaceId: secondWorkspaceId, kind: 'PENDING' },
    ]);
    const handledWorkspaceIds: string[] = [];
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    progression.claimAndReserveDueOccurrenceInTransaction.mockImplementation(
      async () => {
        const workspaceId = getWorkspaceContext().authContext.workspace.id;

        handledWorkspaceIds.push(workspaceId);
        if (workspaceId === ids.workspaceId)
          throw new Error('first item failed');
        return { status: 'SKIPPED', attemptId: ids.attemptId };
      },
    );

    await service.runDueOccurrences();

    expect(handledWorkspaceIds).toEqual([ids.workspaceId, secondWorkspaceId]);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
