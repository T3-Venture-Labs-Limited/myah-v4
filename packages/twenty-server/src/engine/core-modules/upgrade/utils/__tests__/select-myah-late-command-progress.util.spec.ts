import { selectMyahLateCommandProgress } from '../select-myah-late-command-progress.util';

const F =
  '2.20.0_CreateCampaignPartnershipWorkItemFastInstanceCommand_1790000000001';
const G =
  '2.20.0_AddCampaignReplyAmbiguitySnapshotFastInstanceCommand_1790000000002';
const B = '2.20.0_SynchronizeMyahPartnershipFactsCommand_1789730000001';
const BEFORE = '2.20.0_BeforeCommand_1';
const AFTER = '2.20.0_AfterCommand_2';
const sequence = [
  { name: BEFORE, kind: 'fast-instance' as const },
  { name: F, kind: 'fast-instance' as const },
  { name: G, kind: 'fast-instance' as const },
  { name: B, kind: 'workspace' as const },
  { name: AFTER, kind: 'workspace' as const },
];
const row = (
  name: string,
  createdAt: number,
  options: Partial<{
    workspaceId: string | null;
    status: 'completed' | 'failed';
    attempt: number;
    isInitial: boolean;
  }> = {},
) => ({
  id: `${name}-${createdAt}-${options.workspaceId ?? 'null'}`,
  name,
  workspaceId: options.workspaceId ?? null,
  createdAt: new Date(createdAt),
  status: options.status ?? ('completed' as const),
  attempt: options.attempt ?? 1,
  isInitial: options.isInitial ?? false,
});
const select = (
  nativeBaselineRows: ReturnType<typeof row>[],
  selectedRows: ReturnType<typeof row>[],
  workspaceId: string | null = null,
) =>
  selectMyahLateCommandProgress({
    sequence,
    workspaceId,
    nativeBaselineRows,
    selectedRows,
  });

