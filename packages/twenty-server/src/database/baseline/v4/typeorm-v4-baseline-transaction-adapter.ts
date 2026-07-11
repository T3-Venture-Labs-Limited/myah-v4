import type { V4BaselineMarker } from './classify-v4-baseline-state';
import type {
  V4BaselineTransaction,
  V4BaselineTransactionAdapter,
} from './run-v4-baseline';

export type V4BaselineQueryRunner = Readonly<{
  connect: () => Promise<void>;
  startTransaction: () => Promise<void>;
  commitTransaction: () => Promise<void>;
  rollbackTransaction: () => Promise<void>;
  release: () => Promise<void>;
  isTransactionActive: boolean;
  query: <Result>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<Result>;
}>;

const INSERT_MARKER_SQL = `
INSERT INTO core._myah_schema_baseline (
  product,
  schema_version,
  schema_fingerprint,
  catalog_fingerprint,
  applied_at
) VALUES ($1, $2, $3, $4, $5)
`;

const createTransaction = (
  queryRunner: V4BaselineQueryRunner,
): V4BaselineTransaction => ({
  query: <Result>(sql: string, parameters?: readonly unknown[]) =>
    queryRunner.query<Result>(sql, parameters),
  writeMarker: async (marker: V4BaselineMarker): Promise<void> => {
    await queryRunner.query(INSERT_MARKER_SQL, [
      marker.product,
      marker.schemaVersion,
      marker.schemaFingerprint,
      marker.catalogFingerprint,
      marker.appliedAt,
    ]);
  },
});

export const createV4BaselineTransactionAdapter = (
  queryRunner: V4BaselineQueryRunner,
): V4BaselineTransactionAdapter => ({
  transaction: async <Result>(
    callback: (
      transaction: V4BaselineTransaction,
    ) => Promise<Result>,
  ): Promise<Result> => {
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const result = await callback(createTransaction(queryRunner));
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  },
});
