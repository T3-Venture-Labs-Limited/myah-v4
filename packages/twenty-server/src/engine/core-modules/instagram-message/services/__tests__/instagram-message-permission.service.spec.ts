import { PermissionFlagType } from 'twenty-shared/constants';

import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';

const workspaceId = 'workspace-id';
const rolePermissionConfig = { unionOf: ['role-id'] };

describe('InstagramMessagePermissionService', () => {
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
