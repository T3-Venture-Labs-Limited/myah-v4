import { validate } from 'class-validator';
import { getMetadataArgsStorage, IsNull, type Repository } from 'typeorm';

import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { UpdateConnectedAccountSendingPolicyInput } from 'src/engine/metadata-modules/connected-account/dtos/update-connected-account-sending-policy.input';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountResolver } from 'src/engine/metadata-modules/connected-account/resolvers/connected-account.resolver';
import { ConnectedAccountSendingPolicyService } from 'src/engine/metadata-modules/connected-account/services/connected-account-sending-policy.service';

const GRAPHQL_INT_MAX = 2_147_483_647;
const workspaceId = '20202020-1111-4444-8888-111111111111';
const connectedAccountId = '20202020-2222-4444-8888-222222222222';

const buildConnectedAccount = (
  overrides: Partial<ConnectedAccountEntity> = {},
): ConnectedAccountEntity =>
  ({
    id: connectedAccountId,
    workspaceId,
    userWorkspaceId: '20202020-3333-4444-8888-333333333333',
    handle: 'sender@example.com',
    provider: 'google',
    dailySendLimit: 50,
    minimumSendIntervalMs: 300_000,
    archivedAt: null,
    accessToken: null,
    refreshToken: null,
    connectionParameters: null,
    ...overrides,
  }) as ConnectedAccountEntity;

