import { ForbiddenException } from '@nestjs/common';

import { formatResult } from 'src/engine/twenty-orm/utils/format-result.util';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { MyahInboxResolver } from 'src/engine/core-modules/myah-inbox/resolvers/myah-inbox.resolver';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import { encodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';

import { IsNull } from 'typeorm';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';

import {
  ReplyChannel,
  ReplyContextKind,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-reply-context.input';
import {
  MyahInboxReplyContextQueryEvidenceResolver,
  MyahInboxReplyContextService,
  toDraftExecutionState,
  type CurrentReplyContextEvidence,
  type ReplyContextRequest,
} from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-context.service';
import { buildMessageThreadStandardFlatFieldMetadatas } from 'src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/compute-message-thread-standard-flat-field-metadata.util';

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

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({ getWorkspaceAuthContext: jest.fn() }),
);

const visibilityPolicy = {
  buildSqlVisibilityProjection: jest.fn(() => ({
    expression: "'FULL'",
    parameters: {
      messageVisibilityFull: 'FULL',
      messageVisibilityUserWorkspaceId: 'user-workspace',
    },
  })),
};
const messageRepository = (
  rows: { id: string }[] = [{ id: 'sent-message' }],
) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'where',
    'andWhere',
    'setParameters',
    'orderBy',
  ])
    qb[method] = jest.fn(() => qb);
  qb.getRawMany = jest.fn(async () => rows);
  return { createQueryBuilder: jest.fn(() => qb), qb };
};
const emptyEvidenceRepository = { find: jest.fn(async () => []) };

const workspaceId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const standardObjectMetadataRelatedEntityIds = Object.fromEntries(
  Object.entries(STANDARD_OBJECTS).map(([objectName, object]) => [
    objectName,
    {
      id: `${objectName}-id`,
      fields: Object.fromEntries(
        Object.keys(object.fields).map((fieldName) => [
          fieldName,
          { id: `${objectName}-${fieldName}-id` },
        ]),
      ),
    },
  ]),
);

const getMessageThreadCampaignJoinColumnName = (): string => {
  const messageThreadFields = buildMessageThreadStandardFlatFieldMetadatas({
    now: '2026-09-16T00:00:00.000Z',
    objectName: 'messageThread',
    workspaceId,
    twentyStandardApplicationId: 'application-id',
    standardObjectMetadataRelatedEntityIds:
      standardObjectMetadataRelatedEntityIds as never,
    dependencyFlatEntityMaps: {} as never,
  });

  return (
    messageThreadFields.myahCampaign.settings as { joinColumnName: string }
  ).joinColumnName;
};
const threadId = '20202020-f7c5-4e2f-a44a-240b2d3a9d02';
const campaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d03';

const readRequest = {
  target: {
    channel: ReplyChannel.EMAIL,
    contactId: 'opaque-contact-id',
    threadId,
  },
  replyContext: { kind: ReplyContextKind.CAMPAIGN, campaignId },
  authContext: {
    type: 'user' as const,
    workspace: { id: workspaceId },
    workspaceMemberId: 'workspace-member-id',
    user: { id: 'user-id' },
  },
  user: { id: 'user-id' },
  workspace: { id: workspaceId },
  workspaceMemberId: 'workspace-member-id',
  contactIdentity: {
    kind: 'creator',
    recordId: '20202020-f7c5-4e2f-a44a-240b2d3a9d04',
  },
} as ReplyContextRequest;

const readableEvidence: CurrentReplyContextEvidence = {
  readable: true,
  eligible: false,
  target: {
    channel: ReplyChannel.EMAIL,
    deliveryTargetId: threadId,
    contactAnchor: { kind: 'EMAIL_THREAD', id: threadId },
    creatorId: null,
  },
  contextFingerprint: null,
  threadCampaign: { state: 'UNASSOCIATED' },
};

