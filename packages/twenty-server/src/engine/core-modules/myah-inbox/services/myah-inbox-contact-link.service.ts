import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { IsNull, type EntityTarget } from 'typeorm';

import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxMutationService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-mutation.service';
import {
  decodeMyahInboxContactId,
  encodeMyahInboxContactId,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';

type MyahInboxLinkContactInput = {
  contactId: string;
  creatorId?: string | null;
  authContext: WorkspaceAuthContext;
  user: AuthContextUser;
  workspace: WorkspaceEntity;
  workspaceMemberId: string;
};

type ContextRecord = {
  id: string;
  creatorId?: string | null;
};

type LinkRepository = {
  target: EntityTarget<ContextRecord>;
  manager: {
    transaction: <T>(
      callback: (manager: WorkspaceEntityManager) => Promise<T>,
    ) => Promise<T>;
  };
  findOne: (options: unknown) => Promise<ContextRecord | null>;
  update: (
    criteria: { id: string; deletedAt: ReturnType<typeof IsNull> },
    values: { creatorId: string | null },
  ) => Promise<{ affected?: number | null }>;
};

@Injectable()
export class MyahInboxContactLinkService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly myahInboxMutationService: MyahInboxMutationService,
    private readonly myahInboxContactTriageLifecycleService: MyahInboxContactTriageLifecycleService,
  ) {}

  async linkContact(input: MyahInboxLinkContactInput): Promise<string> {
    this.assertUserRequest(input);
    const creatorId = input.creatorId ?? null;

    if (creatorId && !isValidUuid(creatorId)) {
      throw new BadRequestException('Invalid Myah inbox Creator ID');
    }
    const contact = decodeMyahInboxContactId(
      input.contactId,
      input.workspace.id,
    );

    if (contact.kind === 'creator') {
      throw new BadRequestException(
        'Select an exact Email or Instagram source to link',
      );
    }

    if (contact.kind === 'email-thread') {
      await this.myahInboxMutationService.updateMyahInboxThread({
        threadId: contact.recordId,
        creatorId,
        authContext: input.authContext,
        user: input.user,
        workspace: input.workspace,
        workspaceMemberId: input.workspaceMemberId,
      });

      return encodeMyahInboxContactId({
        workspaceId: input.workspace.id,
        identity: creatorId
          ? { kind: 'creator', recordId: creatorId }
          : contact,
      });
    }

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceContext = getWorkspaceContext();
        const rolePermissionConfig = resolveRolePermissionConfig({
          authContext: input.authContext,
          userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
          apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        });

        if (!rolePermissionConfig) {
          throw new ForbiddenException('Inbox role permissions are required');
        }

        const repository = async (name: string) =>
          // SAFETY: all requested names are fixed workspace objects and expose
          // the narrow LinkRepository methods used below.
          (await this.globalWorkspaceOrmManager.getRepository<
            Record<string, unknown>
          >(
            input.workspace.id,
            name,
            rolePermissionConfig,
          )) as unknown as LinkRepository;
        const workspaceMemberRepository = await repository('workspaceMember');
        const currentWorkspaceMember = await workspaceMemberRepository.findOne({
          where: { id: input.workspaceMemberId },
          select: { id: true },
        });

        if (!currentWorkspaceMember) {
          throw new ForbiddenException(
            'Inbox workspace member is not readable',
          );
        }

        const sourceRepository = await repository(
          contact.kind === 'email-thread'
            ? 'messageThread'
            : 'myahSocialConversation',
        );
        const creatorRepository = creatorId
          ? await repository('creator')
          : undefined;
        if (creatorRepository) {
          const creator = await creatorRepository.findOne({
            where: { id: creatorId, deletedAt: IsNull() },
            select: { id: true },
          });

          if (!creator) {
            throw new ForbiddenException('Inbox Creator is not readable');
          }
        }

        const result = await sourceRepository.manager.transaction(
          async (manager) =>
            this.myahInboxContactTriageLifecycleService.withPreparedSourceMutationInTransaction(
              {
                workspaceId: input.workspace.id,
                sourceType: 'INSTAGRAM_CONVERSATION',
                sourceRecordIds: [contact.recordId],
                nextCreatorIds: creatorId ? [creatorId] : [],
                manager,
                mutate: async () => {
                  // SAFETY: this is the transaction-scoped repository for the
                  // same fixed source target obtained through the
                  // permission-aware port.
                  const transactionalSourceRepository =
                    manager.getRepository<ContextRecord>(
                      sourceRepository.target,
                      rolePermissionConfig,
                      input.authContext,
                    ) as unknown as LinkRepository;
                  const source = await transactionalSourceRepository.findOne({
                    where: { id: contact.recordId, deletedAt: IsNull() },
                    select: { id: true, creatorId: true },
                    lock: { mode: 'pessimistic_write' },
                  });
                  if (!source) {
                    throw new ForbiddenException(
                      'Inbox contact source is not readable',
                    );
                  }
                  if (creatorRepository) {
                    // Revalidate the permission-authorized target only after
                    // Creator anchors plus source advisory/row locks prevent a
                    // stale relink.
                    // SAFETY: this is the transaction-scoped repository for
                    // the permission-authorized Creator target prefetch.
                    const transactionalCreatorRepository =
                      manager.getRepository<ContextRecord>(
                        creatorRepository.target,
                        rolePermissionConfig,
                        input.authContext,
                      ) as unknown as LinkRepository;
                    const creator =
                      await transactionalCreatorRepository.findOne({
                        where: { id: creatorId!, deletedAt: IsNull() },
                        select: { id: true },
                        lock: { mode: 'pessimistic_write' },
                      });
                    if (!creator) {
                      throw new ForbiddenException(
                        'Inbox Creator is not readable',
                      );
                    }
                  }
                  return transactionalSourceRepository.update(
                    { id: contact.recordId, deletedAt: IsNull() },
                    { creatorId },
                  );
                },
              },
            ),
        );

        if (result.affected !== 1) {
          throw new ForbiddenException('Inbox contact source is not writable');
        }

        return encodeMyahInboxContactId({
          workspaceId: input.workspace.id,
          identity: creatorId
            ? { kind: 'creator', recordId: creatorId }
            : contact,
        });
      },
      input.authContext,
    );
  }

  private assertUserRequest(
    input: MyahInboxLinkContactInput,
  ): asserts input is MyahInboxLinkContactInput & {
    authContext: Extract<WorkspaceAuthContext, { type: 'user' }>;
  } {
    if (
      !isUserAuthContext(input.authContext) ||
      !isDefined(input.authContext.user) ||
      !isDefined(input.user) ||
      input.authContext.user.id !== input.user.id ||
      input.authContext.workspace.id !== input.workspace.id ||
      input.authContext.workspaceMemberId !== input.workspaceMemberId
    ) {
      throw new ForbiddenException(
        'The Myah Inbox requires matching authenticated user context',
      );
    }
  }
}
