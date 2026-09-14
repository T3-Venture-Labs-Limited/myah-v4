import { ForbiddenException, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { type ObjectRecord } from 'twenty-shared/types';

import { type ActionApprovalBindingEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { InstagramMessageLocalAuthorityReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

@Injectable()
export class InstagramMessageProposalReaderService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly localAuthorityReader: InstagramMessageLocalAuthorityReaderService,
  ) {}

  async read(binding: ActionApprovalBindingEntity, userWorkspaceId: string) {
    const authContext = getWorkspaceAuthContext();
    if (
      !isUserAuthContext(authContext) ||
      authContext.workspace.id !== binding.workspaceId ||
      authContext.userWorkspaceId !== userWorkspaceId ||
      binding.initiatorUserWorkspaceId !== userWorkspaceId
    ) {
      throw new ForbiddenException(
        'Instagram proposal requires matching authenticated user context',
      );
    }
    if (
      binding.actionName !== 'send_instagram_message' ||
      binding.actionVersion !== 2 ||
      binding.actionKind !== 'REPLY' ||
      !binding.threadId ||
      binding.interactionContextType != null ||
      binding.interactionContextId != null ||
      !binding.recipientFingerprint ||
      !binding.sendingAccountFingerprint ||
      !binding.actionContextFingerprint
    ) {
      throw new Error('Instagram message proposal is unavailable');
    }
    const expectedBinding = {
      ...binding,
      actionName: 'send_instagram_message' as const,
      actionVersion: 2 as const,
      actionKind: 'REPLY' as const,
      recipientFingerprint: binding.recipientFingerprint,
      sendingAccountFingerprint: binding.sendingAccountFingerprint,
      actionContextFingerprint: binding.actionContextFingerprint,
      interactionContextType: null,
      interactionContextId: null,
    };

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const rolePermissionConfig = resolveRolePermissionConfig({
          authContext,
          userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
          apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        });
        if (!rolePermissionConfig) {
          throw new ForbiddenException(
            'Instagram proposal read permissions are required',
          );
        }
        // Shared reconstruction compares all canonical fingerprints, including revision/target.
        // The role-scoped adapter returns only authorized fields, never a system-read body.
        const authority = await this.localAuthorityReader.rebuildForProposal({
          workspaceId: binding.workspaceId,
          binding: expectedBinding,
          rolePermissionConfig,
        });
        const evidenceKey = (
          links:
            | typeof expectedBinding.evidenceLinks
            | typeof authority.expectedActionBinding.evidenceLinks,
        ) =>
          JSON.stringify(
            links
              .map(({ objectMetadataId, recordId, role }) =>
                JSON.stringify([objectMetadataId, recordId, role]),
              )
              .sort(),
          );
        if (
          evidenceKey(binding.evidenceLinks) !==
          evidenceKey(authority.expectedActionBinding.evidenceLinks)
        ) {
          throw new Error('Instagram message proposal is unavailable');
        }
        const repository = await this.globalWorkspaceOrmManager.getRepository<
          ObjectRecord & { label: string | null; name: string | null }
        >(binding.workspaceId, 'myahInstagramAccount', rolePermissionConfig);
        const account = await repository.findOne({
          where: {
            id: authority.canonicalGraph.account
              .workspaceInstagramAccountRecordId,
            deletedAt: IsNull(),
          },
          select: { id: true, label: true, name: true },
        });
        if (!account)
          throw new Error('Instagram message proposal is unavailable');

        return {
          body: authority.canonicalGraph.draft.body,
          recipientUsername: authority.canonicalGraph.draft.recipientUsername,
          accountLabel: account.label ?? account.name,
        };
      },
      authContext,
    );
  }
}