describe('MyahInboxReplyContextService', () => {
  it('fails closed for every Email context read before evidence is exposed when activation is absent', async () => {
    const resolveCurrentEvidence = jest.fn();
    const service = new MyahInboxReplyContextService(
      { resolveCurrentEvidence },
      {
        assertEmailContextActivationEnabled: jest
          .fn()
          .mockRejectedValue(
            new ForbiddenException('Email reply context activation is pending'),
          ),
      } as never,
    );

    await expect(service.resolveForRead(readRequest)).rejects.toThrow(
      'Email reply context activation is pending',
    );
    expect(resolveCurrentEvidence).not.toHaveBeenCalled();
  });

  it('does not apply the Email activation gate to Instagram context reads', async () => {
    const resolveCurrentEvidence = jest.fn().mockResolvedValue({
      ...readableEvidence,
      target: {
        ...readableEvidence.target,
        channel: ReplyChannel.INSTAGRAM,
      },
    });
    const activationGate = {
      assertEmailContextActivationEnabled: jest
        .fn()
        .mockRejectedValue(
          new ForbiddenException('Email reply context activation is pending'),
        ),
    };
    const service = new MyahInboxReplyContextService(
      { resolveCurrentEvidence },
      activationGate as never,
    );
    const instagramRequest = {
      ...readRequest,
      target: {
        channel: ReplyChannel.INSTAGRAM,
        contactId: 'opaque-instagram-contact',
        conversationId: threadId,
      },
      contactIdentity: { kind: 'instagram-conversation', recordId: threadId },
    } as ReplyContextRequest;

    await expect(
      service.resolveForRead(instagramRequest),
    ).resolves.toMatchObject({
      state: 'NEEDS_REVIEW',
    });
    expect(
      activationGate.assertEmailContextActivationEnabled,
    ).not.toHaveBeenCalled();
  });

  it('keeps removed evidence readable as NEEDS_REVIEW while rejecting action resolution', async () => {
    const resolveCurrentEvidence = jest
      .fn()
      .mockResolvedValue(readableEvidence);
    const service = new MyahInboxReplyContextService({
      resolveCurrentEvidence,
    });

    await expect(service.resolveForRead(readRequest)).resolves.toMatchObject({
      state: 'NEEDS_REVIEW',
      target: { deliveryTargetId: threadId },
    });
    await expect(service.resolveForAction(readRequest)).rejects.toThrow(
      'Reply context is no longer eligible',
    );
  });

  it('does not return context details when required context is unreadable', async () => {
    const service = new MyahInboxReplyContextService({
      resolveCurrentEvidence: jest.fn().mockResolvedValue({
        ...readableEvidence,
        readable: false,
      }),
    });

    await expect(service.resolveForRead(readRequest)).resolves.toEqual(
      expect.objectContaining({
        state: 'CONTEXT_UNAVAILABLE',
        contextFingerprint: null,
        threadCampaign: null,
      }),
    );
  });

  it('rejects action resolution when the request is not readable', async () => {
    const service = new MyahInboxReplyContextService({
      resolveCurrentEvidence: jest.fn().mockResolvedValue({
        ...readableEvidence,
        readable: false,
      }),
    });

    await expect(service.resolveForAction(readRequest)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    ['an omitted identity', { ...readRequest, contactIdentity: undefined }],
    [
      'an Instagram identity for an Email target',
      {
        ...readRequest,
        contactIdentity: { kind: 'instagram-conversation', recordId: threadId },
      },
    ],
    [
      'a different Email thread identity',
      {
        ...readRequest,
        contactIdentity: {
          kind: 'email-thread',
          recordId: '20202020-f7c5-4e2f-a44a-240b2d3a9d09',
        },
      },
    ],
    [
      'an Email identity for an Instagram target',
      {
        ...readRequest,
        target: {
          channel: ReplyChannel.INSTAGRAM,
          contactId: 'opaque-contact-id',
          conversationId: threadId,
        },
        contactIdentity: { kind: 'email-thread', recordId: threadId },
      },
    ],
  ])('does not read evidence for %s', async (_label, request) => {
    const resolveCurrentEvidence = jest
      .fn()
      .mockResolvedValue(readableEvidence);
    const service = new MyahInboxReplyContextService({
      resolveCurrentEvidence,
    });

    await expect(
      service.resolveForRead(request as never),
    ).resolves.toMatchObject({
      state: 'CONTEXT_UNAVAILABLE',
      contextFingerprint: null,
      threadCampaign: null,
    });
    expect(resolveCurrentEvidence).not.toHaveBeenCalled();
  });

  it('does not fall back to an Email-thread anchor when a Creator anchor is unavailable for GENERAL context', async () => {
    const creatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d04';
    const resolver = new MyahInboxReplyContextQueryEvidenceResolver(
      {
        getThreadSummary: jest.fn().mockResolvedValue({ id: threadId }),
      } as never,
      {
        executeInWorkspaceContext: jest.fn(async (run) => run()),
        getRepository: jest.fn(async (_workspaceId, objectName) => {
          if (objectName === 'messageThread') {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: threadId,
                creatorId,
                myahCampaignId: campaignId,
              }),
            };
          }
          return { findOne: jest.fn().mockResolvedValue(null) };
        }),
      } as never,
      visibilityPolicy as never,
    );
    const service = new MyahInboxReplyContextService(resolver);

    await expect(
      service.resolveForRead({
        ...readRequest,
        replyContext: { kind: ReplyContextKind.GENERAL },
        contactIdentity: { kind: 'creator', recordId: creatorId },
      }),
    ).resolves.toMatchObject({
      state: 'CONTEXT_UNAVAILABLE',
      target: { contactAnchor: { kind: 'UNAVAILABLE' } },
    });
  });

  it('keeps readable historical Campaign context as NEEDS_REVIEW when the current thread association changed', async () => {
    const creatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d04';
    const selectedCampaignId = campaignId;
    const currentCampaignId = '20202020-f7c5-4e2f-a44a-240b2d3a9d05';
    const repositoryByObjectName = {
      messageThread: {
        find: jest.fn(async () => []),
        findOne: jest.fn().mockResolvedValue({
          id: threadId,
          creatorId,
          myahCampaignId: currentCampaignId,
        }),
      },
      creator: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: creatorId, name: 'Creator' }),
      },
      campaign: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: selectedCampaignId, name: 'Historical' }),
      },
    };
    const evidenceResolver = new MyahInboxReplyContextQueryEvidenceResolver(
      {
        getThreadSummary: jest.fn().mockResolvedValue({ id: threadId }),
      } as never,
      {
        executeInWorkspaceContext: jest.fn(async (run) => run()),
        getRepository: jest.fn(
          async (_workspaceId, objectName) =>
            repositoryByObjectName[
              objectName as keyof typeof repositoryByObjectName
            ] ??
            (objectName === 'message'
              ? messageRepository([])
              : emptyEvidenceRepository),
        ),
      } as never,
      visibilityPolicy as never,
    );
    const service = new MyahInboxReplyContextService(evidenceResolver);
    const request = {
      ...readRequest,
      contactIdentity: { kind: 'creator' as const, recordId: creatorId },
    };

    await expect(service.resolveForRead(request)).resolves.toMatchObject({
      state: 'NEEDS_REVIEW',
      target: { contactAnchor: { kind: 'CREATOR', id: creatorId } },
      threadCampaign: { state: 'UNASSOCIATED' },
    });
    await expect(service.resolveForAction(request)).rejects.toThrow(
      'Reply context is no longer eligible',
    );
  });

  it('reads the standard messageThread relation column for a matching Campaign', async () => {
    const creatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d04';
    const persistedCampaignField = getMessageThreadCampaignJoinColumnName();

    expect(persistedCampaignField).toBe('myahCampaignId');

    const messageThread = {
      find: jest.fn(async () => [{ id: threadId }]),
      findOne: jest.fn().mockResolvedValue({
        id: threadId,
        creatorId,
        [persistedCampaignField]: campaignId,
      }),
    };
    const resolver = new MyahInboxReplyContextQueryEvidenceResolver(
      {
        getThreadSummary: jest.fn().mockResolvedValue({ id: threadId }),
      } as never,
      {
        executeInWorkspaceContext: jest.fn(async (run) => run()),
        getRepository: jest.fn(async (_workspaceId, objectName) => {
          if (objectName === 'messageThread') return messageThread;
          if (objectName === 'message') return messageRepository();
          if (['campaignCreator', 'outreachAction'].includes(objectName))
            return emptyEvidenceRepository;
          if (objectName === 'creator') {
            return {
              findOne: jest
                .fn()
                .mockResolvedValue({ id: creatorId, name: 'Creator' }),
            };
          }
          return {
            findOne: jest
              .fn()
              .mockResolvedValue({ id: campaignId, name: 'Campaign' }),
          };
        }),
      } as never,
      visibilityPolicy as never,
    );
    const service = new MyahInboxReplyContextService(resolver);

    await expect(service.resolveForRead(readRequest)).resolves.toMatchObject({
      state: 'READY',
      target: { creatorId, deliveryTargetId: threadId },
      threadCampaign: {
        state: 'READABLE',
        campaign: { id: campaignId, name: 'Campaign' },
      },
    });
    expect(messageThread.findOne).toHaveBeenCalledWith({
      where: { id: threadId, deletedAt: IsNull() },
      select: { id: true, creatorId: true, [persistedCampaignField]: true },
    });
  });

  it('keeps READY scoped to context eligibility rather than a non-empty send body', () => {
    expect(
      toDraftExecutionState({
        targetState: null,
        actionEligible: true,
        requiredContextReadable: true,
        hasReadableBody: false,
      }),
    ).toBe('READY');
  });

  it.each([
    ['readable Campaign and Creator', 'none', false, 'READY'],
    ['hidden Campaign', 'Campaign', true, 'CONTEXT_UNAVAILABLE'],
    ['deleted Campaign', 'Campaign', false, 'CONTEXT_UNAVAILABLE'],
    ['hidden Creator', 'Creator', true, 'CONTEXT_UNAVAILABLE'],
    ['deleted Creator', 'Creator', false, 'CONTEXT_UNAVAILABLE'],
  ])(
    'returns %s only when the required records remain readable',
    async (_label, hiddenContext, permissionHidden, expectedState) => {
      const creatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d04';
      const repositoryByObjectName = {
        messageThread: {
          find: jest.fn(async () => [{ id: threadId }]),
          findOne: jest.fn().mockResolvedValue({
            id: threadId,
            creatorId,
            myahCampaignId: campaignId,
          }),
        },
        creator: {
          findOne:
            hiddenContext === 'Creator' && permissionHidden
              ? jest
                  .fn()
                  .mockRejectedValue(
                    new PermissionsException(
                      'Creator is hidden',
                      PermissionsExceptionCode.PERMISSION_DENIED,
                    ),
                  )
              : jest
                  .fn()
                  .mockResolvedValue(
                    hiddenContext === 'Creator'
                      ? null
                      : { id: creatorId, name: 'Creator' },
                  ),
        },
        campaign: {
          findOne:
            hiddenContext === 'Campaign' && permissionHidden
              ? jest
                  .fn()
                  .mockRejectedValue(
                    new PermissionsException(
                      'Campaign is hidden',
                      PermissionsExceptionCode.PERMISSION_DENIED,
                    ),
                  )
              : jest
                  .fn()
                  .mockResolvedValue(
                    hiddenContext === 'Campaign'
                      ? null
                      : { id: campaignId, name: 'Campaign' },
                  ),
        },
      };
      const resolver = new MyahInboxReplyContextQueryEvidenceResolver(
        {
          getThreadSummary: jest.fn().mockResolvedValue({ id: threadId }),
        } as never,
        {
          executeInWorkspaceContext: jest.fn(async (run) => run()),
          getRepository: jest.fn(
            async (_workspaceId, objectName) =>
              repositoryByObjectName[
                objectName as keyof typeof repositoryByObjectName
              ] ??
              (objectName === 'message'
                ? messageRepository()
                : emptyEvidenceRepository),
          ),
        } as never,
        visibilityPolicy as never,
      );
      const service = new MyahInboxReplyContextService(resolver);

      await expect(service.resolveForRead(readRequest)).resolves.toMatchObject(
        expectedState === 'READY'
          ? {
              state: 'READY',
              target: { creatorId },
              threadCampaign: {
                state: 'READABLE',
                campaign: { id: campaignId },
              },
            }
          : {
              state: 'CONTEXT_UNAVAILABLE',
              contextFingerprint: null,
              threadCampaign: null,
            },
      );
    },
  );
});

