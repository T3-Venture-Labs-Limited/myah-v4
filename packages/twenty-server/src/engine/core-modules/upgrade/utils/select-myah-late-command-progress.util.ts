// This is a projection of real receipts, not an admission decision or a ledger write.
// The caller supplies one already-scoped receipt history and the ordered registry.
export type LateCommandReceipt = {
  id: string;
  name: string;
  workspaceId: string | null;
  status: 'completed' | 'failed';
  attempt: number;
  createdAt: Date;
  isInitial: boolean;
};

const SELECTED = [
  {
    name: '2.20.0_CreateCampaignPartnershipWorkItemFastInstanceCommand_1790000000001',
    kind: 'fast-instance',
  },
  {
    name: '2.20.0_AddCampaignReplyAmbiguitySnapshotFastInstanceCommand_1790000000002',
    kind: 'fast-instance',
  },
  {
    name: '2.20.0_SynchronizeMyahPartnershipFactsCommand_1789730000001',
    kind: 'workspace',
  },
] as const;

export const selectMyahLateCommandProgress = <T extends LateCommandReceipt>({
  sequence,
  workspaceId,
  nativeBaselineRows,
  selectedRows,
}: {
  sequence: readonly { name: string; kind: string }[];
  workspaceId: string | null;
  // Nonselected execution history plus genuine initial workspace checkpoints.
  nativeBaselineRows: readonly T[];
  // Execution history only for the three exact selected commands (no initial markers).
  // For workspaces, missing F/G is a raw fact: only the caller can exempt a
  // verified workspace initialized after those instance commands ran.
  selectedRows: readonly T[];
}): { progress: T; outstanding: { name: string; receipt: T | null }[] } => {
  const rank = new Map<string, number>();

  sequence.forEach((step, index) => {
    if (rank.has(step.name)) {
      throw new Error(`Duplicate upgrade sequence identity: ${step.name}`);
    }
    rank.set(step.name, index);
  });

  const positions = SELECTED.map(({ name, kind }) => {
    const position = rank.get(name);
    if (position === undefined || sequence[position].kind !== kind) {
      throw new Error(
        `Missing or wrong-kind selected upgrade sequence identity: ${name}`,
      );
    }
    return position;
  });

  if (!(positions[0] < positions[1] && positions[1] < positions[2])) {
    throw new Error('Selected upgrade sequence order is inconsistent');
  }

  const selectedNames = new Set<string>(SELECTED.map(({ name }) => name));
  const latest = new Map<string, T>();
  const seenIds = new Set<string>();
  const seenAttempts = new Set<string>();

  const inspect = (receipt: T, partition: 'native' | 'selected') => {
    if (receipt.workspaceId !== workspaceId) {
      throw new Error('Receipt is outside the requested upgrade scope');
    }
    if (
      !Number.isInteger(receipt.attempt) ||
      receipt.attempt < 1 ||
      !(receipt.createdAt instanceof Date) ||
      !Number.isFinite(receipt.createdAt.getTime())
    ) {
      throw new Error('Invalid upgrade receipt attempt or timestamp');
    }
    if (!rank.has(receipt.name)) {
      throw new Error(
        `Unrecognized upgrade baseline identity: ${receipt.name}`,
      );
    }
    if (receipt.status !== 'completed' && receipt.status !== 'failed') {
      throw new Error('Invalid upgrade receipt status');
    }
    if (typeof receipt.isInitial !== 'boolean') {
      throw new Error('Invalid upgrade receipt isInitial flag');
    }
    if (receipt.isInitial && workspaceId === null) {
      throw new Error(
        'Null-instance scope cannot have an initial workspace checkpoint',
      );
    }
    if (
      partition === 'selected'
        ? !selectedNames.has(receipt.name) || receipt.isInitial
        : selectedNames.has(receipt.name) && !receipt.isInitial
    ) {
      throw new Error('Incorrect selected/native upgrade receipt partition');
    }
    if (
      receipt.name === SELECTED[2].name &&
      workspaceId === null &&
      partition === 'selected'
    ) {
      throw new Error('Workspace-only B cannot have a null-instance receipt');
    }
    if (seenIds.has(receipt.id)) {
      throw new Error(`Duplicate upgrade receipt id: ${receipt.id}`);
    }
    seenIds.add(receipt.id);
    const attemptKey = `${receipt.name}:${receipt.attempt}`;
    if (seenAttempts.has(attemptKey)) {
      throw new Error(`Duplicate upgrade receipt attempt: ${receipt.name}`);
    }
    seenAttempts.add(attemptKey);
    const key = receipt.isInitial ? `initial:${receipt.name}` : receipt.name;
    const previous = latest.get(key);
    if (
      previous &&
      ((previous.attempt < receipt.attempt &&
        previous.createdAt > receipt.createdAt) ||
        (previous.attempt > receipt.attempt &&
          previous.createdAt < receipt.createdAt))
    ) {
      throw new Error(`Inconsistent upgrade attempt lineage: ${receipt.name}`);
    }
    if (!previous || receipt.attempt > previous.attempt) {
      latest.set(key, receipt);
    }
  };

  for (const receipt of nativeBaselineRows) {
    inspect(receipt, 'native');
  }
  for (const receipt of selectedRows) {
    inspect(receipt, 'selected');
  }

  // Keep native newest-time behavior rather than ranking arbitrary historical steps.
  const native = nativeBaselineRows
    .filter(
      (receipt) =>
        latest.get(
          receipt.isInitial ? `initial:${receipt.name}` : receipt.name,
        ) === receipt,
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (native.length === 0) {
    throw new Error(
      'No recognized native upgrade baseline; selected receipts cannot establish initialization',
    );
  }
  for (let index = 1; index < native.length; index++) {
    const previous = native[index - 1];
    const current = native[index];
    if (
      previous.createdAt.getTime() === current.createdAt.getTime() &&
      previous.name !== current.name
    ) {
      throw new Error('Ambiguous native upgrade baseline time tie');
    }
    if (
      !previous.isInitial &&
      !current.isInitial &&
      rank.get(current.name)! < rank.get(previous.name)!
    ) {
      throw new Error('Backwards nonselected upgrade lineage');
    }
  }
  let progress = native[native.length - 1];
  const outstanding: { name: string; receipt: T | null }[] = [];

  for (const { name, kind } of SELECTED) {
    if (kind === 'workspace' && workspaceId === null) {
      continue;
    }
    const receipt =
      selectedRows.find(
        (row) => row.name === name && latest.get(name) === row,
      ) ?? null;
    if (!receipt || receipt.status === 'failed') {
      outstanding.push({ name, receipt });
    }
    if (receipt) {
      const receiptRank = rank.get(name)!;
      const progressRank = rank.get(progress.name)!;
      if (
        receiptRank === progressRank &&
        receipt.createdAt.getTime() === progress.createdAt.getTime()
      ) {
        throw new Error('Ambiguous selected/native progress tie');
      }
      if (
        receiptRank > progressRank ||
        (receiptRank === progressRank && receipt.createdAt > progress.createdAt)
      ) {
        progress = receipt;
      }
    }
  }

  return { progress, outstanding };
};
