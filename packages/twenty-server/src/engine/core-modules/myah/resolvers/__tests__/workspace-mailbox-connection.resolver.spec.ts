import {
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA, PIPES_METADATA } from '@nestjs/common/constants';
import { GqlExecutionContext } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { type WorkspaceMailboxConnectionParametersInput } from 'src/engine/core-modules/myah/dtos/workspace-mailbox-connection.input';
import { WorkspaceMailboxConnectionException } from 'src/engine/core-modules/myah/exceptions/workspace-mailbox-connection.exception';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { type PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

import { WorkspaceMailboxConnectionResolver } from '../workspace-mailbox-connection.resolver';

describe('WorkspaceMailboxConnectionResolver', () => {
  const workspace = { id: 'workspace-id' } as WorkspaceEntity;
  const connectionParameters: WorkspaceMailboxConnectionParametersInput = {
    IMAP: {
      connectionSecurity: EmailConnectionSecurity.SSL_TLS,
      host: 'imap.example.com',
      password: 'workspace-secret',
      port: 993,
      username: 'outreach@example.com',
    },
    SMTP: {
      connectionSecurity: EmailConnectionSecurity.SSL_TLS,
      host: 'smtp.example.com',
      password: 'workspace-secret',
      port: 465,
      username: 'outreach@example.com',
    },
  };
  const safeResult = {
    connectedAccountId: 'account-id',
    messageChannelId: 'channel-id',
    status: {
      connectedAccountId: 'account-id',
      errorCode: null,
      errorMessage: null,
      lastSafeOperation: 'CONNECTED',
      maskedHandle: 'o***h@example.com',
      messageChannelId: 'channel-id',
      state: 'CONNECTED',
      syncStage: 'FULL_MESSAGE_LIST_FETCH_PENDING',
      syncStatus: 'ONGOING',
      updatedAt: new Date('2026-07-27T12:00:00.000Z'),
    },
  };
  const service = {
    connectWorkspaceMailbox: jest.fn().mockResolvedValue(safeResult),
    getWorkspaceMailboxStatus: jest.fn().mockResolvedValue(safeResult.status),
    reconnectWorkspaceMailbox: jest.fn().mockResolvedValue({
      ...safeResult,
      status: { ...safeResult.status, lastSafeOperation: 'RECONNECTED' },
    }),
    revokeWorkspaceMailbox: jest.fn().mockResolvedValue({
      connectedAccountId: 'account-id',
      revoked: true,
      state: 'REVOKED',
    }),
    rotateWorkspaceMailbox: jest.fn().mockResolvedValue({
      ...safeResult,
      status: { ...safeResult.status, lastSafeOperation: 'ROTATED' },
    }),
  };
  const resolver = new WorkspaceMailboxConnectionResolver(
    service as unknown as WorkspaceMailboxConnectionService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives workspace and member identity from authentication context', async () => {
    const result = await resolver.connectWorkspaceMailbox(
      {
        accountType: 'IMAP_SMTP',
        connectionParameters,
        handle: 'outreach@example.com',
      },
      workspace,
      'user-workspace-id',
    );

    expect(service.connectWorkspaceMailbox).toHaveBeenCalledWith({
      accountType: 'IMAP_SMTP',
      connectionParameters,
      handle: 'outreach@example.com',
      userWorkspaceId: 'user-workspace-id',
      workspaceId: 'workspace-id',
    });
    expect(JSON.stringify(result)).not.toContain('workspace-secret');
  });

  it('preserves omitted protocols for partial credential rotation', async () => {
    await resolver.rotateWorkspaceMailbox(
      {
        connectedAccountId: 'account-id',
        connectionParameters: { SMTP: connectionParameters.SMTP },
      },
      workspace,
    );

    expect(service.rotateWorkspaceMailbox).toHaveBeenCalledWith({
      connectedAccountId: 'account-id',
      connectionParameters: { SMTP: connectionParameters.SMTP },
      workspaceId: 'workspace-id',
    });
  });
  it('maps stable mailbox failures to safe GraphQL subcodes', async () => {
    service.rotateWorkspaceMailbox.mockRejectedValueOnce(
      new WorkspaceMailboxConnectionException('AUTHENTICATION_FAILED', {
        cause: new Error('provider echoed workspace-secret'),
      }),
    );

    const error = await resolver
      .rotateWorkspaceMailbox(
        {
          connectedAccountId: 'account-id',
          connectionParameters,
        },
        workspace,
      )
      .catch((caughtError) => caughtError);
    const serializedError = JSON.stringify(error);

    expect(error.extensions).toMatchObject({
      code: ErrorCode.BAD_USER_INPUT,
      subCode: 'AUTHENTICATION_FAILED',
    });
    expect(serializedError).not.toContain('workspace-secret');
    expect(serializedError).not.toContain('provider echoed');
  });

  it('normalizes unknown dependency failures without exposing raw text', async () => {
    service.revokeWorkspaceMailbox.mockRejectedValueOnce(
      new Error('delete failed for workspace-secret at provider-host'),
    );

    const error = await resolver
      .revokeWorkspaceMailbox('account-id', workspace)
      .catch((caughtError) => caughtError);
    const serializedError = JSON.stringify(error);

    expect(error.extensions).toMatchObject({
      code: ErrorCode.BAD_USER_INPUT,
      subCode: 'UNKNOWN',
    });
    expect(serializedError).not.toContain('workspace-secret');
    expect(serializedError).not.toContain('provider-host');
  });

  it('scopes status and revocation to the authenticated workspace', async () => {
    await resolver.getWorkspaceMailboxStatus('account-id', workspace);
    await resolver.revokeWorkspaceMailbox('account-id', workspace);

    expect(service.getWorkspaceMailboxStatus).toHaveBeenCalledWith({
      connectedAccountId: 'account-id',
      workspaceId: 'workspace-id',
    });
    expect(service.revokeWorkspaceMailbox).toHaveBeenCalledWith({
      connectedAccountId: 'account-id',
      workspaceId: 'workspace-id',
    });
  });

  it('requires workspace auth, connected-account permission, and DTO validation', async () => {
    const guards: Type<CanActivate>[] = Reflect.getMetadata(
      GUARDS_METADATA,
      WorkspaceMailboxConnectionResolver,
    );
    const pipes = Reflect.getMetadata(
      PIPES_METADATA,
      WorkspaceMailboxConnectionResolver,
    );
    const permissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    };
    const executionContext = {
      getType: jest.fn(() => 'graphql'),
    } as unknown as ExecutionContext;
    const gqlContextSpy = jest
      .spyOn(GqlExecutionContext, 'create')
      .mockReturnValue({
        getContext: () => ({
          req: {
            userWorkspaceId: 'user-workspace-id',
            workspace: {
              activationStatus: WorkspaceActivationStatus.ACTIVE,
              id: 'workspace-id',
            },
          },
        }),
      } as never);

    expect(guards).toHaveLength(2);
    expect(guards[0]).toBe(WorkspaceAuthGuard);
    expect(pipes).toContain(ResolverValidationPipe);

    const ConnectedAccountsPermissionGuard = guards[1];
    const guard = new ConnectedAccountsPermissionGuard(
      permissionsService as unknown as PermissionsService,
    );

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      apiKeyId: undefined,
      applicationId: undefined,
      setting: PermissionFlagType.CONNECTED_ACCOUNTS,
      userWorkspaceId: 'user-workspace-id',
      workspaceId: 'workspace-id',
    });

    gqlContextSpy.mockRestore();
  });
});
