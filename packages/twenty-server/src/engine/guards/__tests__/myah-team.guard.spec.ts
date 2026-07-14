import { type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { type MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { MyahTeamGuard } from 'src/engine/guards/myah-team.guard';

const buildExecutionContext = ({
  user,
}: {
  user?: {
    email?: string | null;
    isEmailVerified?: boolean;
    canAccessFullAdminPanel?: boolean;
    canImpersonate?: boolean;
  };
}) => {
  const mockContext = {
    getContext: jest.fn(() => ({
      req: {
        user,
      },
    })),
  };

  jest
    .spyOn(GqlExecutionContext, 'create')
    .mockReturnValue(mockContext as never);

  return {} as ExecutionContext;
};

describe('MyahTeamGuard', () => {
  const teamAuthorizationService = {
    isMyahTeamMember: jest.fn(),
  } as unknown as jest.Mocked<MyahTeamAuthorizationService>;
  const guard = new MyahTeamGuard(teamAuthorizationService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates authenticated Team identity to the server authorization service', async () => {
    const user = {
      email: 'operator@t3labs.io',
      isEmailVerified: true,
    };
    teamAuthorizationService.isMyahTeamMember.mockReturnValue(true);

    const result = await guard.canActivate(buildExecutionContext({ user }));

    expect(result).toBe(true);
    expect(teamAuthorizationService.isMyahTeamMember).toHaveBeenCalledWith(
      user,
    );
  });

  it('denies a non-Team customer Admin even when legacy instance flags are enabled', async () => {
    const user = {
      email: 'customer@example.com',
      isEmailVerified: true,
      canAccessFullAdminPanel: true,
      canImpersonate: true,
    };
    teamAuthorizationService.isMyahTeamMember.mockReturnValue(false);

    const result = await guard.canActivate(buildExecutionContext({ user }));

    expect(result).toBe(false);
  });

  it('does not grant access without an authenticated Team identity', async () => {
    teamAuthorizationService.isMyahTeamMember.mockReturnValue(false);

    const result = await guard.canActivate(buildExecutionContext({}));

    expect(result).toBe(false);
    expect(teamAuthorizationService.isMyahTeamMember).toHaveBeenCalledWith(
      undefined,
    );
  });
});