describe('selectMyahLateCommandProgress', () => {
  it.each(['completed', 'failed'] as const)(
    'preserves a later %s native receipt across late selected receipts and restart',
    (status) => {
      const x = row(AFTER, 10, { status });
      const native = [x];
      const selected = [row(F, 20), row(G, 21)];
      expect(select(native, selected).progress).toBe(x);
      expect(select(native, selected).progress).toBe(x);
      expect(select(native, selected).outstanding).toEqual([]);
    },
  );

  it('uses latest attempt per identity before rank and exposes failed selected obligations', () => {
    const old = row(F, 4);
    const failed = row(F, 30, { attempt: 2, status: 'failed' });
    const result = select([row(BEFORE, 3)], [old, failed, row(G, 11)]);
    expect(result.progress.name).toBe(G);
    expect(result.outstanding).toEqual([{ name: F, receipt: failed }]);
  });

  it('allows real selected receipts to advance an earlier native baseline without inventing completion', () => {
    const failed = row(B, 15, { status: 'failed', workspaceId: 'w1' });
    const result = select(
      [row(BEFORE, 2, { workspaceId: 'w1' })],
      [
        row(F, 10, { workspaceId: 'w1' }),
        row(G, 11, { workspaceId: 'w1' }),
        failed,
      ],
      'w1',
    );
    expect(result.progress).toBe(failed);
    expect(result.progress.status).toBe('failed');
    expect(result.outstanding).toEqual([{ name: B, receipt: failed }]);
  });

  it('retains genuine workspace initial checkpoints but does not count them as B execution', () => {
    const marker = row(B, 2, { workspaceId: 'w1', isInitial: true });
    const result = select([marker], [], 'w1');
    expect(result.progress).toBe(marker);
    expect(result.outstanding).toEqual([
      { name: F, receipt: null },
      { name: G, receipt: null },
      { name: B, receipt: null },
    ]);
    const executed = row(B, 3, { workspaceId: 'w1', attempt: 2 });
    expect(select([marker], [executed], 'w1').progress).toBe(executed);
    expect(select([marker], [executed], 'w1').outstanding).toEqual([
      { name: F, receipt: null },
      { name: G, receipt: null },
    ]);
  });

  it('keeps null-instance scopes independent and rejects foreign workspace rows', () => {
    const x = row(AFTER, 3);
    expect(select([x], [row(F, 4)]).progress).toBe(x);
    expect(select([x], []).outstanding).toEqual([
      { name: F, receipt: null },
      { name: G, receipt: null },
    ]);
    expect(() => select([x], [row(B, 4)])).toThrow(/Workspace/);
    expect(() => select([x], [row(F, 4, { workspaceId: 'w2' })])).toThrow(
      /scope/,
    );
    expect(() =>
      select([row(AFTER, 3, { workspaceId: 'w2' })], [], 'w1'),
    ).toThrow(/scope/);
    const w1 = row(AFTER, 5, { workspaceId: 'w1', status: 'failed' });
    const w2 = row(BEFORE, 6, { workspaceId: 'w2' });
    expect(
      select([w1], [row(B, 10, { workspaceId: 'w1' })], 'w1').progress,
    ).toBe(w1);
    expect(
      select([w2], [row(B, 11, { workspaceId: 'w2' })], 'w2').progress.name,
    ).toBe(B);
  });

  it('rejects unknown baselines, empty lineage and contradictory native time ties', () => {
    expect(() => select([], [row(F, 10)])).toThrow(/baseline/);
    expect(() => select([row('unknown', 1)], [row(F, 10)])).toThrow(/baseline/);
    expect(() => select([row(BEFORE, 1), row(AFTER, 1)], [])).toThrow(/tie/);
  });

  it('rejects duplicate registered identities, wrong selected kind/order and duplicate attempts', () => {
    expect(() =>
      selectMyahLateCommandProgress({
        sequence: [...sequence, sequence[1]],
        workspaceId: null,
        nativeBaselineRows: [row(BEFORE, 1)],
        selectedRows: [],
      }),
    ).toThrow(/sequence/);
    expect(() =>
      selectMyahLateCommandProgress({
        sequence: [
          sequence[0],
          sequence[3],
          sequence[1],
          sequence[2],
          sequence[4],
        ],
        workspaceId: null,
        nativeBaselineRows: [row(BEFORE, 1)],
        selectedRows: [],
      }),
    ).toThrow(/order/);
    expect(() =>
      selectMyahLateCommandProgress({
        sequence: sequence.filter((step) => step.name !== G),
        workspaceId: null,
        nativeBaselineRows: [row(BEFORE, 1)],
        selectedRows: [],
      }),
    ).toThrow(/sequence/);
    expect(() => select([row(BEFORE, 1)], [row(F, 2), row(F, 3)])).toThrow(
      /attempt/,
    );
  });

  it('rejects aliased and separately materialized cross-partition rows, including duplicate ids', () => {
    const f = row(F, 10);
    expect(() => select([f], [f])).toThrow(/partition/);
    expect(() => select([row(F, 10)], [row(F, 10)])).toThrow(/partition/);
    expect(() => select([row(BEFORE, 1)], [f, { ...f, attempt: 2 }])).toThrow(
      /id/,
    );
  });

  it('rejects nonadjacent duplicate attempts but permits workspace instance fan-out beginning at attempt 2', () => {
    const f = row(F, 10, { workspaceId: 'w1', attempt: 2 });
    expect(
      select([row(BEFORE, 1, { workspaceId: 'w1' })], [f], 'w1').progress,
    ).toBe(f);
    expect(() =>
      select(
        [row(BEFORE, 1)],
        [row(F, 2), row(F, 4, { attempt: 2 }), row(F, 3)],
      ),
    ).toThrow(/attempt/);
  });

  it('rejects malformed runtime status and initial flag rather than claiming selected completion', () => {
    const baseline = row(BEFORE, 1);
    expect(() =>
      select([baseline], [{ ...row(F, 2), status: 'ongoing' as 'completed' }]),
    ).toThrow(/status/);
    expect(() =>
      select(
        [baseline],
        [{ ...row(F, 2), status: undefined as unknown as 'completed' }],
      ),
    ).toThrow(/status/);
    expect(() =>
      select([{ ...baseline, isInitial: 'false' as unknown as boolean }], []),
    ).toThrow(/isInitial/);
  });

  it('rejects backwards nonselected lineage and ties across selected and native positions', () => {
    expect(() => select([row(AFTER, 1), row(BEFORE, 2)], [])).toThrow(
      /lineage/,
    );
    expect(() =>
      select(
        [row(F, 2, { isInitial: true, workspaceId: 'w1' })],
        [
          {
            ...row(F, 2, { workspaceId: 'w1', attempt: 2 }),
            id: 'distinct-execution',
          },
        ],
        'w1',
      ),
    ).toThrow(/tie/);
  });
});
