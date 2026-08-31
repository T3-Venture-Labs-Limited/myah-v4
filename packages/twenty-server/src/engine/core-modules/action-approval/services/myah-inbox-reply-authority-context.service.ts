import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { In, Repository } from 'typeorm';

import {
  type InboxMessageThreadRecord,
  type InboxParentMessageRecord,
  type MyahInboxReplyAuthoritySource,
  type MyahInboxReplyEvidenceObjectMetadataIds,
  type MyahInboxReplyReadableDraftSnapshot,
  MyahInboxReplyUnavailableCode,
  MyahInboxReplyUnavailableError,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.types';
import { normalizeMyahInboxReplyDraft } from 'src/engine/core-modules/action-approval/utils/normalize-myah-inbox-reply-draft.util';
import { type FlatUser } from 'src/engine/core-modules/user/types/flat-user.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

@Injectable()
export class MyahInboxReplyAuthorityContextService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async getReadableDraftSnapshot({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
  }): Promise<MyahInboxReplyReadableDraftSnapshot> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });
    if (!workspace) {
      throw this.threadUnavailable();
    }
    const authContext = await this.buildInitiatorAuthContext(
      workspace,
      initiatorUserWorkspaceId,
    );
    const messageThread =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const repository =
            await this.globalWorkspaceOrmManager.getRepository<InboxMessageThreadRecord>(
              workspaceId,
              'messageThread',
            );

          return repository.findOneBy({ id: messageThreadId });
        },
        authContext,
      );
    if (!messageThread || messageThread.id !== messageThreadId) {
      throw this.threadUnavailable();
    }

    const evidenceObjectMetadataIds =
      await this.resolveEvidenceObjectMetadataIds(workspaceId);

    return {
      revision: messageThread.myahReplyDraftRevision,
      body: normalizeMyahInboxReplyDraft(messageThread),
      messageThreadMetadataId: evidenceObjectMetadataIds.messageThread,
    };
  }

  async resolveEvidenceObjectMetadataIds(
    workspaceId: string,
  ): Promise<MyahInboxReplyEvidenceObjectMetadataIds> {
    const metadata = await this.objectMetadataRepository.find({
      where: {
        workspaceId,
        universalIdentifier: In([
          STANDARD_OBJECTS.messageThread.universalIdentifier,
          STANDARD_OBJECTS.message.universalIdentifier,
        ]),
      },
      select: { id: true, workspaceId: true, universalIdentifier: true },
    });
    const messageThread = metadata.find(
      ({ workspaceId: itemWorkspaceId, universalIdentifier }) =>
        itemWorkspaceId === workspaceId &&
        universalIdentifier ===
          STANDARD_OBJECTS.messageThread.universalIdentifier,
    )?.id;
    const message = metadata.find(
      ({ workspaceId: itemWorkspaceId, universalIdentifier }) =>
        itemWorkspaceId === workspaceId &&
        universalIdentifier === STANDARD_OBJECTS.message.universalIdentifier,
    )?.id;

    if (!messageThread || !message) {
      throw this.threadUnavailable();
    }

    return { messageThread, message };
  }

  async loadAuthoritySource({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    mode,
  }: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    messageThreadId: string;
    mode: 'execution' | 'projection';
  }): Promise<MyahInboxReplyAuthoritySource> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });
    if (!workspace) {
      throw this.threadUnavailable();
    }

    const authContext =
      mode === 'projection'
        ? buildSystemAuthContext(workspaceId)
        : await this.buildInitiatorAuthContext(
            workspace,
            initiatorUserWorkspaceId,
          );

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const messageThreadRepository =
          await this.globalWorkspaceOrmManager.getRepository<InboxMessageThreadRecord>(
            workspaceId,
            'messageThread',
          );
        const messageRepository =
          await this.globalWorkspaceOrmManager.getRepository<InboxParentMessageRecord>(
            workspaceId,
            'message',
          );
        const messageThread = await messageThreadRepository.findOneBy({
          id: messageThreadId,
        });
        const messages = await messageRepository.find({
          where: { messageThreadId, isDraft: false },
          relations: {
            messageParticipants: true,
            messageChannelMessageAssociations: true,
          },
          order: { receivedAt: 'DESC', id: 'DESC' },
          take: 1,
        });

        return { messageThread, parentMessage: messages[0] };
      },
      authContext,
    );
  }

  private async buildInitiatorAuthContext(
    workspace: WorkspaceEntity,
    userWorkspaceId: string,
  ) {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { id: userWorkspaceId, workspaceId: workspace.id },
      relations: { user: true },
    });

    if (!userWorkspace?.user) {
      throw this.threadUnavailable();
    }

    const { flatWorkspaceMemberMaps } =
      await this.workspaceCacheService.getOrRecompute(workspace.id, [
        'flatWorkspaceMemberMaps',
      ]);
    const workspaceMemberId =
      flatWorkspaceMemberMaps.idByUserId[userWorkspace.user.id];
    const workspaceMember = workspaceMemberId
      ? flatWorkspaceMemberMaps.byId[workspaceMemberId]
      : undefined;

    if (!workspaceMemberId || !workspaceMember) {
      throw this.threadUnavailable();
    }

    return buildUserAuthContext({
      workspace: workspace as unknown as FlatWorkspace,
      userWorkspaceId,
      user: userWorkspace.user as unknown as FlatUser,
      workspaceMemberId,
      workspaceMember,
    });
  }

  private threadUnavailable(): MyahInboxReplyUnavailableError {
    return new MyahInboxReplyUnavailableError(
      MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
    );
  }
}
