import { getRepositoryToken } from '@nestjs/typeorm';
import gql from 'graphql-tag';
import {
  MessageChannelVisibility,
  MessageParticipantRole,
} from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { MESSAGE_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/constants/message-channel-seed-ids.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { updateOneOperationFactory } from 'test/integration/graphql/utils/update-one-operation-factory.util';

const creatorId = '21270000-0000-4000-8000-000000000001';
const campaignId = '21270000-0000-4000-8000-000000000002';
const taskId = '21270000-0000-4000-8000-000000000003';
const taskTargetId = '21270000-0000-4000-8000-000000000004';
const noteId = '21270000-0000-4000-8000-000000000005';
const noteTargetId = '21270000-0000-4000-8000-000000000006';
const unreadableCreatorId = '21270000-0000-4000-8000-000000000099';

const markers = {
  prefix: 'MYAH212',
  tied: 'MYAH212 TIED',
  ownerSubject: 'MYAH212 owner-private subject',
  ownerBody: 'MYAH212 owner-private body',
  sharedSubject: 'MYAH212 shared fallback subject',
  sharedBody: 'MYAH212 shared fallback body',
  subjectVisible: 'MYAH212 subject-visible',
  subjectMaskedBody: 'MYAH212 subject-masked-body-oracle',
  metadataMaskedSubject: 'MYAH212 metadata-masked-subject-oracle',
  metadataMaskedBody: 'MYAH212 metadata-masked-body-oracle',
  hiddenSubject: 'MYAH212 hidden-newest-subject-oracle',
  hiddenBody: 'MYAH212 hidden-newest-body-oracle',
  draftSubject: 'MYAH212 two-writer draft',
} as const;

const timestamps = {
  visibleFallback: '2026-07-24T11:00:00.000Z',
  tied: '2026-07-24T12:00:00.000Z',
  hiddenNewest: '2026-07-24T14:00:00.000Z',
} as const;

const threadIds = {
  tiedLinked: '21270000-1001-4000-8000-000000000001',
  tiedUnmatched: '21270000-1002-4000-8000-000000000002',
  owner: '21270000-1003-4000-8000-000000000003',
  sharedFallback: '21270000-1004-4000-8000-000000000004',
  subject: '21270000-1005-4000-8000-000000000005',
  metadata: '21270000-1006-4000-8000-000000000006',
  draft: '21270000-1007-4000-8000-000000000007',
} as const;

export type MyahInboxTask7Fixture = {
  creatorId: string;
  campaignId: string;
  taskId: string;
  noteId: string;
  unreadableCreatorId: string;
  draftRevision: number;
  markers: typeof markers;
  timestamps: typeof timestamps;
  threadIds: typeof threadIds;
};

type SeedMyahInboxTask7FixtureArgs = {
  operatorAccessToken: string;
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
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.JONY,
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
    threadId: threadIds.tiedUnmatched,
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.JONY,
    externalId: 'task7-tied-unmatched',
    threadExternalId: 'task7-tied-unmatched-thread',
    subject: `${markers.tied} unmatched`,
    text: 'Task 7 tied unmatched body',
    receivedAt: timestamps.tied,
  },
  {
    id: '21270000-2003-4000-8000-000000000003',
    participantId: '21270000-3003-4000-8000-000000000003',
    associationId: '21270000-4003-4000-8000-000000000003',
    threadId: threadIds.owner,
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.JANE,
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
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.JONY,
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
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.PHIL,
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
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.TIM,
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
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.TIM,
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
    channelId: MESSAGE_CHANNEL_DATA_SEED_IDS.JONY,
    externalId: 'task7-draft',
    threadExternalId: 'task7-draft-thread',
    subject: markers.draftSubject,
    text: 'Task 7 shared draft source message',
    receivedAt: '2026-07-24T09:00:00.000Z',
  },
];

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

const seedNativeRecords = async (operatorAccessToken: string) => {
  const channelRepository = global.app.get<Repository<MessageChannelEntity>>(
    getRepositoryToken(MessageChannelEntity),
  );
  await Promise.all([
    channelRepository.update(
      {
        id: MESSAGE_CHANNEL_DATA_SEED_IDS.JONY,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
      },
      { visibility: MessageChannelVisibility.SHARE_EVERYTHING },
    ),
    channelRepository.update(
      {
        id: MESSAGE_CHANNEL_DATA_SEED_IDS.PHIL,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
      },
      { visibility: MessageChannelVisibility.SUBJECT },
    ),
    channelRepository.update(
      {
        id: MESSAGE_CHANNEL_DATA_SEED_IDS.JANE,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
      },
      { visibility: MessageChannelVisibility.METADATA },
    ),
    channelRepository.update(
      {
        id: MESSAGE_CHANNEL_DATA_SEED_IDS.TIM,
        workspaceId: SEED_APPLE_WORKSPACE_ID,
      },
      { visibility: MessageChannelVisibility.METADATA },
    ),
  ]);
  const threadSubjects = new Map(
    messageFixtures
      .filter(({ deletedAssociation }) => !deletedAssociation)
      .map(({ threadId, subject }) => [threadId, subject]),
  );
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

export const seedMyahInboxTask7Fixture = async ({
  operatorAccessToken,
}: SeedMyahInboxTask7FixtureArgs): Promise<MyahInboxTask7Fixture> => {
  await seedNativeRecords(operatorAccessToken);
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
    data: { name: 'Task 7 Campaign' },
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
      threadId: threadIds.tiedUnmatched,
      creatorId: null,
      campaignId: null,
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
    taskId,
    noteId,
    unreadableCreatorId,
    draftRevision: draftResponse.body.data.saveMyahInboxDraft.revision,
    markers,
    timestamps,
    threadIds,
  };
};
