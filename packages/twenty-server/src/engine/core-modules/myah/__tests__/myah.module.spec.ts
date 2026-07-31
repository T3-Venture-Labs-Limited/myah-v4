import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';

import { ImapSmtpCaldavModule } from 'src/engine/core-modules/imap-smtp-caldav-connection/imap-smtp-caldav-connection.module';
import { ImapSmtpCaldavService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service';
import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { WorkspaceMailboxConnectionResolver } from 'src/engine/core-modules/myah/resolvers/workspace-mailbox-connection.resolver';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountMetadataModule } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { ConnectedAccountTokenEncryptionModule } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.module';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { ConnectedAccountTokenEncryptionService } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { IMAPAPIsModule } from 'src/modules/connected-account/imap-api/imap-apis.module';
import { ImapSmtpCalDavAPIService } from 'src/modules/connected-account/services/imap-smtp-caldav-apis.service';

describe('MyahModule workspace mailbox wiring', () => {
  it('registers the resolver, service, dependencies, and repositories', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, MyahModule);
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MyahModule,
    );
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, MyahModule);

    expect(imports).toEqual(
      expect.arrayContaining([
        ImapSmtpCaldavModule,
        IMAPAPIsModule,
        ConnectedAccountMetadataModule,
        ConnectedAccountTokenEncryptionModule,
        PermissionsModule,
      ]),
    );
    expect(providers).toEqual(
      expect.arrayContaining([
        WorkspaceMailboxConnectionResolver,
        WorkspaceMailboxConnectionService,
      ]),
    );
    expect(exports).toContain(WorkspaceMailboxConnectionService);

    const typeOrmImport = imports.find(
      (moduleImport: { module?: unknown }) =>
        moduleImport.module === TypeOrmModule,
    );
    const repositoryTokens = typeOrmImport.exports.map(
      (provider: { provide?: unknown } | unknown) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider
          ? provider.provide
          : provider,
    );

    expect(repositoryTokens).toEqual(
      expect.arrayContaining([
        getRepositoryToken(ConnectedAccountEntity),
        getRepositoryToken(MessageChannelEntity),
        getRepositoryToken(UserWorkspaceEntity),
      ]),
    );
  });

  it('resolves the real service and resolver through their Nest tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkspaceMailboxConnectionResolver,
        WorkspaceMailboxConnectionService,
        {
          provide: getRepositoryToken(ConnectedAccountEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {},
        },
        { provide: ImapSmtpCaldavService, useValue: {} },
        { provide: ImapSmtpCalDavAPIService, useValue: {} },
        { provide: ConnectedAccountMetadataService, useValue: {} },
        { provide: ConnectedAccountTokenEncryptionService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(WorkspaceMailboxConnectionResolver)).toBeInstanceOf(
      WorkspaceMailboxConnectionResolver,
    );
    expect(moduleRef.get(WorkspaceMailboxConnectionService)).toBeInstanceOf(
      WorkspaceMailboxConnectionService,
    );

    await moduleRef.close();
  });
});
