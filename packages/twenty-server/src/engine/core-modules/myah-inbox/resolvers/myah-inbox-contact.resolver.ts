import { ForbiddenException, UseGuards } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { Args, Mutation, Query } from '@nestjs/graphql';
import {
  MyahInboxEmailCardPage,
  MyahInboxEmailCardProjection,
  MyahInboxEmailMessagePage,
  MyahInboxEmailMessageLocation,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-email-card.dto';
import {
  MyahInboxEmailCardsInput,
  MyahInboxEmailCardInput,
  MyahInboxEmailCardMessagesInput,
  MyahInboxEmailMessageLocationInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-email-read.input';
import { assertMyahInboxExpectedWorkspace } from 'src/engine/core-modules/myah-inbox/utils/assert-myah-inbox-expected-workspace.util';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { LinkMyahInboxContactCreatorInput } from 'src/engine/core-modules/myah-inbox/dtos/link-myah-inbox-contact-creator.input';
import { MyahInboxContactConnection } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-connection.dto';
import { MyahInboxContactTriage } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-triage.dto';
import { MyahInboxTriageConflictError } from 'src/engine/core-modules/myah-inbox/errors/myah-inbox-triage-conflict.error';
import {
  assertValidMyahInboxContactTriageUpdate,
  UpdateMyahInboxContactTriageInput,
} from 'src/engine/core-modules/myah-inbox/dtos/update-myah-inbox-contact-triage.input';
import {
  MyahInboxContactEmailMessageConnection,
  MyahInboxContactEmailMessagesInput,
} from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-email-message-connection.dto';
import { MyahInboxContactsInput } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-filter.input';
import { MyahInboxContactSummary } from 'src/engine/core-modules/myah-inbox/dtos/myah-inbox-contact-summary.dto';
import { MyahInboxContactEmailQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-email-query.service';
import { MyahInboxContactLinkService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-link.service';
import { MyahInboxContactQueryService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-query.service';
import { MyahInboxTriageCapabilityService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-triage-capability.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { decodeMyahInboxContactId } from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-contact-id.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@UseGuards(WorkspaceAuthGuard, UserAuthGuard, CustomPermissionGuard)
@CoreResolver(() => MyahInboxContactConnection)
export class MyahInboxContactResolver {
  constructor(
    private readonly contactQueryService: MyahInboxContactQueryService,
    private readonly contactEmailQueryService: MyahInboxContactEmailQueryService,
    private readonly contactLinkService: MyahInboxContactLinkService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly contactTriageService: MyahInboxContactTriageService,
    private readonly triageCapabilityService: MyahInboxTriageCapabilityService,
  ) {}

  @Query(() => MyahInboxContactConnection)
  async myahInboxContacts(
    @Args() input: MyahInboxContactsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactConnection> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactQueryService.listContacts({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxContactSummary)
  async myahInboxContact(
    @Args('contactId', { type: () => String }) contactId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactSummary> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactQueryService.getContact({
      contactId,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxContactEmailMessageConnection)
  async myahInboxContactEmailMessages(
    @Args() input: MyahInboxContactEmailMessagesInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactEmailMessageConnection> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactEmailQueryService.listMessages({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxEmailCardPage)
  async myahInboxContactEmailCards(
    @Args() input: MyahInboxEmailCardsInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxEmailCardPage> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    return this.contactEmailQueryService.listCards({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxEmailCardProjection)
  async myahInboxContactEmailCard(
    @Args() input: MyahInboxEmailCardInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxEmailCardProjection> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    return this.contactEmailQueryService.readCard({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxEmailMessagePage)
  async myahInboxContactEmailCardMessages(
    @Args() input: MyahInboxEmailCardMessagesInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxEmailMessagePage> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    return this.contactEmailQueryService.listCardMessages({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Query(() => MyahInboxEmailMessageLocation, { nullable: true })
  async myahInboxContactEmailMessageLocation(
    @Args() input: MyahInboxEmailMessageLocationInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxEmailMessageLocation | null> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    return this.contactEmailQueryService.locateMessage({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => MyahInboxContactTriage)
  async updateMyahInboxContactTriage(
    @Args('input') input: UpdateMyahInboxContactTriageInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<MyahInboxContactTriage> {
    const { authContext, user } = this.getAuthenticatedUserContext();
    assertValidMyahInboxContactTriageUpdate(input);
    assertMyahInboxExpectedWorkspace(
      authContext.workspace.id,
      input.expectedWorkspaceId,
    );
    const contact = decodeMyahInboxContactId(input.contactId, workspace.id);

    return (await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        // Fail before source resolution when triage is already unavailable;
        // the fenced verification below is authoritative at commit time.
        await this.triageCapabilityService.assertWrite({ authContext });
        if (input.inboxOwnerId) {
          const workspaceContext = getWorkspaceContext();
          const rolePermissionConfig = resolveRolePermissionConfig({
            authContext,
            userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
            apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
          });
          if (!rolePermissionConfig) {
            throw new ForbiddenException(
              'Triage is unavailable with your current Inbox access',
            );
          }
          const workspaceMemberRepository =
            await this.globalWorkspaceOrmManager.getRepository<{
              id: string;
              deletedAt: Date | null;
            }>(workspace.id, 'workspaceMember', rolePermissionConfig);
          const owner = await workspaceMemberRepository.findOne({
            where: { id: input.inboxOwnerId, deletedAt: IsNull() },
            select: { id: true },
          });
          if (!owner) {
            throw new ForbiddenException(
              'Triage is unavailable with your current Inbox access',
            );
          }
        }
        try {
          const dataSource =
            await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
          const result = await dataSource.transaction(async (manager) => {
            const transactionManager = manager as WorkspaceEntityManager;
            await transactionManager.queryRunner?.query(
              "SELECT set_config('search_path', $1, true)",
              [getWorkspaceSchemaName(workspace.id)],
            );
            const markerRows = await transactionManager.queryRunner?.query(
              'SELECT status FROM "myahInboxTriageMigration" WHERE id=true FOR KEY SHARE',
            );
            if (markerRows?.[0]?.status !== 'READY') {
              throw new ForbiddenException(
                'Triage is unavailable with your current Inbox access',
              );
            }
            // Source-backed mutations join the producer lock order before
            // taking permission fences. This only locks and validates the
            // exact unmatched fallback source; it must not acquire the shared
            // Creator tuple before an Email association writer is fenced.
            const contactIdentityKey =
              contact.kind === 'creator'
                ? `creator:${contact.recordId}`
                : await this.contactTriageService.prepareUnmatchedSourceContactInTransaction(
                    {
                      workspaceId: workspace.id,
                      sourceType:
                        contact.kind === 'email-thread'
                          ? 'EMAIL_THREAD'
                          : 'INSTAGRAM_CONVERSATION',
                      sourceRecordId: contact.recordId,
                      manager: transactionManager,
                    },
                  );
            if (!contactIdentityKey) {
              throw new ForbiddenException(
                'Inbox contact source is not readable',
              );
            }
            // Every channel visibility, connected-account ownership, and Email
            // association write conflicts with these table fences. Capability
            // is evaluated only after the fences and remains valid through the
            // tuple commit. The locked source cannot be linked between its
            // fallback validation and this post-fence readability recheck.
            await transactionManager.queryRunner?.query(
              'LOCK TABLE core."messageChannel", core."connectedAccount" IN SHARE MODE',
            );
            await transactionManager.queryRunner?.query(
              'LOCK TABLE "messageChannelMessageAssociation" IN SHARE MODE',
            );
            await this.triageCapabilityService.assertWrite({ authContext });
            await this.contactQueryService.getContact({
              contactId: input.contactId,
              authContext,
              user,
              workspace,
              workspaceMemberId,
            });
            return this.contactTriageService.updateTupleInTransaction({
              contactIdentityKey,
              expectedRevision: input.expectedRevision,
              expectedIdentityGeneration: input.expectedIdentityGeneration,
              patch: {
                inboxOwnerId: input.inboxOwnerId,
                inboxState: input.inboxState,
                snoozedUntil: input.snoozedUntil,
              },
              manager: transactionManager,
            });
          });
          return this.sanitizeTriageOwner({
            authContext,
            workspace,
            triage: result as MyahInboxContactTriage,
          });
        } catch (error) {
          if (error instanceof MyahInboxTriageConflictError) {
            const { triage } = error.extensions as {
              triage: MyahInboxContactTriage;
            };
            throw new MyahInboxTriageConflictError(
              await this.sanitizeTriageOwner({
                authContext,
                workspace,
                triage,
              }),
            );
          }
          throw error;
        }
      },
      authContext,
    )) as MyahInboxContactTriage;
  }

  @Mutation(() => String)
  async linkMyahInboxContactCreator(
    @Args('input') input: LinkMyahInboxContactCreatorInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<string> {
    const { authContext, user } = this.getAuthenticatedUserContext();

    return this.contactLinkService.linkContact({
      ...input,
      authContext,
      user,
      workspace,
      workspaceMemberId,
    });
  }

  private async sanitizeTriageOwner({
    authContext,
    workspace,
    triage,
  }: {
    authContext: Extract<WorkspaceAuthContext, { type: 'user' }>;
    workspace: WorkspaceEntity;
    triage: MyahInboxContactTriage;
  }): Promise<MyahInboxContactTriage> {
    if (!triage.inboxOwnerId) return triage;

    const workspaceContext = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
    });
    if (!rolePermissionConfig) return { ...triage, inboxOwnerId: null };

    const workspaceMemberRepository =
      await this.globalWorkspaceOrmManager.getRepository<{
        id: string;
        deletedAt: Date | null;
      }>(workspace.id, 'workspaceMember', rolePermissionConfig);
    const owner = await workspaceMemberRepository.findOne({
      where: { id: triage.inboxOwnerId, deletedAt: IsNull() },
      select: { id: true },
    });

    return owner ? triage : { ...triage, inboxOwnerId: null };
  }

  private getAuthenticatedUserContext() {
    const authContext = getWorkspaceAuthContext();

    if (!isUserAuthContext(authContext) || !authContext.user) {
      throw new ForbiddenException(
        'The Myah Inbox requires authenticated user context',
      );
    }

    return { authContext, user: authContext.user };
  }
}
