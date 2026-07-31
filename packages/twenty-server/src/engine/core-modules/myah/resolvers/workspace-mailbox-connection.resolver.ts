import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { type PlaintextImapSmtpCaldavParams } from 'src/engine/core-modules/imap-smtp-caldav-connection/types/imap-smtp-caldav-connection.type';
import {
  RevokeWorkspaceMailboxResultDTO,
  WorkspaceMailboxConnectionResultDTO,
  WorkspaceMailboxConnectionStatusDTO,
} from 'src/engine/core-modules/myah/dtos/workspace-mailbox-connection.dto';
import {
  ConnectWorkspaceMailboxInputDTO,
  ReplaceWorkspaceMailboxCredentialsInputDTO,
  type WorkspaceMailboxConnectionParametersInput,
} from 'src/engine/core-modules/myah/dtos/workspace-mailbox-connection.input';
import { WorkspaceMailboxConnectionException } from 'src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter, PermissionsGraphqlApiExceptionFilter)
@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS),
)
export class WorkspaceMailboxConnectionResolver {
  constructor(
    private readonly workspaceMailboxConnectionService: WorkspaceMailboxConnectionService,
  ) {}

  @Mutation(() => WorkspaceMailboxConnectionResultDTO)
  connectWorkspaceMailbox(
    @Args('input') input: ConnectWorkspaceMailboxInputDTO,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<WorkspaceMailboxConnectionResultDTO> {
    return this.executeCustomerSafe(() =>
      this.workspaceMailboxConnectionService.connectWorkspaceMailbox({
        accountType: input.accountType,
        connectionParameters: this.toPlaintextConnectionParameters(
          input.connectionParameters,
        ),
        handle: input.handle,
        userWorkspaceId,
        workspaceId: workspace.id,
      }),
    );
  }

  @Mutation(() => WorkspaceMailboxConnectionResultDTO)
  rotateWorkspaceMailbox(
    @Args('input') input: ReplaceWorkspaceMailboxCredentialsInputDTO,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<WorkspaceMailboxConnectionResultDTO> {
    return this.executeCustomerSafe(() =>
      this.workspaceMailboxConnectionService.rotateWorkspaceMailbox({
        connectedAccountId: input.connectedAccountId,
        connectionParameters: this.toPlaintextConnectionParameters(
          input.connectionParameters,
        ),
        workspaceId: workspace.id,
      }),
    );
  }

  @Mutation(() => WorkspaceMailboxConnectionResultDTO)
  reconnectWorkspaceMailbox(
    @Args('input') input: ReplaceWorkspaceMailboxCredentialsInputDTO,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<WorkspaceMailboxConnectionResultDTO> {
    return this.executeCustomerSafe(() =>
      this.workspaceMailboxConnectionService.reconnectWorkspaceMailbox({
        connectedAccountId: input.connectedAccountId,
        connectionParameters: this.toPlaintextConnectionParameters(
          input.connectionParameters,
        ),
        workspaceId: workspace.id,
      }),
    );
  }

  @Query(() => WorkspaceMailboxConnectionStatusDTO)
  getWorkspaceMailboxStatus(
    @Args('connectedAccountId', { type: () => UUIDScalarType })
    connectedAccountId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<WorkspaceMailboxConnectionStatusDTO> {
    return this.executeCustomerSafe(() =>
      this.workspaceMailboxConnectionService.getWorkspaceMailboxStatus({
        connectedAccountId,
        workspaceId: workspace.id,
      }),
    );
  }

  @Mutation(() => RevokeWorkspaceMailboxResultDTO)
  revokeWorkspaceMailbox(
    @Args('connectedAccountId', { type: () => UUIDScalarType })
    connectedAccountId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<RevokeWorkspaceMailboxResultDTO> {
    return this.executeCustomerSafe(() =>
      this.workspaceMailboxConnectionService.revokeWorkspaceMailbox({
        connectedAccountId,
        workspaceId: workspace.id,
      }),
    );
  }

  private toPlaintextConnectionParameters(
    input: WorkspaceMailboxConnectionParametersInput,
  ): PlaintextImapSmtpCaldavParams {
    return {
      ...(isDefined(input.IMAP)
        ? {
            IMAP: {
              ...input.IMAP,
              password: input.IMAP.password as PlaintextString,
            },
          }
        : {}),
      ...(isDefined(input.SMTP)
        ? {
            SMTP: {
              ...input.SMTP,
              password: input.SMTP.password as PlaintextString,
            },
          }
        : {}),
    };
  }

  private async executeCustomerSafe<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const safeError =
        error instanceof WorkspaceMailboxConnectionException
          ? error
          : new WorkspaceMailboxConnectionException('UNKNOWN');

      throw new UserInputError(safeError.message, {
        isExpected: true,
        subCode: safeError.code,
      });
    }
  }
}
