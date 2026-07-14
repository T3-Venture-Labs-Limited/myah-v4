import { Injectable } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type UserEntity } from 'src/engine/core-modules/user/user.entity';

type MyahTeamAuthorizationUser = Pick<UserEntity, 'email' | 'isEmailVerified'>;

@Injectable()
export class MyahTeamAuthorizationService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  isMyahTeamMember(
    user: MyahTeamAuthorizationUser | null | undefined,
  ): boolean {
    if (!user) {
      return false;
    }

    const normalizedEmail = user.email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return false;
    }

    const emailParts = normalizedEmail.split('@');

    if (emailParts.length !== 2) {
      return false;
    }

    const [localPart, emailDomain] = emailParts;

    if (!localPart || !emailDomain || emailDomain.includes('/')) {
      return false;
    }

    const isExactEmailAllowed = this.twentyConfigService
      .get('MYAH_TEAM_ALLOWED_EMAILS')
      ?.split(',')
      .some(
        (allowedEmail) => allowedEmail.trim().toLowerCase() === normalizedEmail,
      );

    if (!isExactEmailAllowed) {
      const allowedDomains = this.twentyConfigService
        .get('MYAH_TEAM_ALLOWED_DOMAINS')
        ?.split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean);

      if (!allowedDomains?.includes(emailDomain)) {
        return false;
      }
    }

    return (
      !this.twentyConfigService.get('IS_EMAIL_VERIFICATION_REQUIRED') ||
      user.isEmailVerified === true
    );
  }
}
