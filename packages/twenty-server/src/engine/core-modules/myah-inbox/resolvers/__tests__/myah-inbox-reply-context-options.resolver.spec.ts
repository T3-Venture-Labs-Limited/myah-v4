import { GUARDS_METADATA } from '@nestjs/common/constants';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ReplyChannel } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);
const workspace = { id: '20202020-0b5c-4178-bed7-d371f6411eaa' };
const member = 'member';
const auth = {
  type: 'user',
  workspace,
  workspaceMemberId: member,
  user: { id: 'user' },
};
const input = {
  expectedWorkspaceId: workspace.id,
  target: {
    channel: ReplyChannel.EMAIL,
    threadId: '20202020-0b5c-4178-bed7-d371f6411eab',
    contactId: encodeMyahInboxContactId({
      workspaceId: workspace.id,
      identity: {
        kind: 'creator',
        recordId: '20202020-0b5c-4178-bed7-d371f6411eac',
      },
    }),
  },
};
const setup = () => {
  const listOptions = jest.fn().mockResolvedValue({
    edges: [],
    pageInfo: { hasNextPage: false, endCursor: null },
    generalAvailable: false,
    defaultContext: null,
  });
  const resolver = new MyahInboxResolver(
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    { listOptions } as never,
  );
  jest.mocked(getWorkspaceAuthContext).mockReturnValue(auth as never);
  return { resolver, listOptions };
};
describe('myahInboxReplyContextOptions GraphQL query', () => {
  it('uses Inbox user/workspace/permission guards and forwards authenticated identity', async () => {
    const { resolver, listOptions } = setup();
    expect(Reflect.getMetadata(GUARDS_METADATA, MyahInboxResolver)).toEqual([
      WorkspaceAuthGuard,
      UserAuthGuard,
      CustomPermissionGuard,
    ]);
    await resolver.myahInboxReplyContextOptions(
      input,
      workspace as never,
      member,
    );
    expect(listOptions).toHaveBeenCalledWith({
      ...input,
      authContext: auth,
      user: auth.user,
      workspace,
      workspaceMemberId: member,
    });
  });
  it.each([
    'wrong workspace',
    'missing workspace',
    'wrong injected workspace',
    'wrong member',
    'system auth',
  ])('rejects %s before evidence access', async (mode) => {
    const { resolver, listOptions } = setup();
    if (mode === 'system auth')
      jest
        .mocked(getWorkspaceAuthContext)
        .mockReturnValue({ type: 'system', workspace } as never);
    await expect(
      resolver.myahInboxReplyContextOptions(
        {
          ...input,
          expectedWorkspaceId:
            mode === 'wrong workspace'
              ? input.target.threadId
              : mode === 'missing workspace'
                ? (undefined as never)
                : workspace.id,
        },
        (mode === 'wrong injected workspace'
          ? { id: input.target.threadId }
          : workspace) as never,
        mode === 'wrong member' ? 'other' : member,
      ),
    ).rejects.toThrow();
    expect(listOptions).not.toHaveBeenCalled();
  });
});
