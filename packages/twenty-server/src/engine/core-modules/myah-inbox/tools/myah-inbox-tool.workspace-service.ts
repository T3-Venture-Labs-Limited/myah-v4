import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { type ToolSet } from 'ai';
import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import {
  generateMyahInboxReplyProposalInputSchema,
  getMyahInboxReplySendReadinessInputSchema,
  getMyahInboxReplySendStatusInputSchema,
  getMyahInboxThreadContextInputSchema,
  saveMyahInboxReplyDraftInputSchema,
  searchMyahInboxThreadsInputSchema,
  updateMyahInboxThreadInputSchema,
} from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.schemas';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';

@Injectable()
export class MyahInboxToolWorkspaceService {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly myahInboxReplyProposalService: MyahInboxReplyProposalService,
    private readonly myahInboxMutationService: MyahInboxMutationService,
    private readonly myahInboxReplySendService: MyahInboxReplySendService,
  ) {}

  generateMyahInboxTools(context: ToolProviderContext): ToolSet {
    const authContext = this.getMatchingUserAuthContext(context);
    const requestContext = {
      authContext,
      user: authContext.user,
      workspace: authContext.workspace,
      userWorkspaceId: authContext.userWorkspaceId,
      workspaceMemberId: authContext.workspaceMemberId,
    };
    const parseThreadId = (threadId: string | undefined): string => {
      if (!threadId || !isValidUuid(threadId)) {
        throw new BadRequestException(
          'A valid Myah Inbox MessageThread ID is required',
        );
      }

      return threadId;
    };
    const resolveSelectedThreadId = (messageThreadId: string | undefined) => {
      const selectedThreadId =
        context.myahInboxSelection?.workspaceId === context.workspaceId
          ? context.myahInboxSelection.threadId
          : undefined;

      return parseThreadId(messageThreadId ?? selectedThreadId);
    };
    const searchThreadsTool = {
      name: 'search_myah_inbox_threads' as const,
      description:
        'Search policy-visible Myah Inbox threads by the latest visible message and Creator name. This does not search full message history.',
      inputSchema: searchMyahInboxThreadsInputSchema,
      execute: async (
        input: z.infer<typeof searchMyahInboxThreadsInputSchema>,
      ) => {
        const result = await this.myahInboxQueryService.listThreads({
          ...requestContext,
          ...input,
        });

        return {
          success: true,
          message: 'Searched Myah Inbox threads',
          result,
        };
      },
    };
    const getThreadContextTool = {
      name: 'get_myah_inbox_thread_context' as const,
      description:
        'Read the policy-visible reply briefing for a Myah Inbox MessageThread.',
      inputSchema: getMyahInboxThreadContextInputSchema,
      execute: async (
        input: z.infer<typeof getMyahInboxThreadContextInputSchema>,
      ) => {
        const result =
          await this.myahInboxReplyProposalService.getReplyBriefing({
            authContext,
            threadId: resolveSelectedThreadId(input.messageThreadId),
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
        'Generate a schema-validated reply proposal for a policy-visible Myah Inbox MessageThread. This tool never saves a draft or sends a message.',
      inputSchema: generateMyahInboxReplyProposalInputSchema,
      execute: async ({
        messageThreadId,
        operatorInstructions,
      }: z.infer<typeof generateMyahInboxReplyProposalInputSchema>) => {
        const result =
          await this.myahInboxReplyProposalService.generateReplyProposal({
            authContext,
            threadId: resolveSelectedThreadId(messageThreadId),
            operatorInstructions,
          });

        return {
          success: true,
          message: 'Generated Myah Inbox reply proposal',
          result,
        };
      },
    };
    const updateThreadTool = {
      name: 'update_myah_inbox_thread' as const,
      description:
        'Update policy-visible Myah Inbox thread triage fields without sending a message.',
      inputSchema: updateMyahInboxThreadInputSchema,
      execute: async ({
        messageThreadId,
        ...input
      }: z.infer<typeof updateMyahInboxThreadInputSchema>) => {
        const result =
          await this.myahInboxMutationService.updateMyahInboxThread({
            ...requestContext,
            ...input,
            threadId: parseThreadId(messageThreadId),
          });

        return {
          success: true,
          message: 'Updated Myah Inbox thread',
          result,
        };
      },
    };
    const saveReplyDraftTool = {
      name: 'save_myah_inbox_reply_draft' as const,
      description:
        'Save a Myah Inbox reply draft with the expected revision. A conflict returns the current draft without retrying.',
      inputSchema: saveMyahInboxReplyDraftInputSchema,
      execute: async ({
        messageThreadId,
        ...input
      }: z.infer<typeof saveMyahInboxReplyDraftInputSchema>) => {
        const result = await this.myahInboxMutationService.saveMyahInboxDraft({
          ...requestContext,
          ...input,
          threadId: parseThreadId(messageThreadId),
        });

        return {
          success: true,
          message: 'Saved Myah Inbox reply draft',
          result,
        };
      },
    };
    const getReplySendReadinessTool = {
      name: 'get_myah_inbox_reply_send_readiness' as const,
      description:
        'Read Myah Inbox reply send readiness with the current draft revision and body. This tool does not send a message.',
      inputSchema: getMyahInboxReplySendReadinessInputSchema,
      execute: async (
        input: z.infer<typeof getMyahInboxReplySendReadinessInputSchema>,
      ) => {
        const result = await this.myahInboxReplySendService.getReadiness({
          ...requestContext,
          threadId: parseThreadId(input.messageThreadId),
        });

        return {
          success: true,
          message: 'Retrieved Myah Inbox reply send readiness',
          result,
        };
      },
    };
    const getReplySendStatusTool = {
      name: 'get_myah_inbox_reply_send_status' as const,
      description:
        'Read the status of a Myah Inbox reply send receipt. This tool does not send a message.',
      inputSchema: getMyahInboxReplySendStatusInputSchema,
      execute: async ({
        messageThreadId,
        receiptId,
      }: z.infer<typeof getMyahInboxReplySendStatusInputSchema>) => {
        const result = await this.myahInboxReplySendService.getStatus({
          ...requestContext,
          threadId: parseThreadId(messageThreadId),
          receiptId,
        });

        return {
          success: true,
          message: 'Retrieved Myah Inbox reply send status',
          result,
        };
      },
    };

    return {
      [searchThreadsTool.name]: searchThreadsTool,
      [getThreadContextTool.name]: getThreadContextTool,
      [generateReplyProposalTool.name]: generateReplyProposalTool,
      [updateThreadTool.name]: updateThreadTool,
      [saveReplyDraftTool.name]: saveReplyDraftTool,
      [getReplySendReadinessTool.name]: getReplySendReadinessTool,
      [getReplySendStatusTool.name]: getReplySendStatusTool,
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
