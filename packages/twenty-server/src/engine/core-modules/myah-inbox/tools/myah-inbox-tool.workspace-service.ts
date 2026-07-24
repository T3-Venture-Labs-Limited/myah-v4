import { ForbiddenException, Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { z } from 'zod';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH } from 'src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';

const threadContextInputSchema = z
  .object({
    threadId: z.string().uuid().describe('The selected native MessageThread UUID'),
  })
  .strict();

const replyProposalInputSchema = threadContextInputSchema
  .extend({
    operatorInstructions: z
      .string()
      .trim()
      .min(1)
      .max(MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH)
      .describe('Explicit operator instructions for this proposal'),
  })
  .strict();

@Injectable()
export class MyahInboxToolWorkspaceService {
  constructor(
    private readonly myahInboxReplyProposalService: MyahInboxReplyProposalService,
  ) {}

  generateMyahInboxTools(context: ToolProviderContext): ToolSet {
    const authContext = this.getMatchingUserAuthContext(context);

    const getThreadContextTool = {
      name: 'get_myah_inbox_thread_context' as const,
      description:
        'Read the selected policy-visible Myah Inbox MessageThread and its readable Creator/Campaign context. This tool never mutates the thread.',
      inputSchema: threadContextInputSchema,
      execute: async ({ threadId }: z.infer<typeof threadContextInputSchema>) => {
        const result =
          await this.myahInboxReplyProposalService.getThreadContext({
            authContext,
            threadId,
          });

        return {
          success: true,
          message: 'Retrieved Myah Inbox thread context',
          result,
        };
      },
    };
    const generateReplyProposalTool = {
      name: 'generate_myah_inbox_reply_proposal' as const,
      description:
        'Generate a schema-validated reply proposal for the selected policy-visible Myah Inbox MessageThread. This tool never saves a draft or sends a message.',
      inputSchema: replyProposalInputSchema,
      execute: async ({
        threadId,
        operatorInstructions,
      }: z.infer<typeof replyProposalInputSchema>) => {
        const result =
          await this.myahInboxReplyProposalService.generateReplyProposal({
            authContext,
            threadId,
            operatorInstructions,
          });

        return {
          success: true,
          message: 'Generated Myah Inbox reply proposal',
          result,
        };
      },
    };

    return {
      [getThreadContextTool.name]: getThreadContextTool,
      [generateReplyProposalTool.name]: generateReplyProposalTool,
    };
  }

  private getMatchingUserAuthContext(
    context: ToolProviderContext,
  ): UserWorkspaceAuthContext {
    if (
      !context.authContext ||
      !isUserAuthContext(context.authContext) ||
      !context.authContext.user ||
      context.authContext.workspace.id !== context.workspaceId ||
      context.authContext.user.id !== context.userId ||
      context.authContext.userWorkspaceId !== context.userWorkspaceId ||
      context.authContext.workspaceMemberId !==
        context.actorContext?.workspaceMemberId
    ) {
      throw new ForbiddenException(
        'Myah Inbox tools require matching authenticated user context',
      );
    }

    return context.authContext;
  }
}
