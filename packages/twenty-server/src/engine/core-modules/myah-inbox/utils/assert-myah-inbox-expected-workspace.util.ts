import { ForbiddenException } from '@nestjs/common';

// Omission remains compatible with older clients; this never selects a workspace.
export const assertMyahInboxExpectedWorkspace = (
  actualWorkspaceId: string,
  expectedWorkspaceId: string | null | undefined,
): void => {
  if (
    expectedWorkspaceId != null &&
    expectedWorkspaceId !== actualWorkspaceId
  ) {
    throw new ForbiddenException('Inbox workspace changed; reload the Inbox');
  }
};
