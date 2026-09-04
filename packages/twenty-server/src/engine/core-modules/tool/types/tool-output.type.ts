import { type RecordReference } from 'src/engine/core-modules/tool/types/record-reference.type';

export type ToolOutcomeCategory =
  | 'SUCCESS'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'ALREADY_EXISTS'
  | 'NOT_READY'
  | 'PENDING'
  | 'FAILED'
  | 'UNKNOWN';

export type ToolOutput<T = object> = {
  success: boolean;
  message: string;
  category?: ToolOutcomeCategory;
  error?: string;
  result?: T;
  warnings?: string[];
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  recordReferences?: RecordReference[];
};
