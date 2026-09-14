import { Test } from '@nestjs/testing';

import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { CodeInterpreterService } from 'src/engine/core-modules/code-interpreter/code-interpreter.service';
import { I18nService } from 'src/engine/core-modules/i18n/i18n.service';
import { MyahInboxModule } from 'src/engine/core-modules/myah-inbox/myah-inbox.module';
import { MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-inbox-reply-execution-service.token';
import { ActionToolProvider } from 'src/engine/core-modules/tool-provider/providers/action-tool.provider';
import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';
import { CreateCalendarEventTool } from 'src/engine/core-modules/tool/tools/calendar-tool/create-calendar-event-tool';
import { CodeInterpreterTool } from 'src/engine/core-modules/tool/tools/code-interpreter-tool/code-interpreter-tool';
import { DraftEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/draft-email-tool';
import { SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { HttpTool } from 'src/engine/core-modules/tool/tools/http-tool/http-tool';
import { PrepareInstagramReplyDraftTool } from 'src/engine/core-modules/tool/tools/instagram-tool/prepare-instagram-reply-draft-tool';
import { SendInstagramReplyTool } from 'src/engine/core-modules/tool/tools/instagram-tool/send-instagram-reply-tool';
import { SendMyahInboxReplyTool } from 'src/engine/core-modules/tool/tools/myah-inbox-reply-tool/send-myah-inbox-reply-tool';
import { NavigateAppTool } from 'src/engine/core-modules/tool/tools/navigate-tool/navigate-app-tool';
import { PrepareOutreachEmailDraftTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/prepare-outreach-email-draft-tool';
import { SendOutreachEmailTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool';
import { ExtractJsonPathsTool } from 'src/engine/core-modules/tool/tools/output-navigation-tool/extract-json-paths-tool';
import { SearchOutputTool } from 'src/engine/core-modules/tool/tools/output-navigation-tool/search-output-tool';
import { SearchHelpCenterTool } from 'src/engine/core-modules/tool/tools/search-help-center-tool/search-help-center-tool';
import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

describe('ToolModule Inbox reply registration', () => {
  it('resolves the Inbox sender and action provider through the Inbox-owned execution token', async () => {
    const toolModuleProviders = Reflect.getMetadata(
      'providers',
      ToolModule,
    ) as unknown[];
    const toolModuleImports = Reflect.getMetadata(
      'imports',
      ToolModule,
    ) as unknown[];

    expect(toolModuleProviders).toContain(SendMyahInboxReplyTool);
    expect(toolModuleImports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ forwardRef: expect.any(Function) }),
      ]),
    );
    expect(
      toolModuleImports
        .filter(
          (moduleImport): moduleImport is { forwardRef: () => unknown } =>
            typeof moduleImport === 'object' &&
            moduleImport !== null &&
            'forwardRef' in moduleImport,
        )
        .map(({ forwardRef }) => forwardRef()),
    ).toContain(MyahInboxModule);

    const moduleRef = await Test.createTestingModule({
      providers: [
        SendMyahInboxReplyTool,
        ActionToolProvider,
        { provide: ActionApprovalService, useValue: {} },
        {
          provide: MYAH_INBOX_REPLY_EXECUTION_SERVICE_TOKEN,
          useValue: { execute: jest.fn() },
        },
        ...[
          HttpTool,
          SendEmailTool,
          DraftEmailTool,
          CreateCalendarEventTool,
          SearchHelpCenterTool,
          CodeInterpreterTool,
          NavigateAppTool,
          ExtractJsonPathsTool,
          SearchOutputTool,
          CodeInterpreterService,
          PrepareInstagramReplyDraftTool,
          SendInstagramReplyTool,
          PrepareOutreachEmailDraftTool,
          SendOutreachEmailTool,
          PermissionsService,
          I18nService,
          ExternalWritePolicyService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();

    expect(moduleRef.get(SendMyahInboxReplyTool)).toBeInstanceOf(
      SendMyahInboxReplyTool,
    );
    expect(moduleRef.get(ActionToolProvider)).toBeInstanceOf(
      ActionToolProvider,
    );

    await moduleRef.close();
  });
});
