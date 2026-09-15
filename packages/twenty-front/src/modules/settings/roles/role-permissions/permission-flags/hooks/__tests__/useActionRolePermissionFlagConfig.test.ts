import { renderHook } from '@testing-library/react';

import { useActionRolePermissionFlagConfig } from '@/settings/roles/role-permissions/permission-flags/hooks/useActionRolePermissionFlagConfig';

const getPermissionKeys = (assignmentCapabilities?: {
  canBeAssignedToAgents?: boolean;
  canBeAssignedToUsers?: boolean;
  canBeAssignedToApiKeys?: boolean;
}) =>
  renderHook(() =>
    useActionRolePermissionFlagConfig({ assignmentCapabilities }),
  ).result.current.map(({ key }) => String(key));

describe('useActionRolePermissionFlagConfig', () => {
  it('makes first Instagram messages assignable only to user roles', () => {
    const userRolePermissionKeys = getPermissionKeys({
      canBeAssignedToUsers: true,
    });
    const agentRolePermissionKeys = getPermissionKeys({
      canBeAssignedToAgents: true,
    });
    const apiKeyRolePermissionKeys = getPermissionKeys({
      canBeAssignedToApiKeys: true,
    });
    const userAndAgentRolePermissionKeys = getPermissionKeys({
      canBeAssignedToAgents: true,
      canBeAssignedToUsers: true,
    });
    const userAndApiKeyRolePermissionKeys = getPermissionKeys({
      canBeAssignedToUsers: true,
      canBeAssignedToApiKeys: true,
    });

    expect(userRolePermissionKeys).toContain(
      'SEND_INSTAGRAM_FIRST_MESSAGE_TOOL',
    );
    expect(agentRolePermissionKeys).not.toContain(
      'SEND_INSTAGRAM_FIRST_MESSAGE_TOOL',
    );
    expect(apiKeyRolePermissionKeys).not.toContain(
      'SEND_INSTAGRAM_FIRST_MESSAGE_TOOL',
    );
    expect(userAndAgentRolePermissionKeys).not.toContain(
      'SEND_INSTAGRAM_FIRST_MESSAGE_TOOL',
    );
    expect(userAndApiKeyRolePermissionKeys).not.toContain(
      'SEND_INSTAGRAM_FIRST_MESSAGE_TOOL',
    );
  });

  it('keeps Instagram reply assignment available to users and agents but not API keys', () => {
    const userRolePermissionKeys = getPermissionKeys({
      canBeAssignedToUsers: true,
    });
    const agentRolePermissionKeys = getPermissionKeys({
      canBeAssignedToAgents: true,
    });
    const apiKeyRolePermissionKeys = getPermissionKeys({
      canBeAssignedToApiKeys: true,
    });

    expect(userRolePermissionKeys).toContain('SEND_INSTAGRAM_REPLY_TOOL');
    expect(agentRolePermissionKeys).toContain('SEND_INSTAGRAM_REPLY_TOOL');
    expect(apiKeyRolePermissionKeys).not.toContain('SEND_INSTAGRAM_REPLY_TOOL');
  });

  it('does not expose Instagram outcome resolution to customer role assignment', () => {
    expect(getPermissionKeys()).not.toContain('RESOLVE_INSTAGRAM_SEND_OUTCOME');
  });
});
