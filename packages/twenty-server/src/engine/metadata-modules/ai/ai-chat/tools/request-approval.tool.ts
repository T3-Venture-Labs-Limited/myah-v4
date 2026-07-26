import { z } from 'zod';

import {
  REQUEST_APPROVAL_TOOL_NAME,
  type RequestApprovalToolInput,
  type RequestApprovalToolResult,
} from 'twenty-shared/ai';

import {
  InstagramReplyActionDefinition,
  InstagramReplyActionProposalInputZodSchema,
} from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import {
  OutreachEmailActionDefinition,
  OutreachEmailActionProposalInputZodSchema,
} from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';

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
const OUTREACH_EMAIL_TOOL_NAME = 'send_outreach_email';

const requestApprovalInputObjectSchema = z
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
  .strict()
  .superRefine((input, context) => {
    if (
      input.toolName === INSTAGRAM_REPLY_TOOL_NAME ||
      input.toolName === OUTREACH_EMAIL_TOOL_NAME
    ) {
      context.addIssue({
        code: 'custom',
        path: ['toolName'],
        message: 'Use the registered action input for this prepared action.',
      });
    }
  });

const registeredInstagramReplyApprovalInputSchema = z
  .object({
    toolName: z.literal(INSTAGRAM_REPLY_TOOL_NAME),
    actionInput: InstagramReplyActionProposalInputZodSchema,
  })
  .strict();

const registeredOutreachEmailApprovalInputSchema = z
  .object({
    toolName: z.literal(OUTREACH_EMAIL_TOOL_NAME),
    actionInput: OutreachEmailActionProposalInputZodSchema,
  })
  .strict();

const registeredApprovalInputSchema = z.discriminatedUnion('toolName', [
  registeredInstagramReplyApprovalInputSchema,
  registeredOutreachEmailApprovalInputSchema,
]);

const unwrapDirectApprovalArguments = (input: unknown): unknown => {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !('arguments' in input)
  ) {
    return input;
  }

  const { arguments: argumentsValue, ...otherFields } = input;

  if (
    Object.keys(otherFields).length !== 0 ||
    !argumentsValue ||
    typeof argumentsValue !== 'object' ||
    Array.isArray(argumentsValue)
  ) {
    return input;
  }

  return argumentsValue;
};

export const requestApprovalInputSchema = z.preprocess(
  unwrapDirectApprovalArguments,
  z.union([requestApprovalInputObjectSchema, registeredApprovalInputSchema]),
);

type RegisteredApprovalInput = z.infer<typeof registeredApprovalInputSchema>;

type RegisteredApprovalOptions = {
  workspaceId: string;
  userWorkspaceId: string | undefined;
  threadId: string | undefined;
  actionDefinitions: {
    send_instagram_reply: InstagramReplyActionDefinition;
    send_outreach_email: OutreachEmailActionDefinition;
  };
  actionApprovalService: ActionApprovalService;
};

type RequestApprovalPendingOutput = {
  success: true;
  message: string;
  result:
    | RequestApprovalToolResult
    | {
        status: 'pending';
        actionApprovalBindingId: string;
      };
};

export const createRequestApprovalTool = (
  registeredApprovalOptions?: RegisteredApprovalOptions,
) => {
  const registeredActions = registeredApprovalOptions
    ? {
        send_instagram_reply: {
          proposalInputSchema: InstagramReplyActionProposalInputZodSchema,
          propose: (input: unknown) =>
            registeredApprovalOptions.actionDefinitions.send_instagram_reply.propose(
              {
                workspaceId: registeredApprovalOptions.workspaceId,
                initiatorUserWorkspaceId:
                  registeredApprovalOptions.userWorkspaceId ?? '',
                threadId: registeredApprovalOptions.threadId ?? '',
                input: InstagramReplyActionProposalInputZodSchema.parse(input),
              },
            ),
        },
        send_outreach_email: {
          proposalInputSchema: OutreachEmailActionProposalInputZodSchema,
          propose: (input: unknown) =>
            registeredApprovalOptions.actionDefinitions.send_outreach_email.propose(
              {
                workspaceId: registeredApprovalOptions.workspaceId,
                initiatorUserWorkspaceId:
                  registeredApprovalOptions.userWorkspaceId ?? '',
                threadId: registeredApprovalOptions.threadId ?? '',
                input: OutreachEmailActionProposalInputZodSchema.parse(input),
              },
            ),
        },
      }
    : undefined;

  return {
    description:
      'Ask the user to approve, reject, or request changes before a consequential side effect. ' +
      'Use this before external writes, public posts, outbound email, destructive changes, ' +
      'financial actions, or sensitive internal record writes. Do NOT use it for read-only ' +
      'lookups or trivial actions. For a prepared Instagram reply or outreach email, provide only its registered record ID. ' +
      'Approval is not execution: after approval, call the real action tool through the normal tool pipeline. ' +
      'If rejected, stop or ask for a safer alternative. Call at most one human-input tool in a single turn.',
    inputSchema: requestApprovalInputSchema,
    execute: async (
      input: RequestApprovalToolInput | RegisteredApprovalInput,
    ): Promise<RequestApprovalPendingOutput> => {
      if ('actionInput' in input) {
        const options = registeredApprovalOptions;

        if (
          !options?.userWorkspaceId ||
          !options.threadId ||
          !registeredActions
        ) {
          throw new Error(
            'An authenticated chat thread is required to request registered action approval.',
          );
        }

        const proposal = await registeredActions[input.toolName].propose(
          input.actionInput,
        );
        const binding =
          await options.actionApprovalService.createPendingBinding(
            proposal.expectedActionBinding,
          );

        return {
          success: true,
          message:
            'Approval request presented to the user; awaiting their decision.',
          result: {
            status: 'pending',
            actionApprovalBindingId: binding.id,
          },
        };
      }

      return {
        success: true,
        message:
          'Approval request presented to the user; awaiting their decision.',
        result: {
          request: input,
          status: 'pending',
        },
      };
    },
  };
};
