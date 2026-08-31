import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxReplySendResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-reply-send.resolver';
import { MyahInboxReplySendService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-send.service';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

jest.mock(
  'src/engine/core-modules/action-approval/action-approval.module',
  () => ({ ActionApprovalModule: class ActionApprovalModule {} }),
);
jest.mock('src/engine/core-modules/billing/billing.module', () => ({
  BillingModule: class BillingModule {},
}));
jest.mock('src/engine/core-modules/tool-provider/tool-provider.module', () => ({
  ToolProviderModule: class ToolProviderModule {},
}));
jest.mock(
  'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module',
  () => ({ AiAgentExecutionModule: class AiAgentExecutionModule {} }),
);
jest.mock(
  'src/engine/metadata-modules/ai/ai-billing/ai-billing.module',
  () => ({
    AiBillingModule: class AiBillingModule {},
  }),
);
jest.mock('src/engine/metadata-modules/ai/ai-models/ai-models.module', () => ({
  AiModelsModule: class AiModelsModule {},
}));
jest.mock(
  'src/modules/messaging/common/query-hooks/messaging-query-hook.module',
  () => ({ MessagingQueryHookModule: class MessagingQueryHookModule {} }),
);
jest.mock(
  'src/modules/messaging/message-outbound-manager/messaging-send-manager.module',
  () => ({ MessagingSendManagerModule: class MessagingSendManagerModule {} }),
);
jest.mock(
  'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver',
  () => ({ MyahInboxResolver: class MyahInboxResolver {} }),
);
jest.mock(
  'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service',
  () => ({ MyahInboxMutationService: class MyahInboxMutationService {} }),
);
jest.mock(
  'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service',
  () => ({ MyahInboxQueryService: class MyahInboxQueryService {} }),
);
jest.mock(
  'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service',
  () => ({
    MyahInboxReplyBriefingService: class MyahInboxReplyBriefingService {},
  }),
);
jest.mock(
  'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-proposal.service',
  () => ({
    MyahInboxReplyProposalService: class MyahInboxReplyProposalService {},
  }),
);
jest.mock(
  'src/engine/core-modules/myah-inbox/tools/myah-inbox-tool.workspace-service',
  () => ({
    MyahInboxToolWorkspaceService: class MyahInboxToolWorkspaceService {},
  }),
);
jest.mock(
  'src/engine/metadata-modules/ai/ai-chat/services/brand-brain-preflight.service',
  () => ({ BrandBrainPreflightService: class BrandBrainPreflightService {} }),
);

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-4678-9012-345678901234';
const userId = '20202020-1234-4678-9012-345678901235';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const receiptId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const workspace = { id: workspaceId };
const authContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: userId },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

const createResolver = () => {
  const getReadiness = jest
    .fn()
    .mockResolvedValue({ status: 'READY', reason: null });
  const send = jest.fn().mockResolvedValue({
    outcome: 'SENT',
    receiptId,
    revision: 5,
    body: { markdown: 'Thanks', blocknote: null },
  });
  const getStatus = jest.fn().mockResolvedValue({
    outcome: 'SENT',
    receiptId,
    revision: 5,
    body: null,
  });

  return {
    resolver: new MyahInboxReplySendResolver({
      getReadiness,
      send,
      getStatus,
    } as never),
    getReadiness,
    send,
    getStatus,
  };
};

describe('MyahInboxReplySendResolver', () => {
  beforeEach(() => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue(authContext as never);
  });

  it('forwards only the narrow send input and authenticated server context', async () => {
    const { resolver, send } = createResolver();

    await resolver.sendMyahInboxReply(
      {
        threadId,
        expectedDraftRevision: 4,
        senderEmail: 'attacker@example.com',
        body: 'attacker body',
      } as never,
      workspace as never,
      userWorkspaceId,
      workspaceMemberId,
    );

    expect(send).toHaveBeenCalledWith({
      threadId,
      expectedDraftRevision: 4,
      authContext,
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      user: authContext.user,
    });
  });

  it('scopes readiness and receipt status to the authenticated actor and workspace', async () => {
    const { resolver, getReadiness, getStatus } = createResolver();

    await resolver.myahInboxReplySendReadiness(
      threadId,
      workspace as never,
      userWorkspaceId,
      workspaceMemberId,
    );
    await resolver.myahInboxReplySendStatus(
      {
        threadId,
        receiptId,
        providerReceiptId: 'attacker-provider-id',
      } as never,
      workspace as never,
      userWorkspaceId,
      workspaceMemberId,
    );

    expect(getReadiness).toHaveBeenCalledWith({
      threadId,
      authContext,
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      user: authContext.user,
    });
    expect(getStatus).toHaveBeenCalledWith({
      threadId,
      receiptId,
      authContext,
      workspace,
      userWorkspaceId,
      workspaceMemberId,
      user: authContext.user,
    });
  });

  it('fails closed when the decorated ids do not match authenticated user context', async () => {
    const { resolver, send } = createResolver();

    await expect(
      resolver.sendMyahInboxReply(
        { threadId, expectedDraftRevision: 4 },
        workspace as never,
        '20202020-1234-4678-9012-345678901299',
        workspaceMemberId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when the decorated workspace member differs from user auth', async () => {
    const { resolver, send } = createResolver();

    await expect(
      resolver.sendMyahInboxReply(
        { threadId, expectedDraftRevision: 4 },
        workspace as never,
        userWorkspaceId,
        '20202020-0b5c-4178-bed7-d371f6411e99',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(send).not.toHaveBeenCalled();
  });

  it('requires isolated workspace, user, custom, and send-email permission guards', async () => {
    const guards: Type<CanActivate>[] = Reflect.getMetadata(
      GUARDS_METADATA,
      MyahInboxReplySendResolver,
    );
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxModule,
    ) as unknown[];
    const permissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    };
    const executionContext = {
      getType: jest.fn(() => 'graphql'),
    } as unknown as ExecutionContext;
    const gqlContextSpy = jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({
        getContext: () => ({
          req: {
            userWorkspaceId,
            workspace: {
              activationStatus: WorkspaceActivationStatus.ACTIVE,
              id: workspaceId,
            },
          },
        }),
      } as never);

    expect(guards).toHaveLength(4);
    expect(guards.slice(0, 3)).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      CustomPermissionGuard,
    ]);
    const SendEmailPermissionGuard = guards[3];
    const guard = new SendEmailPermissionGuard(
      permissionsService as unknown as PermissionsService,
    );

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      apiKeyId: undefined,
      applicationId: undefined,
      setting: PermissionFlagType.SEND_EMAIL_TOOL,
      userWorkspaceId,
      workspaceId,
    });
    expect(providers).toContain(MyahInboxReplySendResolver);
    expect(providers).toContain(MyahInboxReplySendService);

    gqlContextSpy.mockRestore();
  });
});
