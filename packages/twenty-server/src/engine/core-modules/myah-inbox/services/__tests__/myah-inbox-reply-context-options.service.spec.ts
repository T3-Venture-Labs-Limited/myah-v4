import { ForbiddenException } from '@nestjs/common';
import { IsNull } from 'typeorm';

import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import { MyahInboxReplyContextOptionsService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context-options.service';
import { MyahInboxReplyContextQueryEvidenceResolver } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

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
  () => ({ resolveRolePermissionConfig: jest.fn(() => ({ unionOf: [] })) }),
);

const id = (n: number) =>
  `20202020-0b5c-4178-bed7-${String(n).padStart(12, '0')}`;
const workspaceId = id(1);
const creatorId = id(2);
const threadId = id(3);
const contactId = encodeMyahInboxContactId({
  workspaceId,
  identity: { kind: 'creator', recordId: creatorId },
});
const request = {
  expectedWorkspaceId: workspaceId,
  target: { channel: ReplyChannel.EMAIL, threadId, contactId },
  authContext: {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId: id(4),
    user: { id: id(5) },
    workspaceMemberId: id(6),
  },
  user: { id: id(5) },
  workspace: { id: workspaceId },
  workspaceMemberId: id(6),
} as unknown as Parameters<
  MyahInboxReplyContextOptionsService['listOptions']
>[0];

const setup = () => {
  const campaigns = Array.from({ length: 106 }, (_, i) => ({
    id: id(100 + i),
    name: `Same subject ${i % 2}`,
  }));
  const hidden = new Set<string>();
  const denied = new Set<string>();
  const ineligible = new Set<string>();
  let selectedId: string | null = null;
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'where',
    'andWhere',
    'setParameters',
    'orderBy',
  ])
    qb[method] = jest.fn(() => qb);
  qb.getRawMany = jest.fn(async () =>
    selectedId && !ineligible.has(selectedId) ? [{ id: id(900) }] : [],
  );
  const repositories = {
    messageThread: {
      findOne: jest.fn().mockResolvedValue({
        id: threadId,
        creatorId,
        myahCampaignId: campaigns[0].id,
      }),
      find: jest.fn().mockImplementation(async ({ where }) =>
        where.myahCampaignId
          ? [{ id: id(800) }]
          : campaigns
              .slice()
              .reverse()
              .map((c) => ({ id: id(800), myahCampaignId: c.id })),
      ),
    },
    creator: {
      findOne: jest.fn().mockResolvedValue({ id: creatorId, name: 'Creator' }),
    },
    campaign: {
      findOne: jest.fn(async ({ where }) => {
        selectedId = where.id;
        if (denied.has(where.id))
          throw new PermissionsException(
            'Secret campaign',
            PermissionsExceptionCode.PERMISSION_DENIED,
          );
        if (hidden.has(where.id)) return null;
        return campaigns.find((c) => c.id === where.id) ?? null;
      }),
    },
    campaignCreator: { find: jest.fn().mockResolvedValue([]) },
    outreachAction: { find: jest.fn().mockResolvedValue([]) },
    message: { createQueryBuilder: jest.fn(() => qb) },
  };
  const orm = {
    executeInWorkspaceContext: jest.fn(async (run) => run()),
    getRepository: jest.fn(
      async (_workspaceId, name) =>
        repositories[name as keyof typeof repositories],
    ),
  };
  const query = {
    getThreadSummary: jest.fn().mockResolvedValue({ id: threadId }),
  };
  const evidence = new MyahInboxReplyContextQueryEvidenceResolver(
    query as never,
    orm as never,
    {
      buildSqlVisibilityProjection: jest.fn(() => ({
        expression: "'FULL'",
        parameters: {
          messageVisibilityFull: 'FULL',
          messageVisibilityUserWorkspaceId: id(4),
        },
      })),
    } as never,
  );
  const gate = {
    assertEmailContextActivationEnabled: jest.fn().mockResolvedValue(undefined),
  };
  const provenance = { query: jest.fn().mockResolvedValue([]) };
  const service = new MyahInboxReplyContextOptionsService(
    evidence,
    orm as never,
    gate as never,
    provenance as never,
  );
  return {
    service,
    repositories,
    campaigns,
    hidden,
    denied,
    ineligible,
    gate,
    orm,
    qb,
    query,
    evidence,
    provenance,
  };
};

