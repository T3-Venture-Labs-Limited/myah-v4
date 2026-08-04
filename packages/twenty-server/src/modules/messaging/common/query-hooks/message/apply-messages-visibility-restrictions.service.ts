import { Injectable } from '@nestjs/common';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MessageVisibilityPolicyService } from 'src/modules/messaging/common/query-hooks/message/message-visibility-policy.service';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

@Injectable()
export class ApplyMessagesVisibilityRestrictionsService {
  constructor(
    private readonly messageVisibilityPolicyService: MessageVisibilityPolicyService,
  ) {}

  public applyMessagesVisibilityRestrictions(
    messages: MessageWorkspaceEntity[],
    authContext: WorkspaceAuthContext,
  ): Promise<MessageWorkspaceEntity[]> {
    return this.messageVisibilityPolicyService.applyMessagesVisibility(
      messages,
      authContext,
    );
  }
}
