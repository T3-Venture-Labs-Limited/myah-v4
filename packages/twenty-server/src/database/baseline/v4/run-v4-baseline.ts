import {
  MYAH_V4_PRODUCT,
  MYAH_V4_SCHEMA_VERSION,
  V4_SCHEMA_FINGERPRINT,
  classifyV4BaselineState,
  type V4BaselineClassification,
  type V4BaselineMarker,
  type V4BaselineState,
} from './classify-v4-baseline-state';
import type { V4BaselineManifest } from './v4-baseline-manifest';

export type V4BaselineTransaction = Readonly<{
  query: <Result>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<Result>;
  writeMarker: (marker: V4BaselineMarker) => Promise<void>;
}>;

export type V4BaselineTransactionAdapter = Readonly<{
  transaction: <Result>(
    callback: (transaction: V4BaselineTransaction) => Promise<Result>,
  ) => Promise<Result>;
}>;

export type RunV4BaselineOptions = Readonly<{
  state: V4BaselineState;
  manifest: V4BaselineManifest;
  transactionAdapter: V4BaselineTransactionAdapter;
  applyBaseline: (transaction: V4BaselineTransaction) => Promise<void>;
  now?: () => string;
}>;

export const runV4Baseline = async ({
  state,
  manifest,
  transactionAdapter,
  applyBaseline,
  now = () => new Date().toISOString(),
}: RunV4BaselineOptions): Promise<V4BaselineClassification> => {
  const classification = classifyV4BaselineState(state, manifest);

  if (classification.action !== 'apply') {
    return classification;
  }

  await transactionAdapter.transaction(async (transaction) => {
    await applyBaseline(transaction);
    await transaction.writeMarker({
      product: MYAH_V4_PRODUCT,
      schemaVersion: MYAH_V4_SCHEMA_VERSION,
      schemaFingerprint: V4_SCHEMA_FINGERPRINT,
      catalogFingerprint: manifest.catalogFingerprint,
      appliedAt: now(),
    });
  });

  return classification;
};
