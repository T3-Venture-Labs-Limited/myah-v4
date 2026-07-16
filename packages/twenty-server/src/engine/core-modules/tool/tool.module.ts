import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { ActionApprovalModule } from 'src/engine/core-modules/action-approval/action-approval.module';
import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { FileEntity } from 'src/engine/core-modules/file/entities/file.entity';
import { FileModule } from 'src/engine/core-modules/file/file.module';
import { JwtModule } from 'src/engine/core-modules/jwt/jwt.module';
import { InstagramReplyModule } from 'src/engine/core-modules/instagram-reply/instagram-reply.module';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { CreateCalendarEventTool } from 'src/engine/core-modules/tool/tools/calendar-tool/create-calendar-event-tool';
import { CodeInterpreterTool } from 'src/engine/core-modules/tool/tools/code-interpreter-tool/code-interpreter-tool';
import { DraftEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/draft-email-tool';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { HttpTool } from 'src/engine/core-modules/tool/tools/http-tool/http-tool';
import { PrepareInstagramReplyDraftTool } from 'src/engine/core-modules/tool/tools/instagram-tool/prepare-instagram-reply-draft-tool';
import { SendInstagramReplyTool } from 'src/engine/core-modules/tool/tools/instagram-tool/send-instagram-reply-tool';
import { NavigateAppTool } from 'src/engine/core-modules/tool/tools/navigate-tool/navigate-app-tool';
import { ExtractJsonPathsTool } from 'src/engine/core-modules/tool/tools/output-navigation-tool/extract-json-paths-tool';
import { SearchOutputTool } from 'src/engine/core-modules/tool/tools/output-navigation-tool/search-output-tool';
import { SearchHelpCenterTool } from 'src/engine/core-modules/tool/tools/search-help-center-tool/search-help-center-tool';
import { ToolOutputSpillService } from 'src/engine/core-modules/tool/services/tool-output-spill.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { NavigationMenuItemModule } from 'src/engine/metadata-modules/navigation-menu-item/navigation-menu-item.module';
import { ObjectMetadataModule } from 'src/engine/metadata-modules/object-metadata/object-metadata.module';
import { ViewModule } from 'src/engine/metadata-modules/view/view.module';
import { CalendarEventCreationManagerModule } from 'src/modules/calendar/calendar-event-creation-manager/calendar-event-creation-manager.module';
import { MessagingImportManagerModule } from 'src/modules/messaging/message-import-manager/messaging-import-manager.module';
import { MessagingSendManagerModule } from 'src/modules/messaging/message-outbound-manager/messaging-send-manager.module';
import { MyahComposioModule } from 'src/modules/myah-composio/myah-composio.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
@Module({
  imports: [
    ActionApprovalModule,
    MyahComposioModule,
    MessagingImportManagerModule,
    MessagingSendManagerModule,
    CalendarEventCreationManagerModule,
    InstagramReplyModule,
    TypeOrmModule.forFeature([FileEntity, ConnectedAccountEntity]),
    ApplicationModule,
    FeatureFlagModule,
    FileModule,
    JwtModule,
    SecureHttpClientModule,
    ObjectMetadataModule,
    ViewModule,
    NavigationMenuItemModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
  ],
  providers: [
    HttpTool,
    SendEmailTool,
    DraftEmailTool,
    CreateCalendarEventTool,
    PrepareInstagramReplyDraftTool,
    SendInstagramReplyTool,
    EmailComposerService,
    SearchHelpCenterTool,
    CodeInterpreterTool,
    NavigateAppTool,
    ExtractJsonPathsTool,
    SearchOutputTool,
    ToolOutputSpillService,
    provideWorkspaceScopedRepository(FileEntity),
  ],
  exports: [
    HttpTool,
    SendEmailTool,
    DraftEmailTool,
    CreateCalendarEventTool,
    EmailComposerService,
    PrepareInstagramReplyDraftTool,
    SendInstagramReplyTool,
    SearchHelpCenterTool,
    CodeInterpreterTool,
    NavigateAppTool,
    ExtractJsonPathsTool,
    SearchOutputTool,
    ToolOutputSpillService,
  ],
})
export class ToolModule {}
