import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { InstagramMessageDraftService } from 'src/engine/core-modules/instagram-message/services/instagram-message-draft.service';
import { InstagramMessageRecordAccessService } from 'src/engine/core-modules/instagram-message/services/instagram-message-record-access.service';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';

export const PREPARE_INSTAGRAM_REPLY_DRAFT_TOOL_NAME =
  'prepare_instagram_reply_draft';

const PrepareInstagramReplyDraftInputZodSchema = z
  .object({
    draftId: z.string().uuid().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    conversationRecordId: z.string().uuid(),
    body: z.string().trim().min(1),
  })
  .strict()
  .refine(
    ({ draftId, expectedRevision }) =>
      (draftId == null && expectedRevision == null) ||
      (draftId != null && expectedRevision != null),
    {
      message:
        'draftId and expectedRevision must be supplied together for an edit',
    },
  );

type PrepareInstagramReplyDraftToolInput = z.infer<
  typeof PrepareInstagramReplyDraftInputZodSchema
>;

@Injectable()
export class PrepareInstagramReplyDraftTool implements Tool {
  description =
    'Save one revision-protected local reply draft for an exact active Unipile Instagram conversation. It performs no provider read or write and never sends a message.';
  inputSchema = PrepareInstagramReplyDraftInputZodSchema;

  constructor(
    private readonly instagramMessageDraftService: InstagramMessageDraftService,
    private readonly recordAccessService: InstagramMessageRecordAccessService,
  ) {}

  async execute(
    parameters: PrepareInstagramReplyDraftToolInput,
    context: ToolExecutionContext,
  ): Promise<ToolOutput> {
    const parsedInput =
      PrepareInstagramReplyDraftInputZodSchema.safeParse(parameters);
    if (
      !parsedInput.success ||
      !context.userWorkspaceId ||
      !context.workspaceMemberId ||
      !context.rolePermissionConfig ||
      !context.threadId
    ) {
      return {
        success: false,
        message: 'Instagram reply draft could not be prepared.',
        error:
          'An authenticated chat thread and valid local draft target are required.',
      };
    }
    const draftId = parsedInput.data.draftId ?? randomUUID();
    const expectedRevision = parsedInput.data.expectedRevision ?? 0;

    try {
      await this.recordAccessService.assertCanSaveDraft({
        workspaceId: context.workspaceId,
        draftId,
        expectedRevision,
        kind: 'REPLY',
        creatorRecordId: null,
        conversationRecordId: parsedInput.data.conversationRecordId,
        rolePermissionConfig: context.rolePermissionConfig,
      });
      const result = await this.instagramMessageDraftService.saveDraft({
        workspaceId: context.workspaceId,
        workspaceMemberId: context.workspaceMemberId,
        draftId,
        expectedRevision,
        kind: 'REPLY',
        body: parsedInput.data.body,
        creatorRecordId: null,
        conversationRecordId: parsedInput.data.conversationRecordId,
      });
      if (result.status === 'CONFLICT') {
        await this.recordAccessService.assertCanReadDraft({
          workspaceId: context.workspaceId,
          draftId: result.draftId,
          rolePermissionConfig: context.rolePermissionConfig,
        });
      }

      return {
        success: result.status === 'SAVED',
        message:
          result.status === 'SAVED'
            ? 'Instagram reply draft prepared for approval.'
            : 'Instagram reply draft changed; review the latest revision.',
        result,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Instagram reply draft could not be prepared.',
        error:
          error instanceof Error
            ? error.message
            : 'Instagram reply draft could not be prepared.',
      };
    }
  }
}
