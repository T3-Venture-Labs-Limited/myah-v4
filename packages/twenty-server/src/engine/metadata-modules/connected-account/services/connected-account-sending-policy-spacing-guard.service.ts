import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  ConnectedAccountException,
  ConnectedAccountExceptionCode,
} from 'src/engine/metadata-modules/connected-account/connected-account.exception';

const rows = <T>(value: unknown): T[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as T[])
    : Array.isArray(value)
      ? (value as T[])
      : [];

@Injectable()
export class ConnectedAccountSendingPolicySpacingGuardService {
  async assertCanChange(
    input: { connectedAccountId: string; workspaceId: string },
    manager: EntityManager,
  ): Promise<void> {
    const queryRunner = manager.queryRunner;

    if (
      queryRunner === undefined ||
      queryRunner.isReleased ||
      !queryRunner.isTransactionActive
    ) {
      throw new Error('Sending policy spacing guard requires a transaction');
    }

    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    const result = rows<{ blocked: boolean }>(
      await queryRunner.query(
        `SELECT EXISTS (
         SELECT 1 FROM core."outboundEmailAttempt" a
          WHERE a."workspaceId"=$1 AND a."connectedAccountId"=$2
            AND a.source='CAMPAIGN_SEQUENCE'
            AND a."attemptState" IN ('RESERVED','PROCESSING','UNKNOWN')
         UNION ALL
         SELECT 1 FROM core."campaignOccurrence" o
           JOIN "${schemaName}"."campaignAccount" account
             ON account."campaignId"=o."campaignId"
            AND account."connectedAccountId"=$2
            AND account."deletedAt" IS NULL
          WHERE o."workspaceId"=$1
            AND o.state IN ('PENDING','HELD','IN_FLIGHT','UNKNOWN')
       ) AS blocked`,
        [input.workspaceId, input.connectedAccountId],
      ),
    );

    if (result.length !== 1 || result[0]?.blocked !== false) {
      throw new ConnectedAccountException(
        'Minimum spacing cannot change while Campaign email work is active',
        ConnectedAccountExceptionCode.SENDING_POLICY_CONFLICT,
      );
    }
  }
}
