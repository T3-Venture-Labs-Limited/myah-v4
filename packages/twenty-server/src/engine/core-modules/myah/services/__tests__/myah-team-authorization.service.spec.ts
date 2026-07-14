import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';

const createService = ({
  allowedDomains,
  allowedEmails,
  isEmailVerificationRequired,
}: {
  allowedDomains?: string;
  allowedEmails?: string;
  isEmailVerificationRequired?: boolean;
}) => {
  const twentyConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'MYAH_TEAM_ALLOWED_DOMAINS') {
        return allowedDomains;
      }
      if (key === 'MYAH_TEAM_ALLOWED_EMAILS') {
        return allowedEmails;
      }
      if (key === 'IS_EMAIL_VERIFICATION_REQUIRED') {
        return isEmailVerificationRequired;
      }

      return undefined;
    }),
  } as unknown as TwentyConfigService;

  return new MyahTeamAuthorizationService(twentyConfigService);
};

describe('MyahTeamAuthorizationService', () => {
  const configuredDomainUser = {
    email: '  operator@T3Labs.io ',
    isEmailVerified: true,
  };

  it('allows an exact configured domain after normalization', () => {
    const service = createService({
      allowedDomains: ' other.example, T3LABS.IO ',
      isEmailVerificationRequired: true,
    });

    expect(service.isMyahTeamMember(configuredDomainUser)).toBe(true);
  });

  it('allows an exact configured email without a configured domain after normalization', () => {
    const service = createService({
      allowedEmails: ' other@example.com, OPERATOR@T3LABS.IO, ,',
      isEmailVerificationRequired: true,
    });

    expect(service.isMyahTeamMember(configuredDomainUser)).toBe(true);
  });

  it('denies a non-matching exact email when no domain is configured', () => {
    const service = createService({
      allowedEmails: 'other@t3labs.io',
      isEmailVerificationRequired: false,
    });

    expect(service.isMyahTeamMember(configuredDomainUser)).toBe(false);
  });

  it('ignores empty exact-email configuration items', () => {
    const service = createService({
      allowedEmails: ' , , ',
      isEmailVerificationRequired: false,
    });

    expect(service.isMyahTeamMember(configuredDomainUser)).toBe(false);
  });

  it('fails closed when no Team domain is configured', () => {
    const service = createService({ isEmailVerificationRequired: false });

    expect(service.isMyahTeamMember(configuredDomainUser)).toBe(false);
  });

  it('does not assume t3labs.io when the deployment has not configured it', () => {
    const service = createService({
      allowedDomains: 'other.example',
      isEmailVerificationRequired: false,
    });

    expect(service.isMyahTeamMember(configuredDomainUser)).toBe(false);
  });

  it.each([
    'operator@t3labs.io.attacker.com',
    'operator+t3labs.io@example.com',
    'operator@@t3labs.io',
    'not-an-email',
    '',
  ])('rejects malformed and lookalike email %s', (email) => {
    const service = createService({
      allowedDomains: 't3labs.io',
      isEmailVerificationRequired: false,
    });

    expect(service.isMyahTeamMember({ email, isEmailVerified: true })).toBe(
      false,
    );
  });

  it.each(['operator@@t3labs.io', 'not-an-email', ''])(
    'rejects malformed exact-email match %s',
    (email) => {
      const service = createService({
        allowedEmails: email,
        isEmailVerificationRequired: false,
      });

      expect(service.isMyahTeamMember({ email, isEmailVerified: true })).toBe(
        false,
      );
    },
  );

  it('requires a verified email when global verification is enabled', () => {
    const service = createService({
      allowedDomains: 't3labs.io',
      isEmailVerificationRequired: true,
    });

    expect(
      service.isMyahTeamMember({
        email: 'operator@t3labs.io',
        isEmailVerified: false,
      }),
    ).toBe(false);
    expect(
      service.isMyahTeamMember({
        email: 'operator@t3labs.io',
        isEmailVerified: true,
      }),
    ).toBe(true);
  });

  it('requires verification for an exact allowed email when global verification is enabled', () => {
    const service = createService({
      allowedEmails: 'operator@t3labs.io',
      isEmailVerificationRequired: true,
    });

    expect(
      service.isMyahTeamMember({
        email: 'operator@t3labs.io',
        isEmailVerified: false,
      }),
    ).toBe(false);
  });

  it('defers verification enforcement to the configured global login policy', () => {
    const service = createService({
      allowedDomains: 't3labs.io',
      isEmailVerificationRequired: false,
    });

    expect(
      service.isMyahTeamMember({
        email: 'operator@t3labs.io',
        isEmailVerified: false,
      }),
    ).toBe(true);
  });

  it('allows an unverified exact allowed email when global verification is disabled', () => {
    const service = createService({
      allowedEmails: 'operator@t3labs.io',
      isEmailVerificationRequired: false,
    });

    expect(
      service.isMyahTeamMember({
        email: 'operator@t3labs.io',
        isEmailVerified: false,
      }),
    ).toBe(true);
  });

  it('does not derive Team membership from legacy instance flags', () => {
    const service = createService({
      allowedDomains: 't3labs.io',
      isEmailVerificationRequired: false,
    });
    const legacyFullAdmin = {
      email: 'customer@example.com',
      isEmailVerified: true,
      canAccessFullAdminPanel: true,
      canImpersonate: true,
    };

    expect(service.isMyahTeamMember(legacyFullAdmin)).toBe(false);
  });
});
