import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { validate } from 'class-validator';

import { MYAH_INBOX_MAX_PAGE_SIZE } from 'src/engine/core-modules/myah-inbox/constants/myah-inbox.constants';
import { MyahInboxThreadsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-thread-filter.input';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CoreEngineModule } from 'src/engine/core-modules/core-engine.module';
import { MyahInboxReplyContextModule } from 'src/engine/core-modules/myah-inbox/myah-inbox-reply-context.module';
import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-query.service';
import { MyahInboxReplyContextService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { MessagingQueryHookModule } from 'src/modules/messaging/common/query-hooks/messaging-query-hook.module';

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const workspace = { id: '20202020-0b5c-4178-bed7-d371f6411ea9' };
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
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(userAuthContext as never);
  });

  it('passes the authenticated user, workspace, member, and request auth context to the query', async () => {
    const listThreads = jest.fn().mockResolvedValue({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });
    const resolver = new MyahInboxResolver(
      { listThreads } as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.myahInboxThreads(
        { first: 25 } as never,
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toEqual({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });

    expect(listThreads).toHaveBeenCalledWith({
      first: 25,
      authContext: userAuthContext,
      user: userAuthContext.user,
      workspace,
      workspaceMemberId,
    });
  });

  it('passes a validated thread, search, and Campaign filter to the authenticated query', async () => {
    const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
    const campaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';
    const input = Object.assign(new MyahInboxThreadsInput(), {
      first: 25,
      threadId,
      search: 'sender name',
      campaignId,
    });
    const listThreads = jest.fn().mockResolvedValue({
      edges: [],
      pageInfo: { endCursor: null, hasNextPage: false },
    });
    const resolver = new MyahInboxResolver(
      { listThreads } as never,
      {} as never,
      {} as never,
    );

    await expect(
      validate(input, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
    await resolver.myahInboxThreads(
      input,
      workspace as never,
      workspaceMemberId,
    );

    expect(listThreads).toHaveBeenCalledWith({
      first: 25,
      threadId,
      search: 'sender name',
      campaignId,
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
    const resolver = new MyahInboxResolver(
      { listThreads } as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.myahInboxThreads(
        {} as never,
        workspace as never,
        workspaceMemberId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listThreads).not.toHaveBeenCalled();
  });

  it.each([
    'myahInboxThreads',
    'updateMyahInboxThread',
    'saveMyahInboxDraft',
    'generateMyahInboxReplyProposal',
  ] as const)(
    'rejects captured workspace mismatch before %s dispatch',
    async (operation) => {
      const dispatch = jest.fn().mockResolvedValue({});
      const resolver = new MyahInboxResolver(
        { listThreads: dispatch } as never,
        {
          updateMyahInboxThread: dispatch,
          saveMyahInboxDraft: dispatch,
        } as never,
        { generateReplyProposal: dispatch } as never,
      );
      await expect(
        resolver[operation](
          {
            threadId: '20202020-0b5c-4178-bed7-d371f6411eaa',
            expectedWorkspaceId: '20202020-0b5c-4178-bed7-d371f6411eab',
          } as never,
          workspace as never,
          workspaceMemberId,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('guards the exact authoritative shared draft read with a required captured workspace', async () => {
    const readEmailDraft = jest.fn().mockResolvedValue({
      workspaceId: workspace.id,
      threadId: 'thread',
      revision: 4,
      body: null,
    });
    const resolver = new MyahInboxResolver(
      { readEmailDraft } as never,
      {} as never,
      {} as never,
    );
    await expect(
      (async () =>
        resolver.myahInboxEmailDraft(
          'thread',
          workspace.id,
          workspace as never,
          workspaceMemberId,
        ))(),
    ).resolves.toMatchObject({ revision: 4, body: null });
    readEmailDraft.mockClear();
    await expect(
      (async () =>
        resolver.myahInboxEmailDraft(
          'thread',
          'other',
          workspace as never,
          workspaceMemberId,
        ))(),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(readEmailDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['A', 'PROPOSAL', 'A', 'CURRENT', false],
    ['A', 'PROPOSAL', 'B', 'STALE', false],
    ['A', 'EDITED', 'B', 'STALE', true],
    [null, null, 'B', 'UNKNOWN', true],
  ])(
    'derives incoming staleness from the authored baseline %s/%s against %s',
    async (authored, provenance, current, incomingState, bodyEdited) => {
      const testWorkspace = { id: '20202020-0b5c-4178-bed7-d371f6411ea9' };
      jest.mocked(getWorkspaceAuthContext).mockReturnValue({
        ...userAuthContext,
        workspace: testWorkspace,
      } as never);
      const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
      const resolver = new MyahInboxResolver(
        {} as never,
        {} as never,
        {} as never,
        {
          resolveForRead: jest.fn().mockResolvedValue({
            target: {
              channel: 'EMAIL',
              deliveryTargetId: threadId,
              contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
              creatorId: null,
            },
            selected: { kind: 'GENERAL' },
            state: 'READY',
            contextFingerprint: 'f'.repeat(64),
            incomingBaseline: current,
            threadCampaign: { state: 'UNASSOCIATED' },
          }),
        } as never,
        {
          read: jest.fn().mockResolvedValue({
            draftId: '20202020-f7c5-4e2f-a44a-240b2d3a9d02',
            revision: 1,
            contextAcknowledged: true,
            body: { markdown: 'body', blocknote: null },
            authoredIncomingBaseline: authored,
            bodyProvenance: provenance,
          }),
        } as never,
      );

      await expect(
        resolver.myahInboxReplyDraft(
          {
            expectedWorkspaceId: testWorkspace.id,
            target: {
              channel: 'EMAIL',
              contactId: encodeMyahInboxContactId({
                workspaceId: testWorkspace.id,
                identity: { kind: 'email-thread', recordId: threadId },
              }),
              threadId,
            },
            replyContext: { kind: 'GENERAL' },
          } as never,
          testWorkspace as never,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ incomingState, bodyEdited });
    },
  );

  it.each(['NEEDS_REVIEW', 'READY'])(
    'composes readable historical or F1-authored/F2-current draft as NEEDS_REVIEW (%s)',
    async (state) => {
      const testWorkspace = { id: '20202020-0b5c-4178-bed7-d371f6411ea9' };
      const testAuthContext = { ...userAuthContext, workspace: testWorkspace };
      jest
        .mocked(getWorkspaceAuthContext)
        .mockReturnValue(testAuthContext as never);
      const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
      const resolver = new MyahInboxResolver(
        {} as never,
        {} as never,
        {} as never,
        {
          resolveForRead: jest.fn().mockResolvedValue({
            target: {
              channel: 'EMAIL',
              deliveryTargetId: threadId,
              contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
              creatorId: '20202020-f7c5-4e2f-a44a-240b2d3a9d03',
            },
            selected: {
              kind: 'CAMPAIGN',
              campaignId: '20202020-f7c5-4e2f-a44a-240b2d3a9d04',
            },
            state,
            contextFingerprint: null,
            threadCampaign: {
              state: 'READABLE',
              campaign: {
                id: '20202020-f7c5-4e2f-a44a-240b2d3a9d04',
                name: 'Campaign',
              },
            },
          }),
        } as never,
        {
          read: jest.fn().mockResolvedValue({
            draftId: '20202020-f7c5-4e2f-a44a-240b2d3a9d02',
            revision: 1,
            contextAcknowledged: false,
            body: { markdown: 'preserve this', blocknote: null },
          }),
        } as never,
      );

      await expect(
        resolver.myahInboxReplyDraft(
          {
            expectedWorkspaceId: testWorkspace.id,
            target: {
              channel: 'EMAIL',
              contactId: encodeMyahInboxContactId({
                workspaceId: testWorkspace.id,
                identity: { kind: 'email-thread', recordId: threadId },
              }),
              threadId,
            },
            replyContext: {
              kind: 'CAMPAIGN',
              campaignId: '20202020-f7c5-4e2f-a44a-240b2d3a9d04',
            },
          } as never,
          testWorkspace as never,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({
        body: { markdown: 'preserve this', blocknote: null },
        executionState: 'NEEDS_REVIEW',
      });
    },
  );

  it.each([
    ['PENDING', 'OUTCOME_PENDING'],
    ['UNKNOWN', 'OUTCOME_UNKNOWN'],
  ])(
    'serializes target-wide %s before an otherwise ready draft',
    async (targetState, executionState) => {
      const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
      const resolver = new MyahInboxResolver(
        {} as never,
        {} as never,
        {} as never,
        {
          resolveForRead: jest.fn().mockResolvedValue({
            target: {
              channel: 'EMAIL',
              deliveryTargetId: threadId,
              contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
              creatorId: '20202020-f7c5-4e2f-a44a-240b2d3a9d03',
            },
            selected: { kind: 'GENERAL' },
            state: 'READY',
            contextFingerprint: null,
            threadCampaign: { state: 'UNASSOCIATED' },
          }),
        } as never,
        {
          read: jest.fn().mockResolvedValue({
            draftId: '20202020-f7c5-4e2f-a44a-240b2d3a9d02',
            revision: 1,
            body: { markdown: 'preserve this', blocknote: null },
            targetState,
          }),
        } as never,
      );

      await expect(
        resolver.myahInboxReplyDraft(
          {
            expectedWorkspaceId: workspace.id,
            target: {
              channel: 'EMAIL',
              contactId: encodeMyahInboxContactId({
                workspaceId: workspace.id,
                identity: { kind: 'email-thread', recordId: threadId },
              }),
              threadId,
            },
            replyContext: { kind: 'GENERAL' },
          } as never,
          workspace as never,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({ executionState });
    },
  );

  it.each([
    'hidden Campaign',
    'deleted Campaign',
    'hidden Creator',
    'deleted Creator',
  ])(
    'suppresses body and context for an unavailable required %s before target state',
    async () => {
      const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
      const read = jest.fn().mockResolvedValue({
        draftId: '20202020-f7c5-4e2f-a44a-240b2d3a9d02',
        revision: 1,
        body: { markdown: 'must not leak', blocknote: null },
        targetState: 'UNKNOWN',
      });
      const resolver = new MyahInboxResolver(
        {} as never,
        {} as never,
        {} as never,
        {
          resolveForRead: jest.fn().mockResolvedValue({
            target: {
              channel: 'EMAIL',
              deliveryTargetId: threadId,
              contactAnchor: { kind: 'UNAVAILABLE', id: '' },
              creatorId: null,
            },
            selected: { kind: 'GENERAL' },
            state: 'CONTEXT_UNAVAILABLE',
            contextFingerprint: null,
            threadCampaign: null,
          }),
        } as never,
        { read } as never,
      );

      await expect(
        resolver.myahInboxReplyDraft(
          {
            expectedWorkspaceId: workspace.id,
            target: {
              channel: 'EMAIL',
              contactId: encodeMyahInboxContactId({
                workspaceId: workspace.id,
                identity: { kind: 'email-thread', recordId: threadId },
              }),
              threadId,
            },
            replyContext: { kind: 'GENERAL' },
          } as never,
          workspace as never,
          workspaceMemberId,
        ),
      ).resolves.toMatchObject({
        body: null,
        resolvedContext: null,
        executionState: 'CONTEXT_UNAVAILABLE',
      });
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('rejects an Instagram identity for an Email target before evidence or draft reads', async () => {
    const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
    const resolveCurrentEvidence = jest.fn();
    const read = jest.fn().mockResolvedValue({
      draftId: '20202020-f7c5-4e2f-a44a-240b2d3a9d02',
      revision: 1,
      body: { markdown: 'must not leak', blocknote: null },
    });
    const resolver = new MyahInboxResolver(
      {} as never,
      {} as never,
      {} as never,
      new MyahInboxReplyContextService({ resolveCurrentEvidence }),
      { read } as never,
    );

    await expect(
      resolver.myahInboxReplyDraft(
        {
          expectedWorkspaceId: workspace.id,
          target: {
            channel: 'EMAIL',
            contactId: encodeMyahInboxContactId({
              workspaceId: workspace.id,
              identity: {
                kind: 'instagram-conversation',
                recordId: '20202020-f7c5-4e2f-a44a-240b2d3a9d09',
              },
            }),
            threadId,
          },
          replyContext: { kind: 'GENERAL' },
        } as never,
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toMatchObject({
      body: null,
      resolvedContext: null,
      executionState: 'CONTEXT_UNAVAILABLE',
    });
    expect(resolveCurrentEvidence).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('does not label lost eligibility without a historical body as NEEDS_REVIEW', async () => {
    const threadId = '20202020-0b5c-4178-bed7-d371f6411eaa';
    const resolver = new MyahInboxResolver(
      {} as never,
      {} as never,
      {} as never,
      {
        resolveForRead: jest.fn().mockResolvedValue({
          target: {
            channel: 'EMAIL',
            deliveryTargetId: threadId,
            contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
            creatorId: '20202020-f7c5-4e2f-a44a-240b2d3a9d03',
          },
          selected: { kind: 'GENERAL' },
          state: 'NEEDS_REVIEW',
          contextFingerprint: null,
          threadCampaign: { state: 'UNASSOCIATED' },
        }),
      } as never,
      { read: jest.fn().mockResolvedValue(null) } as never,
    );

    await expect(
      resolver.myahInboxReplyDraft(
        {
          expectedWorkspaceId: workspace.id,
          target: {
            channel: 'EMAIL',
            contactId: encodeMyahInboxContactId({
              workspaceId: workspace.id,
              identity: { kind: 'email-thread', recordId: threadId },
            }),
            threadId,
          },
          replyContext: { kind: 'GENERAL' },
        } as never,
        workspace as never,
        workspaceMemberId,
      ),
    ).resolves.toMatchObject({
      body: null,
      executionState: 'CONTEXT_UNAVAILABLE',
    });
  });

  it('accepts oversized public page requests for the service clamp', async () => {
    const input = Object.assign(new MyahInboxThreadsInput(), {
      first: MYAH_INBOX_MAX_PAGE_SIZE + 1,
    });

    await expect(validate(input)).resolves.toEqual([]);
  });

  it('rejects Creator linkage as a public Inbox filter', async () => {
    const input = Object.assign(new MyahInboxThreadsInput(), {
      queue: 'CREATOR_LINKED',
    });

    await expect(
      validate(input, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'queue' })]),
    );
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
    expect(inboxProviders).toContain(MyahInboxResolver);
    expect(inboxProviders).not.toContain(MyahInboxQueryService);
    expect(inboxImports).toContain(MyahInboxReplyContextModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ActionApprovalModule),
    ).toContain(MyahInboxReplyContextModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ActionApprovalModule),
    ).not.toContain(MyahInboxModule);
    expect(
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        MyahInboxReplyContextModule,
      ),
    ).toEqual(
      expect.arrayContaining([
        MyahInboxQueryService,
        MyahInboxReplyContextService,
      ]),
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, MyahInboxReplyContextModule),
    ).not.toEqual(
      expect.arrayContaining([MyahInboxModule, ActionApprovalModule]),
    );
  });
});
