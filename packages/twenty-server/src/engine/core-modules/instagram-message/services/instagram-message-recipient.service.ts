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

type CreatorIdentity = ObjectRecord & {
  id: string;
  instagramUsername: string | null;
  instagramUrl: string | null;
  instagramLink: { primaryLinkUrl?: string | null } | null;
};

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
    const recipient = this.assertRecipient({
      rawHandle: graph.normalizedHandle,
    });
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
    // Discovery is internal and minimal; a match must still pass the separate
    // role-scoped read (or current create permission check) below.
    const allCreators =
      await this.globalWorkspaceOrmManager.getRepository<CreatorIdentity>(
        input.workspaceId,
        'creator',
        { shouldBypassPermissionChecks: true },
      );
    const readableCreators =
      await this.globalWorkspaceOrmManager.getRepository<CreatorIdentity>(
        input.workspaceId,
        'creator',
        input.rolePermissionConfig,
      );

    if (input.recipient.creatorRecordId) {
      await input.beforeQuery?.();
      const selected = await readableCreators.findOne(
        {
          where: { id: input.recipient.creatorRecordId, deletedAt: IsNull() },
          select: {
            id: true,
            instagramUsername: true,
            instagramUrl: true,
            // TypeORM selects mapped columns; formatResult restores instagramLink.
            instagramLinkPrimaryLinkUrl: true,
          },
        },
        input.manager,
      );
      if (!selected) throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');

      const resolved = this.resolveCreatorHandle(selected);
      if (!resolved) throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
      input.recipient.normalizedHandle = resolved.normalizedHandle;
      input.recipient.sourceValues = resolved.sourceValues;

      return { ...selected, ...resolved };
    }

    await input.beforeQuery?.();
    const candidates = await allCreators.find(
      {
        where: { deletedAt: IsNull() },
        select: {
          id: true,
          instagramUsername: true,
          instagramUrl: true,
          instagramLinkPrimaryLinkUrl: true,
        },
      },
      input.manager,
    );
    const matchingIds = new Set<string>();
    let conflictingCandidate = false;
    for (const candidate of candidates) {
      const resolved = this.resolveCreatorHandle(candidate);
      if (resolved?.normalizedHandle === input.recipient.normalizedHandle) {
        matchingIds.add(candidate.id);
      } else if (
        this.hasSourceMatching(candidate, input.recipient.normalizedHandle)
      ) {
        // A stale/contradictory canonical record must never be ignored to create a duplicate.
        conflictingCandidate = true;
      }
    }
    if (conflictingCandidate)
      throw new ComposerResolutionError('CREATOR_AMBIGUOUS');
    if (matchingIds.size > 1)
      throw new ComposerResolutionError('CREATOR_AMBIGUOUS');
    const [id] = matchingIds;
    if (!id) {
      if (!(await this.canCreateCreator(readableCreators))) {
        throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
      }
      // A prospective raw-handle Creator will persist this canonical source;
      // use it now so a crash after the Creator transaction has a stable v3
      // snapshot on replay.
      input.recipient.sourceValues = [
        {
          field: 'instagramUsername',
          value: input.recipient.normalizedHandle,
        },
      ];
      return null;
    }

    await input.beforeQuery?.();
    const readable = await readableCreators.findOne(
      {
        where: { id, deletedAt: IsNull() },
        select: {
          id: true,
          instagramUsername: true,
          instagramUrl: true,
          instagramLinkPrimaryLinkUrl: true,
        },
      },
      input.manager,
    );
    if (!readable) throw new ComposerResolutionError('RECIPIENT_UNAVAILABLE');
    const resolved = this.resolveCreatorHandle(readable);
    if (
      !resolved ||
      resolved.normalizedHandle !== input.recipient.normalizedHandle
    ) {
      throw new ComposerResolutionError('CONTEXT_CHANGED');
    }

    input.recipient.sourceValues = resolved.sourceValues;
    return { ...readable, ...resolved };
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
        updatedColumns: ['instagramUsername'],
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

  private resolveCreatorHandle(creator: CreatorIdentity): {
    normalizedHandle: string;
    sourceValues: Array<{ field: string; value: string }>;
  } | null {
    try {
      const resolved = resolveInstagramRecipient({
        instagramUsername: creator.instagramUsername,
        instagramUrl: creator.instagramUrl,
        instagramLink: creator.instagramLink,
      });
      return {
        normalizedHandle: resolved.normalizedUsername,
        sourceValues: resolved.sourceFields.map((field) => ({
          field,
          value:
            field === 'instagramUsername'
              ? (creator.instagramUsername ?? '')
              : field === 'instagramUrl'
                ? (creator.instagramUrl ?? '')
                : (creator.instagramLink?.primaryLinkUrl ?? ''),
        })),
      };
    } catch {
      return null;
    }
  }

  private hasSourceMatching(
    creator: CreatorIdentity,
    normalizedHandle: string,
  ): boolean {
    return [
      {
        instagramUsername: creator.instagramUsername,
        instagramUrl: null,
        instagramLink: null,
      },
      {
        instagramUsername: null,
        instagramUrl: creator.instagramUrl,
        instagramLink: null,
      },
      {
        instagramUsername: null,
        instagramUrl: null,
        instagramLink: creator.instagramLink,
      },
    ].some((source) => {
      try {
        return (
          resolveInstagramRecipient(source).normalizedUsername ===
          normalizedHandle
        );
      } catch {
        return false;
      }
    });
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
