import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'util';

import { ConflictException, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import { resolveInstagramRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';
import { InstagramActionBudgetService } from 'src/engine/core-modules/instagram-action-budget/services/instagram-action-budget.service';
import { computeInstagramActionTargetFingerprints } from 'src/engine/core-modules/instagram-action-budget/utils/instagram-action-target-fingerprint.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import {
  INSTAGRAM_CONVERSATION_DELETED_MESSAGE,
  UnipileInstagramProjectionService,
} from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type SocialProfileRecord } from 'src/modules/myah-creator-social-profile/types/social-profile-record.type';

import {
  type InstagramComposerAuthenticatedContext,
  type InstagramComposerBlockedCode,
  type InstagramComposerPreparation,
  type InstagramComposerRecipient,
  type PrepareInstagramComposerInput,
  type ResolvedInstagramComposerGraph,
} from './instagram-message-composer.types';
import { InstagramMessagePermissionService } from './instagram-message-permission.service';
import { InstagramMessageRecordAccessService } from './instagram-message-record-access.service';

const CHAT_PAGE_LIMIT = 250;
const MAX_CHAT_PAGES = 100;

class ComposerResolutionError extends Error {
  constructor(readonly code: InstagramComposerBlockedCode) {
    super(code);
  }
}

type CreatorIdentity = ObjectRecord & { id: string };

type LocalConversation = ObjectRecord & {
  id: string;
  providerConversationId: string | null;
  recipientIgsid: string | null;
  recipientUsername: string | null;
};

const sha256 = (values: unknown[]) =>
  createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');

export const computeInstagramComposerPreparationFingerprint = (
  input: PrepareInstagramComposerInput,
  authenticatedContext: InstagramComposerAuthenticatedContext,
  graph: Omit<ResolvedInstagramComposerGraph, 'preparationFingerprint'>,
): string => {
  return sha256([
    authenticatedContext.workspaceId,
    authenticatedContext.initiatorUserWorkspaceId,
    authenticatedContext.workspaceMemberId,
    input.recipient,
    graph.recipient.sourceValues,
    graph.creatorRecordId,
    graph.normalizedHandle,
    graph.account.bindingId,
    graph.account.instagramAccountRecordId,
    graph.account.unipileAccountId,
    graph.account.instagramUserId,
    graph.recipient.providerId,
    graph.recipient.providerMessagingId,
    graph.actionKind,
    graph.chat.conversationRecordId,
    graph.chat.providerChatId,
  ]);
};

