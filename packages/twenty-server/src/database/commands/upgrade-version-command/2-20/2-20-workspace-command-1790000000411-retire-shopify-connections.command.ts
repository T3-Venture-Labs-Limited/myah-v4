import { InjectRepository } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type QueryResult, type QueryRunner, type Repository } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';

export const RETIRED_SHOPIFY_CONNECTED_ACCOUNT_NAME = 'Shopify';

type Candidate = {
  id: string;
  name: string | null;
  handle: string;
  visibility: string;
  userWorkspaceId: string;
  userWorkspaceWorkspaceId: string | null;
  applicationId: string | null;
  applicationWorkspaceId: string | null;
  applicationUniversalIdentifier: string | null;
  connectionProviderId: string | null;
  providerApplicationId: string | null;
  providerWorkspaceId: string | null;
};

const candidateSql = `SELECT ca.id, ca.name, ca.handle, ca.visibility, ca."userWorkspaceId",
              uw."workspaceId" AS "userWorkspaceWorkspaceId",
              ca."applicationId", app."workspaceId" AS "applicationWorkspaceId",
              app."universalIdentifier" AS "applicationUniversalIdentifier",
              ca."connectionProviderId", cp."applicationId" AS "providerApplicationId",
              cp."workspaceId" AS "providerWorkspaceId"
         FROM core."connectedAccount" ca
         LEFT JOIN core.application app ON app.id = ca."applicationId"
         LEFT JOIN core."connectionProvider" cp ON cp.id = ca."connectionProviderId"
         LEFT JOIN core."userWorkspace" uw ON uw.id = ca."userWorkspaceId"
        WHERE ca."workspaceId" = $1 AND ca."archivedAt" IS NULL
          AND ca.provider = $2
          AND (ca.name = $3 OR app."universalIdentifier" = $4)
        ORDER BY ca.id`;
const candidateParameters = (workspaceId: string) => [
  workspaceId,
  ConnectedAccountProvider.APP,
  RETIRED_SHOPIFY_CONNECTED_ACCOUNT_NAME,
  RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
];

// Historical native saveConnection used no application/provider ownership: it
// wrote this exact normalized domain, workspace visibility and userWorkspace.
// Do not treat the display name alone as proof of that legacy origin.
const NATIVE_SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const hasExactIds = (rows: unknown, ids: string[]): boolean =>
  Array.isArray(rows) &&
  rows.length === ids.length &&
  new Set(
    rows.map((row: unknown) =>
      row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined,
    ),
  ).size === ids.length &&
  rows.every(
    (row: unknown) =>
      row !== null &&
      typeof row === 'object' &&
      typeof (row as { id?: unknown }).id === 'string' &&
      ids.includes((row as { id: string }).id),
  );

const assertVerifiedCandidates = (
  candidates: Candidate[],
  workspaceId: string,
) => {
  if (
    candidates.some((row) => {
      // Both app-owned and historical native records must resolve to a
      // userWorkspace belonging to this workspace before either can archive.
      if (
        !row.userWorkspaceId ||
        row.userWorkspaceWorkspaceId !== workspaceId
      ) {
        return true;
      }
      if (row.applicationId !== null) {
        return (
          row.applicationWorkspaceId !== workspaceId ||
          row.applicationUniversalIdentifier !==
            RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER ||
          (row.connectionProviderId !== null &&
            (row.providerApplicationId !== row.applicationId ||
              row.providerWorkspaceId !== workspaceId))
        );
      }
      return (
        row.name !== RETIRED_SHOPIFY_CONNECTED_ACCOUNT_NAME ||
        row.connectionProviderId !== null ||
        row.visibility !== 'workspace' ||
        !NATIVE_SHOP_DOMAIN.test(row.handle)
      );
    })
  ) {
    throw new Error(
      'Ambiguous or foreign Shopify connection ownership; no accounts archived',
    );
  }
};

@RegisteredWorkspaceCommand('2.20.0', 1790000000411)
@Command({
  name: 'upgrade:2-20:retire-shopify-connections',
  description:
    'Archive verified Shopify connections while preserving encrypted recovery data',
})
export class RetireShopifyConnectionsCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    options,
    workspaceId,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!options.dryRun) {
      throw new Error(
        'Shopify retirement requires a pinned upgrade transaction',
      );
    }
    const candidates: Candidate[] = await this.connectedAccountRepository.query(
      candidateSql,
      candidateParameters(workspaceId),
    );
    assertVerifiedCandidates(candidates, workspaceId);
    this.logger.log(
      `${candidates.length} verified Shopify connection(s) found (dry run)`,
      workspaceId,
    );
  }

  override async runOnWorkspaceInUpgradeTransaction(
    { workspaceId, options }: RunOnWorkspaceArgs,
    runner: QueryRunner,
    afterCommit: (effect: () => Promise<void> | void) => void,
  ): Promise<void> {
    if (
      options.dryRun ||
      !runner?.isTransactionActive ||
      runner.isReleased ||
      runner.manager?.queryRunner !== runner ||
      typeof afterCommit !== 'function'
    ) {
      throw new Error(
        'Shopify retirement requires a pinned upgrade transaction',
      );
    }

    // Lock the candidate rows; the ordered upgrade owns the workspace write lock.
    // Select only identity columns: tokens and connection parameters never leave storage.
    const candidates: Candidate[] = await runner.query(
      `${candidateSql} FOR UPDATE OF ca`,
      candidateParameters(workspaceId),
    );
    assertVerifiedCandidates(candidates, workspaceId);

    this.logger.log(
      `${candidates.length} verified Shopify connection(s) found`,
      workspaceId,
    );
    if (candidates.length === 0) return;
    const ids = candidates.map(({ id }) => id);
    const updated: QueryResult<{ id: string }> = await runner.query(
      `UPDATE core."connectedAccount" SET "archivedAt" = NOW()
        WHERE "workspaceId" = $1 AND id = ANY($2::uuid[]) AND "archivedAt" IS NULL
        RETURNING id`,
      [workspaceId, ids],
      true,
    );
    const persisted: { id: string }[] = await runner.query(
      `SELECT id FROM core."connectedAccount"
        WHERE "workspaceId" = $1 AND id = ANY($2::uuid[]) AND "archivedAt" IS NOT NULL`,
      [workspaceId, ids],
    );
    if (
      updated.affected !== ids.length ||
      !hasExactIds(updated.records, ids) ||
      !hasExactIds(persisted, ids)
    ) {
      throw new Error('Shopify retirement postcondition failed');
    }
    // The sequence runner writes its receipt on this runner, before committing.
  }
}
