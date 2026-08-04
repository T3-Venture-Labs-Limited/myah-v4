import gql from 'graphql-tag';
import {
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelType,
  MessageChannelVisibility,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { MessageChannelMetadataService } from 'src/engine/metadata-modules/message-channel/message-channel-metadata.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CONNECTED_ACCOUNT_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/connected-account-data-seeds.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { destroyOneOperationFactory } from 'test/integration/graphql/utils/destroy-one-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';

const creatorId = '21270000-0000-4000-8000-000000000001';
const campaignId = '21270000-0000-4000-8000-000000000002';
const taskId = '21270000-0000-4000-8000-000000000003';
const taskTargetId = '21270000-0000-4000-8000-000000000004';
const noteId = '21270000-0000-4000-8000-000000000005';
const noteTargetId = '21270000-0000-4000-8000-000000000006';
const foreignCreatorId = '21270000-0000-4000-8000-000000000099';
const fixtureMarker = 'MYAH212-INTEGRATION-TASK7';
const campaignName = 'MYAH-212 UAT · Summer Creator Launch';

const markers = {
  prefix: fixtureMarker,
  tied: `${fixtureMarker} TIED`,
  ownerSubject: `${fixtureMarker} owner-private subject`,
  ownerBody: `${fixtureMarker} owner-private body`,
  sharedSubject: `${fixtureMarker} shared fallback subject`,
  sharedBody: `${fixtureMarker} shared fallback body`,
  subjectVisible: `${fixtureMarker} subject-visible`,
  subjectMaskedBody: `${fixtureMarker} subject-masked-body-oracle`,
  metadataMaskedSubject: `${fixtureMarker} metadata-masked-subject-oracle`,
  metadataMaskedBody: `${fixtureMarker} metadata-masked-body-oracle`,
  hiddenSubject: `${fixtureMarker} hidden-newest-subject-oracle`,
  hiddenBody: `${fixtureMarker} hidden-newest-body-oracle`,
  hiddenWindow: `${fixtureMarker} hidden-window`,
  hiddenOnly: `${fixtureMarker} hidden-window hidden`,
  draftSubject: `${fixtureMarker} two-writer draft`,
  draftPriorSubject: `${fixtureMarker} draft prior visible subject`,
  draftPriorBody: `${fixtureMarker} draft prior visible body`,
  draftMaskedSubject: `${fixtureMarker} draft masked subject`,
  draftMaskedBody: `${fixtureMarker} draft masked body`,
  draftHiddenSubject: `${fixtureMarker} draft hidden subject`,
  draftHiddenBody: `${fixtureMarker} draft hidden body`,
} as const;
const timestamps = {
  visibleFallback: '2099-07-24T11:00:00.000Z',
  tied: '2099-07-24T12:00:00.000Z',
  hiddenVisibleBefore: '2099-07-24T13:59:00.000Z',
  hiddenNewest: '2099-07-24T14:00:00.000Z',
  hiddenVisibleAfter: '2099-07-24T14:01:00.000Z',
} as const;

const threadIds = {
  tiedLinked: '21270000-1001-4000-8000-000000000001',
  tiedUnlinked: '21270000-1002-4000-8000-000000000002',
  owner: '21270000-1003-4000-8000-000000000003',
  sharedFallback: '21270000-1004-4000-8000-000000000004',
  subject: '21270000-1005-4000-8000-000000000005',
  metadata: '21270000-1006-4000-8000-000000000006',
  draft: '21270000-1007-4000-8000-000000000007',
  hiddenOnly: '21270000-1008-4000-8000-000000000008',
  hiddenVisibleAfter: '21270000-1009-4000-8000-000000000009',
  hiddenVisibleBefore: '21270000-1010-4000-8000-000000000010',
} as const;

const channelIds = {
  shared: '21270000-5001-4000-8000-000000000001',
  subject: '21270000-5002-4000-8000-000000000002',
  metadata: '21270000-5003-4000-8000-000000000003',
  owner: '21270000-5004-4000-8000-000000000004',
} as const;

export type MyahInboxTask7CleanupEvidence = {
  fixtureGraphqlRecordsRemaining: Array<{
    objectName: string;
    id: string;
  }>;
  fixtureChannelIdsRemaining: string[];
  foreignCreatorRemaining: boolean;
};

export type MyahInboxTask7Fixture = {
  creatorId: string;
  campaignId: string;
  campaignName: string;
  taskId: string;
  noteId: string;
  foreignCreatorId: string;
  draftRevision: number;
  markers: typeof markers;
  timestamps: typeof timestamps;
  threadIds: typeof threadIds;
};

type SeedMyahInboxTask7FixtureArgs = {
  operatorAccessToken: string;
  afterNativeRecordsSeeded?: () => void | Promise<void>;
};

type MessageFixture = {
  id: string;
  participantId: string;
  associationId: string;
  threadId: string;
  channelId: string;
  externalId: string;
  threadExternalId: string;
  subject: string;
  text: string;
  receivedAt: string;
  deletedAssociation?: boolean;
};

const messageFixtures: MessageFixture[] = [
  {
    id: '21270000-2001-4000-8000-000000000001',
    participantId: '21270000-3001-4000-8000-000000000001',
    associationId: '21270000-4001-4000-8000-000000000001',
    threadId: threadIds.tiedLinked,
    channelId: channelIds.shared,
    externalId: 'task7-tied-linked',
    threadExternalId: 'task7-tied-linked-thread',
    subject: `${markers.tied} linked`,
    text: 'Task 7 tied linked body',
    receivedAt: timestamps.tied,
  },
  {
    id: '21270000-2002-4000-8000-000000000002',
    participantId: '21270000-3002-4000-8000-000000000002',
    associationId: '21270000-4002-4000-8000-000000000002',
    threadId: threadIds.tiedUnlinked,
    channelId: channelIds.shared,
    externalId: 'task7-tied-unlinked-readable',
    threadExternalId: 'task7-tied-unlinked-readable-thread',
    subject: `${markers.tied} unlinked readable`,
    text: 'Task 7 tied unlinked readable body',
    receivedAt: timestamps.tied,
  },
  {
    id: '21270000-2003-4000-8000-000000000003',
    participantId: '21270000-3003-4000-8000-000000000003',
    associationId: '21270000-4003-4000-8000-000000000003',
    threadId: threadIds.owner,
    channelId: channelIds.owner,
    externalId: 'task7-owner',
    threadExternalId: 'task7-owner-thread',
    subject: markers.ownerSubject,
    text: markers.ownerBody,
    receivedAt: '2026-07-24T10:00:00.000Z',
  },
  {
    id: '21270000-2004-4000-8000-000000000004',
    participantId: '21270000-3004-4000-8000-000000000004',
    associationId: '21270000-4004-4000-8000-000000000004',
    threadId: threadIds.sharedFallback,
    channelId: channelIds.shared,
    externalId: 'task7-shared-visible',
    threadExternalId: 'task7-shared-fallback-thread',
    subject: markers.sharedSubject,
    text: markers.sharedBody,
    receivedAt: timestamps.visibleFallback,
  },
  {
    id: '21270000-2005-4000-8000-000000000005',
    participantId: '21270000-3005-4000-8000-000000000005',
    associationId: '21270000-4005-4000-8000-000000000005',
    threadId: threadIds.subject,
    channelId: channelIds.subject,
    externalId: 'task7-subject',
    threadExternalId: 'task7-subject-thread',
    subject: markers.subjectVisible,
    text: markers.subjectMaskedBody,
    receivedAt: '2026-07-24T08:00:00.000Z',
  },
  {
    id: '21270000-2006-4000-8000-000000000006',
    participantId: '21270000-3006-4000-8000-000000000006',
    associationId: '21270000-4006-4000-8000-000000000006',
    threadId: threadIds.metadata,
    channelId: channelIds.metadata,
    externalId: 'task7-metadata',
    threadExternalId: 'task7-metadata-thread',
    subject: markers.metadataMaskedSubject,
    text: markers.metadataMaskedBody,
    receivedAt: '2026-07-24T07:00:00.000Z',
  },
  {
    id: '21270000-2007-4000-8000-000000000007',
    participantId: '21270000-3007-4000-8000-000000000007',
    associationId: '21270000-4007-4000-8000-000000000007',
    threadId: threadIds.sharedFallback,
    channelId: channelIds.metadata,
    externalId: 'task7-hidden-newest',
    threadExternalId: 'task7-hidden-thread',
    subject: markers.hiddenSubject,
    text: markers.hiddenBody,
    receivedAt: timestamps.hiddenNewest,
    deletedAssociation: true,
  },
  {
    id: '21270000-2008-4000-8000-000000000008',
    participantId: '21270000-3008-4000-8000-000000000008',
    associationId: '21270000-4008-4000-8000-000000000008',
    threadId: threadIds.draft,
    channelId: channelIds.shared,
    externalId: 'task7-draft',
    threadExternalId: 'task7-draft-thread',
    subject: markers.draftSubject,
    text: 'Task 7 shared draft source message',
    receivedAt: '2026-07-24T09:00:00.000Z',
  },
  {
    id: '21270000-2012-4000-8000-000000000012',
    participantId: '21270000-3012-4000-8000-000000000012',
    associationId: '21270000-4012-4000-8000-000000000012',
    threadId: threadIds.draft,
    channelId: channelIds.shared,
    externalId: 'task7-draft-prior-visible',
    threadExternalId: 'task7-draft-thread',
    subject: markers.draftPriorSubject,
    text: markers.draftPriorBody,
    receivedAt: '2026-07-24T06:00:00.000Z',
  },
  {
    id: '21270000-2013-4000-8000-000000000013',
    participantId: '21270000-3013-4000-8000-000000000013',
    associationId: '21270000-4013-4000-8000-000000000013',
    threadId: threadIds.draft,
    channelId: channelIds.subject,
    externalId: 'task7-draft-masked',
    threadExternalId: 'task7-draft-thread',
    subject: markers.draftMaskedSubject,
    text: markers.draftMaskedBody,
    receivedAt: '2026-07-24T07:00:00.000Z',
  },
  {
    id: '21270000-2014-4000-8000-000000000014',
    participantId: '21270000-3014-4000-8000-000000000014',
    associationId: '21270000-4014-4000-8000-000000000014',
    threadId: threadIds.draft,
    channelId: channelIds.metadata,
    externalId: 'task7-draft-hidden',
    threadExternalId: 'task7-draft-thread',
    subject: markers.draftHiddenSubject,
    text: markers.draftHiddenBody,
    receivedAt: '2026-07-24T08:00:00.000Z',
    deletedAssociation: true,
  },
  {
    id: '21270000-2009-4000-8000-000000000009',
    participantId: '21270000-3009-4000-8000-000000000009',
    associationId: '21270000-4009-4000-8000-000000000009',
    threadId: threadIds.hiddenOnly,
    channelId: channelIds.metadata,
    externalId: 'task7-hidden-only',
    threadExternalId: 'task7-hidden-only-thread',
    subject: markers.hiddenOnly,
    text: `${markers.hiddenOnly} body`,
    receivedAt: timestamps.hiddenNewest,
    deletedAssociation: true,
  },
  {
    id: '21270000-2010-4000-8000-000000000010',
    participantId: '21270000-3010-4000-8000-000000000010',
    associationId: '21270000-4010-4000-8000-000000000010',
    threadId: threadIds.hiddenVisibleAfter,
    channelId: channelIds.shared,
    externalId: 'task7-hidden-visible-after',
    threadExternalId: 'task7-hidden-visible-after-thread',
    subject: `${markers.hiddenWindow} after`,
    text: 'Task 7 visible row after hidden timestamp',
    receivedAt: timestamps.hiddenVisibleAfter,
  },
  {
    id: '21270000-2011-4000-8000-000000000011',
    participantId: '21270000-3011-4000-8000-000000000011',
    associationId: '21270000-4011-4000-8000-000000000011',
    threadId: threadIds.hiddenVisibleBefore,
    channelId: channelIds.shared,
    externalId: 'task7-hidden-visible-before',
    threadExternalId: 'task7-hidden-visible-before-thread',
    subject: `${markers.hiddenWindow} before`,
    text: 'Task 7 visible row before hidden timestamp',
    receivedAt: timestamps.hiddenVisibleBefore,
  },
];
const graphqlFixtureRecords = [
  ...messageFixtures.flatMap((message) => [
    ...(message.deletedAssociation
      ? []
      : [
          {
            objectName: 'messageChannelMessageAssociation',
            id: message.associationId,
          },
        ]),
    { objectName: 'messageParticipant', id: message.participantId },
    { objectName: 'message', id: message.id },
  ]),
  ...Object.values(threadIds).map((id) => ({
    objectName: 'messageThread',
    id,
  })),
  { objectName: 'taskTarget', id: taskTargetId },
  { objectName: 'noteTarget', id: noteTargetId },
  { objectName: 'task', id: taskId },
  { objectName: 'note', id: noteId },
  { objectName: 'campaign', id: campaignId },
  { objectName: 'creator', id: creatorId },
] as const;

const updateThreadMutation = gql`
  mutation SeedTask7UpdateThread($input: UpdateMyahInboxThreadInput!) {
    updateMyahInboxThread(input: $input) {
      id
      state
      creator {
        id
      }
      campaign {
        id
      }
      inboxOwner {
        id
      }
    }
  }
`;

const saveDraftMutation = gql`
  mutation SeedTask7SaveDraft($input: SaveMyahInboxDraftInput!) {
    saveMyahInboxDraft(input: $input) {
      status
      revision
      body {
        markdown
        blocknote
      }
    }
  }
`;

const ensureRecord = async ({
  objectName,
  gqlFields,
  id,
  data,
  token,
}: {
  objectName: string;
  gqlFields: string;
  id: string;
  data: Record<string, unknown>;
  token: string;
}) => {
  const existing = await makeGraphqlAPIRequest(
    findOneOperationFactory({
      objectMetadataSingularName: objectName,
      gqlFields: 'id',
      filter: { id: { eq: id } },
    }),
    token,
  );

  if (
    existing.body.errors &&
    existing.body.errors.some(
      ({ message }: { message: string }) => message !== 'Record not found',
    )
  ) {
    throw new Error(
      `Could not read Task 7 ${objectName} fixture: ${existing.body.errors[0].message}`,
    );
  }

  const operation = existing.body.data?.[objectName]
    ? updateOneOperationFactory({
        objectMetadataSingularName: objectName,
        gqlFields,
        recordId: id,
        data,
      })
    : createOneOperationFactory({
        objectMetadataSingularName: objectName,
        gqlFields,
        data: { id, ...data },
      });
  const response = await makeGraphqlAPIRequest(operation, token);

  if (response.body.errors) {
    throw new Error(
      `Could not persist Task 7 ${objectName} fixture: ${response.body.errors[0].message}`,
    );
  }
};

type ProviderWrapper = {
  instance?: unknown;
  metatype?: { name?: string };
};

type AppModuleRef = {
  providers: Map<unknown, ProviderWrapper>;
};

export const getDomainService = <T>(serviceName: string): T => {
  const appContainer = (
    global.app as typeof global.app & {
      container: { getModules: () => Map<unknown, AppModuleRef> };
    }
  ).container;

  for (const moduleRef of appContainer.getModules().values()) {
    for (const [token, provider] of moduleRef.providers) {
      const tokenName =
        typeof token === 'function'
          ? token.name
          : typeof token === 'string'
            ? token
            : undefined;

      if (
        provider.instance &&
        (tokenName === serviceName || provider.metatype?.name === serviceName)
      ) {
        return provider.instance as T;
      }
    }
  }

  throw new Error(`Task 7 integration provider ${serviceName} was not found`);
};

const channelFixtures = [
  {
    id: channelIds.shared,
    handle: 'task7-shared@integration.test',
    connectedAccountId: CONNECTED_ACCOUNT_DATA_SEED_IDS.JONY,
    visibility: MessageChannelVisibility.SHARE_EVERYTHING,
  },
  {
    id: channelIds.subject,
    handle: 'task7-subject@integration.test',
    connectedAccountId: CONNECTED_ACCOUNT_DATA_SEED_IDS.PHIL,
    visibility: MessageChannelVisibility.SUBJECT,
  },
  {
    id: channelIds.metadata,
    handle: 'task7-metadata@integration.test',
    connectedAccountId: CONNECTED_ACCOUNT_DATA_SEED_IDS.TIM,
    visibility: MessageChannelVisibility.METADATA,
  },
  {
    id: channelIds.owner,
    handle: 'task7-owner@integration.test',
    connectedAccountId: CONNECTED_ACCOUNT_DATA_SEED_IDS.JANE,
    visibility: MessageChannelVisibility.METADATA,
  },
] as const;

const seedFixtureChannels = async () => {
  const channelService = getDomainService<MessageChannelMetadataService>(
    'MessageChannelMetadataService',
  );

  for (const channel of channelFixtures) {
    const existing = await channelService.findById({
      id: channel.id,
      workspaceId: SEED_APPLE_WORKSPACE_ID,
    });
    const data = {
      ...channel,
      workspaceId: SEED_APPLE_WORKSPACE_ID,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.PENDING_CONFIGURATION,
      pendingGroupEmailsAction: MessageChannelPendingGroupEmailsAction.NONE,
      isSyncEnabled: false,
    };

    if (existing) {
      await channelService.update({
        id: channel.id,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
        data,
      });
    } else {
      await channelService.create(data);
    }
  }
};

const seedNativeRecords = async (operatorAccessToken: string) => {
  await seedFixtureChannels();
  const threadSubjects = new Map<string, string>();

  for (const { threadId, subject } of messageFixtures) {
    if (!threadSubjects.has(threadId)) {
      threadSubjects.set(threadId, subject);
    }
  }

  for (const [id, subject] of threadSubjects) {
    await ensureRecord({
      objectName: 'messageThread',
      gqlFields: 'id subject',
      id,
      data: { subject },
      token: operatorAccessToken,
    });
  }
  for (const message of messageFixtures) {
    await ensureRecord({
      objectName: 'message',
      gqlFields: 'id subject text receivedAt',
      id: message.id,
      data: {
        headerMessageId: `${message.externalId}@myah212.local`,
        subject: message.subject,
        text: message.text,
        receivedAt: message.receivedAt,
        messageThreadId: message.threadId,
        isDraft: false,
      },
      token: operatorAccessToken,
    });
    await ensureRecord({
      objectName: 'messageParticipant',
      gqlFields: 'id role handle displayName',
      id: message.participantId,
      data: {
        messageId: message.id,
        role: MessageParticipantRole.FROM,
        handle: `${message.externalId}@creator.test`,
        displayName: 'Task 7 Creator',
      },
      token: operatorAccessToken,
    });
    if (!message.deletedAssociation) {
      await ensureRecord({
        objectName: 'messageChannelMessageAssociation',
        gqlFields: 'id messageExternalId messageThreadExternalId direction',
        id: message.associationId,
        data: {
          messageChannelId: message.channelId,
          messageId: message.id,
          messageExternalId: message.externalId,
          messageThreadExternalId: message.threadExternalId,
          direction: MessageDirection.INCOMING,
        },
        token: operatorAccessToken,
      });
    }
  }
};

const fixtureRecordExists = async ({
  objectName,
  id,
  token,
}: {
  objectName: string;
  id: string;
  token: string;
}) => {
  const response = await makeGraphqlAPIRequest(
    findOneOperationFactory({
      objectMetadataSingularName: objectName,
      gqlFields: 'id',
      filter: { id: { eq: id } },
    }),
    token,
  );
  const errors = response.body.errors as Array<{ message: string }> | undefined;
  const unexpectedError = errors?.find(
    ({ message }) => message !== 'Record not found',
  );

  if (unexpectedError) {
    throw new Error(
      `Could not verify Task 7 ${objectName} fixture: ${unexpectedError.message}`,
    );
  }

  return Boolean(response.body.data?.[objectName]);
};

const destroyRecord = async ({
  objectName,
  id,
  token,
}: {
  objectName: string;
  id: string;
  token: string;
}) => {
  if (!(await fixtureRecordExists({ objectName, id, token }))) {
    return;
  }

  const response = await makeGraphqlAPIRequest(
    destroyOneOperationFactory({
      objectMetadataSingularName: objectName,
      gqlFields: 'id',
      recordId: id,
    }),
    token,
  );

  if (response.body.errors) {
    throw new Error(
      `Could not clean up Task 7 ${objectName} fixture: ${response.body.errors[0].message}`,
    );
  }
};

type ForeignCreatorRecord = {
  id: string;
  name: string;
  email: string;
};

const createForeignCreator = async () => {
  const workspaceOrmManager = getDomainService<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );

  await workspaceOrmManager.executeInWorkspaceContext(async () => {
    const creatorRepository =
      await workspaceOrmManager.getRepository<ForeignCreatorRecord>(
        SEED_YCOMBINATOR_WORKSPACE_ID,
        'creator',
        { shouldBypassPermissionChecks: true },
      );
    const existing = await creatorRepository.findOne({
      where: { id: foreignCreatorId },
    });
    const data = {
      name: 'Task 7 Foreign Creator',
      email: 'task7-foreign-creator@example.test',
    };

    if (existing) {
      await creatorRepository.update({ id: foreignCreatorId }, data);
    } else {
      await creatorRepository.save({ id: foreignCreatorId, ...data });
    }

    const persisted = await creatorRepository.findOne({
      where: { id: foreignCreatorId },
    });

    if (!persisted) {
      throw new Error('Task 7 foreign Creator was not committed');
    }
  }, buildSystemAuthContext(SEED_YCOMBINATOR_WORKSPACE_ID));
};