describe('ConnectedAccount sending policy', () => {
  describe('entity defaults', () => {
    it.each([
      ['dailySendLimit', 50],
      ['minimumSendIntervalMs', 300_000],
    ] as const)(
      'defines the non-null database default for %s',
      (property, value) => {
        const column = getMetadataArgsStorage().columns.find(
          ({ propertyName, target }) =>
            target === ConnectedAccountEntity && propertyName === property,
        );

        expect(column?.options).toMatchObject({
          default: value,
          nullable: false,
          type: 'integer',
        });
      },
    );
  });

  describe('input validation', () => {
    it.each([
      ['dailySendLimit', 0],
      ['dailySendLimit', -1],
      ['dailySendLimit', 1.5],
      ['minimumSendIntervalMs', 0],
      ['minimumSendIntervalMs', -1],
      ['minimumSendIntervalMs', 1.5],
    ] as const)('rejects invalid %s value %s', async (property, value) => {
      const input = Object.assign(
        new UpdateConnectedAccountSendingPolicyInput(),
        {
          connectedAccountId,
          dailySendLimit: 50,
          minimumSendIntervalMs: 300_000,
          [property]: value,
        },
      );

      const errors = await validate(input);

      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ property })]),
      );
    });

    it.each(['dailySendLimit', 'minimumSendIntervalMs'] as const)(
      'rejects %s above the signed GraphQL Int maximum',
      async (property) => {
        const input = Object.assign(
          new UpdateConnectedAccountSendingPolicyInput(),
          {
            connectedAccountId,
            dailySendLimit: 50,
            minimumSendIntervalMs: 300_000,
            [property]: GRAPHQL_INT_MAX + 1,
          },
        );

        await expect(validate(input)).resolves.toEqual(
          expect.arrayContaining([expect.objectContaining({ property })]),
        );
      },
    );

    it('accepts the signed GraphQL Int maximum', async () => {
      const input = Object.assign(
        new UpdateConnectedAccountSendingPolicyInput(),
        {
          connectedAccountId,
          dailySendLimit: GRAPHQL_INT_MAX,
          minimumSendIntervalMs: GRAPHQL_INT_MAX,
        },
      );

      await expect(validate(input)).resolves.toEqual([]);
    });
  });

  describe('service workspace authority', () => {
    const repository = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<ConnectedAccountEntity>>;
    const service = new ConnectedAccountSendingPolicyService(repository);

    const activeWorkspacePredicate = {
      archivedAt: IsNull(),
      id: connectedAccountId,
      workspaceId,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it.each([
      { dailySendLimit: 0, minimumSendIntervalMs: 300_000 },
      { dailySendLimit: 1.5, minimumSendIntervalMs: 300_000 },
      { dailySendLimit: GRAPHQL_INT_MAX + 1, minimumSendIntervalMs: 300_000 },
      { dailySendLimit: 50, minimumSendIntervalMs: -1 },
      { dailySendLimit: 50, minimumSendIntervalMs: 1.5 },
      { dailySendLimit: 50, minimumSendIntervalMs: GRAPHQL_INT_MAX + 1 },
    ])(
      'rejects invalid policy values at the service boundary',
      async (policy) => {
        await expect(
          service.update({
            connectedAccountId,
            workspaceId,
            ...policy,
          }),
        ).rejects.toMatchObject({
          code: ConnectedAccountExceptionCode.INVALID_CONNECTED_ACCOUNT_INPUT,
        });
        expect(repository.update).not.toHaveBeenCalled();
        expect(repository.findOne).not.toHaveBeenCalled();
      },
    );

    it('allows a same-workspace non-owner by writing only policy fields and reloading concurrent unrelated changes', async () => {
      const freshAccount = buildConnectedAccount({
        accessToken: 'new-access-token' as EncryptedString,
        dailySendLimit: GRAPHQL_INT_MAX,
        minimumSendIntervalMs: GRAPHQL_INT_MAX,
        refreshToken: 'new-refresh-token' as EncryptedString,
        userWorkspaceId: '20202020-5555-4444-8888-555555555555',
      });

      repository.update.mockResolvedValue({ affected: 1 } as never);
      repository.findOne.mockResolvedValue(freshAccount);

      await expect(
        service.update({
          connectedAccountId,
          dailySendLimit: GRAPHQL_INT_MAX,
          minimumSendIntervalMs: GRAPHQL_INT_MAX,
          workspaceId,
        }),
      ).resolves.toBe(freshAccount);

      expect(repository.update).toHaveBeenCalledWith(activeWorkspacePredicate, {
        dailySendLimit: GRAPHQL_INT_MAX,
        minimumSendIntervalMs: GRAPHQL_INT_MAX,
      });
      expect(repository.findOne).toHaveBeenCalledWith({
        where: activeWorkspacePredicate,
      });
    });

    it('rejects a concurrent archive when the conditional write affects no row', async () => {
      repository.update.mockResolvedValue({ affected: 0 } as never);

      await expect(
        service.update({
          connectedAccountId,
          dailySendLimit: 75,
          minimumSendIntervalMs: 120_000,
          workspaceId,
        }),
      ).rejects.toMatchObject<Partial<ConnectedAccountException>>({
        code: ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      });

      expect(repository.update).toHaveBeenCalledWith(activeWorkspacePredicate, {
        dailySendLimit: 75,
        minimumSendIntervalMs: 120_000,
      });
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('rejects a cross-workspace account id', async () => {
      const foreignWorkspaceId = '20202020-4444-4444-8888-444444444444';

      repository.update.mockResolvedValue({ affected: 0 } as never);

      await expect(
        service.update({
          connectedAccountId,
          dailySendLimit: 75,
          minimumSendIntervalMs: 120_000,
          workspaceId: foreignWorkspaceId,
        }),
      ).rejects.toMatchObject({
        code: ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      });
      expect(repository.update).toHaveBeenCalledWith(
        {
          archivedAt: IsNull(),
          id: connectedAccountId,
          workspaceId: foreignWorkspaceId,
        },
        {
          dailySendLimit: 75,
          minimumSendIntervalMs: 120_000,
        },
      );
    });

    it('rejects when the account is archived before the reload', async () => {
      repository.update.mockResolvedValue({ affected: 1 } as never);
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.update({
          connectedAccountId,
          dailySendLimit: 75,
          minimumSendIntervalMs: 120_000,
          workspaceId,
        }),
      ).rejects.toMatchObject({
        code: ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      });
    });
  });

  describe('resolver mutation', () => {
    it('returns the updated public policy values without checking account ownership', async () => {
      const updatedAccount = buildConnectedAccount({
        dailySendLimit: 80,
        minimumSendIntervalMs: 90_000,
      });
      const policyService = {
        update: jest.fn().mockResolvedValue(updatedAccount),
      };
      const resolver = new ConnectedAccountResolver(
        {} as never,
        policyService as never,
      );
      const input = {
        connectedAccountId,
        dailySendLimit: 80,
        minimumSendIntervalMs: 90_000,
      };

      await expect(
        resolver.updateConnectedAccountSendingPolicy(input, {
          id: workspaceId,
        } as WorkspaceEntity),
      ).resolves.toMatchObject({
        id: connectedAccountId,
        dailySendLimit: 80,
        minimumSendIntervalMs: 90_000,
      });
      expect(policyService.update).toHaveBeenCalledWith({
        ...input,
        workspaceId,
      });
    });
  });
});
