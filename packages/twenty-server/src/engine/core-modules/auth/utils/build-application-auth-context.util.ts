import { type RawAuthContext } from 'src/engine/core-modules/auth/types/raw-auth-context.type';
import { type ApplicationWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

type ApplicationAuthContextInput = {
  workspace: NonNullable<RawAuthContext['workspace']>;
  application: NonNullable<RawAuthContext['application']>;
  userWorkspaceId?: RawAuthContext['userWorkspaceId'];
  user?: RawAuthContext['user'];
  workspaceMemberId?: RawAuthContext['workspaceMemberId'];
  workspaceMember?: RawAuthContext['workspaceMember'];
  workspaceMetadataVersion?: string;
};

export const buildApplicationAuthContext = (
  input: ApplicationAuthContextInput,
): ApplicationWorkspaceAuthContext => {
  return {
    type: 'application',
    workspace: input.workspace,
    application: input.application,
    userWorkspaceId: input.userWorkspaceId,
    user: input.user ?? undefined,
    workspaceMemberId: input.workspaceMemberId,
    workspaceMember: input.workspaceMember,
    workspaceMetadataVersion: input.workspaceMetadataVersion,
  };
};
