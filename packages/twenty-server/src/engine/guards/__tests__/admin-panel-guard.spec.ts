import { type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { AdminPanelGuard } from 'src/engine/guards/admin-panel-guard';

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

describe('AdminPanelGuard', () => {
  const guard = new AdminPanelGuard();

  beforeEach(() => {
    delete process.env.MYAH_TEAM_ALLOWED_EMAILS;
    delete process.env.MYAH_TEAM_ALLOWED_DOMAINS;
  });

  it('should return true for a Myah Team full admin', async () => {
    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          email: 'operator@t3labs.io',
          canAccessFullAdminPanel: true,
          canImpersonate: false,
        },
      }),
    );

    expect(result).toBe(true);
  });

  it('should return false if user can only impersonate', async () => {
    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          canAccessFullAdminPanel: false,
          canImpersonate: true,
        },
      }),
    );

    expect(result).toBe(false);
  });

  it('should return true for a Myah Team email allowlist match', async () => {
    process.env.MYAH_TEAM_ALLOWED_EMAILS = 'operator@t3labs.io';
    process.env.MYAH_TEAM_ALLOWED_DOMAINS = '';

    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          email: 'Operator@T3Labs.io',
          canAccessFullAdminPanel: false,
          canImpersonate: false,
        },
      }),
    );

    expect(result).toBe(true);
  });

  it('should return true for the default Myah Team t3labs.io domain', async () => {
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

  it('should return false if customer Admin is not a Myah Team user', async () => {
    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          email: 'customer@example.com',
          canAccessFullAdminPanel: false,
          canImpersonate: false,
        },
      }),
    );

    expect(result).toBe(false);
  });
  it('should deny customer Admin even when legacy server flags are enabled', async () => {
    const result = await guard.canActivate(
      buildExecutionContext({
        user: {
          email: 'customer@example.com',
          canAccessFullAdminPanel: true,
          canImpersonate: true,
        },
      }),
    );

    expect(result).toBe(false);
  });
});