describe('Email reply context persisted evidence and fingerprint', () => {
  const metadata = computeTwentyStandardApplicationAllFlatEntityMaps({
    now: '2026-09-16T00:00:00.000Z',
    workspaceId,
    twentyStandardApplicationId: '00000000-0000-4000-8000-000000000002',
  }).allFlatEntityMaps;
  const campaignMetadata = Object.values(
    metadata.flatObjectMetadataMaps.byUniversalIdentifier,
  ).find((object) => object?.nameSingular === 'campaign');

  const creatorId = '20202020-f7c5-4e2f-a44a-240b2d3a9d04';
  if (!campaignMetadata) throw new Error('Campaign metadata is required');
  campaignMetadata.fieldIds = Object.values(
    metadata.flatFieldMetadataMaps.byUniversalIdentifier,
  )
    .filter((field) => field?.objectMetadataId === campaignMetadata.id)
    .map((field) => field!.id);
  const setup = () => {
    const campaign = {
      id: campaignId,
      name: 'Selected',
      campaignBriefMarkdown: 'Brief',
      communicationGuidelinesMarkdown: 'Guidelines',
      replyRulesMarkdown: 'F1',
      escalationBoundariesMarkdown: 'Boundaries',
      additionalNotesMarkdown: 'Notes',
      emailSignatureMarkdown: 'Signature',
    };
    const terms = {
      id: 'campaign-creator',
      creatorId,
      campaignId,
      dealSummary: 'Terms',
    };
    const message = {
      id: 'sent-message',
      isDraft: false,
      receivedAt: new Date(),
      messageThreadId: 'other-thread',
    };
    const repositories = {
      messageThread: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: threadId, creatorId, myahCampaignId: null }),
        find: jest.fn().mockResolvedValue([]),
      },
      creator: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: creatorId, name: 'Creator' }),
      },
      campaign: {
        findOne: jest
          .fn()
          .mockImplementation(async () =>
            formatResult(
              campaign,
              campaignMetadata,
              metadata.flatObjectMetadataMaps,
              metadata.flatFieldMetadataMaps,
            ),
          ),
      },
      campaignCreator: {
        find: jest.fn().mockImplementation(async () => [terms]),
      },
      outreachAction: {
        find: jest.fn().mockResolvedValue([
          {
            id: 'outreach',
            status: 'APPLIED',
            channel: 'EMAIL',
            campaignCreatorId: terms.id,
            messageId: message.id,
            completedAt: new Date(),
          },
        ]),
      },
      message: messageRepository([message]),
      messageChannelMessageAssociation: {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 'association', messageId: message.id, direction: 'OUTGOING' },
          ]),
      },
    };
    const resolver = new MyahInboxReplyContextQueryEvidenceResolver(
      {
        getThreadSummary: jest.fn().mockResolvedValue({ id: threadId }),
      } as never,
      {
        executeInWorkspaceContext: jest.fn(async (run) => run()),
        getRepository: jest.fn(
          async (_workspaceId, name) =>
            repositories[name as keyof typeof repositories],
        ),
      } as never,
      visibilityPolicy as never,
    );
    return { resolver, repositories, campaign, terms };
  };

  it('accepts readable completed outreach for the Creator beyond the current thread Campaign', async () => {
    const { resolver } = setup();
    await expect(
      resolver.resolveCurrentEvidence(readRequest),
    ).resolves.toMatchObject({
      readable: true,
      eligible: true,
      contextFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it.each([
    'campaignBriefMarkdown',
    'communicationGuidelinesMarkdown',
    'replyRulesMarkdown',
    'escalationBoundariesMarkdown',
    'additionalNotesMarkdown',
    'emailSignatureMarkdown',
    'dealSummary',
  ] as const)('changes the fingerprint when %s changes', async (field) => {
    const { resolver, repositories, campaign, terms } = setup();
    expect(await repositories.campaign.findOne()).toMatchObject({
      id: campaignId,
      replyRules: { markdown: 'F1' },
      emailSignature: { markdown: 'Signature' },
    });
    const first = await resolver.resolveCurrentEvidence(readRequest);
    if (field === 'dealSummary') terms.dealSummary = 'Changed terms';
    else campaign[field] = 'Changed guidance';
    const second = await resolver.resolveCurrentEvidence(readRequest);
    expect(first.contextFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.contextFingerprint).not.toBe(first.contextFingerprint);
  });

  it('resolves legacy Campaign B delivery on readable T2 for the same Creator without outreach membership, keeping T1 as the target', async () => {
    const { resolver, repositories } = setup();
    repositories.messageThread.findOne.mockResolvedValue({
      id: threadId,
      creatorId,
      myahCampaignId: 'campaign-A',
    });
    repositories.messageThread.find.mockResolvedValue([{ id: 'thread-B' }]);
    repositories.campaignCreator.find.mockResolvedValue([]);
    repositories.outreachAction.find.mockResolvedValue([]);
    repositories.message.qb.getRawMany.mockImplementation(async () => {
      const parameters =
        repositories.message.qb.where.mock.calls.slice(-1)[0]?.[1];
      return parameters?.legacyThreadIds?.includes('thread-B')
        ? [{ id: 'legacy-B' }, { id: 'legacy-B' }]
        : [];
    });
    const result = await resolver.resolveCurrentEvidence(readRequest);
    expect(result).toMatchObject({
      readable: true,
      eligible: true,
      target: { deliveryTargetId: threadId },
    });
    expect(repositories.messageThread.find).toHaveBeenCalledWith({
      where: { creatorId, myahCampaignId: campaignId, deletedAt: IsNull() },
      select: { id: true },
    });
    expect(
      repositories.message.qb.andWhere.mock.calls.flat().join(' '),
    ).toContain("association.direction = 'OUTGOING'");
    expect(
      repositories.message.qb.andWhere.mock.calls.flat().join(' '),
    ).toContain(':messageVisibilityFull');
    repositories.messageThread.find.mockResolvedValue([]);
    expect((await resolver.resolveCurrentEvidence(readRequest)).eligible).toBe(
      false,
    );
    repositories.messageThread.find.mockResolvedValue([{ id: 'thread-B' }]);
    repositories.message.qb.getRawMany.mockResolvedValue([{ id: 'legacy-B' }]);
    expect(
      (await resolver.resolveCurrentEvidence(readRequest))
        .eligibilityEvidenceDigest,
    ).toBe(result.eligibilityEvidenceDigest);
    repositories.message.qb.getRawMany.mockResolvedValue([]);
    expect((await resolver.resolveCurrentEvidence(readRequest)).eligible).toBe(
      false,
    );
  });

  it('isolates Creator A from a relink to B without A permission', async () => {
    const { resolver: evidence, repositories } = setup();
    const contexts = new MyahInboxReplyContextService(evidence);
    jest
      .mocked(getWorkspaceAuthContext)
      .mockReturnValue(readRequest.authContext as never);
    const rows = new Map<
      string,
      { body: { markdown: string; blocknote: null }; revision: number }
    >();
    const approvals = {
      executeInboxReplyTargetLocked: jest.fn(async (_input, run) => run()),
      getInboxReplyTargetExecutionState: jest.fn(async () => null),
    };
    const drafts = {
      save: jest.fn(async (identity) => {
        rows.set(identity.contactAnchorId, {
          body: identity.body,
          revision: 1,
        });
        return { status: 'SAVED', body: identity.body, revision: 1 };
      }),
    };
    const mutations = new MyahInboxMutationService(
      {} as never,
      {} as never,
      {} as never,
      approvals as never,
      {} as never,
      contexts,
      drafts as never,
    );
    const reader = {
      read: jest.fn(async ({ resolvedContext }) => ({
        draftId: null,
        body: null,
        revision: 0,
        targetState: null,
        ...rows.get(resolvedContext.target.contactAnchor.id),
      })),
    };
    const publicResolver = new MyahInboxResolver(
      {} as never,
      mutations,
      {} as never,
      contexts,
      reader as never,
    );
    const requestFor = (
      kind: 'creator' | 'email-thread',
      recordId: string,
    ) => ({
      ...readRequest,
      expectedWorkspaceId: workspaceId,
      expectedRevision: 0,
      body: { markdown: 'A private draft', blocknote: null },
      target: {
        ...readRequest.target,
        channel: ReplyChannel.EMAIL,
        threadId,
        contactId: encodeMyahInboxContactId({
          workspaceId,
          identity: { kind, recordId },
        }),
      },
      replyContext: { kind: ReplyContextKind.GENERAL },
    });
    const threadRequest = requestFor('email-thread', threadId);
    await expect(
      publicResolver.myahInboxReplyDraft(
        threadRequest,
        readRequest.workspace as never,
        readRequest.workspaceMemberId,
      ),
    ).resolves.toMatchObject({
      body: null,
      executionState: 'READY',
    });
    await mutations.saveMyahInboxDraft(threadRequest);
    expect(rows.get(threadId)?.body.markdown).toBe('A private draft');
    const requestA = requestFor('creator', creatorId);
    await mutations.saveMyahInboxDraft(requestA);
    const creatorB = '20202020-f7c5-4e2f-a44a-240b2d3a9d09';
    repositories.messageThread.findOne.mockResolvedValue({
      id: threadId,
      creatorId: creatorB,
      myahCampaignId: null,
    });
    repositories.creator.findOne.mockImplementation(async ({ where }) =>
      where.id === creatorB ? { id: creatorB, name: 'B' } : null,
    );
    for (const oldRequest of [requestA]) {
      await expect(
        publicResolver.myahInboxReplyDraft(
          oldRequest,
          readRequest.workspace as never,
          readRequest.workspaceMemberId,
        ),
      ).resolves.toMatchObject({
        body: null,
        executionState: 'CONTEXT_UNAVAILABLE',
      });
      await expect(mutations.saveMyahInboxDraft(oldRequest)).rejects.toThrow();
    }
    // The thread-anchored draft doesn't depend on the thread's linked
    // Creator, so relinking the thread away from Creator A never touches it.
    await expect(
      publicResolver.myahInboxReplyDraft(
        threadRequest,
        readRequest.workspace as never,
        readRequest.workspaceMemberId,
      ),
    ).resolves.toMatchObject({
      body: { markdown: 'A private draft', blocknote: null },
      executionState: 'READY',
    });
    const requestB = requestFor('creator', creatorB);
    await expect(
      publicResolver.myahInboxReplyDraft(
        requestB,
        readRequest.workspace as never,
        readRequest.workspaceMemberId,
      ),
    ).resolves.toMatchObject({ body: null });
    await mutations.saveMyahInboxDraft({
      ...requestB,
      body: { markdown: 'B draft', blocknote: null },
    });
    expect(rows.get(creatorId)?.body.markdown).toBe('A private draft');
    expect(rows.get(creatorB)?.body.markdown).toBe('B draft');
  });

  it('includes readable Creator generation guidance in the context fingerprint', async () => {
    const { resolver, repositories } = setup();
    repositories.creator.findOne.mockResolvedValue({
      id: creatorId,
      name: 'Creator',
      language: 'English',
    });
    const first = await resolver.resolveCurrentEvidence(readRequest);
    repositories.creator.findOne.mockResolvedValue({
      id: creatorId,
      name: 'Creator',
      language: 'Spanish',
    });
    const second = await resolver.resolveCurrentEvidence(readRequest);
    expect(first.contextFingerprint).not.toBe(second.contextFingerprint);
  });

  it('does not treat membership or an unprojected outreach action as delivery evidence', async () => {
    const { resolver, repositories } = setup();
    repositories.outreachAction.find.mockResolvedValue([]);
    repositories.message.qb.getRawMany.mockResolvedValue([]);
    await expect(
      resolver.resolveCurrentEvidence(readRequest),
    ).resolves.toMatchObject({ readable: true, eligible: false });
  });

  it('fails closed when commercial terms are permission-hidden', async () => {
    const { resolver, repositories } = setup();
    repositories.campaignCreator.find.mockRejectedValue(
      new PermissionsException(
        'Hidden',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    );
    await expect(
      resolver.resolveCurrentEvidence(readRequest),
    ).resolves.toMatchObject({ readable: false, contextFingerprint: null });
  });
});
