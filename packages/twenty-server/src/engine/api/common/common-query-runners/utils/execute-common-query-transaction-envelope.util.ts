import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

type CommonQueryTransactionCleanupFailure = {
  error: unknown;
  stage: 'release' | 'rollback';
  transactionCommitted: boolean;
};

export const executeCommonQueryTransactionEnvelope = async <Result>(
  workspaceDataSource: GlobalWorkspaceDataSource,
  execute: (entityManager: WorkspaceEntityManager) => Promise<Result>,
  onCommitted?: () => void | Promise<void>,
  reportCleanupFailure?: (
    failure: CommonQueryTransactionCleanupFailure,
  ) => void,
): Promise<Result> => {
  const queryRunner = workspaceDataSource.createQueryRunner();
  let committed = false;
  let connected = false;
  let failed = false;
  let primaryError: unknown;
  let result!: Result;

  try {
    await queryRunner.connect();
    connected = true;
    await queryRunner.startTransaction();

    result = await execute(queryRunner.manager as WorkspaceEntityManager);

    await queryRunner.commitTransaction();
    committed = true;
    await onCommitted?.();
  } catch (error) {
    failed = true;
    primaryError = error;

    if (!committed && connected && queryRunner.isTransactionActive) {
      try {
        await queryRunner.rollbackTransaction();
      } catch (rollbackError) {
        try {
          reportCleanupFailure?.({
            error: rollbackError,
            stage: 'rollback',
            transactionCommitted: committed,
          });
        } catch {
          // Cleanup diagnostics must never replace the primary failure.
        }
      }
    }
  } finally {
    try {
      await queryRunner.release();
    } catch (releaseError) {
      try {
        reportCleanupFailure?.({
          error: releaseError,
          stage: 'release',
          transactionCommitted: committed,
        });
      } catch {
        // Cleanup diagnostics must never affect the operation outcome.
      }

      if (!committed && !failed) {
        failed = true;
        primaryError = releaseError;
      }
    }
  }

  if (failed) {
    throw primaryError;
  }

  return result;
};
