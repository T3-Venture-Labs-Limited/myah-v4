import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, type Repository } from 'typeorm';

import {
  UnipileHostedAuthAttemptEntity,
  UnipileHostedAuthAttemptStatus,
} from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileHostedAuthService } from 'src/modules/myah-unipile/services/unipile-hosted-auth.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';

@Injectable()
export class UnipileInstagramAccountRecoveryService {
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- Recovery scans lifecycle rows across workspaces.
    @InjectRepository(UnipileInstagramAccountBindingEntity)
    private readonly bindingRepository: Repository<UnipileInstagramAccountBindingEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- Recovery scans lifecycle rows across workspaces.
    @InjectRepository(UnipileHostedAuthAttemptEntity)
    private readonly hostedAuthAttemptRepository: Repository<UnipileHostedAuthAttemptEntity>,
    private readonly accountService: UnipileInstagramAccountService,
    private readonly hostedAuthService: UnipileHostedAuthService,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
  ) {}

  async recover({ processingBefore }: { processingBefore: Date }): Promise<{
    disconnectRecovered: number;
    hostedRecovered: number;
    failed: number;
  }> {
    await this.availabilityService.assertEnabled();

    const [
      unknownDisconnectBindings,
      connectingBindings,
      staleHostedAuthAttempts,
    ] = await Promise.all([
      this.bindingRepository.find({
        where: {
          status: UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN,
        },
        order: { updatedAt: 'ASC', id: 'ASC' },
        take: 50,
      }),
      this.bindingRepository.find({
        where: {
          status: UnipileInstagramAccountBindingStatus.CONNECTING,
        },
        order: { updatedAt: 'ASC', id: 'ASC' },
        take: 50,
      }),
      this.hostedAuthAttemptRepository.find({
        where: {
          status: UnipileHostedAuthAttemptStatus.PROCESSING,
          updatedAt: LessThan(processingBefore),
        },
        order: { updatedAt: 'ASC', id: 'ASC' },
        take: 50,
      }),
    ]);

    let disconnectRecovered = 0;
    let hostedRecovered = 0;
    let failed = 0;

    for (const binding of unknownDisconnectBindings) {
      try {
        await this.accountService.reconcileUnknownDisconnect(binding.id);
        disconnectRecovered += 1;
      } catch {
        failed += 1;
      }
    }

    for (const binding of connectingBindings) {
      try {
        await this.accountService.reconcileConnectingAccount(binding.id);
      } catch {
        failed += 1;
      }
    }

    for (const attempt of staleHostedAuthAttempts) {
      try {
        await this.hostedAuthService.resumeProcessingAttempt(attempt.id);
        hostedRecovered += 1;
      } catch {
        failed += 1;
      }
    }

    return { disconnectRecovered, hostedRecovered, failed };
  }
}