const destroyForeignCreator = async () => {
  const workspaceOrmManager = getDomainService<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );

  await workspaceOrmManager.executeInWorkspaceContext(async () => {
    const creatorRepository =
      await workspaceOrmManager.getRepository<ForeignCreatorRecord>(
        SEED_YCOMBINATOR_WORKSPACE_ID,
        'creator',
        { shouldBypassPermissionChecks: true },
      );

    await creatorRepository.delete({ id: foreignCreatorId });
  }, buildSystemAuthContext(SEED_YCOMBINATOR_WORKSPACE_ID));
};
const foreignCreatorExists = async () => {
  const workspaceOrmManager = getDomainService<GlobalWorkspaceOrmManager>(
    'GlobalWorkspaceOrmManager',
  );

  return workspaceOrmManager.executeInWorkspaceContext(async () => {
    const creatorRepository =
      await workspaceOrmManager.getRepository<ForeignCreatorRecord>(
        SEED_YCOMBINATOR_WORKSPACE_ID,
        'creator',
        { shouldBypassPermissionChecks: true },
      );

    return Boolean(
      await creatorRepository.findOne({ where: { id: foreignCreatorId } }),
    );
  }, buildSystemAuthContext(SEED_YCOMBINATOR_WORKSPACE_ID));
};

