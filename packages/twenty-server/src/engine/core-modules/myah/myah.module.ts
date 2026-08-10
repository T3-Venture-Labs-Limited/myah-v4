import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ImapSmtpCaldavModule } from 'src/engine/core-modules/imap-smtp-caldav-connection/imap-smtp-caldav-connection.module';
import { WorkspaceMailboxConnectionResolver } from 'src/engine/core-modules/myah/resolvers/workspace-mailbox-connection.resolver';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ManagedEmailModule } from 'src/engine/core-modules/managed-email/managed-email.module';
import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { ConnectedAccountMetadataModule } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountTokenEncryptionModule } from 'src/engine/metadata-modules/connected-account/services/connected-account-token-encryption.module';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { IMAPAPIsModule } from 'src/modules/connected-account/imap-api/imap-apis.module';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { MyahCampaignLifecycleModule } from 'src/modules/myah-campaign/myah-campaign-lifecycle.module';

@Global()
@Module({
  imports: [
    TwentyConfigModule,
    ManagedProviderBillingModule,
    TypeOrmModule.forFeature([
      ConnectedAccountEntity,
      MessageChannelEntity,
      UserWorkspaceEntity,
    ]),
    ImapSmtpCaldavModule,
    IMAPAPIsModule,
    ConnectedAccountMetadataModule,
    MyahCampaignLifecycleModule,
    ConnectedAccountTokenEncryptionModule,
    PermissionsModule,
    ManagedEmailModule,
  ],
  providers: [
    MyahTeamAuthorizationService,
    WorkspaceMailboxConnectionResolver,
    WorkspaceMailboxConnectionService,
  ],
  exports: [
    MyahTeamAuthorizationService,
    ManagedProviderBillingModule,
    WorkspaceMailboxConnectionService,
    ManagedEmailModule,
  ],
})
export class MyahModule {}
