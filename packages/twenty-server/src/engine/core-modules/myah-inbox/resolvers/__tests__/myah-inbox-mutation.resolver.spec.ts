import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH,
} from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { SaveMyahInboxDraftInput } from 'src/engine/core-modules/myah-inbox/dtos/save-myah-inbox-draft.input';
import { UpdateMyahInboxThreadInput } from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-thread.input';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspace = { id: '20202020-1c25-4d02-bf25-6aeccf7ea419' };
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: '20202020-1234-5678-9012-345678901234',
  user: { id: 'user-id' },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

const createResolver = () => {
  const updateMyahInboxThread = jest.fn().mockResolvedValue({ id: threadId });
  const saveMyahInboxDraft = jest.fn().mockResolvedValue({
    status: 'SAVED',
    revision: 3,
    body: { markdown: 'copy', blocknote: null },
  });
  const resolver = new MyahInboxResolver(
    { listThreads: jest.fn() } as never,
    { updateMyahInboxThread, saveMyahInboxDraft } as never,
    {} as never,
  );

  return { resolver, updateMyahInboxThread, saveMyahInboxDraft };
};

describe('MyahInboxResolver mutations', () => {
  beforeEach(() => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue(
      userAuthContext as never,
    );
  });

  it('passes authenticated request context to the separate triage mutation service method', async () => {
    const { resolver, updateMyahInboxThread } = createResolver();
    const input = {
      threadId,
      creatorId: '20202020-f7c5-4e2f-a44a-240b2d3a9d02',
    };

    await resolver.updateMyahInboxThread(
      input,
      workspace as never,
      workspaceMemberId,
    );

    expect(updateMyahInboxThread).toHaveBeenCalledWith({
      ...input,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('passes authenticated request context to the separate draft mutation service method', async () => {
    const { resolver, saveMyahInboxDraft } = createResolver();
    const input = {
      threadId,
      expectedRevision: 2,
      body: { markdown: 'copy', blocknote: null },
    };

    await resolver.saveMyahInboxDraft(
      input,
      workspace as never,
      workspaceMemberId,
    );

    expect(saveMyahInboxDraft).toHaveBeenCalledWith({
      ...input,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it.each(['updateMyahInboxThread', 'saveMyahInboxDraft'] as const)(
    'fails closed for %s when guards are bypassed outside user auth',
    async (method) => {
      jest.mocked(getWorkspaceAuthContext).mockReturnValue({
        type: 'system',
        workspace,
      } as never);
      const { resolver, updateMyahInboxThread, saveMyahInboxDraft } =
        createResolver();

      await expect(
        method === 'updateMyahInboxThread'
          ? resolver.updateMyahInboxThread(
              { threadId, creatorId: null },
              workspace as never,
              workspaceMemberId,
            )
          : resolver.saveMyahInboxDraft(
              { threadId, expectedRevision: 2, body: null },
              workspace as never,
              workspaceMemberId,
            ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateMyahInboxThread).not.toHaveBeenCalled();
      expect(saveMyahInboxDraft).not.toHaveBeenCalled();
    },
  );

  it('bounds and validates the public mutation inputs', async () => {
    const invalidTriage = Object.assign(new UpdateMyahInboxThreadInput(), {
      threadId: 'not-a-uuid',
      inboxState: 'NOT_A_STATE',
    });
    const invalidDraft = Object.assign(new SaveMyahInboxDraftInput(), {
      threadId,
      expectedRevision: -1,
      body: {
        markdown: 'x'.repeat(MYAH_INBOX_MAX_DRAFT_MARKDOWN_LENGTH + 1),
        blocknote: null,
      },
    });

    await expect(validate(invalidTriage)).resolves.not.toEqual([]);
    await expect(validate(invalidDraft)).resolves.not.toEqual([]);
  });

  it('retains Task 3 guards and registers the mutation service', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MyahInboxResolver);
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxModule,
    ) as unknown[];

    expect(guards).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      CustomPermissionGuard,
    ]);
    expect(providers).toContain(MyahInboxMutationService);
  });
});
