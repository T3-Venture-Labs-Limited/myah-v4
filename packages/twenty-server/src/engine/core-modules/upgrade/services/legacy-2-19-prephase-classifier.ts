import { createHash } from 'node:crypto';

export type Legacy219PrePhaseSnapshot = {
  catalogHash: string;
  tables: string[];
  rowCounts: Record<string, number>;
  latestGlobal: Array<{ name: string; status: string; attempt: number }>;
  checkpoints: Array<{
    activation_status: string;
    name: string;
    cursor_status: string;
    attempt: number;
  }>;
  // SHA-256 of all ordered {name,status,attempt,isInitial,is_instance} receipts,
  // with no workspace/customer IDs or receipt timestamps in the projection.
  ledgerHash: string;
  ledger: Array<{
    status: string;
    isInitial: boolean;
    is_instance: boolean;
    n: number;
  }>;
  prerequisites: unknown[];
  lineage: Array<{
    name: string;
    status: string;
    attempt: number;
    is_instance: boolean;
  }>;
  rowRelations: {
    orphan_receipts: number;
    nonactive_bindings: number;
    invalid_actors: number;
  };
};

export const fingerprintLegacy219Catalog = (catalog: unknown): string =>
  createHash('sha256').update(JSON.stringify(catalog)).digest('hex');

// Fingerprints cover every ordered column (including default/length/nullability),
// constraint definition, index definition/predicate and enum label in the named
// authority/billing families, from the authentic PG16 source-native restores.
// No digest is defined for generic, finalized, partially applied or post-R states.
const ORIGINAL_CATALOG =
  'd974e942789da450c56040e1a0120de760841ae5e79ad521f058c71b67e543a5';
const LEGACY_CATALOG =
  '0674258d7d82eafeba9fa25564020add3f094e27f92cf0e21e2d1d032ff3d970';
const ORIGINAL_LEDGER =
  'd0eb7a801ca1945836e3a21fef6f9e27a93ba91d9f8a7cc09b45767362df943c';
const LEGACY_LEDGER =
  '877ce9eecb261fba0e9e5817daef8c303877c86abaf7bf9c7d22ec6f2c0e37ac';
const REBRAND =
  '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206';
const BINDING =
  '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001';
const FINALIZE =
  '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059';
const INITIAL =
  '2.19.0_BackfillSystemUniqueIndexUniversalIdentifierCommand_1783093620000';
const originalLedger = [
  { status: 'completed', isInitial: false, is_instance: true, n: 98 },
  { status: 'completed', isInitial: true, is_instance: false, n: 1 },
];
const failedLedger = [
  { status: 'completed', isInitial: false, is_instance: false, n: 1 },
  { status: 'completed', isInitial: false, is_instance: true, n: 99 },
  { status: 'completed', isInitial: true, is_instance: false, n: 1 },
  { status: 'failed', isInitial: false, is_instance: false, n: 1 },
  { status: 'failed', isInitial: false, is_instance: true, n: 1 },
];
const attempt = (name: string, status: string, is_instance: boolean) => ({
  name,
  status,
  attempt: 1,
  is_instance,
});
const same = (actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected);

export const classifyLegacy219PrePhase = (
  snapshot: Legacy219PrePhaseSnapshot,
): 'original-absent' | 'failed167-legacy' => {
  const common =
    same(snapshot.prerequisites, []) &&
    same(snapshot.rowRelations, {
      orphan_receipts: 0,
      nonactive_bindings: 0,
      invalid_actors: 0,
    });

  if (
    common &&
    snapshot.catalogHash === ORIGINAL_CATALOG &&
    snapshot.ledgerHash === ORIGINAL_LEDGER &&
    same(snapshot.tables, ['myahWorkspaceInstallation']) &&
    same(snapshot.rowCounts, { myahWorkspaceInstallation: 0 }) &&
    same(snapshot.latestGlobal, [
      { name: REBRAND, status: 'completed', attempt: 1 },
    ]) &&
    same(snapshot.checkpoints, [
      {
        activation_status: 'ACTIVE',
        name: INITIAL,
        cursor_status: 'completed',
        attempt: 1,
      },
    ]) &&
    same(snapshot.ledger, originalLedger) &&
    same(snapshot.lineage, [attempt(REBRAND, 'completed', true)])
  ) {
    return 'original-absent';
  }

  if (
    common &&
    snapshot.catalogHash === LEGACY_CATALOG &&
    snapshot.ledgerHash === LEGACY_LEDGER &&
    same(snapshot.tables, [
      'instagramReplyApprovalRequest',
      'instagramReplyExecutionReceipt',
      'myahWorkspaceInstallation',
    ]) &&
    Object.keys(snapshot.rowCounts).length === 3 &&
    snapshot.rowCounts.myahWorkspaceInstallation === 0 &&
    Number.isSafeInteger(snapshot.rowCounts.instagramReplyApprovalRequest) &&
    snapshot.rowCounts.instagramReplyApprovalRequest >= 0 &&
    Number.isSafeInteger(snapshot.rowCounts.instagramReplyExecutionReceipt) &&
    snapshot.rowCounts.instagramReplyExecutionReceipt >= 0 &&
    snapshot.rowCounts.instagramReplyExecutionReceipt <=
      snapshot.rowCounts.instagramReplyApprovalRequest &&
    same(snapshot.latestGlobal, [
      { name: FINALIZE, status: 'failed', attempt: 1 },
    ]) &&
    same(snapshot.checkpoints, [
      {
        activation_status: 'ACTIVE',
        name: FINALIZE,
        cursor_status: 'failed',
        attempt: 1,
      },
    ]) &&
    same(snapshot.ledger, failedLedger) &&
    same(snapshot.lineage, [
      attempt(BINDING, 'completed', true),
      attempt(BINDING, 'completed', false),
      attempt(FINALIZE, 'failed', true),
      attempt(FINALIZE, 'failed', false),
      attempt(REBRAND, 'completed', true),
    ])
  ) {
    return 'failed167-legacy';
  }

  throw new Error('Unsupported legacy 2.19 pre-phase');
};