@Injectable()
export class InstagramMessageRecipientService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly recordAccessService: InstagramMessageRecordAccessService,
    private readonly permissionService: InstagramMessagePermissionService,
    private readonly budgetService: InstagramActionBudgetService,
    private readonly unipileClient: UnipileV1ClientService,
    private readonly projectionService: UnipileInstagramProjectionService,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    private readonly accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
  ) {}

  async resolveNormalizedHandle(
    input: PrepareInstagramComposerInput,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ): Promise<string> {
    const recipient = this.assertRecipient(input.recipient);
    const creator = await this.resolveCreator({
      recipient,
      workspaceId: authenticatedContext.workspaceId,
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
    });

    return creator?.normalizedHandle ?? recipient.normalizedHandle;
  }

  async prepare(
    input: PrepareInstagramComposerInput,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ): Promise<InstagramComposerPreparation> {
    try {
      const resolved = await this.resolve(input, authenticatedContext);

      return {
        status: resolved.status,
        normalizedHandle: resolved.normalizedHandle,
        creatorRecordId: resolved.creatorRecordId,
        sender: resolved.sender,
        actionKind: resolved.actionKind,
        preparationFingerprint: resolved.preparationFingerprint,
      };
    } catch (error) {
      if (error instanceof ComposerResolutionError) {
        return { status: 'BLOCKED', code: error.code };
      }

      return { status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' };
    }
  }

  // This graph is deliberately internal: only the safe display subset leaves prepare().
  async resolve(
    input: PrepareInstagramComposerInput,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ): Promise<ResolvedInstagramComposerGraph> {
    if (
      !(await this.permissionService.canQueryComposerAccount({
        workspaceId: authenticatedContext.workspaceId,
        rolePermissionConfig: authenticatedContext.rolePermissionConfig,
      }))
    ) {
      throw new ComposerResolutionError('MISSING_ROUTE_PERMISSION');
    }
    const recipient = this.assertRecipient(input.recipient);
    const account = await this.recordAccessService.getComposerAccount({
      workspaceId: authenticatedContext.workspaceId,
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
    });
    if (!account) throw new ComposerResolutionError('ACCOUNT_UNAVAILABLE');

    const creator = await this.resolveCreator({
      recipient,
      workspaceId: authenticatedContext.workspaceId,
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
    });
    const profile = await this.resolveProfile(
      account.unipileAccountId,
      recipient.normalizedHandle,
    );
    const providerChats = await this.listVerifiedChats(
      account.unipileAccountId,
      profile.providerMessagingId,
    );
    const localChats = await this.listLocalChats({
      workspaceId: authenticatedContext.workspaceId,
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
      accountRecordId: account.instagramAccountRecordId,
      normalizedHandle: recipient.normalizedHandle,
      providerMessagingId: profile.providerMessagingId,
    });
    const chat = await this.resolveVerifiedChat({
      providerChatIds: providerChats,
      localChats,
      providerMessagingId: profile.providerMessagingId,
      accountId: account.unipileAccountId,
      bindingId: account.bindingId,
      workspaceId: authenticatedContext.workspaceId,
      creatorRecordId: creator?.id ?? null,
    });
    const actionKind = chat.providerChatId ? 'REPLY' : 'START_CHAT';

    const hasPermission = await this.permissionService.canSend({
      actionKind,
      rolePermissionConfig: authenticatedContext.rolePermissionConfig,
      workspaceId: authenticatedContext.workspaceId,
    });
    if (!hasPermission) {
      throw new ComposerResolutionError('MISSING_ROUTE_PERMISSION');
    }

    const target = computeInstagramActionTargetFingerprints({
      instagramAccountRecordId: account.instagramAccountRecordId,
      normalizedHandle: recipient.normalizedHandle,
      providerId: profile.providerId,
      providerMessagingId: profile.providerMessagingId,
    });
    const targetAvailable = await this.budgetService.isTargetAvailable({
      workspaceId: authenticatedContext.workspaceId,
      instagramAccountRecordId: account.instagramAccountRecordId,
      providerMessagingId: profile.providerMessagingId,
      ...target,
    });
    if (!targetAvailable) throw new ComposerResolutionError('TARGET_LOCKED');

    const sourceValues = recipient.sourceValues;

    const graph: Omit<
      ResolvedInstagramComposerGraph,
      'preparationFingerprint'
    > = {
      status: 'READY',
      selectedCreatorRecordId: input.recipient.creatorRecordId ?? null,
      normalizedHandle: recipient.normalizedHandle,
      creatorRecordId: creator?.id ?? null,
      sender: {
        accountRecordId: account.instagramAccountRecordId,
        label: account.label,
      },
      actionKind,
      account,
      recipient: {
        providerId: profile.providerId,
        providerMessagingId: profile.providerMessagingId,
        sourceValues,
      },
      chat:
        actionKind === 'REPLY'
          ? {
              actionKind,
              conversationRecordId: chat.conversationRecordId!,
              providerChatId: chat.providerChatId!,
            }
          : {
              actionKind,
              conversationRecordId: null,
              providerChatId: null,
            },
    };
    return {
      ...graph,
      preparationFingerprint: computeInstagramComposerPreparationFingerprint(
        input,
        authenticatedContext,
        graph,
      ),
    };
  }

  // Caller holds the exact workspace Creator table lock. No provider resolution
  // belongs here: reject newly visible candidates rather than adopting them.
  async assertCreatorMatchesUnderLock(
    graph: ResolvedInstagramComposerGraph,
    context: InstagramComposerAuthenticatedContext,
    manager: WorkspaceEntityManager,
    beforeQuery: () => Promise<void>,
  ): Promise<void> {
    // A Creator selection must recheck every profile for that Creator, including
    // newly added or hidden accounts. A raw handle instead checks its exact locator.
    const recipient = this.assertRecipient(
      graph.selectedCreatorRecordId
        ? { creatorRecordId: graph.selectedCreatorRecordId }
        : { rawHandle: graph.normalizedHandle },
    );
    const creator = await this.resolveCreator({
      recipient,
      workspaceId: context.workspaceId,
      rolePermissionConfig: context.rolePermissionConfig,
      manager,
      beforeQuery,
    });
    if (
      (creator?.id ?? null) !== graph.creatorRecordId ||
      !isDeepStrictEqual(recipient.sourceValues, graph.recipient.sourceValues)
    ) {
      throw new ComposerResolutionError('CONTEXT_CHANGED');
    }
  }

  private assertRecipient(recipient: InstagramComposerRecipient): {
    creatorRecordId: string | null;
    normalizedHandle: string;
    sourceValues: Array<{ field: string; value: string }>;
  } {
    const hasCreator = typeof recipient.creatorRecordId === 'string';
    const hasRaw = typeof recipient.rawHandle === 'string';
    if (hasCreator === hasRaw || (hasCreator && !recipient.creatorRecordId)) {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }

    if (hasCreator) {
      return {
        creatorRecordId: recipient.creatorRecordId,
        normalizedHandle: '',
        sourceValues: [],
      };
    }

    try {
      const resolved = resolveInstagramRecipient({
        instagramUsername: recipient.rawHandle,
        instagramUrl: null,
        instagramLink: null,
      });
      return {
        creatorRecordId: null,
        normalizedHandle: resolved.normalizedUsername,
        sourceValues: [{ field: 'rawHandle', value: recipient.rawHandle }],
      };
    } catch {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }
  }

  private async resolveCreator(input: {
    recipient: ReturnType<InstagramMessageRecipientService['assertRecipient']>;
    manager?: WorkspaceEntityManager;
    beforeQuery?: () => Promise<void>;
    workspaceId: string;
    rolePermissionConfig: InstagramComposerAuthenticatedContext['rolePermissionConfig'];
  }): Promise<
    | (CreatorIdentity & {
        normalizedHandle: string;
        sourceValues: Array<{ field: string; value: string }>;
      })
    | null
  > {
    const readableCreators =
      await this.globalWorkspaceOrmManager.getRepository<CreatorIdentity>(
        input.workspaceId,
        'creator',
        input.rolePermissionConfig,
      );
    const socialProfile = await this.resolveCanonicalSocialProfile(input);
    if (socialProfile) {
      await input.beforeQuery?.();
      const selected = await readableCreators.findOne(
        {
          where: { id: socialProfile.creatorId, deletedAt: IsNull() },
          select: { id: true },
        },
        input.manager,
      );
      if (!selected) throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
      input.recipient.creatorRecordId = socialProfile.creatorId;
      input.recipient.normalizedHandle = socialProfile.normalizedHandle;
      input.recipient.sourceValues = socialProfile.sourceValues;
      return { ...selected, ...socialProfile };
    }

    // A Creator without an unambiguous canonical account has no message identity.
    if (input.recipient.creatorRecordId) {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }
    if (!(await this.canCreateCreator(readableCreators))) {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }
    // The raw handle is only a preparation input. The transaction creates a
    // canonical profile and binds its ID into the durable action snapshot.
    return null;
  }

  private async resolveCanonicalSocialProfile(input: {
    recipient: ReturnType<InstagramMessageRecipientService['assertRecipient']>;
    manager?: WorkspaceEntityManager;
    beforeQuery?: () => Promise<void>;
    workspaceId: string;
    rolePermissionConfig: InstagramComposerAuthenticatedContext['rolePermissionConfig'];
  }): Promise<{
    creatorId: string;
    normalizedHandle: string;
    sourceValues: Array<{ field: string; value: string }>;
  } | null> {
    const allProfiles =
      await this.globalWorkspaceOrmManager.getRepository<SocialProfileRecord>(
        input.workspaceId,
        'socialProfile',
        { shouldBypassPermissionChecks: true },
      );
    const readableProfiles =
      await this.globalWorkspaceOrmManager.getRepository<SocialProfileRecord>(
        input.workspaceId,
        'socialProfile',
        input.rolePermissionConfig,
      );
    await input.beforeQuery?.();
    const profiles = await allProfiles.find(
      {
        where: {
          platform: 'INSTAGRAM',
          deletedAt: IsNull(),
          ...(input.recipient.creatorRecordId
            ? { creatorId: input.recipient.creatorRecordId }
            : {
                normalizedLocator: `handle:${input.recipient.normalizedHandle}`,
              }),
        },
        select: {
          id: true,
          creatorId: true,
          handle: true,
          profileUrl: true,
          platformAccountId: true,
        },
      },
      input.manager,
    );

    await input.beforeQuery?.();
    const readableCandidates = await readableProfiles.find(
      {
        where: {
          platform: 'INSTAGRAM',
          deletedAt: IsNull(),
          ...(input.recipient.creatorRecordId
            ? { creatorId: input.recipient.creatorRecordId }
            : {
                normalizedLocator: `handle:${input.recipient.normalizedHandle}`,
              }),
        },
        select: {
          id: true,
          creatorId: true,
          handle: true,
          profileUrl: true,
          platformAccountId: true,
        },
      },
      input.manager,
    );
    if (
      profiles.length !== readableCandidates.length ||
      profiles.some(
        ({ id }) => !readableCandidates.some((readable) => readable.id === id),
      )
    ) {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }
    if (profiles.length > 1) {
      throw new ComposerResolutionError('CREATOR_AMBIGUOUS');
    }
    const [readable] = readableCandidates;
    if (!readable) return null;

    let normalizedHandle: string;
    try {
      normalizedHandle = resolveInstagramRecipient({
        instagramUsername: readable.handle,
        instagramUrl: readable.profileUrl,
        instagramLink: null,
      }).normalizedUsername;
    } catch {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }
    if (
      (!input.recipient.creatorRecordId &&
        normalizedHandle !== input.recipient.normalizedHandle) ||
      (input.recipient.creatorRecordId &&
        readable.creatorId !== input.recipient.creatorRecordId)
    ) {
      throw new ComposerResolutionError('CONTEXT_CHANGED');
    }

    return {
      creatorId: readable.creatorId,
      normalizedHandle,
      sourceValues: [
        { field: 'socialProfile.id', value: readable.id },
        ...(readable.handle
          ? [{ field: 'socialProfile.handle', value: readable.handle }]
          : []),
        ...(readable.profileUrl
          ? [{ field: 'socialProfile.profileUrl', value: readable.profileUrl }]
          : []),
        ...(readable.platformAccountId
          ? [
              {
                field: 'socialProfile.platformAccountId',
                value: readable.platformAccountId,
              },
            ]
          : []),
      ],
    };
  }

  private async canCreateCreator(
    creatorRepository: WorkspaceRepository<CreatorIdentity>,
  ): Promise<boolean> {
    try {
      validateOperationIsPermittedOrThrow({
        entityName: 'creator',
        operationType: 'insert',
        objectsPermissions: creatorRepository.objectRecordsPermissions ?? {},
        flatObjectMetadataMaps:
          creatorRepository.internalContext.flatObjectMetadataMaps,
        flatFieldMetadataMaps:
          creatorRepository.internalContext.flatFieldMetadataMaps,
        objectIdByNameSingular:
          creatorRepository.internalContext.objectIdByNameSingular,
        selectedColumns: ['id'],
        allFieldsSelected: false,
        updatedColumns: [],
      });

      return true;
    } catch (error) {
      if (
        error instanceof PermissionsException &&
        error.code === PermissionsExceptionCode.PERMISSION_DENIED
      ) {
        return false;
      }
      throw error;
    }
  }

  private async resolveProfile(accountId: string, normalizedHandle: string) {
    try {
      const profile = await this.unipileClient.getInstagramMessagingProfile({
        accountId,
        username: normalizedHandle,
      });
      if (
        profile.username !== normalizedHandle ||
        !profile.providerId ||
        !profile.providerMessagingId
      ) {
        throw new Error('incomplete profile');
      }
      return profile;
    } catch {
      throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    }
  }

  private async listVerifiedChats(
    accountId: string,
    providerMessagingId: string,
  ) {
    const chats = new Map<string, { attendeeProviderId: string }>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    for (let pageCount = 0; pageCount < MAX_CHAT_PAGES; pageCount += 1) {
      let page;
      try {
        page = await this.unipileClient.listChats({
          accountId,
          cursor,
          after: null,
          limit: CHAT_PAGE_LIMIT,
        });
      } catch {
        throw new ComposerResolutionError('TRAVERSAL_INCOMPLETE');
      }
      for (const chat of page.chats) {
        if (chat.accountId !== accountId || chat.type !== 'ONE_TO_ONE') {
          throw new ComposerResolutionError('TRAVERSAL_INCOMPLETE');
        }
        const prior = chats.get(chat.chatId);
        if (prior && prior.attendeeProviderId !== chat.attendeeProviderId) {
          throw new ComposerResolutionError('CHAT_AMBIGUOUS');
        }
        chats.set(chat.chatId, { attendeeProviderId: chat.attendeeProviderId });
      }
      if (!page.nextCursor) break;
      if (seenCursors.has(page.nextCursor) || pageCount + 1 >= MAX_CHAT_PAGES) {
        throw new ComposerResolutionError('TRAVERSAL_INCOMPLETE');
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }

    const matches = [...chats.entries()]
      .filter(([, chat]) => chat.attendeeProviderId === providerMessagingId)
      .map(([chatId]) => chatId);
    if (matches.length > 1) throw new ComposerResolutionError('CHAT_AMBIGUOUS');
    return matches;
  }

  private async listLocalChats(input: {
    workspaceId: string;
    rolePermissionConfig: InstagramComposerAuthenticatedContext['rolePermissionConfig'];
    accountRecordId: string;
    normalizedHandle: string;
    providerMessagingId: string;
  }): Promise<LocalConversation[]> {
    const findPlausibleChats = async (
      rolePermissionConfig?: InstagramComposerAuthenticatedContext['rolePermissionConfig'],
    ) => {
      const repository =
        await this.globalWorkspaceOrmManager.getRepository<LocalConversation>(
          input.workspaceId,
          'myahSocialConversation',
          rolePermissionConfig,
        );
      const rows = await repository.find({
        where: {
          deletedAt: IsNull(),
          instagramAccountId: input.accountRecordId,
          lifecycle: 'ACTIVE',
          provider: 'UNIPILE',
        },
        select: {
          id: true,
          providerConversationId: true,
          recipientIgsid: true,
          recipientUsername: true,
        },
      });

      return rows.filter(
        (row) =>
          row.recipientIgsid === input.providerMessagingId ||
          row.recipientUsername?.toLowerCase() === input.normalizedHandle,
      );
    };
    // Discover only plausible local evidence internally, then read it again
    // through the caller's role. A hidden exact candidate must not become START.
    const internalCandidates = await findPlausibleChats({
      shouldBypassPermissionChecks: true,
    });
    if (internalCandidates.length === 0) return [];

    const readableCandidates = await findPlausibleChats(
      input.rolePermissionConfig,
    );
    if (readableCandidates.length !== internalCandidates.length) {
      throw new ComposerResolutionError('CONTEXT_CHANGED');
    }

    const internalIds = new Set(internalCandidates.map(({ id }) => id));
    if (readableCandidates.some(({ id }) => !internalIds.has(id))) {
      throw new ComposerResolutionError('CONTEXT_CHANGED');
    }

    return readableCandidates;
  }

  // A contact we have already messaged whose conversation this workspace has not
  // synced yet is a reply, not an ambiguity. Materialise the verified local
  // conversation so the exact REPLY contract (a UUID local conversation that
  // matches the provider chat) holds before approval. Operator-deleted
  // conversations are never resurrected.
  private async resolveVerifiedChat(input: {
    providerChatIds: string[];
    localChats: LocalConversation[];
    providerMessagingId: string;
    accountId: string;
    bindingId: string;
    workspaceId: string;
    creatorRecordId: string | null;
  }): Promise<{
    providerChatId: string | null;
    conversationRecordId: string | null;
  }> {
    if (input.providerChatIds.length !== 1 || input.localChats.length !== 0) {
      return this.mergeChats(
        input.providerChatIds,
        input.localChats,
        input.providerMessagingId,
      );
    }

    const [chatId] = input.providerChatIds;
    const chat = await this.unipileClient.getChat({
      accountId: input.accountId,
      chatId,
      expectedAttendeeId: input.providerMessagingId,
    });
    const binding = await this.accountBindingRepository.findOne(
      input.workspaceId,
      {
        where: {
          id: input.bindingId,
          status: UnipileInstagramAccountBindingStatus.ACTIVE,
          deactivatedAt: IsNull(),
        },
      },
    );
    if (!binding) {
      throw new ComposerResolutionError('ACCOUNT_UNAVAILABLE');
    }

    try {
      const { conversationRecordId } =
        await this.projectionService.upsertVerifiedChat({
          workspace: { id: input.workspaceId } as WorkspaceEntity,
          binding,
          chat,
          ...(input.creatorRecordId
            ? { creatorRecordId: input.creatorRecordId }
            : {}),
          restoreDeletedConversation: false,
        });

      return { providerChatId: chat.chatId, conversationRecordId };
    } catch (error) {
      if (
        error instanceof ConflictException &&
        error.message === INSTAGRAM_CONVERSATION_DELETED_MESSAGE
      ) {
        throw new ComposerResolutionError('CONVERSATION_DELETED');
      }

      throw error;
    }
  }

  private mergeChats(
    providerChatIds: string[],
    localChats: LocalConversation[],
    providerMessagingId: string,
  ) {
    if (providerChatIds.length === 0 && localChats.length === 0) {
      return { providerChatId: null, conversationRecordId: null };
    }
    if (providerChatIds.length !== 1 || localChats.length !== 1) {
      throw new ComposerResolutionError('CHAT_AMBIGUOUS');
    }
    const [providerChatId] = providerChatIds;
    const [localChat] = localChats;
    if (
      !localChat.providerConversationId ||
      localChat.providerConversationId !== providerChatId ||
      localChat.recipientIgsid !== providerMessagingId
    ) {
      throw new ComposerResolutionError('CONTEXT_CHANGED');
    }
    return { providerChatId, conversationRecordId: localChat.id };
  }
}
