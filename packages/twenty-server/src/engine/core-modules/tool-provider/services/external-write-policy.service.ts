import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isValidUuid } from 'twenty-shared/utils';

import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

export type ExternalWritePolicy = {
  permissionFlag?: PermissionFlagType;
  kind: 'read' | 'preparation' | 'external-write';
  actionName?: 'send_instagram_reply';
};

const EXTERNAL_WRITE_POLICIES: Readonly<Record<string, ExternalWritePolicy>> =
  Object.freeze({
    http_request: {
      permissionFlag: PermissionFlagType.HTTP_REQUEST_TOOL,
      kind: 'external-write',
    },
    send_email: {
      permissionFlag: PermissionFlagType.SEND_EMAIL_TOOL,
      kind: 'external-write',
    },
    draft_email: {
      permissionFlag: PermissionFlagType.SEND_EMAIL_TOOL,
      kind: 'external-write',
    },
    prepare_instagram_reply_draft: {
      permissionFlag: PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
      kind: 'preparation',
    },
    send_instagram_reply: {
      permissionFlag: PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL,
      kind: 'external-write',
      actionName: 'send_instagram_reply',
    },
    create_calendar_event: {
      permissionFlag: PermissionFlagType.CREATE_CALENDAR_EVENT_TOOL,
      kind: 'external-write',
    },
    search_help_center: { kind: 'read' },
    code_interpreter: {
      permissionFlag: PermissionFlagType.CODE_INTERPRETER_TOOL,
      kind: 'read',
    },
    navigate_app: { kind: 'read' },
    extract_json_paths: { kind: 'read' },
    search_output: { kind: 'read' },
  });

@Injectable()
export class ExternalWritePolicyService {
  constructor(private readonly permissionsService: PermissionsService) {}

  async assertExecutable({
    toolName,
    context,
    approvalBindingId,
  }: {
    toolName: string;
    context: ToolProviderContext;
    approvalBindingId?: string;
  }): Promise<void> {
    const policy = EXTERNAL_WRITE_POLICIES[toolName];

    if (!policy) {
      throw new Error(`No policy registered for action tool "${toolName}".`);
    }

    if (
      policy.kind === 'external-write' &&
      (policy.actionName !== 'send_instagram_reply' ||
        !approvalBindingId ||
        !isValidUuid(approvalBindingId))
    ) {
      throw new Error(
        `External write tool "${toolName}" requires an approval binding.`,
      );
    }

    if (!('permissionFlag' in policy)) {
      return;
    }

    const hasPermission = await this.permissionsService.hasToolPermission(
      context.rolePermissionConfig,
      context.workspaceId,
      policy.permissionFlag,
    );

    if (!hasPermission) {
      throw new Error(`Missing permission to execute action tool "${toolName}".`);
    }
  }
}
