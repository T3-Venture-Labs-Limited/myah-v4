export type RequestApprovalPreview = {
  format: 'text' | 'json' | 'diff' | 'markdown';
  content: string;
};
