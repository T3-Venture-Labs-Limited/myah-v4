import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxContactResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox-contact.resolver';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MyahInboxContactLinkService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-link.service';
import { MyahInboxContactQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-query.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

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

const buildResolver = () => {
  const listContacts = jest.fn().mockResolvedValue({
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  });
  const getContact = jest.fn().mockResolvedValue({ id: 'opaque-contact' });
  const listMessages = jest.fn().mockResolvedValue({
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  });
  const linkContact = jest.fn().mockResolvedValue('result-contact-id');

  return {
    getContact,
    linkContact,
    listContacts,
    listMessages,
    resolver: new MyahInboxContactResolver(
      { listContacts, getContact } as never,
      { listMessages } as never,
      { linkContact } as never,
    ),
  };
};

describe('MyahInboxContactResolver', () => {
  beforeEach(() => {
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);
  });

  it('forwards Contact list and Email timeline requests with exact authenticated context', async () => {
    const harness = buildResolver();

    await harness.resolver.myahInboxContacts(
      { first: 25, search: 'creator' },
      workspace as never,
      workspaceMemberId,
    );
    await harness.resolver.myahInboxContact(
      'opaque-contact',
      workspace as never,
      workspaceMemberId,
    );
    await harness.resolver.myahInboxContactEmailMessages(
      { contactId: 'opaque-contact', first: 50 },
      workspace as never,
      workspaceMemberId,
    );

    expect(harness.listContacts).toHaveBeenCalledWith({
      first: 25,
      search: 'creator',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
    expect(harness.getContact).toHaveBeenCalledWith({
      contactId: 'opaque-contact',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
    expect(harness.listMessages).toHaveBeenCalledWith({
      contactId: 'opaque-contact',
      first: 50,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('forwards exact source linkage and returns the resulting opaque Contact ID', async () => {
    const harness = buildResolver();

    await expect(
      harness.resolver.linkMyahInboxContactCreator(
        { contactId: 'source-contact-id', creatorId: 'creator-id' },
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toBe('result-contact-id');
    expect(harness.linkContact).toHaveBeenCalledWith({
      contactId: 'source-contact-id',
      creatorId: 'creator-id',
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('requires all Inbox guards and registers every Contact provider', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MyahInboxContactResolver),
    ).toEqual([WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard]);
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahInboxModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([
        MyahInboxContactResolver,
        MyahInboxContactQueryService,
        MyahInboxContactEmailQueryService,
        MyahInboxContactLinkService,
      ]),
    );
  });
});
