import { PermissionFlagType } from 'twenty-shared/constants';

const mockGetWorkspaceAuthContext = jest.fn();

jest.mock(
  'src/engine/core-modules/auth/storage/workspace-auth-context.storage',
  () => ({
    getWorkspaceAuthContext: () => mockGetWorkspaceAuthContext(),
  }),
);

import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';

const workspaceId = 'workspace-id';
const rolePermissionConfig = { unionOf: ['role-id'] };

describe('InstagramMessagePermissionService', () => {
  beforeEach(() => {
    mockGetWorkspaceAuthContext.mockReturnValue({
      type: 'user',
      workspace: { id: workspaceId },
      userWorkspaceId: 'user-workspace-id',
      workspaceMemberId: 'workspace-member-id',
      user: { id: 'user-id' },
      isInteractiveUserRequest: true,
    });
  });

  it('allows account readiness with either route permission without using settings access', async () => {
    const permissionsService = {
      hasToolPermission: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };
    const service = new InstagramMessagePermissionService(
      permissionsService as never,
    );

    await expect(
      service.canQueryComposerAccount({ workspaceId, rolePermissionConfig }),
    ).resolves.toBe(true);
    expect(permissionsService.hasToolPermission).toHaveBeenCalledTimes(2);
  });

  it.each(['START_CHAT', 'REPLY'] as const)(
    'allows a verified manual human %s send without a role tool grant',
    async (actionKind) => {
      const permissionsService = {
        hasToolPermission: jest.fn().mockResolvedValue(false),
      };
      const service = new InstagramMessagePermissionService(
        permissionsService as never,
      );

      await expect(
        service.canSend({
          actionKind,
          rolePermissionConfig,
          workspaceId,
          manualHumanAccess: {
            userWorkspaceId: 'user-workspace-id',
            workspaceMemberId: 'workspace-member-id',
          },
        }),
      ).resolves.toBe(true);
      expect(permissionsService.hasToolPermission).not.toHaveBeenCalled();
    },
  );

  it.each(['START_CHAT', 'REPLY'] as const)(
    'keeps automated %s sends gated despite an interactive user in scope when manual provenance is absent',
    async (actionKind) => {
      const permissionsService = {
        hasToolPermission: jest.fn().mockResolvedValue(false),
      };
      const service = new InstagramMessagePermissionService(
        permissionsService as never,
      );
      await expect(
        service.canSend({ actionKind, workspaceId, rolePermissionConfig }),
      ).resolves.toBe(false);
      expect(permissionsService.hasToolPermission).toHaveBeenCalledTimes(1);
    },
  );

  it('allows manual account readiness without a route grant for a real human request', async () => {
    const permissionsService = {
      hasToolPermission: jest.fn().mockResolvedValue(false),
    };
    const service = new InstagramMessagePermissionService(
      permissionsService as never,
    );

    await expect(
      service.canQueryComposerAccount({
        rolePermissionConfig,
        workspaceId,
        manualHumanAccess: {
          userWorkspaceId: 'user-workspace-id',
          workspaceMemberId: 'workspace-member-id',
        },
      }),
    ).resolves.toBe(true);
    expect(permissionsService.hasToolPermission).not.toHaveBeenCalled();
  });

  it.each([
    [
      'apiKey',
      'workspace-id',
      'user-workspace-id',
      'workspace-member-id',
      false,
    ],
    [
      'application',
      'workspace-id',
      'user-workspace-id',
      'workspace-member-id',
      true,
    ],
    [
      'system',
      'workspace-id',
      'user-workspace-id',
      'workspace-member-id',
      true,
    ],
    [
      'pendingActivationUser',
      'workspace-id',
      'user-workspace-id',
      'workspace-member-id',
      true,
    ],
    [
      'user',
      'other-workspace',
      'user-workspace-id',
      'workspace-member-id',
      true,
    ],
    ['user', 'workspace-id', 'other-user', 'workspace-member-id', true],
    ['user', 'workspace-id', 'user-workspace-id', 'other-member', true],
    ['user', 'workspace-id', 'user-workspace-id', 'workspace-member-id', false],
  ])(
    'does not grant manual sends to %s with workspace %s, user %s, member %s, interactive %s',
    async (
      type,
      actualWorkspaceId,
      userWorkspaceId,
      workspaceMemberId,
      isInteractiveUserRequest,
    ) => {
      mockGetWorkspaceAuthContext.mockReturnValue({
        type,
        workspace: { id: actualWorkspaceId },
        userWorkspaceId,
        workspaceMemberId,
        user: { id: 'user-id' },
        isInteractiveUserRequest,
      });
      const permissionsService = {
        hasToolPermission: jest.fn().mockResolvedValue(false),
      };
      const service = new InstagramMessagePermissionService(
        permissionsService as never,
      );

      await expect(
        service.canSend({
          actionKind: 'REPLY',
          workspaceId,
          rolePermissionConfig,
          manualHumanAccess: {
            userWorkspaceId: 'user-workspace-id',
            workspaceMemberId: 'workspace-member-id',
          },
        }),
      ).resolves.toBe(false);
      expect(permissionsService.hasToolPermission).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['START_CHAT', PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL],
    ['REPLY', PermissionFlagType.SEND_INSTAGRAM_REPLY_TOOL],
  ] as const)(
    'requires the distinct %s permission at execution',
    async (actionKind, flag) => {
      const permissionsService = {
        hasToolPermission: jest.fn().mockResolvedValue(true),
      };
      const service = new InstagramMessagePermissionService(
        permissionsService as never,
      );

      await expect(
        service.assertCanSend({
          actionKind,
          rolePermissionConfig,
          workspaceId,
        }),
      ).resolves.toBeUndefined();
      expect(permissionsService.hasToolPermission).toHaveBeenCalledWith(
        rolePermissionConfig,
        workspaceId,
        flag,
      );
    },
  );

  it.each(['START_CHAT', 'REPLY'] as const)(
    'fails closed when %s permission is absent',
    async (actionKind) => {
      const service = new InstagramMessagePermissionService({
        hasToolPermission: jest.fn().mockResolvedValue(false),
      } as never);

      await expect(
        service.assertCanSend({
          actionKind,
          rolePermissionConfig,
          workspaceId,
        }),
      ).rejects.toThrow('Instagram message send permission is required');
    },
  );
});
