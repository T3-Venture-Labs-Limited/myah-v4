import { getToolName, isToolUIPart } from 'ai';
import { z } from 'zod';

import { REQUEST_APPROVAL_TOOL_NAME } from 'twenty-shared/ai';

import { AgentChatComponentInstanceContext } from '@/ai/contexts/AgentChatComponentInstanceContext';
import { agentChatDisplayedThreadState } from '@/ai/states/agentChatDisplayedThreadState';
import { agentChatMessagesComponentFamilyState } from '@/ai/states/agentChatMessagesComponentFamilyState';
import { type AgentChatPendingApproval } from '@/ai/types/AgentChatPendingApproval';
import { createAtomComponentSelector } from '@/ui/utilities/state/jotai/utils/createAtomComponentSelector';

const pendingRegisteredApprovalResultSchema = z
  .object({
    status: z.literal('pending'),
    actionApprovalBindingId: z.string().uuid(),
  })
  .strict();

const pendingGenericApprovalResultSchema = z.object({
  status: z.literal('pending'),
  request: z.object({
    title: z.string(),
    summary: z.string(),
    actionKind: z.enum([
      'internal_record_write',
      'external_write',
      'public_post',
      'email_send',
      'webhook_call',
      'destructive_change',
      'financial_action',
      'other',
    ]),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    toolName: z.string().optional(),
    targetLabel: z.string().optional(),
    affectedRecords: z
      .array(
        z.object({
          objectNameSingular: z.string(),
          recordId: z.string(),
          label: z.string().optional(),
        }),
      )
      .optional(),
    preview: z
      .object({
        format: z.enum(['text', 'json', 'diff', 'markdown']),
        content: z.string(),
      })
      .optional(),
    consequences: z.array(z.string()),
    options: z.object({ allowRequestChanges: z.boolean().optional() }).optional(),
  }),
});

export const agentChatPendingApprovalComponentSelector =
  createAtomComponentSelector<AgentChatPendingApproval | null>({
    key: 'agentChatPendingApprovalComponentSelector',
    componentInstanceContext: AgentChatComponentInstanceContext,
    get:
      ({ instanceId }) =>
      ({ get }) => {
        const currentThreadId = get(agentChatDisplayedThreadState);

        const messages = get(agentChatMessagesComponentFamilyState, {
          instanceId,
          familyKey: { threadId: currentThreadId },
        });

        const lastAssistantMessage = [...messages]
          .reverse()
          .find((message) => message.role === 'assistant');

        if (!lastAssistantMessage) {
          return null;
        }

        for (const part of lastAssistantMessage.parts) {
          if (
            !isToolUIPart(part) ||
            getToolName(part) !== REQUEST_APPROVAL_TOOL_NAME ||
            !part.output ||
            typeof part.output !== 'object' ||
            !('result' in part.output)
          ) {
            continue;
          }

          const registered =
            pendingRegisteredApprovalResultSchema.safeParse(part.output.result);
          if (registered.success) {
            return {
              messageId: lastAssistantMessage.id,
              toolCallId: part.toolCallId,
              actionApprovalBindingId: registered.data.actionApprovalBindingId,
            };
          }

          const generic =
            pendingGenericApprovalResultSchema.safeParse(part.output.result);
          if (generic.success) {
            return {
              messageId: lastAssistantMessage.id,
              toolCallId: part.toolCallId,
              request: generic.data.request,
            };
          }
        }

        return null;
      },
  });
