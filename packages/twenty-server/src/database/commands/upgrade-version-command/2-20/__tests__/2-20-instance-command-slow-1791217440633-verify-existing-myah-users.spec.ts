import { VerifyExistingMyahUsersSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-slow-1791217440633-verify-existing-myah-users';

describe('VerifyExistingMyahUsersSlowInstanceCommand', () => {
  const run = async (isEmailVerificationRequired: boolean) => {
    const query = jest.fn();
    await new VerifyExistingMyahUsersSlowInstanceCommand({
      get: (key: string) =>
        key === 'IS_EMAIL_VERIFICATION_REQUIRED'
          ? isEmailVerificationRequired
          : undefined,
    } as never).runDataMigration({ query } as never);
    return query;
  };

  it('verifies existing users before email verification is required', async () => {
    expect(await run(false)).toHaveBeenCalledWith(
      expect.stringContaining('SET "isEmailVerified" = true'),
    );
  });

  it('leaves pending sign-ups alone if it runs after verification is required', async () => {
    expect(await run(true)).not.toHaveBeenCalled();
  });
});
