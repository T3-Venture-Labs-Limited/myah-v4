import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, type Repository } from 'typeorm';

import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

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
      !Number.isInteger(minimumSendIntervalMs) ||
      minimumSendIntervalMs <= 0
    ) {
      throw new ConnectedAccountException(
        'Sending policy values must be positive integers',
        ConnectedAccountExceptionCode.INVALID_CONNECTED_ACCOUNT_INPUT,
      );
    }

    const connectedAccount = await this.repository.findOne({
      where: {
        archivedAt: IsNull(),
        id: connectedAccountId,
        workspaceId,
      },
    });

    if (!connectedAccount) {
      throw new ConnectedAccountException(
        `Connected account ${connectedAccountId} not found`,
        ConnectedAccountExceptionCode.CONNECTED_ACCOUNT_NOT_FOUND,
      );
    }

    connectedAccount.dailySendLimit = dailySendLimit;
    connectedAccount.minimumSendIntervalMs = minimumSendIntervalMs;

    return this.repository.save(connectedAccount);
  }
}
