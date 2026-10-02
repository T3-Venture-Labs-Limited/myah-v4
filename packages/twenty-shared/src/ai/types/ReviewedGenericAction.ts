// Server-derived description of the exact generic write a founder approves.
// The card renders this, not model-authored text, and execution must match it.
export type ReviewedGenericActionFieldChange = {
  field: string;
  // Absent for creations; null when the field is currently empty.
  current?: unknown;
  proposed: unknown;
};

export type ReviewedGenericActionLinkedRecord = {
  field: string;
  recordId: string;
  label: string | null;
};

export type ReviewedGenericActionRecord = {
  recordId: string | null;
  label: string | null;
  changes: ReviewedGenericActionFieldChange[];
  linkedRecords: ReviewedGenericActionLinkedRecord[];
};

export type ReviewedGenericActionTarget =
  | {
      kind: 'record_write';
      operation: 'create' | 'update' | 'delete';
      objectNameSingular: string;
      // Records shown on the card (capped); totalCount covers every target.
      records: ReviewedGenericActionRecord[];
      totalCount: number;
      // Null for creations, which have no existing target to keep fresh.
      targetFingerprint: string | null;
    }
  | { kind: 'arguments_only' };

export type ReviewedGenericAction = {
  version: 1;
  toolName: string;
  toolLabel: string;
  argumentsDigest: string;
  arguments: Record<string, unknown>;
  target: ReviewedGenericActionTarget;
};
