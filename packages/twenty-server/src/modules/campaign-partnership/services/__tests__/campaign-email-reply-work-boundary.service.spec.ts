import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { CampaignEmailReplyWorkBoundaryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-work-boundary.service';

const W = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const C = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333';
const CREATOR = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';
const THREAD = '66666666-6666-4666-8666-666666666666';
const CHANNEL = '77777777-7777-4777-8777-777777777777';
const ACCOUNT = '88888888-8888-4888-8888-888888888888';
const MESSAGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const auth = {
  type: 'user',
  workspace: { id: W },
  userWorkspaceId: MEMBER,
  workspaceMemberId: MEMBER,
  workspaceMember: { id: MEMBER, userId: C },
  user: { id: C },
} as never;
const route = {
  workspaceId: W,
  messageId: MESSAGE,
  messageThreadId: THREAD,
  messageChannelId: CHANNEL,
  connectedAccountId: ACCOUNT,
  providerThreadId: 'provider-thread',
  creatorSender: 'creator@example.test',
  accountRecipient: 'brand@example.test',
  providerOccurredAt: new Date('2026-09-28T12:00:00Z'),
};
const binding: {
  revokedAt: Date | null;
  deletedAt: Date | null;
  id: string;
  campaignId: string;
  participationId: string;
  creatorId: string;
  messageThreadId: string;
  messageChannelId: string;
  connectedAccountId: string;
  providerThreadId: string;
  creatorSender: string;
  accountRecipient: string;
  messageId: string | null;
  establishedAt: Date;
} = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  campaignId: C,
  participationId: P,
  creatorId: CREATOR,
  messageThreadId: THREAD,
  messageChannelId: CHANNEL,
  connectedAccountId: ACCOUNT,
  providerThreadId: 'provider-thread',
  creatorSender: route.creatorSender,
  accountRecipient: route.accountRecipient,
  messageId: null,
  establishedAt: new Date('2026-09-28T11:00:00Z'),
  revokedAt: null,
  deletedAt: null,
};
const fixture = () => {
  let bindings = [binding];
  const repository = (name: string) => ({
    target: name,
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      name === 'campaignEmailConversationBinding'
        ? bindings.filter(
            (row) =>
              row.revokedAt === null &&
              row.deletedAt === null &&
              [
                'messageThreadId',
                'messageChannelId',
                'connectedAccountId',
                'providerThreadId',
                'creatorSender',
                'accountRecipient',
              ].every((key) => where[key] === row[key as keyof typeof row]),
          )
        : [],
    ),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
      if (name === 'workspaceMember')
        return where.id === MEMBER ? { id: MEMBER, userId: C } : null;
      if (name === 'campaign')
        return where.id === C
          ? {
              id: C,
              replyAgentEnabled: true,
              replyAgentMode: 'REVIEW',
              replyAgentEnabledAt: new Date('2026-09-28T11:00:00Z'),
            }
          : null;
      if (name === 'campaignCreator')
        return where.id === P
          ? {
              id: P,
              campaignId: C,
              creatorId: CREATOR,
              replyAgentPaused: false,
              excludedAt: null,
              stage: 'CONTACTED',
            }
          : null;
      if (name === 'creator')
        return where.id === CREATOR ? { id: CREATOR } : null;
      return null;
    }),
  });
  const repos = Object.fromEntries(
    [
      'workspaceMember',
      'campaignEmailConversationBinding',
      'campaign',
      'campaignCreator',
      'creator',
    ].map((name) => [name, repository(name)]),
  );
  const manager: {
    queryRunner: { isTransactionActive: boolean; isReleased: boolean };
    getRepository: jest.Mock;
    transaction: jest.Mock;
  } = {
    queryRunner: { isTransactionActive: true, isReleased: false },
    getRepository: jest.fn((name: string) => repos[name]),
    transaction: jest.fn(),
  };
  manager.transaction.mockImplementation(
    async (fn: (manager: unknown) => unknown) => fn(manager),
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (fn: () => unknown) => fn()),
    getRepository: jest.fn(async (_workspace: string, name: string) => ({
      ...repos[name],
      manager,
    })),
  };
  const service = new CampaignEmailReplyWorkBoundaryService(orm as never);
  const call = (workspaceId = W) =>
    withWorkspaceContext(
      {
        authContext: auth,
        userWorkspaceRoleMap: { [MEMBER]: 'role' },
        apiKeyRoleMap: {},
      } as never,
      () =>
        service.inspect({
          authContext: auth,
          route: { ...route, workspaceId },
        }),
    );
  return {
    service,
    call,
    manager,
    orm,
    repos,
    setBindings: (rows: typeof bindings) => {
      bindings = rows;
    },
  };
};

describe('permissioned Email reply binding choices (registered in Inbox)', () => {
  it('lists only an exact visible participation without authorizing generation or send', async () => {
    const f = fixture();
    await expect(f.call()).resolves.toEqual({
      choices: [
        {
          bindingId: binding.id,
          campaignId: C,
          participationId: P,
          creatorId: CREATOR,
        },
      ],
    });
    expect(f.manager.transaction).toHaveBeenCalledTimes(1);
    expect(f.repos.campaignEmailConversationBinding.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageThreadId: THREAD,
          messageChannelId: CHANNEL,
          connectedAccountId: ACCOUNT,
          creatorSender: route.creatorSender,
        }),
      }),
    );
  });
  it('does not expose another workspace or a revoked/hidden/reassigned participation', async () => {
    const f = fixture();
    await expect(f.call(OTHER)).rejects.toThrow();
    expect(f.orm.getRepository).not.toHaveBeenCalled();
    f.setBindings([{ ...binding, revokedAt: new Date() }]);
    await expect(f.call()).resolves.toMatchObject({ choices: [] });
    f.setBindings([{ ...binding, creatorId: OTHER }]);
    await expect(f.call()).resolves.toMatchObject({ choices: [] });
    f.setBindings([{ ...binding, campaignId: OTHER }]);
    await expect(f.call()).resolves.toMatchObject({ choices: [] });
  });
  it('rejects account, channel, thread and provider-route substitution', async () => {
    const f = fixture();
    const rows = [
      { ...binding, connectedAccountId: OTHER },
      { ...binding, messageChannelId: OTHER },
      { ...binding, providerThreadId: 'other-thread' },
      { ...binding, messageThreadId: OTHER },
    ];
    for (const row of rows) {
      f.setBindings([row]);
      await expect(f.call()).resolves.toMatchObject({ choices: [] });
    }
  });
  it('keeps both exact campaigns visible rather than choosing an enabled one', async () => {
    const f = fixture();
    f.setBindings([binding, { ...binding, id: P, participationId: P }]);
    await expect(f.call()).resolves.toMatchObject({
      choices: expect.arrayContaining([
        expect.objectContaining({ bindingId: binding.id }),
        expect.objectContaining({ bindingId: P }),
      ]),
    });
  });
});
