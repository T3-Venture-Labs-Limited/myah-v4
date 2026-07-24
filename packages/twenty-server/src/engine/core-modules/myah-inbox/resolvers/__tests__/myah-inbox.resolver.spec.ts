import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CoreEngineModule } from 'src/engine/core-modules/core-engine.module';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspace = { id: 'workspace-id' };
const workspaceMemberId = 'workspace-member-id';
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId: 'user-workspace-id',
  user: { id: 'user-id' },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
};

describe('MyahInboxResolver', () => {
  beforeEach(() => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue(
      userAuthContext as never,
    );
  });

  it('passes the authenticated user, workspace, member, and request auth context to the query', async () => {
    const listThreads = jest.fn().mockResolvedValue({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });
    const resolver = new MyahInboxResolver({ listThreads } as never);

    await expect(
      resolver.myahInboxThreads(
        { first: 25, queue: 'CREATOR_LINKED' } as never,
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toEqual({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });

    expect(listThreads).toHaveBeenCalledWith({
      first: 25,
      queue: 'CREATOR_LINKED',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('fails closed if invoked outside user auth even when guards are bypassed in a direct call', async () => {
    jest.mocked(getWorkspaceAuthContext).mockReturnValue({
      type: 'system',
      workspace,
    } as never);
    const listThreads = jest.fn();
    const resolver = new MyahInboxResolver({ listThreads } as never);

    await expect(
      resolver.myahInboxThreads({} as never, workspace as never, workspaceMemberId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listThreads).not.toHaveBeenCalled();
  });

  it('requires workspace, user, and custom permission guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MyahInboxResolver)).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      CustomPermissionGuard,
    ]);
  });

  it('registers the resolver module in CoreEngineModule and GraphQL providers', () => {
    const coreImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CoreEngineModule,
    ) as unknown[];
    const inboxImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahInboxModule,
    ) as unknown[];
    const inboxProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxModule,
    ) as unknown[];

    expect(coreImports).toContain(MyahInboxModule);
    expect(inboxImports).toContain(MessagingQueryHookModule);
    expect(inboxProviders).toEqual(
      expect.arrayContaining([MyahInboxResolver, MyahInboxQueryService]),
    );
  });
});
