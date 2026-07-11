import { type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { AdminPanelOrImpersonateGuard } from 'src/engine/guards/admin-panel-or-impersonate.guard';
import { ServerLevelImpersonateGuard } from 'src/engine/guards/server-level-impersonate.guard';

const buildExecutionContext = ({
  user,
}: {
  user: {
    email?: string | null;
    canAccessFullAdminPanel: boolean;
    canImpersonate: boolean;
  };
}) => {
  const mockContext = {
    getContext: jest.fn(() => ({
      req: {
        user,
      },
    })),
  };

  jest.spyOn(GqlExecutionContext, 'create').mockReturnValue(mockContext as any);

  return {} as ExecutionContext;
};

describe('Myah Team admin-panel guards', () => {
  beforeEach(() => {
    delete process.env.MYAH_TEAM_ALLOWED_EMAILS;
    delete process.env.MYAH_TEAM_ALLOWED_DOMAINS;
    jest.restoreAllMocks();
  });

  it('allows Myah Team users through read-only admin and impersonation guard without legacy flags', async () => {
    const guard = new AdminPanelOrImpersonateGuard();

    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          email: 'operator@t3labs.io',
          canAccessFullAdminPanel: false,
          canImpersonate: false,
        },
      }),
    );

    expect(result).toBe(true);
  });

  it('allows Myah Team users through server-level impersonation guard without legacy flags', async () => {
    const guard = new ServerLevelImpersonateGuard();

    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          email: 'operator@t3labs.io',
          canAccessFullAdminPanel: false,
          canImpersonate: false,
        },
      }),
    );

    expect(result).toBe(true);
  });
});
