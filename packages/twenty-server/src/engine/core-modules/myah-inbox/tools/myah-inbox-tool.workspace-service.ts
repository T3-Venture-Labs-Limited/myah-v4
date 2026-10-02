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
import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyContextDraftService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-draft.service';
import { MyahInboxReplyContextOptionsService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-options.service';
import { MyahInboxReplyContextService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { MyahInboxReplyProposalService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import {
  generateMyahInboxReplyProposalInputSchema,
  getMyahInboxReplySendReadinessInputSchema,
  getMyahInboxReplySendStatusInputSchema,
  getMyahInboxThreadContextInputSchema,
  listMyahInboxReplyContextsInputSchema,
  saveMyahInboxReplyDraftInputSchema,
  searchMyahInboxThreadsInputSchema,
  updateMyahInboxThreadInputSchema,
} from 'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.schemas';
import {
  encodeMyahInboxContactId,
  type MyahInboxContactIdentity,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';

@Injectable()
export class MyahInboxToolWorkspaceService {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly myahInboxReplyProposalService: MyahInboxReplyProposalService,
    private readonly myahInboxMutationService: MyahInboxMutationService,
    private readonly myahInboxReplySendService: MyahInboxReplySendService,
    private readonly myahInboxReplyContextOptionsService: MyahInboxReplyContextOptionsService,
    private readonly myahInboxReplyContextService: MyahInboxReplyContextService,
    private readonly myahInboxReplyContextDraftService: MyahInboxReplyContextDraftService,
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
    const resolveThreadTarget = async (messageThreadId: string) => {
      const threadId = parseThreadId(messageThreadId);
      const thread = await this.myahInboxQueryService.getThreadSummary({
        ...requestContext,
        threadId,
      });
      const contactIdentity: MyahInboxContactIdentity = thread.creator
        ? { kind: 'creator', recordId: thread.creator.id }
        : { kind: 'email-thread', recordId: threadId };

      return {
        threadId,
        contactIdentity,
        target: {
          channel: ReplyChannel.EMAIL as const,
          contactId: encodeMyahInboxContactId({
            workspaceId: context.workspaceId,
            identity: contactIdentity,
          }),
          threadId,
        },
      };
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
    const listReplyContextsTool = {
      name: 'list_myah_inbox_reply_contexts' as const,
      description:
        'List policy-authorized Campaign reply contexts and General availability for one exact Myah Inbox Email thread.',
      inputSchema: listMyahInboxReplyContextsInputSchema,
      execute: async ({
        messageThreadId,
        ...page
      }: z.infer<typeof listMyahInboxReplyContextsInputSchema>) => {
        const { target } = await resolveThreadTarget(messageThreadId);
        const result =
          await this.myahInboxReplyContextOptionsService.listOptions({
            ...requestContext,
            expectedWorkspaceId: context.workspaceId,
            target,
            ...page,
          });

        return {
          success: true,
          message: 'Listed Myah Inbox reply contexts',
          result,
        };
      },
    };
    const getThreadContextTool = {
      name: 'get_myah_inbox_thread_context' as const,
      description:
        'Read the policy-visible reply briefing for a Myah Inbox MessageThread, optionally bound to one explicit listed reply context.',
      inputSchema: getMyahInboxThreadContextInputSchema,
      execute: async (
        input: z.infer<typeof getMyahInboxThreadContextInputSchema>,
      ) => {
        const threadId = resolveSelectedThreadId(input.messageThreadId);
        if (!input.replyContext) {
          const result =
            await this.myahInboxReplyProposalService.getReplyBriefing({
              authContext,
              threadId,
            });

          return {
            success: true,
            message: 'Retrieved Myah Inbox thread context',
            result,
          };
        }

        const { target, contactIdentity } = await resolveThreadTarget(threadId);
        if (input.replyContext.kind === ReplyContextKind.GENERAL) {
          const options =
            await this.myahInboxReplyContextOptionsService.listOptions({
              ...requestContext,
              expectedWorkspaceId: context.workspaceId,
              target,
              first: 1,
            });
          if (!options.generalAvailable) {
            throw new ForbiddenException(
              'General reply context is not available',
            );
          }
        }
        const resolvedContext =
          await this.myahInboxReplyContextService.resolveForAction({
            ...requestContext,
            target,
            contactIdentity,
            replyContext: input.replyContext,
          });
        if (!resolvedContext.contextFingerprint) {
          throw new ForbiddenException('Reply context is not readable');
        }
        const draft = await this.myahInboxReplyContextDraftService.read({
          workspaceId: context.workspaceId,
          contactAnchorKind: resolvedContext.target.contactAnchor.kind,
          contactAnchorId: resolvedContext.target.contactAnchor.id,
          channel: resolvedContext.target.channel,
          deliveryTargetId: resolvedContext.target.deliveryTargetId,
          context: resolvedContext.selected,
        });
        const briefing =
          await this.myahInboxReplyProposalService.getReplyBriefing({
            authContext,
            threadId,
            selectedContext: resolvedContext,
          });

        return {
          success: true,
          message: 'Retrieved Myah Inbox thread context',
          result: {
            ...briefing,
            selectedContext: {
              ...resolvedContext.selected,
              campaignName: resolvedContext.campaignName,
              contextFingerprint: resolvedContext.contextFingerprint,
              draftRevision: draft.revision,
              draftBody: draft.body,
            },
          },
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
        'Update the Creator or Campaign link of a policy-visible Myah Inbox thread without sending a message. Inbox triage is contact-wide and is not changed by this tool.',
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
        const { target } = await resolveThreadTarget(messageThreadId);
        const result = await this.myahInboxMutationService.saveMyahInboxDraft({
          ...requestContext,
          ...input,
          expectedWorkspaceId: context.workspaceId,
          target,
          proposalContextFingerprint: null,
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
      [listReplyContextsTool.name]: listReplyContextsTool,
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