class Task7FixtureCleanupError extends Error {
  readonly errors: Error[];

  constructor(errors: Error[]) {
    super(
      [
        'Task 7 fixture cleanup did not complete',
        ...errors.map((error) => error.message),
      ].join('\n'),
    );
    this.name = 'Task7FixtureCleanupError';
    this.errors = errors;
  }
}

const collectCleanupError = async (
  errors: Error[],
  label: string,
  operation: () => Promise<void>,
) => {
  try {
    await operation();
  } catch (error) {
    errors.push(
      new Error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
};

export const cleanupMyahInboxTask7Fixture = async ({
  operatorAccessToken,
}: {
  operatorAccessToken: string;
}): Promise<MyahInboxTask7CleanupEvidence> => {
  const cleanupErrors: Error[] = [];

  for (const { objectName, id } of graphqlFixtureRecords) {
    await collectCleanupError(
      cleanupErrors,
      `destroy ${objectName} ${id}`,
      () => destroyRecord({ objectName, id, token: operatorAccessToken }),
    );
  }

  await collectCleanupError(
    cleanupErrors,
    `destroy foreign Creator ${foreignCreatorId}`,
    destroyForeignCreator,
  );

  let channelService: MessageChannelMetadataService | undefined;

  try {
    channelService = getDomainService<MessageChannelMetadataService>(
      'MessageChannelMetadataService',
    );
  } catch (error) {
    cleanupErrors.push(
      new Error(
        `resolve MessageChannel cleanup service: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  if (channelService) {
    for (const { id } of [...channelFixtures].reverse()) {
      await collectCleanupError(
        cleanupErrors,
        `destroy MessageChannel ${id}`,
        async () => {
          if (
            await channelService.findById({
              id,
              workspaceId: SEED_APPLE_WORKSPACE_ID,
            })
          ) {
            await channelService.delete({
              id,
              workspaceId: SEED_APPLE_WORKSPACE_ID,
            });
          }
        },
      );
    }
  }

  const fixtureGraphqlRecordsRemaining: Array<{
    objectName: string;
    id: string;
  }> = [];

  for (const { objectName, id } of graphqlFixtureRecords) {
    await collectCleanupError(
      cleanupErrors,
      `verify ${objectName} ${id} absent`,
      async () => {
        if (
          await fixtureRecordExists({
            objectName,
            id,
            token: operatorAccessToken,
          })
        ) {
          fixtureGraphqlRecordsRemaining.push({ objectName, id });
        }
      },
    );
  }

  const fixtureChannelIdsRemaining: string[] = [];

  if (channelService) {
    for (const { id } of channelFixtures) {
      await collectCleanupError(
        cleanupErrors,
        `verify MessageChannel ${id} absent`,
        async () => {
          if (
            await channelService.findById({
              id,
              workspaceId: SEED_APPLE_WORKSPACE_ID,
            })
          ) {
            fixtureChannelIdsRemaining.push(id);
          }
        },
      );
    }
  }

  let foreignCreatorRemaining = false;

  await collectCleanupError(
    cleanupErrors,
    `verify foreign Creator ${foreignCreatorId} absent`,
    async () => {
      foreignCreatorRemaining = await foreignCreatorExists();
    },
  );

  if (fixtureGraphqlRecordsRemaining.length > 0) {
    cleanupErrors.push(
      new Error(
        `Task 7 GraphQL fixtures remain: ${fixtureGraphqlRecordsRemaining
          .map(({ objectName, id }) => `${objectName}:${id}`)
          .join(', ')}`,
      ),
    );
  }
  if (fixtureChannelIdsRemaining.length > 0) {
    cleanupErrors.push(
      new Error(
        `Task 7 MessageChannels remain: ${fixtureChannelIdsRemaining.join(
          ', ',
        )}`,
      ),
    );
  }
  if (foreignCreatorRemaining) {
    cleanupErrors.push(
      new Error(`Task 7 foreign Creator remains: ${foreignCreatorId}`),
    );
  }
  if (cleanupErrors.length > 0) {
    throw new Task7FixtureCleanupError(cleanupErrors);
  }

  return {
    fixtureGraphqlRecordsRemaining,
    fixtureChannelIdsRemaining,
    foreignCreatorRemaining,
  };
};

export const seedMyahInboxTask7Fixture = async ({
  operatorAccessToken,
  afterNativeRecordsSeeded,
}: SeedMyahInboxTask7FixtureArgs): Promise<MyahInboxTask7Fixture> => {
  await createForeignCreator();
  await seedNativeRecords(operatorAccessToken);
  await afterNativeRecordsSeeded?.();
  await ensureRecord({
    objectName: 'creator',
    gqlFields: 'id name email',
    id: creatorId,
    data: { name: 'Task 7 Creator', email: 'task7-creator@example.test' },
    token: operatorAccessToken,
  });
  await ensureRecord({
    objectName: 'campaign',
    gqlFields: 'id name',
    id: campaignId,
    data: { name: campaignName },
    token: operatorAccessToken,
  });
  await ensureRecord({
    objectName: 'task',
    gqlFields: 'id title status',
    id: taskId,
    data: { title: 'Task 7 native follow-up', status: 'TODO' },
    token: operatorAccessToken,
  });
  await ensureRecord({
    objectName: 'taskTarget',
    gqlFields: 'id taskId targetCreatorId',
    id: taskTargetId,
    data: { taskId, targetCreatorId: creatorId },
    token: operatorAccessToken,
  });
  await ensureRecord({
    objectName: 'note',
    gqlFields: 'id title',
    id: noteId,
    data: { title: 'Task 7 native context note' },
    token: operatorAccessToken,
  });
  await ensureRecord({
    objectName: 'noteTarget',
    gqlFields: 'id noteId targetCreatorId',
    id: noteTargetId,
    data: { noteId, targetCreatorId: creatorId },
    token: operatorAccessToken,
  });

  const threadUpdates = [
    {
      threadId: threadIds.tiedLinked,
      creatorId,
      campaignId,
      inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
      inboxState: 'NEEDS_REPLY',
    },
    {
      threadId: threadIds.tiedUnlinked,
      creatorId: null,
      campaignId,
      inboxOwnerId: null,
      inboxState: 'WAITING_ON_CREATOR',
    },
    {
      threadId: threadIds.owner,
      creatorId,
      campaignId: null,
      inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
      inboxState: 'NEEDS_REPLY',
    },
    {
      threadId: threadIds.sharedFallback,
      creatorId,
      campaignId,
      inboxOwnerId: null,
      inboxState: 'NEEDS_REPLY',
    },
    {
      threadId: threadIds.subject,
      creatorId,
      campaignId: null,
      inboxOwnerId: null,
      inboxState: 'NEEDS_REPLY',
    },
    {
      threadId: threadIds.metadata,
      creatorId,
      campaignId,
      inboxOwnerId: null,
      inboxState: 'CLOSED',
    },
    {
      threadId: threadIds.draft,
      creatorId,
      campaignId,
      inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
      inboxState: 'NEEDS_REPLY',
    },
    {
      threadId: threadIds.hiddenVisibleAfter,
      creatorId,
      campaignId: null,
      inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
      inboxState: 'NEEDS_REPLY',
    },
    {
      threadId: threadIds.hiddenVisibleBefore,
      creatorId,
      campaignId: null,
      inboxOwnerId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
      inboxState: 'NEEDS_REPLY',
    },
  ];

  for (const input of threadUpdates) {
    const response = await makeGraphqlAPIRequest(
      { query: updateThreadMutation, variables: { input } },
      operatorAccessToken,
    );

    if (response.body.errors) {
      throw new Error(
        `Could not triage Task 7 thread fixture: ${response.body.errors[0].message}`,
      );
    }
  }

  const currentDraftResponse = await makeGraphqlAPIRequest(
    findOneOperationFactory({
      objectMetadataSingularName: 'messageThread',
      gqlFields: 'id myahReplyDraftRevision',
      filter: { id: { eq: threadIds.draft } },
    }),
    operatorAccessToken,
  );

  if (currentDraftResponse.body.errors) {
    throw new Error(
      `Could not read Task 7 draft fixture: ${currentDraftResponse.body.errors[0].message}`,
    );
  }

  const currentRevision =
    currentDraftResponse.body.data.messageThread.myahReplyDraftRevision;
  const draftResponse = await makeGraphqlAPIRequest(
    {
      query: saveDraftMutation,
      variables: {
        input: {
          threadId: threadIds.draft,
          expectedRevision: currentRevision,
          body: { markdown: 'Task 7 baseline shared draft', blocknote: null },
        },
      },
    },
    operatorAccessToken,
  );

  if (draftResponse.body.errors) {
    throw new Error(
      `Could not seed Task 7 draft fixture: ${draftResponse.body.errors[0].message}`,
    );
  }

  return {
    creatorId,
    campaignId,
    campaignName,
    taskId,
    noteId,
    foreignCreatorId,
    draftRevision: draftResponse.body.data.saveMyahInboxDraft.revision,
    markers,
    timestamps,
    threadIds,
  };
};
