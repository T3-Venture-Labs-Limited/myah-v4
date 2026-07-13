import { createInstagramAuthorizationLink } from 'src/logic-functions/utils/create-instagram-authorization-link';

const getWorkspaceId = (): string | undefined => {
  const token = process.env.TWENTY_APP_ACCESS_TOKEN;
  const payload = token?.split('.')[1];

  if (!payload) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      workspaceId?: unknown;
    };

    return typeof parsed.workspaceId === 'string' && parsed.workspaceId.length > 0
      ? parsed.workspaceId
      : undefined;
  } catch {
    return undefined;
  }
};

export const connectInstagramHandler = async (): Promise<{
  success: boolean;
  connectedAccountId?: string;
  authorizationUrl?: string;
  error?: string;
}> => {
  const workspaceId = getWorkspaceId();

  if (!workspaceId) {
    return { success: false, error: 'Workspace context is required to connect Instagram.' };
  }

  try {
    const result = await createInstagramAuthorizationLink({ workspaceId });

    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Instagram authorization could not be started.',
    };
  }
};
