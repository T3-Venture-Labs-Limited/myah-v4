import { type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { type MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { MyahTeamWorkspaceModelGuard } from 'src/engine/guards/myah-team-workspace-model.guard';

const buildExecutionContext = ({
  data,
  impersonationContext,
  user,
}: {
  data: {
    displayName?: string;
    enabledAiModelIds?: string[];
    useRecommendedModels?: boolean;
  };
  impersonationContext?: {
    impersonatorUserWorkspaceId?: string;
    impersonatedUserWorkspaceId?: string;
  };
  user?: {
    email: string;
    isEmailVerified: boolean;
  };
}) => {
  const graphqlContext = {
    getArgs: jest.fn(() => ({ data })),
    getContext: jest.fn(() => ({ req: { user, impersonationContext } })),
  };

  jest
    .spyOn(GqlExecutionContext, 'create')
    .mockReturnValue(graphqlContext as never);

  return {} as ExecutionContext;
};

describe('MyahTeamWorkspaceModelGuard', () => {
  const teamAuthorizationService = {
    isMyahTeamMember: jest.fn(),
  } as unknown as jest.Mocked<MyahTeamAuthorizationService>;
  const guard = new MyahTeamWorkspaceModelGuard(teamAuthorizationService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves non-model workspace updates under ordinary workspace permissions', () => {
    const result = guard.canActivate(
      buildExecutionContext({
        data: { displayName: 'Customer workspace' },
        impersonationContext: {
          impersonatorUserWorkspaceId: 'operator-user-workspace-id',
          impersonatedUserWorkspaceId: 'customer-user-workspace-id',
        },
      }),
    );

    expect(result).toBe(true);
    expect(teamAuthorizationService.isMyahTeamMember).not.toHaveBeenCalled();
  });

  it.each([
    ['enabled AI model IDs', { enabledAiModelIds: ['gpt-5.4'] }],
    ['recommended model availability', { useRecommendedModels: false }],
  ])('denies an impersonated Myah Team member changing %s', (_field, data) => {
    teamAuthorizationService.isMyahTeamMember.mockReturnValue(true);

    const result = guard.canActivate(
      buildExecutionContext({
        data,
        user: {
          email: 'operator@t3labs.io',
          isEmailVerified: true,
        },
        impersonationContext: {
          impersonatorUserWorkspaceId: 'operator-user-workspace-id',
          impersonatedUserWorkspaceId: 'customer-user-workspace-id',
        },
      }),
    );

    expect(result).toBe(false);
    expect(teamAuthorizationService.isMyahTeamMember).not.toHaveBeenCalled();
  });

  it('denies model configuration to a non-Team customer Admin', () => {
    teamAuthorizationService.isMyahTeamMember.mockReturnValue(false);

    const result = guard.canActivate(
      buildExecutionContext({
        data: { enabledAiModelIds: ['gpt-5.4'] },
        user: {
          email: 'customer@example.com',
          isEmailVerified: true,
        },
      }),
    );

    expect(result).toBe(false);
  });

  it('allows a verified Myah Team member to change model configuration', () => {
    const user = {
      email: 'operator@t3labs.io',
      isEmailVerified: true,
    };
    teamAuthorizationService.isMyahTeamMember.mockReturnValue(true);

    const result = guard.canActivate(
      buildExecutionContext({
        data: { useRecommendedModels: false },
        user,
      }),
    );

    expect(result).toBe(true);
    expect(teamAuthorizationService.isMyahTeamMember).toHaveBeenCalledWith(
      user,
    );
  });
});
