import { randomUUID } from 'crypto';

import { z } from 'zod';

import {
  REQUEST_APPROVAL_TOOL_NAME,
  type RequestApprovalToolInput,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';

export { REQUEST_APPROVAL_TOOL_NAME };

const approvalActionKindSchema = z.enum([
  'internal_record_write',
  'external_write',
  'public_post',
  'email_send',
  'webhook_call',
  'destructive_change',
  'financial_action',
  'other',
]);

const approvalRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

const requestApprovalPreviewSchema = z.object({
  format: z
    .enum(['text', 'json', 'diff', 'markdown'])
    .describe('How to render the concrete preview of the proposed action.'),
  content: z
    .string()
    .min(1)
    .describe('The exact text, JSON, diff, or markdown preview to show.'),
});

const requestApprovalAffectedRecordSchema = z.object({
  objectNameSingular: z
    .string()
    .min(1)
    .describe('The object type affected by the proposed action.'),
  recordId: z.string().min(1).describe('The affected record id.'),
  label: z
    .string()
    .optional()
    .describe('Human-readable affected record label.'),
});

const INSTAGRAM_REPLY_TOOL_NAME = 'send_instagram_reply';

export const requestApprovalInputSchema = z
  .object({
    title: z.string().min(1).describe('Short title for the approval card.'),
    summary: z
      .string()
      .min(1)
      .describe('One or two sentence summary of the proposed side effect.'),
    actionKind: approvalActionKindSchema.describe('The category of action.'),
    riskLevel: approvalRiskLevelSchema.describe('Risk level for the user.'),
    toolName: z
      .string()
      .optional()
      .describe('The tool expected to perform the action after approval.'),
    targetLabel: z
      .string()
      .optional()
      .describe('Human-readable target, recipient, account, or record label.'),
    affectedRecords: z
      .array(requestApprovalAffectedRecordSchema)
      .optional()
      .describe('Structured records affected by the proposed action.'),
    preview: requestApprovalPreviewSchema
      .optional()
      .describe('Concrete preview of what will happen if approved.'),
    instagramReply: z
      .object({
        draftId: z.string().uuid(),
        connectedAccountId: z.string().min(1),
        conversationId: z.string().uuid(),
      })
      .optional()
      .describe('Bound source records for an approved Instagram reply only.'),
    consequences: z
      .array(z.string().min(1))
      .min(1)
      .describe('One or more consequences the user should understand.'),
    options: z
      .object({
        allowRequestChanges: z
          .boolean()
          .optional()
          .describe(
            'Allow the user to request changes instead of yes/no only.',
          ),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (input.toolName !== INSTAGRAM_REPLY_TOOL_NAME) {
      return;
    }

    if (!input.instagramReply) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['instagramReply'],
        message:
          'Instagram reply approvals must reference one draft and one conversation.',
      });
    }

    if (input.actionKind !== 'external_write') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionKind'],
        message: 'Instagram replies are external writes.',
      });
    }

    if (input.preview?.format !== 'text') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preview'],
        message: 'Instagram replies require an exact text preview.',
      });
    }
  });

type RequestApprovalPendingOutput = {
  success: true;
  message: string;
  result: RequestApprovalToolResult;
};

export const createRequestApprovalTool = () => ({
  description:
    'Ask the user to approve, reject, or request changes before a consequential side effect. ' +
    'Use this before external writes, public posts, outbound email, destructive changes, ' +
    'financial actions, or sensitive internal record writes. Do NOT use it for read-only ' +
    'lookups or trivial actions. Include a concrete preview and consequences. Approval is ' +
    'not execution: after approval, call the real action tool through the normal tool pipeline. ' +
    'If rejected, stop or ask for a safer alternative. Call at most one human-input tool in a single turn.',
  inputSchema: requestApprovalInputSchema,
  execute: async (
    input: RequestApprovalToolInput,
  ): Promise<RequestApprovalPendingOutput> => ({
    success: true,
    message: 'Approval request presented to the user; awaiting their decision.',
    result: {
      request: input,
      ...(input.toolName === INSTAGRAM_REPLY_TOOL_NAME
        ? { approvalId: randomUUID() }
        : {}),
      status: 'pending',
    },
  }),
});
