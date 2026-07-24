import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { generateText, Output } from 'ai';
import { type APP_LOCALES } from 'twenty-shared/translations';
import { z } from 'zod';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { BillingUsageService } from 'src/engine/core-modules/billing/services/billing-usage.service';
import { MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH } from 'src/engine/core-modules/myah-inbox/dtos/generate-myah-inbox-reply-proposal.input';
import {
  MyahInboxReplyProposal,
  MyahInboxReplyProposalSchema,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-proposal.dto';
import { type MyahInboxThreadSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-summary.dto';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { UsageOperationType } from 'src/engine/core-modules/usage/enums/usage-operation-type.enum';
import {
  type AgentActorContext,
  AgentActorContextService,
} from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';
import { AiBillingService } from 'src/engine/metadata-modules/ai/ai-billing/services/ai-billing.service';
import { BrandBrainPreflightService } from 'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service';
import {
  AI_TELEMETRY_CONFIG,
  MANAGED_AI_TELEMETRY_CONFIG,
} from 'src/engine/metadata-modules/ai/ai-models/constants/ai-telemetry.const';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { ManagedOpenRouterModelService } from 'src/engine/metadata-modules/ai/ai-models/services/managed-openrouter-model.service';

export type MyahInboxReplyProposalContextInput = {
  authContext: UserWorkspaceAuthContext;
  threadId: string;
};

export type GenerateMyahInboxReplyProposalRequest =
  MyahInboxReplyProposalContextInput & {
    operatorInstructions: string;
  };

type AuthorizedProposalContext = {
  actor: AgentActorContext;
  thread: MyahInboxThreadSummary;
};

const proposalRequestSchema = z
  .object({
    threadId: z.string().uuid(),
    operatorInstructions: z
      .string()
      .trim()
      .min(1)
      .max(MYAH_INBOX_MAX_OPERATOR_INSTRUCTIONS_LENGTH),
  })
  .strict();

@Injectable()
export class MyahInboxReplyProposalService {
  constructor(
    private readonly myahInboxQueryService: MyahInboxQueryService,
    private readonly agentActorContextService: AgentActorContextService,
    private readonly brandBrainPreflightService: BrandBrainPreflightService,
    private readonly aiModelRegistryService: AiModelRegistryService,
    private readonly billingUsageService: BillingUsageService,
    private readonly aiBillingService: AiBillingService,
    private readonly managedOpenRouterModelService: ManagedOpenRouterModelService,
  ) {}

  async getThreadContext(
    input: MyahInboxReplyProposalContextInput,
  ): Promise<MyahInboxThreadSummary> {
    return (await this.loadAuthorizedContext(input)).thread;
  }

  async generateReplyProposal(
    input: GenerateMyahInboxReplyProposalRequest,
  ): Promise<MyahInboxReplyProposal> {
    const parsedInput = proposalRequestSchema.parse({
      threadId: input.threadId,
      operatorInstructions: input.operatorInstructions,
    });
    const { actor, thread } = await this.loadAuthorizedContext({
      authContext: input.authContext,
      threadId: parsedInput.threadId,
    });
    const brandTask = [
      parsedInput.operatorInstructions,
      `Selected permitted context. Creator: ${thread.creator?.name ?? 'unlinked'}. Campaign: ${thread.campaign?.name ?? 'unlinked'}.`,
    ].join('\n');
    const brandBrain = await this.brandBrainPreflightService.run({
      lastUserMessageText: brandTask,
      toolContext: {
        workspaceId: input.authContext.workspace.id,
        roleId: actor.roleId,
        authContext: actor.authContext,
        actorContext: actor.actorContext,
        userId: actor.userId,
        userWorkspaceId: actor.userWorkspaceId,
        locale: actor.userContext.locale as keyof typeof APP_LOCALES,
      },
    });
    const registeredModel = this.aiModelRegistryService.getDefaultSpeedModel(
      input.authContext.workspace.id,
    );
    const modelConfig = this.aiModelRegistryService.getEffectiveModelConfig(
      registeredModel.modelId,
      input.authContext.workspace.id,
    );
    const usesManagedOpenRouter =
      this.managedOpenRouterModelService.isManagedModel({
        modelId: registeredModel.modelId,
        providerName: registeredModel.providerName,
      });

    if (!usesManagedOpenRouter) {
      await this.billingUsageService.hasAvailableCreditsOrThrow(
        input.authContext.workspace.id,
      );
    }

    const executionModel = this.managedOpenRouterModelService.wrapModel({
      executionSurface: 'myah-inbox-reply-proposal',
      actorUserWorkspaceId: actor.userWorkspaceId,
      model: registeredModel.model,
      modelConfig,
      providerName: registeredModel.providerName,
      requestIdRoot: `${thread.id}:reply-proposal:${randomUUID()}`,
      workspaceId: input.authContext.workspace.id,
    });
    const result = await generateText({
      model: executionModel,
      system:
        'Propose an email reply only. Do not claim to save, apply, or send it. Return only the requested subject and rich-text body schema.',
      prompt: [
        `Selected policy-visible thread context:\n${JSON.stringify(thread)}`,
        `Operator instructions:\n${parsedInput.operatorInstructions}`,
        `Permission-appropriate Brand Brain context:\n${brandBrain.contextPart ?? 'No additional Brand Brain context is available.'}`,
      ].join('\n\n'),
      output: Output.object({ schema: MyahInboxReplyProposalSchema }),
      maxRetries: usesManagedOpenRouter ? 0 : undefined,
      experimental_telemetry: usesManagedOpenRouter
        ? MANAGED_AI_TELEMETRY_CONFIG
        : AI_TELEMETRY_CONFIG,
    });

    if (!usesManagedOpenRouter) {
      void this.aiBillingService.calculateAndBillUsage(
        registeredModel.modelId,
        {
          usage: result.usage,
          cacheCreationTokens:
            result.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
        },
        input.authContext.workspace.id,
        UsageOperationType.AI_CHAT_TOKEN,
        null,
        actor.userWorkspaceId,
      );
    }

    return MyahInboxReplyProposalSchema.parse(result.output);
  }

  private async loadAuthorizedContext(
    input: MyahInboxReplyProposalContextInput,
  ): Promise<AuthorizedProposalContext> {
    if (!isUserAuthContext(input.authContext) || !input.authContext.user) {
      throw new ForbiddenException(
        'Reply proposals require authenticated user context',
      );
    }

    z.string().uuid().parse(input.threadId);

    const actor =
      await this.agentActorContextService.buildUserAndAgentActorContext(
        input.authContext.userWorkspaceId,
        input.authContext.workspace.id,
      );

    if (
      actor.authContext.workspace.id !== input.authContext.workspace.id ||
      actor.userWorkspaceId !== input.authContext.userWorkspaceId ||
      actor.userId !== input.authContext.user.id ||
      actor.actorContext.workspaceMemberId !==
        input.authContext.workspaceMemberId
    ) {
      throw new ForbiddenException('Reply proposal actor context does not match');
    }

    const thread = await this.myahInboxQueryService.getThreadSummary({
      authContext: input.authContext,
      user: input.authContext.user,
      workspace: input.authContext.workspace,
      workspaceMemberId: input.authContext.workspaceMemberId,
      threadId: input.threadId,
    });

    return { actor, thread };
  }
}
