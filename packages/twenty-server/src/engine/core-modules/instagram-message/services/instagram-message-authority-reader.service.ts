import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, type Repository } from 'typeorm';

import {
  buildInstagramMessageActionAuthority,
  INSTAGRAM_MESSAGE_ACTION_NAME,
  INSTAGRAM_MESSAGE_ACTION_VERSION,
} from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { type InstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import { type ExpectedActionBindingWithWorkspace } from 'src/engine/core-modules/action-approval/types/action-approval.type';
import { resolveInstagramRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-instagram-recipient.util';
import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { buildSystemAuthContext } from 'src/engine/core-modules/auth/utils/build-system-auth-context.util';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

const OBJECT_UNIVERSAL_IDENTIFIER_BY_ROLE: Record<string, string> = {
  INSTAGRAM_ACCOUNT: '2d357469-831a-4629-ad4b-47335900e883',
  INSTAGRAM_MESSAGE_DRAFT: '85762d24-541b-407f-9d6a-cdf89552c665',
  SOCIAL_CONVERSATION: '36817464-855f-42db-9fbb-f8853643f8d6',
  CREATOR: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
};

type DraftRow = {
  id: string;
  body: string | null;
  revision: number | string;
  kind: 'FIRST_MESSAGE' | 'REPLY';
  creatorId: string | null;
  recipientUsername: string | null;
  recipientProviderId: string | null;
  conversationId: string | null;
  sentAt: Date | null;
  creatorInstagramUsername: string | null;
  creatorInstagramUrl: string | null;
  creatorInstagramLinkPrimaryLinkUrl: string | null;
  providerConversationId: string | null;
  conversationRecipientIgsid: string | null;
  conversationRecipientUsername: string | null;
  conversationProvider: string | null;
  conversationLifecycle: string | null;
  conversationInstagramAccountId: string | null;
};

@Injectable()
export class InstagramMessageAuthorityReaderService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    private readonly accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
    // Universal identifiers are resolved globally but every result is filtered by workspace.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    private readonly unipileClient: UnipileV1ClientService,
  ) {}

  async getDraftActionKind(input: {
    workspaceId: string;
    draftId: string;
    expectedRevision: number;
  }): Promise<'START_CHAT' | 'REPLY'> {
    const workspace = await this.getWorkspace(input.workspaceId);
    const draft = await this.loadDraft(workspace, input.draftId);
    if (Number(draft.revision) !== input.expectedRevision) {
      throw new Error('Instagram message draft revision changed');
    }

    return draft.kind === 'FIRST_MESSAGE' ? 'START_CHAT' : 'REPLY';
  }

  async assertReadyAfterReservation(
    authority: InstagramMessageActionAuthority,
  ): Promise<void> {
    const { account, draft } = authority.canonicalGraph;
    const accountBinding = await this.getActiveAccountBinding(
      authority.expectedActionBinding.workspaceId,
    );
    if (accountBinding.id !== account.bindingId) {
      throw new Error('Instagram account binding changed');
    }
    if (draft.kind === 'START_CHAT') {
      const workspace = await this.getWorkspace(
        authority.expectedActionBinding.workspaceId,
      );
      await this.assertNoCurrentConversation(
        workspace,
        accountBinding,
        draft.recipientUsername,
        draft.recipientProviderId,
      );

      return;
    }

    await this.unipileClient.getChat({
      accountId: account.unipileAccountId,
      chatId: draft.providerConversationId!,
      expectedAttendeeId: draft.recipientProviderId,
    });
  }

  async rebuildExecutionAuthority(input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }): Promise<InstagramMessageActionAuthority> {
    return this.rebuildAuthority(input, false);
  }

  async rebuildForReconciliation(input: {
    workspaceId: string;
    binding: ExpectedActionBindingWithWorkspace;
  }): Promise<InstagramMessageActionAuthority> {
    return this.rebuildAuthority(input, true);
  }

  private async rebuildAuthority(
    input: {
      workspaceId: string;
      binding: ExpectedActionBindingWithWorkspace;
    },
    allowExistingTarget: boolean,
  ): Promise<InstagramMessageActionAuthority> {
    if (
      input.binding.actionName !== INSTAGRAM_MESSAGE_ACTION_NAME ||
      input.binding.actionVersion !== INSTAGRAM_MESSAGE_ACTION_VERSION
    ) {
      throw new Error('Instagram message source graph is unavailable');
    }

    const workspace = await this.getWorkspace(input.workspaceId);
    const accountBinding = await this.getActiveAccountBinding(
      input.workspaceId,
    );
    const draft = await this.loadDraft(
      workspace,
      input.binding.draftId,
      allowExistingTarget,
    );
    const authority = await this.buildAuthority({
      workspace,
      accountBinding,
      draft,
      allowExistingTarget,
      approvalContext: {
        initiatorUserWorkspaceId: input.binding.initiatorUserWorkspaceId,
        threadId: input.binding.threadId,
        interactionContextType: input.binding.interactionContextType,
        interactionContextId: input.binding.interactionContextId,
      },
    });
    if (
      computeLogicalActionKey(authority.expectedActionBinding) !==
      computeLogicalActionKey(input.binding)
    ) {
      throw new Error('Instagram message source graph is unavailable');
    }

    return authority;
  }

  async createDirectAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    draftId: string;
    expectedRevision: number;
  }): Promise<InstagramMessageActionAuthority> {
    const workspace = await this.getWorkspace(input.workspaceId);
    const accountBinding = await this.getActiveAccountBinding(
      input.workspaceId,
    );
    const draft = await this.loadDraft(workspace, input.draftId);
    if (Number(draft.revision) !== input.expectedRevision) {
      throw new Error('Instagram message draft revision changed');
    }

    return this.buildAuthority({
      workspace,
      accountBinding,
      draft,
      approvalContext: {
        initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
        threadId: null,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
        interactionContextId: input.draftId,
      },
    });
  }

  async createThreadReplyAuthority(input: {
    workspaceId: string;
    initiatorUserWorkspaceId: string;
    threadId: string;
    draftId: string;
  }): Promise<InstagramMessageActionAuthority> {
    const workspace = await this.getWorkspace(input.workspaceId);
    const accountBinding = await this.getActiveAccountBinding(
      input.workspaceId,
    );
    const draft = await this.loadDraft(workspace, input.draftId);

    return this.buildAuthority({
      workspace,
      accountBinding,
      draft,
      approvalContext: {
        initiatorUserWorkspaceId: input.initiatorUserWorkspaceId,
        threadId: input.threadId,
        interactionContextType: null,
        interactionContextId: null,
      },
    });
  }

  private async buildAuthority(input: {
    workspace: FlatWorkspace;
    accountBinding: UnipileInstagramAccountBindingEntity;
    draft: DraftRow;
    allowExistingTarget?: boolean;
    approvalContext: Pick<
      Extract<
        ExpectedActionBindingWithWorkspace,
        { actionName: 'send_instagram_message' }
      >,
      | 'initiatorUserWorkspaceId'
      | 'threadId'
      | 'interactionContextType'
      | 'interactionContextId'
    >;
  }): Promise<InstagramMessageActionAuthority> {
    const draftKind =
      input.draft.kind === 'FIRST_MESSAGE' ? 'START_CHAT' : 'REPLY';
    const recipient = resolveInstagramRecipient({
      instagramUsername: input.draft.creatorInstagramUsername,
      instagramUrl: input.draft.creatorInstagramUrl,
      instagramLink: {
        primaryLinkUrl: input.draft.creatorInstagramLinkPrimaryLinkUrl,
      },
    });
    const recipientProviderId =
      input.draft.recipientProviderId?.trim() ?? recipient.normalizedUsername;

    if (
      input.draft.recipientUsername?.trim().toLowerCase() !==
      recipient.normalizedUsername
    ) {
      throw new Error('Instagram draft recipient is stale');
    }

    if (draftKind === 'START_CHAT') {
      if (!input.draft.creatorId || input.draft.conversationId) {
        throw new Error('START_CHAT draft target is stale');
      }
      if (!input.allowExistingTarget) {
        await this.assertNoCurrentConversation(
          input.workspace,
          input.accountBinding,
          recipient.normalizedUsername,
          recipientProviderId,
        );
      }
    } else {
      if (
        !input.draft.conversationId ||
        !input.draft.providerConversationId ||
        input.draft.conversationProvider !== 'UNIPILE' ||
        input.draft.conversationLifecycle !== 'ACTIVE' ||
        input.draft.conversationInstagramAccountId !==
          input.accountBinding.workspaceInstagramAccountRecordId ||
        input.draft.conversationRecipientIgsid !== recipientProviderId
      ) {
        throw new Error('REPLY draft target is stale');
      }
      await this.unipileClient.getChat({
        accountId: input.accountBinding.unipileAccountId,
        chatId: input.draft.providerConversationId,
        expectedAttendeeId: recipientProviderId,
      });
    }

    const evidenceLinks = await this.getEvidenceLinks(
      input.workspace.id,
      input.draft,
      input.accountBinding.workspaceInstagramAccountRecordId,
    );

    return buildInstagramMessageActionAuthority({
      workspaceId: input.workspace.id,
      initiatorUserWorkspaceId: input.approvalContext.initiatorUserWorkspaceId,
      threadId: input.approvalContext.threadId,
      interactionContextType: input.approvalContext.interactionContextType,
      interactionContextId: input.approvalContext.interactionContextId,
      draft: {
        id: input.draft.id,
        revision: Number(input.draft.revision),
        body: input.draft.body ?? '',
        kind: draftKind,
        creatorRecordId: input.draft.creatorId,
        recipientUsername: recipient.normalizedUsername,
        recipientSourceValues: recipient.sourceFields.map((field) => ({
          field,
          value:
            field === 'instagramUsername'
              ? (input.draft.creatorInstagramUsername ?? '')
              : field === 'instagramUrl'
                ? (input.draft.creatorInstagramUrl ?? '')
                : (input.draft.creatorInstagramLinkPrimaryLinkUrl ?? ''),
        })),
        conversationRecordId: input.draft.conversationId,
        providerConversationId: input.draft.providerConversationId,
        recipientProviderId,
      },
      account: {
        bindingId: input.accountBinding.id,
        workspaceInstagramAccountRecordId:
          input.accountBinding.workspaceInstagramAccountRecordId,
        unipileAccountId: input.accountBinding.unipileAccountId,
        instagramUserId: input.accountBinding.instagramUserId,
      },
      evidenceLinks,
    });
  }

  private async assertNoCurrentConversation(
    workspace: FlatWorkspace,
    accountBinding: UnipileInstagramAccountBindingEntity,
    recipientUsername: string,
    recipientProviderId: string,
  ): Promise<void> {
    const dataSource =
      await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
    const schemaName = getWorkspaceSchemaName(workspace.id);
    const localRows = await dataSource.query<Array<{ id: string }>>(
      `SELECT "id"
       FROM "${schemaName}"."_myahSocialConversation"
       WHERE "provider" = 'UNIPILE'
         AND "lifecycle" = 'ACTIVE'
         AND "instagramAccountId" = $1
         AND (
           lower("recipientUsername") = $2
           OR "recipientIgsid" = $3
         )
         AND "deletedAt" IS NULL
       LIMIT 1`,
      [
        accountBinding.workspaceInstagramAccountRecordId,
        recipientUsername,
        recipientProviderId,
      ],
    );
    if (localRows.length > 0) {
      throw new Error(
        'START_CHAT authority cannot target an existing conversation',
      );
    }

    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    let pageCount = 0;
    do {
      const page = await this.unipileClient.listChats({
        accountId: accountBinding.unipileAccountId,
        cursor,
        after: null,
        limit: 250,
      });
      if (
        page.chats.some(
          ({ attendeeProviderId }) =>
            attendeeProviderId === recipientProviderId,
        )
      ) {
        throw new Error(
          'START_CHAT authority cannot target an existing conversation',
        );
      }
      pageCount += 1;
      if (
        page.nextCursor &&
        (seenCursors.has(page.nextCursor) || pageCount >= 100)
      ) {
        throw new Error('Unipile chat traversal is incomplete');
      }
      if (page.nextCursor) seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
  }

  private async loadDraft(
    workspace: FlatWorkspace,
    draftId: string,
    allowSent = false,
  ): Promise<DraftRow> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const dataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const schemaName = getWorkspaceSchemaName(workspace.id);
        const rows = await dataSource.query<DraftRow[]>(
          `SELECT
             d."id", d."body", d."revision", d."kind", d."creatorId",
             d."recipientUsername", d."recipientProviderId",
             d."conversationId", d."sentAt",
             creator."instagramUsername" AS "creatorInstagramUsername",
             creator."instagramUrl" AS "creatorInstagramUrl",
             creator."instagramLinkPrimaryLinkUrl" AS "creatorInstagramLinkPrimaryLinkUrl",
             conversation."providerConversationId",
             conversation."recipientIgsid" AS "conversationRecipientIgsid",
             conversation."recipientUsername" AS "conversationRecipientUsername",
             conversation."provider" AS "conversationProvider",
             conversation."lifecycle" AS "conversationLifecycle",
             conversation."instagramAccountId" AS "conversationInstagramAccountId"
           FROM "${schemaName}"."_myahInstagramReplyDraft" d
           LEFT JOIN "${schemaName}"."_creator" creator
             ON creator."id" = d."creatorId" AND creator."deletedAt" IS NULL
           LEFT JOIN "${schemaName}"."_myahSocialConversation" conversation
             ON conversation."id" = d."conversationId" AND conversation."deletedAt" IS NULL
           WHERE d."id" = $1
             AND d."deletedAt" IS NULL
             AND ($2::boolean OR d."sentAt" IS NULL)
           LIMIT 1`,
          [draftId, allowSent],
        );
        if (rows.length !== 1) {
          throw new Error('Instagram message draft is unavailable');
        }

        return rows[0];
      },
      buildSystemAuthContext({ workspace }),
    );
  }

  private async getActiveAccountBinding(
    workspaceId: string,
  ): Promise<UnipileInstagramAccountBindingEntity> {
    const bindings = await this.accountBindingRepository.find(workspaceId, {
      take: 2,
      where: {
        status: UnipileInstagramAccountBindingStatus.ACTIVE,
        deactivatedAt: IsNull(),
      },
    });
    if (bindings.length !== 1) {
      throw new Error('A single active Instagram account binding is required');
    }

    return bindings[0];
  }

  private async getEvidenceLinks(
    workspaceId: string,
    draft: DraftRow,
    accountRecordId: string,
  ) {
    const roleByUniversalIdentifier = Object.fromEntries(
      Object.entries(OBJECT_UNIVERSAL_IDENTIFIER_BY_ROLE).map(
        ([role, universalIdentifier]) => [universalIdentifier, role],
      ),
    );
    const objectMetadatas = await this.objectMetadataRepository.find({
      where: { workspaceId },
    });
    const idByRole = Object.fromEntries(
      objectMetadatas
        .filter(({ universalIdentifier }) =>
          Object.prototype.hasOwnProperty.call(
            roleByUniversalIdentifier,
            universalIdentifier,
          ),
        )
        .map(({ id, universalIdentifier }) => [
          roleByUniversalIdentifier[universalIdentifier],
          id,
        ]),
    );
    const recordsByRole: Record<string, string | null> = {
      INSTAGRAM_ACCOUNT: accountRecordId,
      INSTAGRAM_MESSAGE_DRAFT: draft.id,
      SOCIAL_CONVERSATION: draft.conversationId,
      CREATOR: draft.creatorId,
    };
    const evidenceLinks = Object.entries(recordsByRole)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([role, recordId]) => ({
        objectMetadataId: idByRole[role],
        recordId,
        role,
      }));

    if (
      evidenceLinks.some(({ objectMetadataId }) => !objectMetadataId) ||
      !evidenceLinks.some(({ role }) => role === 'INSTAGRAM_MESSAGE_DRAFT') ||
      !evidenceLinks.some(({ role }) => role === 'INSTAGRAM_ACCOUNT')
    ) {
      throw new Error('Instagram message evidence metadata is unavailable');
    }

    return evidenceLinks;
  }

  private async getWorkspace(workspaceId: string): Promise<FlatWorkspace> {
    const workspace = await this.workspaceRepository.findOneBy({
      id: workspaceId,
    });
    if (!workspace) throw new Error('Workspace is unavailable');

    return workspace as unknown as FlatWorkspace;
  }
}
