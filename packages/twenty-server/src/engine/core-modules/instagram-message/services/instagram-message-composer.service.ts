import { buildInstagramMessageEvidenceLinks } from 'src/engine/core-modules/action-approval/utils/build-instagram-message-evidence-links.util';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { assertInstagramComposerReady } from './instagram-message-composer-readiness.util';
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'util';

import { Injectable, Logger } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import {
  buildInstagramMessageV3ActionAuthority,
  INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT,
  isInstagramMessageIdentitySnapshot,
} from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { type InstagramMessageIdentitySnapshot } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { InstagramMessageDraftLockService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft-lock.service';
import {
  InstagramMessageSendService,
  type InstagramMessageSendResult,
} from 'src/engine/core-modules/instagram-message/services/instagram-message-send.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceQueryRunner } from 'src/engine/twenty-orm/query-runner/workspace-query-runner';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import {
  runWithWorkspaceDatabaseEventBuffer,
  flushBufferedWorkspaceDatabaseEvents,
} from 'src/engine/workspace-event-emitter/utils/workspace-database-event-buffer';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { resolveInstagramRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';

import {
  type InstagramComposerAttempt,
  type InstagramComposerAuthenticatedContext,
  type ResolvedInstagramComposerGraph,
  type SendInstagramComposerInput,
} from './instagram-message-composer.types';
import { InstagramMessagePermissionService } from './instagram-message-permission.service';
import { withInstagramConversationLinkEvents } from './instagram-message-conversation-link-events.util';
import {
  computeInstagramComposerPreparationFingerprint,
  InstagramMessageRecipientService,
} from './instagram-message-recipient.service';

const sha256 = (values: unknown[]) =>
  createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

type ComposerConversationRow = {
  id: string;
  creatorId: string | null;
  instagramAccountId: string;
  providerConversationId: string;
  recipientIgsid: string;
  lifecycle: string;
  provider: string;
  deletedAt: Date | null;
};

type ComposerDraftRow = {
  id: string;
  revision: number | string;
  body: string;
  kind: 'FIRST_MESSAGE' | 'REPLY';
  status: 'DRAFT';
  source: 'MANUAL';
  creatorId: string | null;
  conversationId: string | null;
  recipientUsername: string;
  recipientProviderId: string;
  createdByWorkspaceMemberId: string | null;
  sentAt: Date | null;
  composerInputDigest: string | null;
  instagramMessageSnapshot: InstagramMessageIdentitySnapshot | null;
};

@Injectable()
export class InstagramMessageComposerService {
  private readonly logger = new Logger(InstagramMessageComposerService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly recipientService: InstagramMessageRecipientService,
    private readonly permissionService: InstagramMessagePermissionService,
    private readonly draftLockService: InstagramMessageDraftLockService,
    private readonly actionApprovalService: ActionApprovalService,
    private readonly sendService: InstagramMessageSendService,
  ) {}

  async send(
    input: SendInstagramComposerInput,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ): Promise<InstagramMessageSendResult> {
    const body = this.validateInput(input);
    const composerInputDigest = this.computeInputDigest(
      input,
      authenticatedContext,
      body,
    );

    // Discovery is deliberately before resolving a mutable Creator. A receipt
    // replay must remain possible when the selected Creator has since changed,
    // been deleted, or is no longer readable.
    const discovered = await this.findComposerAttempt(
      input.draftId,
      authenticatedContext,
    );
    const discoveredDraft = discovered
      ? null
      : await this.findVerifiedDraft({
          workspaceId: authenticatedContext.workspaceId,
          draftId: input.draftId,
        });
    const normalizedHandle =
      discovered?.instagramMessageSnapshot.publicIdentifier ??
      discoveredDraft?.snapshot.publicIdentifier ??
      (await this.resolveNewAttemptHandle(input, authenticatedContext));

    return this.draftLockService.withNormalizedHandleLock(
      { workspaceId: authenticatedContext.workspaceId, normalizedHandle },
      () =>
        this.draftLockService.withLock(
          {
            workspaceId: authenticatedContext.workspaceId,
            draftId: input.draftId,
          },
          async () => {
            const existing = await this.findComposerAttempt(
              input.draftId,
              authenticatedContext,
            );
            if (
              existing &&
              existing.composerInputDigest !== composerInputDigest
            ) {
              throw new Error('Instagram composer input changed');
            }
            const persistedDraft = existing?.receipt
              ? null
              : await this.findVerifiedDraft({
                  workspaceId: authenticatedContext.workspaceId,
                  draftId: input.draftId,
                });
            const durableHandle =
              existing?.instagramMessageSnapshot.publicIdentifier ??
              persistedDraft?.snapshot.publicIdentifier;
            if (durableHandle && durableHandle !== normalizedHandle) {
              throw new Error('Instagram composer context changed');
            }
            if (
              discovered
                ? !existing ||
                  discovered.id !== existing.id ||
                  discovered.actionKind !== existing.actionKind ||
                  discovered.composerInputDigest !==
                    existing.composerInputDigest ||
                  !this.snapshotMatches(
                    discovered.instagramMessageSnapshot,
                    existing.instagramMessageSnapshot,
                  )
                : existing ||
                  !isDeepStrictEqual(discoveredDraft, persistedDraft)
            ) {
              throw new Error('Instagram composer context changed');
            }
            if (existing) {
              const binding =
                await this.actionApprovalService.getApprovedBinding({
                  workspaceId: authenticatedContext.workspaceId,
                  approvalBindingId: existing.id,
                  initiatorUserWorkspaceId:
                    authenticatedContext.initiatorUserWorkspaceId,
                  threadId: null,
                  interactionContextType:
                    INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT,
                  interactionContextId: input.draftId,
                });
              if (binding.actionName !== 'send_instagram_message') {
                throw new Error('Instagram composer attempt is unavailable');
              }
              if (!existing.receipt) {
                // A binding alone is not execution authority. Rebuild and compare
                // the complete current graph before the Task 5 v3 dispatch gate.
                if (
                  !persistedDraft ||
                  persistedDraft.createdByWorkspaceMemberId !==
                    authenticatedContext.workspaceMemberId ||
                  persistedDraft.composerInputDigest !== composerInputDigest ||
                  !this.verifiedDraftMatchesSnapshot(
                    persistedDraft,
                    existing.instagramMessageSnapshot,
                    body,
                  )
                ) {
                  throw new Error('Instagram composer context changed');
                }
                const graph = await this.recipientService.resolve(
                  { recipient: input.recipient },
                  authenticatedContext,
                );
                if (
                  !this.snapshotMatchesGraph(
                    existing.instagramMessageSnapshot,
                    graph,
                  )
                ) {
                  throw new Error('Instagram composer context changed');
                }
                const authority = this.buildAuthority({
                  graph,
                  input,
                  authenticatedContext,
                  composerInputDigest: persistedDraft.composerInputDigest,
                  body: persistedDraft.body,
                  snapshot: persistedDraft.snapshot,
                  revision: Number(persistedDraft.revision),
                });
                // getApprovedBinding returns the authority value, not its entity.
                // Compare the whole value (including evidence), not just hashes.
                const evidenceValues = (links: typeof binding.evidenceLinks) =>
                  links
                    .map((link) => {
                      const {
                        id: _id,
                        createdAt: _createdAt,
                        actionApprovalBindingId,
                        ...authority
                      } = link as typeof link & {
                        id?: string;
                        createdAt?: Date;
                        actionApprovalBindingId?: string;
                        actionApprovalBinding?: unknown;
                      };
                      // The owning FK is already scoped by getApprovedBinding's
                      // evidence query; verify it again before excluding storage provenance.
                      if (
                        Object.prototype.hasOwnProperty.call(
                          link,
                          'actionApprovalBindingId',
                        ) &&
                        actionApprovalBindingId !== existing.id
                      )
                        throw new Error('Instagram composer context changed');
                      if (
                        Object.prototype.hasOwnProperty.call(
                          authority,
                          'actionApprovalBinding',
                        ) &&
                        authority.actionApprovalBinding === undefined
                      )
                        delete authority.actionApprovalBinding;
                      return authority;
                    })
                    .sort((left, right) => {
                      const leftKey = JSON.stringify([
                        left.objectMetadataId,
                        left.recordId,
                        left.role,
                      ]);
                      const rightKey = JSON.stringify([
                        right.objectMetadataId,
                        right.recordId,
                        right.role,
                      ]);
                      return leftKey < rightKey
                        ? -1
                        : leftKey > rightKey
                          ? 1
                          : 0;
                    });
                // Exclude only row UUID, creation timestamp, the verified owning FK,
                // and an OWN strictly-undefined unloaded relation slot. Null/loaded
                // relations and unknown fields remain authority mismatches. Keep
                // every tuple field, count and duplicate; never repair evidence.
                if (
                  !isDeepStrictEqual(
                    {
                      ...binding,
                      evidenceLinks: evidenceValues(binding.evidenceLinks),
                    },
                    {
                      ...authority.expectedActionBinding,
                      evidenceLinks: evidenceValues(
                        authority.expectedActionBinding.evidenceLinks,
                      ),
                    },
                  )
                ) {
                  throw new Error('Instagram composer context changed');
                }
              }
              await this.permissionService.assertCanSend({
                workspaceId: authenticatedContext.workspaceId,
                actionKind: existing.actionKind,
                rolePermissionConfig: authenticatedContext.rolePermissionConfig,
              });
              return this.sendService.executeApprovedWithDraftLockHeld(
                {
                  workspaceId: authenticatedContext.workspaceId,
                  initiatorUserWorkspaceId:
                    authenticatedContext.initiatorUserWorkspaceId,
                  approvalBindingId: existing.id,
                  threadId: null,
                  interactionContextType:
                    INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT,
                  interactionContextId: input.draftId,
                  rolePermissionConfig:
                    authenticatedContext.rolePermissionConfig,
                },
                binding,
              );
            }

            const graph = await this.recipientService.resolve(
              { recipient: input.recipient },
              authenticatedContext,
            );
            const preparationMatches =
              graph.sender.accountRecordId === input.expectedAccountRecordId &&
              graph.preparationFingerprint ===
                input.expectedPreparationFingerprint;
            const resumesCommittedAttempt =
              persistedDraft?.createdByWorkspaceMemberId ===
                authenticatedContext.workspaceMemberId &&
              persistedDraft.composerInputDigest === composerInputDigest &&
              this.verifiedDraftMatchesGraph(persistedDraft, graph, body);
            const resumesOwnCreatorCreation =
              resumesCommittedAttempt &&
              'rawHandle' in input.recipient &&
              graph.sender.accountRecordId === input.expectedAccountRecordId &&
              input.expectedPreparationFingerprint ===
                computeInstagramComposerPreparationFingerprint(
                  { recipient: input.recipient },
                  authenticatedContext,
                  { ...graph, creatorRecordId: null },
                );
            if (
              (persistedDraft && !resumesCommittedAttempt) ||
              (!preparationMatches && !resumesOwnCreatorCreation)
            ) {
              throw new Error('Instagram composer context changed');
            }
            await this.permissionService.assertCanSend({
              workspaceId: authenticatedContext.workspaceId,
              actionKind: graph.actionKind,
              rolePermissionConfig: authenticatedContext.rolePermissionConfig,
            });

            const persisted = resumesCommittedAttempt
              ? persistedDraft
              : await this.persistVerifiedDraft({
                  input,
                  authenticatedContext,
                  graph,
                  body,
                  composerInputDigest,
                });
            const authority = this.buildAuthority({
              graph: { ...graph, creatorRecordId: persisted.creatorRecordId },
              input,
              authenticatedContext,
              composerInputDigest,
              body,
              snapshot: persisted.snapshot,
              revision: Number(persisted.revision),
            });
            const binding =
              await this.actionApprovalService.createApprovedInstagramMessageBinding(
                authority.expectedActionBinding,
              );
            return this.sendService.executeApprovedWithDraftLockHeld(
              {
                workspaceId: authenticatedContext.workspaceId,
                initiatorUserWorkspaceId:
                  authenticatedContext.initiatorUserWorkspaceId,
                approvalBindingId: binding.id,
                threadId: null,
                interactionContextType:
                  INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT,
                interactionContextId: input.draftId,
                rolePermissionConfig: authenticatedContext.rolePermissionConfig,
              },
              authority.expectedActionBinding,
            );
          },
        ),
    );
  }

  /**
   * COMMITTED reports an owned, structurally valid persisted draft, not approval
   * or proof that its body still matches the original submitted input. Callers
   * must retain that input and draft ID: only send(input) verifies the digest;
   * this status must never trigger reconstructed input, reapproval, or resend.
   */
  async getAttempt(
    draftId: string,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ): Promise<InstagramComposerAttempt | null> {
    const attempt = await this.findComposerAttempt(
      draftId,
      authenticatedContext,
    );
    if (attempt) {
      return {
        draftId,
        approvalBindingId: attempt.id,
        receiptId: attempt.receipt?.id ?? null,
        state: attempt.receipt?.state ?? null,
      };
    }
    if (!('getGlobalWorkspaceDataSource' in this.globalWorkspaceOrmManager)) {
      return null;
    }
    const draft = await this.findVerifiedDraft({
      workspaceId: authenticatedContext.workspaceId,
      draftId,
    });
    if (
      !draft ||
      !this.verifiedDraftMatchesSnapshot(draft, draft.snapshot, draft.body) ||
      draft.createdByWorkspaceMemberId !==
        authenticatedContext.workspaceMemberId
    ) {
      return null;
    }
    return {
      draftId,
      approvalBindingId: null,
      receiptId: null,
      state: 'COMMITTED',
    };
  }

  private async findComposerAttempt(
    draftId: string,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ) {
    return this.actionApprovalService.findComposerAttempt({
      workspaceId: authenticatedContext.workspaceId,
      draftId,
      initiatorUserWorkspaceId: authenticatedContext.initiatorUserWorkspaceId,
    });
  }

  private async resolveNewAttemptHandle(
    input: SendInstagramComposerInput,
    authenticatedContext: InstagramComposerAuthenticatedContext,
  ): Promise<string> {
    if ('rawHandle' in input.recipient) {
      return resolveInstagramRecipient({
        instagramUsername: input.recipient.rawHandle ?? null,
        instagramUrl: null,
        instagramLink: null,
      }).normalizedUsername;
    }
    return this.recipientService.resolveNormalizedHandle(
      { recipient: input.recipient },
      authenticatedContext,
    );
  }

  private validateInput(input: SendInstagramComposerInput): string {
    if (!input.recipient || typeof input.recipient !== 'object') {
      throw new Error('Invalid Instagram composer input');
    }
    const hasCreator = 'creatorRecordId' in input.recipient;
    const hasRaw = 'rawHandle' in input.recipient;
    if (
      hasCreator === hasRaw ||
      !input.draftId ||
      typeof input.body !== 'string' ||
      !input.body.trim() ||
      (hasCreator && !isUuid(input.recipient.creatorRecordId)) ||
      (hasRaw &&
        (typeof input.recipient.rawHandle !== 'string' ||
          !input.recipient.rawHandle.trim()))
    ) {
      throw new Error('Invalid Instagram composer input');
    }

    return input.body.trim();
  }

  private computeInputDigest(
    input: SendInstagramComposerInput,
    authenticatedContext: InstagramComposerAuthenticatedContext,
    body: string,
  ): string {
    const recipientDiscriminant =
      'creatorRecordId' in input.recipient
        ? [
            'creatorRecordId',
            (input.recipient.creatorRecordId ?? '').toLowerCase(),
          ]
        : [
            'rawHandle',
            resolveInstagramRecipient({
              instagramUsername: input.recipient.rawHandle ?? null,
              instagramUrl: null,
              instagramLink: null,
            }).normalizedUsername,
          ];
    return sha256([
      authenticatedContext.workspaceId,
      authenticatedContext.initiatorUserWorkspaceId,
      input.draftId,
      recipientDiscriminant,
      input.expectedAccountRecordId,
      input.expectedPreparationFingerprint,
      body,
    ]);
  }

  private toSnapshot(
    graph: ResolvedInstagramComposerGraph,
  ): InstagramMessageIdentitySnapshot {
    const common = {
      publicIdentifier: graph.normalizedHandle,
      providerId: graph.recipient.providerId,
      providerMessagingId: graph.recipient.providerMessagingId,
      creatorRecordId: graph.creatorRecordId!,
      accountBindingId: graph.account.bindingId,
      instagramAccountRecordId: graph.account.instagramAccountRecordId,
      unipileAccountId: graph.account.unipileAccountId,
      instagramUserId: graph.account.instagramUserId,
      recipientSourceValues: graph.recipient.sourceValues,
    };
    return graph.chat.actionKind === 'START_CHAT'
      ? {
          ...common,
          actionKind: 'START_CHAT',
          conversationRecordId: null,
          providerChatId: null,
          attendeeProviderId: null,
        }
      : {
          ...common,
          actionKind: 'REPLY',
          conversationRecordId: graph.chat.conversationRecordId,
          providerChatId: graph.chat.providerChatId,
          attendeeProviderId: graph.recipient.providerMessagingId,
        };
  }

  private buildAuthority(input: {
    graph: ResolvedInstagramComposerGraph;
    input: SendInstagramComposerInput;
    authenticatedContext: InstagramComposerAuthenticatedContext;
    composerInputDigest: string;
    body: string;
    snapshot?: InstagramMessageIdentitySnapshot;
    revision?: number;
  }) {
    const snapshot = input.snapshot ?? this.toSnapshot(input.graph);
    if (!input.graph.creatorRecordId) {
      throw new Error('Instagram composer Creator is unavailable');
    }
    const context = getWorkspaceContext();
    if (
      context.authContext.workspace.id !==
      input.authenticatedContext.workspaceId
    )
      throw new Error('Instagram message evidence metadata is unavailable');
    const objectMetadatas = Object.values(
      context.flatObjectMetadataMaps.byUniversalIdentifier,
    ).filter(
      (object): object is NonNullable<typeof object> =>
        object !== undefined &&
        object.workspaceId === input.authenticatedContext.workspaceId &&
        object.isActive,
    );
    return buildInstagramMessageV3ActionAuthority({
      workspaceId: input.authenticatedContext.workspaceId,
      initiatorUserWorkspaceId:
        input.authenticatedContext.initiatorUserWorkspaceId,
      threadId: null,
      interactionContextType: INSTAGRAM_MESSAGE_V3_DIRECT_INTERACTION_CONTEXT,
      interactionContextId: input.input.draftId,
      composerInputDigest: input.composerInputDigest,
      instagramMessageSnapshot: snapshot,
      draft: {
        id: input.input.draftId,
        revision: input.revision ?? 1,
        body: input.body,
        kind: input.graph.actionKind,
        creatorRecordId: input.graph.creatorRecordId,
        recipientUsername: input.graph.normalizedHandle,
        recipientSourceValues: input.graph.recipient.sourceValues,
        conversationRecordId: input.graph.chat.conversationRecordId,
        providerConversationId: input.graph.chat.providerChatId,
        // v3 binds the provider profile ID here; Task 5 reads the separate
        // messaging ID from the immutable snapshot for provider dispatch.
        recipientProviderId: input.graph.recipient.providerId,
      },
      account: {
        bindingId: input.graph.account.bindingId,
        workspaceInstagramAccountRecordId:
          input.graph.account.instagramAccountRecordId,
        unipileAccountId: input.graph.account.unipileAccountId,
        instagramUserId: input.graph.account.instagramUserId,
      },
      evidenceLinks: buildInstagramMessageEvidenceLinks({
        objectMetadatas,
        accountRecordId: input.graph.account.instagramAccountRecordId,
        draftId: input.input.draftId,
        conversationRecordId: input.graph.chat.conversationRecordId,
        creatorRecordId: input.graph.creatorRecordId,
      }),
    });
  }

  private snapshotMatchesGraph(
    snapshot: InstagramMessageIdentitySnapshot | null,
    graph: ResolvedInstagramComposerGraph,
  ): snapshot is InstagramMessageIdentitySnapshot {
    if (!isInstagramMessageIdentitySnapshot(snapshot)) return false;

    return (
      snapshot.publicIdentifier === graph.normalizedHandle &&
      snapshot.providerId === graph.recipient.providerId &&
      snapshot.providerMessagingId === graph.recipient.providerMessagingId &&
      snapshot.creatorRecordId === graph.creatorRecordId &&
      snapshot.accountBindingId === graph.account.bindingId &&
      snapshot.instagramAccountRecordId ===
        graph.account.instagramAccountRecordId &&
      snapshot.unipileAccountId === graph.account.unipileAccountId &&
      snapshot.instagramUserId === graph.account.instagramUserId &&
      snapshot.actionKind === graph.actionKind &&
      snapshot.conversationRecordId === graph.chat.conversationRecordId &&
      snapshot.providerChatId === graph.chat.providerChatId &&
      snapshot.attendeeProviderId ===
        (graph.chat.actionKind === 'REPLY'
          ? graph.recipient.providerMessagingId
          : null) &&
      isDeepStrictEqual(
        snapshot.recipientSourceValues,
        graph.recipient.sourceValues,
      )
    );
  }

  private verifiedDraftMatchesSnapshot(
    draft: ComposerDraftRow & {
      creatorRecordId: string;
      snapshot: InstagramMessageIdentitySnapshot;
    },
    snapshot: InstagramMessageIdentitySnapshot,
    body: string,
  ): boolean {
    return (
      Number(draft.revision) === 1 &&
      draft.body === body &&
      draft.kind ===
        (snapshot.actionKind === 'START_CHAT' ? 'FIRST_MESSAGE' : 'REPLY') &&
      draft.status === 'DRAFT' &&
      draft.source === 'MANUAL' &&
      draft.sentAt === null &&
      draft.creatorId === snapshot.creatorRecordId &&
      draft.conversationId === snapshot.conversationRecordId &&
      draft.recipientUsername === snapshot.publicIdentifier &&
      draft.recipientProviderId === snapshot.providerId &&
      typeof draft.body === 'string' &&
      draft.body.length > 0 &&
      draft.body === draft.body.trim() &&
      typeof draft.composerInputDigest === 'string' &&
      /^[a-f0-9]{64}$/.test(draft.composerInputDigest) &&
      this.snapshotMatches(draft.snapshot, snapshot)
    );
  }

  private verifiedDraftMatchesGraph(
    draft:
      | (ComposerDraftRow & {
          creatorRecordId: string;
          snapshot: InstagramMessageIdentitySnapshot;
        })
      | null
      | undefined,
    graph: ResolvedInstagramComposerGraph,
    body: string,
  ): boolean {
    if (!draft || Number(draft.revision) !== 1 || draft.body !== body)
      return false;
    return (
      this.verifiedDraftMatchesSnapshot(draft, draft.snapshot, body) &&
      draft.creatorId === graph.creatorRecordId &&
      this.snapshotMatchesGraph(draft.snapshot, graph)
    );
  }

  private snapshotMatches(
    left: InstagramMessageIdentitySnapshot,
    right: InstagramMessageIdentitySnapshot,
  ): boolean {
    return isDeepStrictEqual(left, right);
  }

  private async findVerifiedDraft(input: {
    workspaceId: string;
    draftId: string;
  }): Promise<
    | (ComposerDraftRow & {
        creatorRecordId: string;
        snapshot: InstagramMessageIdentitySnapshot;
      })
    | null
  > {
    await assertInstagramComposerReady(
      this.globalWorkspaceOrmManager,
      input.workspaceId,
    );
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const schemaName = getWorkspaceSchemaName(input.workspaceId);
    const columns = await dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = '_myahInstagramReplyDraft'
         AND column_name = ANY($2)`,
      [schemaName, ['composerInputDigest', 'instagramMessageSnapshot']],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    // This check is deliberately before any app-table access: workspaces that
    // have not installed the app metadata fail safe rather than issuing SQL for
    // absent columns.
    if (columns.length !== 2) {
      throw new Error('Instagram composer metadata is unavailable');
    }
    const [draft] = await dataSource.query<ComposerDraftRow[]>(
      `SELECT "id", "revision", "body", "kind", "status", "source", "creatorId",
              "conversationId", "recipientUsername", "recipientProviderId",
              "createdByWorkspaceMemberId", "sentAt", "composerInputDigest",
              "instagramMessageSnapshot"
       FROM "${schemaName}"."_myahInstagramReplyDraft"
       WHERE "id" = $1 AND "deletedAt" IS NULL`,
      [input.draftId],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    if (
      !draft ||
      !draft.creatorId ||
      !isInstagramMessageIdentitySnapshot(draft.instagramMessageSnapshot)
    ) {
      return null;
    }

    return {
      ...draft,
      creatorRecordId: draft.creatorId,
      snapshot: draft.instagramMessageSnapshot,
    };
  }

  private async persistVerifiedDraft(input: {
    input: SendInstagramComposerInput;
    authenticatedContext: InstagramComposerAuthenticatedContext;
    graph: ResolvedInstagramComposerGraph;
    body: string;
    composerInputDigest: string;
  }): Promise<{
    creatorRecordId: string;
    revision: number;
    snapshot: InstagramMessageIdentitySnapshot;
  }> {
    await assertInstagramComposerReady(
      this.globalWorkspaceOrmManager,
      input.authenticatedContext.workspaceId,
    );
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const schemaName = getWorkspaceSchemaName(
      input.authenticatedContext.workspaceId,
    );
    const columns = await dataSource.query<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = '_myahInstagramReplyDraft'
         AND column_name = ANY($2)`,
      [schemaName, ['composerInputDigest', 'instagramMessageSnapshot']],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    if (columns.length !== 2) {
      throw new Error('Instagram composer metadata is unavailable');
    }

    // SQL identifiers cannot be parameters. Only the trusted helper's base36
    // workspace schema and the fixed Creator table are permitted in lock SQL.
    if (!/^workspace_[a-z0-9]+$/.test(schemaName)) {
      throw new Error('Instagram composer workspace schema is unavailable');
    }
    const creatorTableLockSql = [
      'LOCK TABLE',
      `${dataSource.driver.escape(schemaName)}."creator"`,
      'IN SHARE ROW EXCLUSIVE MODE',
    ].join(' ');
    const runner: WorkspaceQueryRunner = dataSource.createQueryRunner();
    const { result, bufferedEvents } =
      await runWithWorkspaceDatabaseEventBuffer(async () => {
        try {
          await runner.connect();
          await runner.startTransaction('READ COMMITTED');
          const manager: WorkspaceEntityManager = runner.manager;
          // Pool/advisory acquisition has a separate lifecycle. Once the
          // write transaction starts, every server wait and its total work budget
          // is bounded; timeout/deadlock means rollback, never automatic retry.
          const deadline = Date.now() + 10_000;
          await runner.query(`SET LOCAL statement_timeout = '3000ms'`);
          await runner.query(`SET LOCAL lock_timeout = '2000ms'`);
          await runner.query(
            `SET LOCAL idle_in_transaction_session_timeout = '10000ms'`,
          );
          const beforeQuery = async () => {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
              throw new Error(
                'Instagram composer transaction deadline exceeded',
              );
            }
            await runner.query(
              `SELECT set_config('statement_timeout', $1, true)`,
              [`${Math.min(3_000, remaining)}ms`],
            );
          };
          await beforeQuery();
          // Ordinary Creator DML conflicts with this lock. The subsequent READ
          // COMMITTED scan observes preceding writers; later writers wait until
          // commit. This is not a permanent canonical uniqueness guarantee.
          await runner.query(creatorTableLockSql);
          await this.recipientService.assertCreatorMatchesUnderLock(
            input.graph,
            input.authenticatedContext,
            manager,
            beforeQuery,
          );
          let creatorRecordId = input.graph.creatorRecordId;
          if (!creatorRecordId) {
            const creatorRepository =
              await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
                input.authenticatedContext.workspaceId,
                'creator',
                input.authenticatedContext.rolePermissionConfig,
              );
            await beforeQuery();
            const inserted = await creatorRepository.insert(
              { instagramUsername: input.graph.normalizedHandle },
              manager,
              ['id'],
            );
            const id = inserted.identifiers[0]?.id;
            if (typeof id !== 'string') {
              throw new Error('Instagram composer Creator is unavailable');
            }
            creatorRecordId = id;
          }
          const snapshot = this.toSnapshot({ ...input.graph, creatorRecordId });

          if (input.graph.chat.actionKind === 'REPLY') {
            const conversationRepository =
              await this.globalWorkspaceOrmManager.getRepository<ComposerConversationRow>(
                input.authenticatedContext.workspaceId,
                'myahSocialConversation',
                input.authenticatedContext.rolePermissionConfig,
              );
            const exactConversation = {
              id: input.graph.chat.conversationRecordId,
              instagramAccountId: input.graph.account.instagramAccountRecordId,
              providerConversationId: input.graph.chat.providerChatId,
              recipientIgsid: input.graph.recipient.providerMessagingId,
              lifecycle: 'ACTIVE',
              provider: 'UNIPILE',
              deletedAt: IsNull(),
            };
            await beforeQuery();
            const conversation = await conversationRepository.findOne(
              {
                where: exactConversation,
                select: { id: true, creatorId: true },
                lock: { mode: 'pessimistic_write' },
              },
              manager,
            );
            if (
              !conversation ||
              (conversation.creatorId !== null &&
                conversation.creatorId !== creatorRecordId)
            ) {
              throw new Error('Instagram composer conversation is unavailable');
            }
            if (conversation.creatorId === null) {
              await withInstagramConversationLinkEvents({
                manager,
                conversationId: conversation.id,
                creatorId: creatorRecordId,
                beforeQuery,
                update: () =>
                  conversationRepository.update(
                    { ...exactConversation, creatorId: IsNull() },
                    { creatorId: creatorRecordId },
                    undefined,
                    manager,
                    ['id'],
                  ),
              });
            }
          }

          const draftRepository =
            await this.globalWorkspaceOrmManager.getRepository<ObjectRecord>(
              input.authenticatedContext.workspaceId,
              'myahInstagramReplyDraft',
              input.authenticatedContext.rolePermissionConfig,
            );
          await beforeQuery();
          const collision = await draftRepository.findOne(
            {
              where: { id: input.input.draftId },
              withDeleted: true,
              select: { id: true },
              lock: { mode: 'pessimistic_write' },
            },
            manager,
          );
          if (collision) throw new Error('Instagram composer input changed');
          const actor = {
            source: 'MANUAL',
            workspaceMemberId: input.authenticatedContext.workspaceMemberId,
            name: 'Workspace member',
            context: {},
          };
          await beforeQuery();
          // Fixed trusted payload, not generic API input. The repository still
          // enforces object, field and row permissions, including business fields.
          // A colliding ID fails the insert; only verified recovery can resume it.
          await draftRepository.insert(
            {
              id: input.input.draftId,
              name: `Instagram message to ${input.graph.normalizedHandle}`,
              title: `Instagram message to ${input.graph.normalizedHandle}`,
              body: input.body,
              kind:
                input.graph.actionKind === 'START_CHAT'
                  ? 'FIRST_MESSAGE'
                  : 'REPLY',
              status: 'DRAFT',
              source: 'MANUAL',
              creatorId: creatorRecordId,
              conversationId: input.graph.chat.conversationRecordId,
              recipientUsername: input.graph.normalizedHandle,
              recipientProviderId: input.graph.recipient.providerId,
              revision: 1,
              composerInputDigest: input.composerInputDigest,
              instagramMessageSnapshot: snapshot,
              createdBy: actor,
              updatedBy: actor,
              sentAt: null,
              deletedAt: null,
            },
            manager,
            ['id'],
          );
          await beforeQuery();
          await runner.commitTransaction();
          return { creatorRecordId, revision: 1, snapshot };
        } catch (error) {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          throw error;
        } finally {
          await runner.release();
        }
      });
    // Never run listeners with a transaction/connection held. A listener failure
    // cannot reinterpret a committed draft as a rolled-back write.
    flushBufferedWorkspaceDatabaseEvents(bufferedEvents, () => {
      this.logger.error('Instagram composer post-commit database event failed');
    });
    return result;
  }
}
