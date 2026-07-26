import { Injectable } from '@nestjs/common';

import { OutreachEmailDraftService } from 'src/engine/core-modules/outreach-email/services/outreach-email-draft.service';
import {
  OutreachEmailDraftInputZodSchema,
  type OutreachEmailDraftInput,
} from 'src/engine/core-modules/tool/tools/outreach-email-tool/outreach-email-tool.schema';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolInput } from 'src/engine/core-modules/tool/types/tool-input.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

export const PREPARE_OUTREACH_EMAIL_DRAFT_TOOL_NAME =
  'prepare_outreach_email_draft';

@Injectable()
export class PrepareOutreachEmailDraftTool implements Tool {
  description =
    'Prepare one provider email draft for exactly one selected Campaign Creator. The recipient is resolved from workspace records and cannot be supplied by the caller.';
  inputSchema = OutreachEmailDraftInputZodSchema;

  constructor(
    private readonly outreachEmailDraftService: OutreachEmailDraftService,
    private readonly emailComposerService: EmailComposerService,
  ) {}

  async execute(
    input: ToolInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    if (!context.userWorkspaceId || !context.threadId) {
      return {
        success: false,
        message:
          'An authenticated workspace member and chat thread are required to prepare outreach.',
      };
    }

    const parsedInput = OutreachEmailDraftInputZodSchema.safeParse(input);

    if (!parsedInput.success) {
      return {
        success: false,
        message: 'Invalid outreach draft request.',
      };
    }

    return this.prepareDraft(parsedInput.data, context);
  }

  private async prepareDraft(
    input: OutreachEmailDraftInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    try {
      const authority =
        await this.outreachEmailDraftService.resolvePreparationAuthority({
          workspaceId: context.workspaceId,
          campaignCreatorId: input.campaignCreatorId,
          connectedAccountId: input.connectedAccountId,
          inReplyTo: input.inReplyTo,
        });
      const composedEmail = await this.emailComposerService.composeEmail(
        {
          recipients: { to: authority.recipientEmail },
          subject: input.subject,
          body: input.body,
          connectedAccountId: authority.mailboxSelection.connectedAccountId,
          files: [],
          inReplyTo: authority.inReplyTo ?? undefined,
        },
        context,
      );

      if (!composedEmail.success) {
        return composedEmail.output;
      }

      const preparedDraft =
        await this.outreachEmailDraftService.persistPreparedDraft({
          authority,
          composedEmail: composedEmail.data,
        });
      const { headerMessageId, ...safePreparedDraft } = preparedDraft;

      return {
        success: true,
        message: 'Outreach email draft prepared for approval.',
        result: {
          ...safePreparedDraft,
          providerDraftHeaderMessageId: headerMessageId,
        },
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to prepare outreach email draft.',
      };
    }
  }
}
