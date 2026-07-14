jest.mock('src/engine/core-modules/user/services/user.service', () => ({
  UserService: class UserService {},
}));

jest.mock(
  'src/engine/core-modules/user-workspace/user-workspace.service',
  () => ({
    UserWorkspaceService: class UserWorkspaceService {},
  }),
);

import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { UserResolver } from 'src/engine/core-modules/user/user.resolver';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

const createResolver = (
  myahTeamAuthorizationService: Pick<
    MyahTeamAuthorizationService,
    'isMyahTeamMember'
  >,
): UserResolver =>
  new UserResolver(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    myahTeamAuthorizationService as MyahTeamAuthorizationService,
  );

describe('UserResolver', () => {
  describe('isMyahTeamMember', () => {
    it('returns the server-authorized Team membership claim', () => {
      const user = { email: 'operator@t3labs.io' } as UserEntity;
      const myahTeamAuthorizationService = {
        isMyahTeamMember: jest.fn().mockReturnValue(false),
      };
      const resolver = createResolver(myahTeamAuthorizationService);

      expect(resolver.isMyahTeamMember(user)).toBe(false);
      expect(
        myahTeamAuthorizationService.isMyahTeamMember,
      ).toHaveBeenCalledWith(user);
    });
  });
});
