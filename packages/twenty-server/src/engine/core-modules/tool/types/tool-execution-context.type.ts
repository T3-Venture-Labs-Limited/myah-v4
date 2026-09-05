import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

import { type CodeExecutionStreamEmitter } from 'src/engine/core-modules/tool-provider/interfaces/code-execution-stream-emitter.type';

export type ToolExecutionContext = {
  workspaceId: string;
  userId?: string;
  userWorkspaceId?: string;
  workspaceMemberId?: string;
  threadId?: string;
  rolePermissionConfig?: RolePermissionConfig;
  onCodeExecutionUpdate?: CodeExecutionStreamEmitter;
};
