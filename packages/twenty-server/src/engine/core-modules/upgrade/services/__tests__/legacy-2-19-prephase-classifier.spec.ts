import {
  classifyLegacy219PrePhase,
  fingerprintLegacy219Catalog,
  type Legacy219PrePhaseSnapshot,
} from 'src/engine/core-modules/upgrade/services/legacy-2-19-prephase-classifier';

const original: Legacy219PrePhaseSnapshot = {
  catalogHash:
    'd974e942789da450c56040e1a0120de760841ae5e79ad521f058c71b67e543a5',
  ledgerHash:
    'd0eb7a801ca1945836e3a21fef6f9e27a93ba91d9f8a7cc09b45767362df943c',
  tables: ['myahWorkspaceInstallation'],
  rowCounts: { myahWorkspaceInstallation: 0 },
  latestGlobal: [
    {
      name: '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206',
      status: 'completed',
      attempt: 1,
    },
  ],
  checkpoints: [
    {
      activation_status: 'ACTIVE',
      name: '2.19.0_BackfillSystemUniqueIndexUniversalIdentifierCommand_1783093620000',
      cursor_status: 'completed',
      attempt: 1,
    },
  ],
  ledger: [
    { status: 'completed', isInitial: false, is_instance: true, n: 98 },
    { status: 'completed', isInitial: true, is_instance: false, n: 1 },
  ],
  prerequisites: [],
  lineage: [
    {
      name: '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206',
      status: 'completed',
      attempt: 1,
      is_instance: true,
    },
  ],
  rowRelations: {
    orphan_receipts: 0,
    nonactive_bindings: 0,
    invalid_actors: 0,
  },
};
const failed167: Legacy219PrePhaseSnapshot = {
  ...original,
  catalogHash:
    '0674258d7d82eafeba9fa25564020add3f094e27f92cf0e21e2d1d032ff3d970',
  ledgerHash:
    '877ce9eecb261fba0e9e5817daef8c303877c86abaf7bf9c7d22ec6f2c0e37ac',
  tables: [
    'instagramReplyApprovalRequest',
    'instagramReplyExecutionReceipt',
    'myahWorkspaceInstallation',
  ],
  rowCounts: {
    instagramReplyApprovalRequest: 2,
    instagramReplyExecutionReceipt: 2,
    myahWorkspaceInstallation: 0,
  },
  latestGlobal: [
    {
      name: '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
      status: 'failed',
      attempt: 1,
    },
  ],
  checkpoints: [
    {
      activation_status: 'ACTIVE',
      name: '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
      cursor_status: 'failed',
      attempt: 1,
    },
  ],
  ledger: [
    { status: 'completed', isInitial: false, is_instance: false, n: 1 },
    { status: 'completed', isInitial: false, is_instance: true, n: 99 },
    { status: 'completed', isInitial: true, is_instance: false, n: 1 },
    { status: 'failed', isInitial: false, is_instance: false, n: 1 },
    { status: 'failed', isInitial: false, is_instance: true, n: 1 },
  ],
  lineage: [
    {
      name: '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001',
      status: 'completed',
      attempt: 1,
      is_instance: true,
    },
    {
      name: '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001',
      status: 'completed',
      attempt: 1,
      is_instance: false,
    },
    {
      name: '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
      status: 'failed',
      attempt: 1,
      is_instance: true,
    },
    {
      name: '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
      status: 'failed',
      attempt: 1,
      is_instance: false,
    },
    {
      name: '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206',
      status: 'completed',
      attempt: 1,
      is_instance: true,
    },
  ],
};

describe('legacy 2.19 pre-phase classification (not a reconciliation)', () => {
  it('recognizes only the observed original and populated failed167 source phases', () => {
    expect(classifyLegacy219PrePhase(original)).toBe('original-absent');
    expect(classifyLegacy219PrePhase(failed167)).toBe('failed167-legacy');
  });

  it.each([
    [
      'malformed default, length, constraint, index or enum',
      { catalogHash: 'wrong' },
    ],
    [
      'partial physical table family',
      {
        tables: ['myahWorkspaceInstallation', 'instagramReplyApprovalRequest'],
      },
    ],
    ['fabricated fast receipt', { prerequisites: [{ name: '151' }] }],
    ['replaced unrelated historical receipt', { ledgerHash: 'wrong' }],
    [
      'missing native 166 workspace completion',
      {
        lineage: failed167.lineage.filter(
          (row) =>
            !(
              row.name.includes('AddInstagramReplyApprovalProviderBinding') &&
              !row.is_instance
            ),
        ),
      },
    ],
    [
      'staggered workspace cursor',
      { checkpoints: [...failed167.checkpoints, failed167.checkpoints[0]] },
    ],
    [
      'retained inactive reference',
      { rowRelations: { ...failed167.rowRelations, nonactive_bindings: 1 } },
    ],
    [
      'orphan receipt',
      { rowRelations: { ...failed167.rowRelations, orphan_receipts: 1 } },
    ],
    [
      'invalid actor',
      { rowRelations: { ...failed167.rowRelations, invalid_actors: 1 } },
    ],
    [
      'incompatible latest status',
      { latestGlobal: [{ ...failed167.latestGlobal[0], status: 'completed' }] },
    ],
    [
      'partial billing installation',
      { rowCounts: { ...failed167.rowCounts, myahWorkspaceInstallation: 1 } },
    ],
  ])('rejects %s', (_case, changed) => {
    expect(() =>
      classifyLegacy219PrePhase({ ...failed167, ...changed }),
    ).toThrow('Unsupported legacy 2.19 pre-phase');
  });

  it('fingerprints the full ordered catalog, not just table names', () => {
    expect(
      fingerprintLegacy219Catalog({ columns: [{ name: 'id', default: null }] }),
    ).not.toBe(
      fingerprintLegacy219Catalog({
        columns: [{ name: 'id', default: 'now()' }],
      }),
    );
  });
});
