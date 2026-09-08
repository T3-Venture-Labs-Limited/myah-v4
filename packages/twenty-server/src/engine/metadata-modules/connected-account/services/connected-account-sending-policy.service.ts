import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, type Repository } from 'typeorm';

import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

const GRAPHQL_INT_MAX = 2_147_483_647;

export type UpdateConnectedAccountSendingPolicyParams = {
  connectedAccountId: string;
  dailySendLimit: number;
  minimumSendIntervalMs: number;
  workspaceId: string;
};

@Injectable()
export class ConnectedAccountSendingPolicyService {
  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly repository: Repository<ConnectedAccountEntity>,
  ) {}

  async update({
    connectedAccountId,
    dailySendLimit,
    minimumSendIntervalMs,
    workspaceId,
  }: UpdateConnectedAccountSendingPolicyParams): Promise<ConnectedAccountEntity> {
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
}
