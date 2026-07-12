import { isDefined } from 'twenty-shared/utils';

import { type CurrentUser } from '@/auth/states/currentUserState';

const DEFAULT_MYAH_TEAM_EMAIL_DOMAINS = ['t3labs.io'];

type MyahTeamUser = Pick<
  CurrentUser,
  'email' | 'canAccessFullAdminPanel' | 'canImpersonate'
>;

type IsMyahTeamUserArgs = {
  user?: MyahTeamUser | null;
  allowedEmails?: string[] | string | null;
  allowedEmailDomains?: string[] | string | null;
};

const normalizeCsv = (
  value: string[] | string | null | undefined,
): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeCsv(entry));
  }

  if (!isDefined(value) || value === '') {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeEmail = (email: string | null | undefined): string | null => {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const emailParts = normalizedEmail.split('@');

  if (emailParts.length !== 2) {
    return null;
  }

  const [localPart, domain] = emailParts;

  if (!localPart || !domain || domain.includes('/')) {
    return null;
  }

  return normalizedEmail;
};

const getEmailDomain = (email: string): string => email.split('@')[1] ?? '';

export const isMyahTeamUser = ({
  user,
  allowedEmails,
  allowedEmailDomains,
}: IsMyahTeamUserArgs): boolean => {
  if (!user) {
    return false;
  }

  const normalizedEmail = normalizeEmail(user.email);

  if (!normalizedEmail) {
    return false;
  }

  const normalizedAllowedEmails = normalizeCsv(allowedEmails);
  const normalizedAllowedEmailDomains = normalizeCsv(
    allowedEmailDomains ?? DEFAULT_MYAH_TEAM_EMAIL_DOMAINS,
  );

  if (normalizedAllowedEmails.includes(normalizedEmail)) {
    return true;
  }

  return normalizedAllowedEmailDomains.includes(
    getEmailDomain(normalizedEmail),
  );
};
