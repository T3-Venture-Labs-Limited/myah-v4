export type ApprovalActionKind =
  | 'internal_record_write'
  | 'external_write'
  | 'public_post'
  | 'email_send'
  | 'webhook_call'
  | 'destructive_change'
  | 'financial_action'
  | 'other';
