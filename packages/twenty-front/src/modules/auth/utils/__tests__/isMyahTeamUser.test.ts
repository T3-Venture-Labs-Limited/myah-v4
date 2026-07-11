import { isMyahTeamUser } from '@/auth/utils/isMyahTeamUser';
import { OnboardingStatus } from '~/generated-metadata/graphql';

const defaultUser = {
  id: 'user-id',
  email: 'customer@example.com',
  supportUserHash: null,
  canAccessFullAdminPanel: false,
  canImpersonate: false,
  onboardingStatus: OnboardingStatus.COMPLETED,
  userVars: {},
  firstName: 'Customer',
  lastName: 'User',
  hasPassword: true,
};

describe('isMyahTeamUser', () => {
  it('should not treat legacy server flags as Myah Team identity', () => {
    expect(
      isMyahTeamUser({
        user: {
          ...defaultUser,
          canAccessFullAdminPanel: true,
          canImpersonate: true,
        },
        allowedEmails: [],
        allowedEmailDomains: [],
      }),
    ).toBe(false);
  });

  it('should match exact allowlisted emails case-insensitively after trimming', () => {
    expect(
      isMyahTeamUser({
        user: {
          ...defaultUser,
          email: '  Zachary@T3Labs.io ',
        },
        allowedEmails: ['zachary@t3labs.io'],
        allowedEmailDomains: [],
      }),
    ).toBe(true);
  });

  it('should match allowlisted domains case-insensitively after trimming', () => {
    expect(
      isMyahTeamUser({
        user: {
          ...defaultUser,
          email: 'zachary+test@T3Labs.io',
        },
        allowedEmailDomains: [' T3LABS.IO '],
        allowedEmails: [],
      }),
    ).toBe(true);
  });

  it('should default to the t3labs.io domain allowlist for Myah Team users', () => {
    expect(
      isMyahTeamUser({
        user: {
          ...defaultUser,
          email: 'operator@t3labs.io',
        },
      }),
    ).toBe(true);
  });

  it.each([
    'user@t3labs.io.attacker.com',
    'user+t3labs.io@example.com',
    'not-an-email',
    '',
  ])('should reject malformed or lookalike email %s', (email) => {
    expect(
      isMyahTeamUser({
        user: {
          ...defaultUser,
          email,
        },
        allowedEmailDomains: ['t3labs.io'],
        allowedEmails: ['zachary@t3labs.io'],
      }),
    ).toBe(false);
  });

  it('should deny customer Admin users whose email is not allowlisted', () => {
    expect(
      isMyahTeamUser({
        user: defaultUser,
        allowedEmailDomains: ['t3labs.io'],
        allowedEmails: ['zachary@t3labs.io'],
      }),
    ).toBe(false);
  });
});