describe('MyahInboxReplyContextOptionsService', () => {
  it('enumerates complete history over bounded pages in stable ID order, not subject or membership order', async () => {
    const { service, campaigns, repositories, qb, query } = setup();
    const first = await service.listOptions({ ...request, first: 100 });
    expect(first.edges.map((e) => e.node)).toEqual(campaigns.slice(0, 100));
    expect(first.pageInfo.hasNextPage).toBe(true);
    const repeat = await service.listOptions({ ...request, first: 100 });
    expect(repeat).toEqual(first);
    const second = await service.listOptions({
      ...request,
      first: 100,
      after: first.pageInfo.endCursor,
    });
    expect(second.edges.map((e) => e.node)).toEqual(campaigns.slice(100));
    expect(second.pageInfo.hasNextPage).toBe(false);
    expect(
      await service.listOptions({
        ...request,
        after: second.pageInfo.endCursor,
      }),
    ).toMatchObject({
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    expect(repositories.messageThread.find).toHaveBeenCalledWith({
      where: { creatorId, deletedAt: IsNull() },
      select: { id: true, myahCampaignId: true },
    });
    const sql = qb.andWhere.mock.calls.flat().join(' ');
    expect(sql).toContain('message."isDraft" = false');
    expect(sql).toContain('message."receivedAt" IS NOT NULL');
    expect(sql).toContain("association.direction = 'OUTGOING'");
    expect(sql).toContain("channel.type IN ('EMAIL', 'EMAIL_GROUP')");
    expect(sql).toContain(':messageVisibilityFull');
    for (const [summaryInput] of query.getThreadSummary.mock.calls) {
      expect(summaryInput).not.toHaveProperty('after');
      expect(summaryInput).not.toHaveProperty('first');
    }
  });

  it('retains a readable exact-thread default but omits ineligible options for NEEDS_REVIEW', async () => {
    const { service, campaigns, ineligible } = setup();
    ineligible.add(campaigns[0].id);
    const result = await service.listOptions(request);
    expect(result.defaultContext).toEqual({
      kind: ReplyContextKind.CAMPAIGN,
      campaignId: campaigns[0].id,
      campaignName: campaigns[0].name,
    });
    expect(result.edges.some((e) => e.node.id === campaigns[0].id)).toBe(false);
    expect(result.generalAvailable).toBe(false);
  });

  it.each(['hidden', 'soft-deleted', 'undefined', 'ambiguous'] as const)(
    'never maps %s exact-thread association to General or leaks its ID/name',
    async (mode) => {
      const { service, repositories, hidden, denied, campaigns } = setup();
      campaigns[0].name = 'Never disclose this Campaign';
      if (mode === 'hidden') denied.add(campaigns[0].id);
      else if (mode === 'soft-deleted') hidden.add(campaigns[0].id);
      else
        repositories.messageThread.findOne.mockResolvedValue({
          id: threadId,
          creatorId,
          myahCampaignId: mode === 'undefined' ? undefined : [],
        });
      const result = await service.listOptions(request);
      expect(result).toMatchObject({
        generalAvailable: false,
        defaultContext: null,
      });
      if (hidden.size || denied.size) {
        expect(JSON.stringify(result)).not.toContain(campaigns[0].id);
        expect(JSON.stringify(result)).not.toContain(campaigns[0].name);
      }
    },
  );

  it('offers and defaults General only with durable proof on the exact authorized anchor', async () => {
    const { service, repositories, provenance } = setup();
    provenance.query.mockResolvedValue([{ proven: true }]);
    repositories.messageThread.findOne.mockResolvedValue({
      id: threadId,
      creatorId,
      myahCampaignId: null,
    });
    expect(await service.listOptions(request)).toMatchObject({
      generalAvailable: true,
      defaultContext: {
        kind: ReplyContextKind.GENERAL,
        campaignId: null,
        campaignName: null,
      },
    });
  });

  it.each(['hard-delete SET_NULL', 'ambiguous historical null'])(
    'does not infer General from %s without provenance',
    async (mode) => {
      const { service, repositories, campaigns, hidden, provenance } = setup();
      if (mode === 'hard-delete SET_NULL') hidden.add(campaigns[0].id);
      repositories.messageThread.findOne.mockResolvedValue({
        id: threadId,
        creatorId,
        myahCampaignId: null,
      });
      expect(await service.listOptions(request)).toMatchObject({
        generalAvailable: false,
        defaultContext: null,
      });
      expect(provenance.query).toHaveBeenCalledWith(
        expect.stringContaining('"revokedAt" IS NULL'),
        [workspaceId, threadId, creatorId],
      );
    },
  );

  it('does not read provenance before target permission checks or accept another anchor', async () => {
    const { service, query, provenance } = setup();
    provenance.query.mockResolvedValue([{ proven: true }]);
    query.getThreadSummary.mockRejectedValue(new ForbiddenException());
    await expect(service.listOptions(request)).rejects.toThrow();
    expect(provenance.query).not.toHaveBeenCalled();
  });

  it('never offers General on an associated target even if stale proof is returned', async () => {
    const { service, provenance } = setup();
    provenance.query.mockResolvedValue([{ proven: true }]);
    expect((await service.listOptions(request)).generalAvailable).toBe(false);
    expect(provenance.query).not.toHaveBeenCalled();
  });

  it('fails activation default-off before any target/evidence read', async () => {
    const { service, gate, orm, query } = setup();
    gate.assertEmailContextActivationEnabled.mockRejectedValue(
      new ForbiddenException('Email reply context activation is pending'),
    );
    await expect(service.listOptions(request)).rejects.toThrow(
      'activation is pending',
    );
    expect(orm.getRepository).not.toHaveBeenCalled();
    expect(query.getThreadSummary).not.toHaveBeenCalled();
  });

  it.each([
    'wrong creator',
    'thread alias',
    'hidden target',
    'missing creator',
    'permission denied',
  ])('rejects %s without enumerating options', async (mode) => {
    const { service, repositories, query } = setup();
    let input = request;
    if (mode === 'wrong creator' || mode === 'thread alias')
      input = {
        ...request,
        target: {
          ...request.target,
          contactId: encodeMyahInboxContactId({
            workspaceId,
            identity:
              mode === 'wrong creator'
                ? { kind: 'creator', recordId: id(99) }
                : { kind: 'email-thread', recordId: threadId },
          }),
        },
      };
    if (mode === 'hidden target')
      query.getThreadSummary.mockRejectedValue(
        new ForbiddenException('secret target'),
      );
    if (mode === 'missing creator')
      repositories.creator.findOne.mockResolvedValue(null);
    if (mode === 'permission denied')
      repositories.creator.findOne.mockRejectedValue(
        new PermissionsException(
          'secret creator',
          PermissionsExceptionCode.PERMISSION_DENIED,
        ),
      );
    await expect(service.listOptions(input)).rejects.toThrow(
      'Reply context is not readable',
    );
    expect(repositories.messageThread.find).not.toHaveBeenCalled();
  });

  it('uses completed outreach evidence from the Creator even without a legacy Campaign thread', async () => {
    const { service, repositories, qb, campaigns } = setup();
    repositories.messageThread.find.mockResolvedValue([]);
    repositories.campaignCreator.find.mockResolvedValue([
      { id: id(700), campaignId: campaigns[0].id },
    ]);
    repositories.outreachAction.find.mockResolvedValue([
      { id: id(701), messageId: id(900), completedAt: new Date() },
    ]);
    qb.getRawMany.mockImplementation(async () =>
      qb.where.mock.calls[qb.where.mock.calls.length - 1]?.[1]?.hasEvidenceIds
        ? [{ id: id(900) }]
        : [],
    );
    expect(
      (await service.listOptions(request)).edges.map((e) => e.node.id),
    ).toEqual([campaigns[0].id]);
    repositories.outreachAction.find.mockResolvedValue([
      { id: id(701), messageId: id(900), completedAt: null },
    ]);
    expect((await service.listOptions(request)).edges).toEqual([]);
    expect(repositories.outreachAction.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: 'EMAIL',
          status: 'APPLIED',
          deletedAt: IsNull(),
        }),
      }),
    );
  });

  it('rejects cross-target cursors and advances even if the prior option becomes hidden', async () => {
    const { service, hidden, campaigns } = setup();
    const page = await service.listOptions({ ...request, first: 1 });
    hidden.add(campaigns[0].id);
    const next = await service.listOptions({
      ...request,
      first: 1,
      after: page.pageInfo.endCursor,
    });
    expect(next.edges[0].node.id).toBe(campaigns[1].id);
    await expect(
      service.listOptions({
        ...request,
        target: { ...request.target, threadId: id(44) },
        after: page.pageInfo.endCursor,
      }),
    ).rejects.toThrow('Invalid reply context options cursor');
  });
});
