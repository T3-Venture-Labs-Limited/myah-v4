import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  decodeMyahInboxContactId,
  encodeMyahInboxContactId,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

const rolePermissionConfig = { unionOf: ['role-id'] };

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

const workspaceId = '00000000-0000-4000-8000-000000000001';
const workspaceMemberId = '00000000-0000-4000-8000-000000000002';
const userWorkspaceId = '00000000-0000-4000-8000-000000000003';
const creatorId = '00000000-0000-4000-8000-000000000004';
const emailThreadId = '00000000-0000-4000-8000-000000000005';
const instagramConversationId = '00000000-0000-4000-8000-000000000006';
const workspace = { id: workspaceId } as WorkspaceEntity;
const authContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  workspaceMemberId,
  user: { id: 'user-id' },
  workspaceMember: { id: workspaceMemberId },
} as unknown as UserWorkspaceAuthContext;

const emailContactId = encodeMyahInboxContactId({
  workspaceId,
  identity: { kind: 'email-thread', recordId: emailThreadId },
});
const instagramContactId = encodeMyahInboxContactId({
  workspaceId,
  identity: {
    kind: 'instagram-conversation',
    recordId: instagramConversationId,
  },
});
const creatorContactId = encodeMyahInboxContactId({
  workspaceId,
  identity: { kind: 'creator', recordId: creatorId },
});

type LinkService = {
  linkContact: (input: Record<string, unknown>) => Promise<string>;
};
type LinkServiceConstructor = new (...args: never[]) => LinkService;

const loadService = (): LinkServiceConstructor | undefined => {
  try {
    return require('../myah-inbox-contact-link.service')
      .MyahInboxContactLinkService as LinkServiceConstructor;
  } catch {
    return undefined;
  }
};

const buildHarness = () => {
  const repositories = new Map<string, Record<string, jest.Mock>>();
  const getRepository = (name: string) => {
    if (!repositories.has(name)) {
      repositories.set(name, {
        findOne: jest.fn().mockResolvedValue({ id: creatorId }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      });
    }

    return repositories.get(name)!;
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getRepository: jest.fn(async (_workspaceId, name) => getRepository(name)),
  };
  const updateMyahInboxThread = jest.fn().mockResolvedValue({});
  const Service = loadService();

  expect(Service).toBeDefined();

  return {
    globalWorkspaceOrmManager,
    getRepository,
    repositories,
    updateMyahInboxThread,
    service: new Service!(
      globalWorkspaceOrmManager as never,
      { updateMyahInboxThread } as never,
    ),
  };
};

const request = (overrides: Record<string, unknown> = {}) => ({
  contactId: emailContactId,
  creatorId,
  authContext,
  user: authContext.user,
  workspace,
  workspaceMemberId,
  ...overrides,
});

describe('MyahInboxContactLinkService', () => {
  it('delegates exact Email linkage to the existing thread mutation', async () => {
    const harness = buildHarness();

    const resultingContactId = await harness.service.linkContact(request());

    expect(harness.updateMyahInboxThread).toHaveBeenCalledWith({
      threadId: emailThreadId,
      creatorId,
      authContext,
      user: authContext.user,
      workspace,
      workspaceMemberId,
    });
    expect(decodeMyahInboxContactId(resultingContactId, workspaceId)).toEqual({
      kind: 'creator',
      recordId: creatorId,
    });
  });

  it('links an exact Instagram conversation through its permission-scoped repository', async () => {
    const harness = buildHarness();

    const resultingContactId = await harness.service.linkContact(
      request({ contactId: instagramContactId }),
    );

    expect(
      harness.repositories.get('myahSocialConversation')?.update,
    ).toHaveBeenCalledWith(
      { id: instagramConversationId, deletedAt: expect.anything() },
      { creatorId },
    );
    expect(decodeMyahInboxContactId(resultingContactId, workspaceId)).toEqual({
      kind: 'creator',
      recordId: creatorId,
    });
  });

  it('unlinks one exact source and returns its separate contact identity immediately', async () => {
    const harness = buildHarness();

    const resultingContactId = await harness.service.linkContact(
      request({ contactId: instagramContactId, creatorId: null }),
    );

    expect(
      harness.repositories.get('myahSocialConversation')?.update,
    ).toHaveBeenCalledWith(
      { id: instagramConversationId, deletedAt: expect.anything() },
      { creatorId: null },
    );
    expect(decodeMyahInboxContactId(resultingContactId, workspaceId)).toEqual({
      kind: 'instagram-conversation',
      recordId: instagramConversationId,
    });
  });

  it('normalizes an omitted nullable Creator argument to unlink', async () => {
    const harness = buildHarness();

    await harness.service.linkContact(
      request({ contactId: emailContactId, creatorId: undefined }),
    );

    expect(harness.updateMyahInboxThread).toHaveBeenCalledWith({
      threadId: emailThreadId,
      creatorId: null,
      authContext,
      user: authContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('rejects attempts to relink a grouped Creator identity', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.linkContact(request({ contactId: creatorContactId })),
    ).rejects.toThrow('Select an exact Email or Instagram source to link');
    expect(
      harness.globalWorkspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when the source or target Creator is not readable', async () => {
    const sourceHarness = buildHarness();
    sourceHarness.updateMyahInboxThread.mockRejectedValue(
      new Error('Inbox contact source is not readable'),
    );

    await expect(sourceHarness.service.linkContact(request())).rejects.toThrow(
      'Inbox contact source is not readable',
    );

    const creatorHarness = buildHarness();
    creatorHarness.getRepository('creator').findOne.mockResolvedValue(null);

    await expect(
      creatorHarness.service.linkContact(
        request({ contactId: instagramContactId }),
      ),
    ).rejects.toThrow('Inbox Creator is not readable');
    expect(
      creatorHarness.repositories.get('myahSocialConversation')?.update,
    ).not.toHaveBeenCalled();
  });
});
