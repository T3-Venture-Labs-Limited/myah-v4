import { type EntityManager } from 'typeorm';

import { ConnectedAccountExceptionCode } from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { ConnectedAccountSendingPolicySpacingGuardService } from 'src/engine/metadata-modules/connected-account/services/connected-account-sending-policy-spacing-guard.service';

const workspaceId = '20202020-1111-4444-8888-111111111111';
const connectedAccountId = '20202020-2222-4444-8888-222222222222';

const manager = (query: jest.Mock) =>
  ({
    queryRunner: { isReleased: false, isTransactionActive: true, query },
  }) as unknown as EntityManager;

describe('ConnectedAccountSendingPolicySpacingGuardService', () => {
  const service = new ConnectedAccountSendingPolicySpacingGuardService();

  it('rejects spacing changes while linked Campaign work is active', async () => {
    const query = jest.fn().mockResolvedValue([{ blocked: true }]);

    await expect(
      service.assertCanChange(
        { connectedAccountId, workspaceId },
        manager(query),
      ),
    ).rejects.toMatchObject({
      code: ConnectedAccountExceptionCode.SENDING_POLICY_CONFLICT,
    });
    expect(query.mock.calls[0][0]).toContain(
      `o.state IN ('PENDING','HELD','IN_FLIGHT','UNKNOWN')`,
    );
    expect(query.mock.calls[0][0]).toContain(
      `a."attemptState" IN ('RESERVED','PROCESSING','UNKNOWN')`,
    );
  });

  it('allows spacing changes after all affected work settles', async () => {
    const query = jest.fn().mockResolvedValue([{ blocked: false }]);

    await expect(
      service.assertCanChange(
        { connectedAccountId, workspaceId },
        manager(query),
      ),
    ).resolves.toBeUndefined();
  });
});
