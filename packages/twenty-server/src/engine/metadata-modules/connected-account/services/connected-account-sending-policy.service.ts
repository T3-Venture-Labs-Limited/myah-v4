import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, type Repository } from 'typeorm';

import { campaignMailboxAdvisoryKeys } from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';

import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountSendingPolicySpacingGuardService } from 'src/engine/metadata-modules/connected-account/services/connected-account-sending-policy-spacing-guard.service';

const GRAPHQL_INT_MAX = 2_147_483_647;
const rows = <T>(value: unknown): T[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as T[])
    : Array.isArray(value)
      ? (value as T[])
      : [];

export type UpdateConnectedAccountSendingPolicyParams = {
  connectedAccountId: string;
  dailySendLimit: number;
  minimumSendIntervalMs: number;
  workspaceId: string;
};

type UpdateRevisionedConnectedAccountSendingPolicyParams =
  UpdateConnectedAccountSendingPolicyParams & {
    expectedRevision: number;
    idempotencyKey: string;
  };

@Injectable()
export class ConnectedAccountSendingPolicyService {
  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly repository: Repository<ConnectedAccountEntity>,
    private readonly spacingGuard: ConnectedAccountSendingPolicySpacingGuardService = new ConnectedAccountSendingPolicySpacingGuardService(),
  ) {}

  async updateRevisioned({
    connectedAccountId,
    dailySendLimit,
    expectedRevision,
    idempotencyKey,
    minimumSendIntervalMs,
    workspaceId,
  }: UpdateRevisionedConnectedAccountSendingPolicyParams): Promise<ConnectedAccountEntity> {
    this.assertValidPolicy(dailySendLimit, minimumSendIntervalMs);

    return this.repository.manager.transaction(async (manager) => {
      const channels = rows<{ id: string }>(
        await manager.query(
          `SELECT id FROM core."messageChannel"
            WHERE "workspaceId"=$1 AND "connectedAccountId"=$2
            ORDER BY id`,
          [workspaceId, connectedAccountId],
        ),
      );

      for (const key of campaignMailboxAdvisoryKeys({
        connectedAccountId,
        messageChannelIds: channels.map(({ id }) => id),
        workspaceId,
      })) {
        await manager.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
          [key],
        );
      }

      const accounts = rows<ConnectedAccountEntity>(
        await manager.query(
          `SELECT * FROM core."connectedAccount"
            WHERE id=$1 AND "workspaceId"=$2 AND "archivedAt" IS NULL
            FOR UPDATE`,
          [connectedAccountId, workspaceId],
        ),
      );
      const account = accounts[0];

      if (accounts.length !== 1 || account === undefined) {
        throw new ConnectedAccountException(
          `Connected account ${connectedAccountId} not found`,
          ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
        );
      }

      if (account.sendingPolicyIdempotencyKey === idempotencyKey) {
        if (
          account.dailySendLimit === dailySendLimit &&
          account.minimumSendIntervalMs === minimumSendIntervalMs
        ) {
          return account;
        }
        throw new ConnectedAccountException(
          'Sending policy idempotency key was reused with different values',
          ConnectedAccountExceptionCode.SENDING_POLICY_REVISION_CONFLICT,
        );
      }

      if (account.sendingPolicyRevision !== expectedRevision) {
        throw new ConnectedAccountException(
          'Sending policy revision is stale',
          ConnectedAccountExceptionCode.SENDING_POLICY_REVISION_CONFLICT,
        );
      }

      if (account.minimumSendIntervalMs !== minimumSendIntervalMs) {
        await this.spacingGuard.assertCanChange(
          { connectedAccountId, workspaceId },
          manager,
        );
      }

      const updated = rows<ConnectedAccountEntity>(
        await manager.query(
          `UPDATE core."connectedAccount"
              SET "dailySendLimit"=$3,
                  "minimumSendIntervalMs"=$4,
                  "sendingPolicyRevision"="sendingPolicyRevision"+1,
                  "sendingPolicyIdempotencyKey"=$5,
                  "updatedAt"=clock_timestamp()
            WHERE id=$1 AND "workspaceId"=$2 AND "archivedAt" IS NULL
              AND "sendingPolicyRevision"=$6
            RETURNING *`,
          [
            connectedAccountId,
            workspaceId,
            dailySendLimit,
            minimumSendIntervalMs,
            idempotencyKey,
            expectedRevision,
          ],
        ),
      );

      if (updated.length !== 1) {
        throw new ConnectedAccountException(
          'Sending policy revision changed during update',
          ConnectedAccountExceptionCode.SENDING_POLICY_REVISION_CONFLICT,
        );
      }

      return updated[0];
    });
  }

  async update({
    connectedAccountId,
    dailySendLimit,
    minimumSendIntervalMs,
    workspaceId,
  }: UpdateConnectedAccountSendingPolicyParams): Promise<ConnectedAccountEntity> {
    this.assertValidPolicy(dailySendLimit, minimumSendIntervalMs);

    const activeWorkspacePredicate = {
      archivedAt: IsNull(),
      id: connectedAccountId,
      workspaceId,
    };
    const updateResult = await this.repository.update(
      activeWorkspacePredicate,
      {
        dailySendLimit,
        minimumSendIntervalMs,
      },
    );

    if (updateResult.affected !== 1) {
      throw new ConnectedAccountException(
        `Connected account ${connectedAccountId} not found`,
        ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    const connectedAccount = await this.repository.findOne({
      where: activeWorkspacePredicate,
    });

    if (!connectedAccount) {
      throw new ConnectedAccountException(
        `Connected account ${connectedAccountId} not found`,
        ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    return connectedAccount;
  }

  private assertValidPolicy(
    dailySendLimit: number,
    minimumSendIntervalMs: number,
  ): void {
    if (
      !Number.isInteger(dailySendLimit) ||
      dailySendLimit <= 0 ||
      dailySendLimit > GRAPHQL_INT_MAX ||
      !Number.isInteger(minimumSendIntervalMs) ||
      minimumSendIntervalMs <= 0 ||
      minimumSendIntervalMs > GRAPHQL_INT_MAX
    ) {
      throw new ConnectedAccountException(
        'Sending policy values must be integers between 1 and 2147483647',
        ConnectedAccountExceptionCode.INVALID_CONNECTED_ACCOUNT_INPUT,
      );
    }
  }
}
