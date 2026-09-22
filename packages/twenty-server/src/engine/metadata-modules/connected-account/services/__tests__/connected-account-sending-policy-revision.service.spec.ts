import { type EntityManager, type Repository } from 'typeorm';

import { ConnectedAccountExceptionCode } from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type ConnectedAccountSendingPolicySpacingGuardService } from 'src/engine/metadata-modules/connected-account/services/connected-account-sending-policy-spacing-guard.service';
import { ConnectedAccountSendingPolicyService } from 'src/engine/metadata-modules/connected-account/services/connected-account-sending-policy.service';

const workspaceId = '20202020-1111-4444-8888-111111111111';
const connectedAccountId = '20202020-2222-4444-8888-222222222222';
const idempotencyKey = 'b486cb28-c908-42f0-91ce-0e4a87a38592';

const account = {
  id: connectedAccountId,
  workspaceId,
  archivedAt: null,
  dailySendLimit: 50,
  minimumSendIntervalMs: 300_000,
  sendingPolicyRevision: 4,
  sendingPolicyIdempotencyKey: null,
} as ConnectedAccountEntity;

describe('ConnectedAccountSendingPolicyService revisioned update', () => {
  const query = jest.fn();
  const manager = {
    query,
    transaction: jest.fn((callback) => callback(manager)),
  } as unknown as EntityManager;
  const repository = { manager } as Repository<ConnectedAccountEntity>;
  const spacingGuard = {
    assertCanChange: jest.fn(),
  } as unknown as jest.Mocked<ConnectedAccountSendingPolicySpacingGuardService>;
  const service = new ConnectedAccountSendingPolicyService(
    repository,
    spacingGuard,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM core."messageChannel"')) return [];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM core."connectedAccount"')) {
        return [{ ...account }];
      }
      if (sql.includes('UPDATE core."connectedAccount"')) {
        return [
          {
            ...account,
            dailySendLimit: 75,
            sendingPolicyIdempotencyKey: idempotencyKey,
            sendingPolicyRevision: 5,
          },
        ];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('allows a cap-only update without invoking the spacing guard', async () => {
    await expect(
      service.updateRevisioned({
        connectedAccountId,
        dailySendLimit: 75,
        expectedRevision: 4,
        idempotencyKey,
        minimumSendIntervalMs: 300_000,
        workspaceId,
      }),
    ).resolves.toMatchObject({
      dailySendLimit: 75,
      sendingPolicyRevision: 5,
    });

    expect(spacingGuard.assertCanChange).not.toHaveBeenCalled();
    const sql = query.mock.calls.map(([statement]) => String(statement));
    expect(
      query.mock.calls.findIndex(([, parameters]) =>
        parameters?.includes(`campaign-mailbox:account:${connectedAccountId}`),
      ),
    ).toBeLessThan(
      sql.findIndex((statement) =>
        statement.includes('SELECT * FROM core."connectedAccount"'),
      ),
    );
    expect(
      sql.every((statement) => !statement.includes('mailboxCapacityDay')),
    ).toBe(true);
  });

  it('guards minimum-spacing changes inside the transaction', async () => {
    await service.updateRevisioned({
      connectedAccountId,
      dailySendLimit: 50,
      expectedRevision: 4,
      idempotencyKey,
      minimumSendIntervalMs: 120_000,
      workspaceId,
    });

    expect(spacingGuard.assertCanChange).toHaveBeenCalledWith(
      { connectedAccountId, workspaceId },
      manager,
    );
  });

  it('rejects a stale revision before changing policy', async () => {
    await expect(
      service.updateRevisioned({
        connectedAccountId,
        dailySendLimit: 75,
        expectedRevision: 3,
        idempotencyKey,
        minimumSendIntervalMs: 300_000,
        workspaceId,
      }),
    ).rejects.toMatchObject({
      code: ConnectedAccountExceptionCode.SENDING_POLICY_REVISION_CONFLICT,
    });

    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE core."connectedAccount"'),
      expect.anything(),
    );
  });

  it('returns the previous result for an exact idempotent replay', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM core."messageChannel"')) return [];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT * FROM core."connectedAccount"')) {
        return [
          {
            ...account,
            dailySendLimit: 75,
            sendingPolicyIdempotencyKey: idempotencyKey,
            sendingPolicyRevision: 5,
          },
        ];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      service.updateRevisioned({
        connectedAccountId,
        dailySendLimit: 75,
        expectedRevision: 4,
        idempotencyKey,
        minimumSendIntervalMs: 300_000,
        workspaceId,
      }),
    ).resolves.toMatchObject({ sendingPolicyRevision: 5 });

    expect(spacingGuard.assertCanChange).not.toHaveBeenCalled();
  });
});
