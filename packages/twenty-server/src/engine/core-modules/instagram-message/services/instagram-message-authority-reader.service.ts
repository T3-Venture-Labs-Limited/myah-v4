import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type Repository } from 'typeorm';

import { type InstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.types';
import { InstagramMessageLocalAuthorityReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { UnipileInstagramAccountBindingEntity } from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

@Injectable()
export class InstagramMessageAuthorityReaderService extends InstagramMessageLocalAuthorityReaderService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    workspaceRepository: Repository<WorkspaceEntity>,
    globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectWorkspaceScopedRepository(UnipileInstagramAccountBindingEntity)
    accountBindingRepository: WorkspaceScopedRepository<UnipileInstagramAccountBindingEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ObjectMetadataEntity)
    objectMetadataRepository: Repository<ObjectMetadataEntity>,
    private readonly unipileClient: UnipileV1ClientService,
  ) {
    super(
      workspaceRepository,
      globalWorkspaceOrmManager,
      accountBindingRepository,
      objectMetadataRepository,
    );
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
    } else {
      await this.unipileClient.getChat({
        accountId: account.unipileAccountId,
        chatId: draft.providerConversationId!,
        expectedAttendeeId: draft.recipientProviderId,
      });
    }

    // Recompare current local fingerprints after provider reads, before dispatch.
    // The draft lock does not serialize ordinary Creator edits.
    await this.rebuildExecutionAuthority({
      workspaceId: authority.expectedActionBinding.workspaceId,
      binding: authority.expectedActionBinding,
    });
  }

  private async assertNoCurrentConversation(
    workspace: FlatWorkspace,
    accountBinding: UnipileInstagramAccountBindingEntity,
    recipientUsername: string,
    recipientProviderId: string,
  ): Promise<void> {
    await this.assertNoLocalCurrentConversation(
      workspace,
      accountBinding,
      recipientUsername,
      recipientProviderId,
    );

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
}
