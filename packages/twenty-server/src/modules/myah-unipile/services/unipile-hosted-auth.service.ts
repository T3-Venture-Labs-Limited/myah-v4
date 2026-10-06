import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import * as crypto from 'node:crypto';
import {
  In,
  IsNull,
  QueryFailedError,
  type EntityManager,
  type Repository,
} from 'typeorm';

import { WorkspaceDomainsService } from 'src/engine/core-modules/domain/workspace-domains/services/workspace-domains.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { UnipileInstagramSubscriptionLapseJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-subscription-lapse.job';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import {
  UnipileHostedAuthAttemptEntity,
  UnipileHostedAuthAttemptOperation,
  UnipileHostedAuthAttemptStatus,
} from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import {
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { type UnipileInstagramAccount } from 'src/modules/myah-unipile/types/unipile-v1.type';

export const UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER = Symbol(
  'unipileHostedAuthAccountFinalizer',
);

type HostedAuthWorkspace = Pick<
  FlatWorkspace,
  'id' | 'subdomain' | 'customDomain' | 'isCustomDomainEnabled'
>;

type HostedAuthAccountService = {
  finalizeHostedAuthConnection(input: {
    attemptId: string;
    workspaceId: string;
    userWorkspaceId: string | null;
    operation: UnipileHostedAuthAttemptOperation;
    expectedBindingId: string | null;
    account: UnipileInstagramAccount;
    coreManager?: EntityManager;
  }): Promise<void>;
};

class DeferredHostedAuthTerminalizationError extends Error {
  constructor(readonly originalError: QueryFailedError) {
    super('Deferred Hosted Auth terminalization');
  }
}

@Injectable()
export class UnipileHostedAuthService {
  private readonly logger = new Logger(UnipileHostedAuthService.name);

  constructor(
    private readonly myahUsageService: MyahUsageService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly queue: MessageQueueService,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- Public callbacks and recovery resolve attempts without workspace auth context.
    @InjectRepository(UnipileHostedAuthAttemptEntity)
    private readonly attemptRepository: Repository<UnipileHostedAuthAttemptEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- Hosted Auth enforces provider identity globally.
    @InjectRepository(UnipileInstagramAccountBindingEntity)
    private readonly bindingRepository: Repository<UnipileInstagramAccountBindingEntity>,
    private readonly client: UnipileV1ClientService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
    @Optional()
    @Inject(UNIPILE_HOSTED_AUTH_ACCOUNT_FINALIZER)
    private readonly accountService: HostedAuthAccountService | undefined,
    private readonly workspaceDomainsService: WorkspaceDomainsService,
  ) {}

  async createConnectionAttempt({
    workspace,
    userWorkspaceId,
  }: {
    workspace: HostedAuthWorkspace;
    userWorkspaceId: string;
  }): Promise<{ attemptId: string; url: string }> {
    this.availabilityService.assertEnabled();

    await this.myahUsageService.assertCanAct(workspace.id);

    const activeBinding = await this.bindingRepository.findOne({
      where: { workspaceId: workspace.id, deactivatedAt: IsNull() },
    });

    if (activeBinding) {
      throw new ConflictException('Your plan includes one Instagram account.');
    }

    return this.createHostedAuthAttempt({
      workspace,
      userWorkspaceId,
      operation: UnipileHostedAuthAttemptOperation.CREATE,
      expectedBindingId: null,
    });
  }

  async createReconnectAttempt({
    workspace,
    userWorkspaceId,
  }: {
    workspace: HostedAuthWorkspace;
    userWorkspaceId: string;
  }): Promise<{ attemptId: string; url: string }> {
    this.availabilityService.assertEnabled();

    await this.myahUsageService.assertCanAct(workspace.id);

    const bindings = await this.bindingRepository.find({
      where: {
        workspaceId: workspace.id,
        status: In([
          UnipileInstagramAccountBindingStatus.NEEDS_RECONNECT,
          UnipileInstagramAccountBindingStatus.ERROR,
        ]),
      },
    });

    if (bindings.length !== 1) {
      throw new ConflictException('Unable to reconnect Instagram account');
    }

    const binding = bindings[0];
    return this.createHostedAuthAttempt({
      workspace,
      userWorkspaceId,
      operation: UnipileHostedAuthAttemptOperation.RECONNECT,
      expectedBindingId: binding.id,
      reconnectAccountId: binding.unipileAccountId,
    });
  }

  private async createHostedAuthAttempt({
    workspace,
    userWorkspaceId,
    operation,
    expectedBindingId,
    reconnectAccountId,
  }: {
    workspace: HostedAuthWorkspace;
    userWorkspaceId: string;
    operation: UnipileHostedAuthAttemptOperation;
    expectedBindingId: string | null;
    reconnectAccountId?: string;
  }): Promise<{ attemptId: string; url: string }> {
    const attemptId = crypto.randomUUID();
    const callbackSecret = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const attempt = this.attemptRepository.create({
      id: attemptId,
      workspaceId: workspace.id,
      userWorkspaceId,
      operation,
      expectedBindingId,
      callbackSecretHash: crypto
        .createHash('sha256')
        .update(callbackSecret)
        .digest('hex'),
      callbackDigest: null,
      callbackAccountId: null,
      callbackStatus: null,
      status: UnipileHostedAuthAttemptStatus.PENDING,
      expiresAt,
      processedAt: null,
      failureCode: null,
      failureReason: null,
    });

    await this.attemptRepository.save(attempt);

    const callbackBaseUrl =
      this.twentyConfigService.get('UNIPILE_INSTAGRAM_CALLBACK_BASE_URL') ||
      this.twentyConfigService.get('SERVER_URL');
    const input = {
      expiresOn: expiresAt,
      successRedirectUrl: this.workspaceDomainsService
        .buildWorkspaceURL({
          workspace,
          pathname: '/settings/accounts/instagram',
          searchParams: { connection: 'success', attemptId },
        })
        .toString(),
      failureRedirectUrl: this.workspaceDomainsService
        .buildWorkspaceURL({
          workspace,
          pathname: '/settings/accounts/instagram',
          searchParams: { connection: 'failed', attemptId },
        })
        .toString(),
      notifyUrl: `${callbackBaseUrl.replace(/\/+$/, '')}/rest/myah/unipile/instagram/hosted-auth/${attemptId}/notify`,
      name: callbackSecret,
    };
    try {
      const { url } = await this.client.createHostedAuthLink(
        operation === UnipileHostedAuthAttemptOperation.RECONNECT
          ? {
              ...input,
              operation: 'RECONNECT',
              reconnectAccountId: reconnectAccountId as string,
            }
          : input,
      );

      return { attemptId, url };
    } catch (error) {
      attempt.status = UnipileHostedAuthAttemptStatus.FAILED;
      attempt.processedAt = new Date();
      attempt.failureCode = 'HOSTED_AUTH_LINK_UNAVAILABLE';
      attempt.failureReason = 'Unable to start Instagram authorization';

      try {
        await this.attemptRepository.save(attempt);
      } finally {
        throw error;
      }
    }
  }

  async processNotification({
    attemptId,
    name,
    status,
    accountId,
  }: {
    attemptId: string;
    name: string;
    status: 'CREATION_SUCCESS' | 'RECONNECTED';
    accountId: string;
  }): Promise<{ attemptId: string; status: 'COMPLETED' }> {
    this.availabilityService.assertEnabled();

    const callbackDigest = crypto
      .createHash('sha256')
      .update(name)
      .digest('hex');

    await this.attemptRepository.manager.transaction(async (manager) => {
      const attempt = await manager.findOne(UnipileHostedAuthAttemptEntity, {
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!attempt) {
        this.rejectNotification('attempt_missing');
      }

      const isExpectedOperationStatus =
        (attempt.operation === UnipileHostedAuthAttemptOperation.CREATE &&
          status === 'CREATION_SUCCESS') ||
        (attempt.operation === UnipileHostedAuthAttemptOperation.RECONNECT &&
          status === 'RECONNECTED');

      if (!isExpectedOperationStatus) {
        this.rejectNotification('operation_mismatch');
      }

      const isExactReplay =
        attempt.callbackDigest === callbackDigest &&
        attempt.callbackAccountId === accountId &&
        attempt.callbackStatus === status;

      if (
        attempt.status === UnipileHostedAuthAttemptStatus.COMPLETED ||
        attempt.status === UnipileHostedAuthAttemptStatus.PROCESSING
      ) {
        if (!isExactReplay) {
          this.rejectNotification('replay_mismatch');
        }

        return;
      }

      if (attempt.status !== UnipileHostedAuthAttemptStatus.PENDING) {
        this.rejectNotification('attempt_not_pending');
      }
      if (attempt.expiresAt <= new Date()) {
        this.rejectNotification('expired');
      }
      if (attempt.callbackSecretHash !== callbackDigest) {
        this.rejectNotification('secret_mismatch');
      }

      attempt.callbackDigest = callbackDigest;
      attempt.callbackAccountId = accountId;
      attempt.callbackStatus = status;
      attempt.status = UnipileHostedAuthAttemptStatus.PROCESSING;

      await manager.save(attempt);
    });

    const { error } = await this.finalizeStoredProcessingAttempt({
      attemptId,
      callback: {
        digest: callbackDigest,
        accountId,
        status,
      },
      terminalizeMissingAccount: false,
    });

    if (error !== null) {
      throw error;
    }

    await this.enqueueLapseCleanup(attemptId);
    return { attemptId, status: UnipileHostedAuthAttemptStatus.COMPLETED };
  }

  private async enqueueLapseCleanup(attemptId: string) {
    if (!this.twentyConfigService.get('MYAH_SUBSCRIPTION_REQUIRED')) return;
    const attempt = await this.attemptRepository.findOneByOrFail({
      id: attemptId,
    });
    // Authorization can finish after access lapses. Queue only after the binding
    // commits; the job rechecks current access and does nothing when still paid.
    await this.queue.add(
      UnipileInstagramSubscriptionLapseJob.name,
      { workspaceId: attempt.workspaceId },
      { retryLimit: 5 },
    );
  }

  private rejectNotification(
    reason:
      | 'attempt_missing'
      | 'operation_mismatch'
      | 'replay_mismatch'
      | 'attempt_not_pending'
      | 'expired'
      | 'secret_mismatch',
  ): never {
    this.logger.warn(`UNIPILE_HOSTED_AUTH_NOTIFY_REJECTED ${reason}`);
    throw new ConflictException('Unable to process Hosted Auth callback');
  }

  async expirePendingAttempt(attemptId: string): Promise<void> {
    this.availabilityService.assertEnabled();

    await this.attemptRepository.manager.transaction(async (manager) => {
      const attempt = await manager.findOne(UnipileHostedAuthAttemptEntity, {
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();

      if (
        !attempt ||
        attempt.status !== UnipileHostedAuthAttemptStatus.PENDING ||
        attempt.expiresAt > now
      ) {
        return;
      }

      attempt.status = UnipileHostedAuthAttemptStatus.FAILED;
      attempt.processedAt = now;
      attempt.failureCode = 'HOSTED_AUTH_EXPIRED';
      attempt.failureReason = 'Instagram authorization expired';

      await manager.save(attempt);
    });
  }

  async resumeProcessingAttempt(
    attemptId: string,
  ): Promise<{ attemptId: string; status: 'COMPLETED' }> {
    this.availabilityService.assertEnabled();

    const { error } = await this.finalizeStoredProcessingAttempt({
      attemptId,
      terminalizeMissingAccount: true,
    });

    if (error !== null) {
      throw error;
    }

    await this.enqueueLapseCleanup(attemptId);
    return { attemptId, status: UnipileHostedAuthAttemptStatus.COMPLETED };
  }

  async getAttemptStatus({
    attemptId,
    workspaceId,
    userWorkspaceId,
  }: {
    attemptId: string;
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<{
    attemptId: string;
    status: UnipileHostedAuthAttemptStatus;
    failureCode: string | null;
    failureReason: string | null;
  }> {
    this.availabilityService.assertEnabled();

    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, workspaceId, userWorkspaceId },
    });

    if (!attempt) {
      throw new ConflictException('Unable to retrieve Hosted Auth attempt');
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      failureCode: attempt.failureCode,
      failureReason: attempt.failureReason,
    };
  }

  private async finalizeStoredProcessingAttempt({
    attemptId,
    callback,
    terminalizeMissingAccount,
  }: {
    attemptId: string;
    callback?: {
      digest: string;
      accountId: string;
      status: 'CREATION_SUCCESS' | 'RECONNECTED';
    };
    terminalizeMissingAccount: boolean;
  }): Promise<{ error: unknown | null }> {
    try {
      return await this.attemptRepository.manager.transaction(
        async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `unipile-hosted-auth-finalization:${attemptId}`,
          ]);

          const attempt = await manager.findOne(
            UnipileHostedAuthAttemptEntity,
            {
              where: { id: attemptId },
              lock: { mode: 'pessimistic_write' },
            },
          );

          if (!attempt) {
            throw new ConflictException(
              'Unable to process Hosted Auth callback',
            );
          }

          const isExactReplay =
            !callback ||
            (attempt.callbackDigest === callback.digest &&
              attempt.callbackAccountId === callback.accountId &&
              attempt.callbackStatus === callback.status);

          if (attempt.status === UnipileHostedAuthAttemptStatus.COMPLETED) {
            if (!isExactReplay) {
              throw new ConflictException(
                'Unable to process Hosted Auth callback',
              );
            }

            return { error: null };
          }

          const hasExpectedStoredCallback =
            (attempt.operation === UnipileHostedAuthAttemptOperation.CREATE &&
              attempt.callbackStatus === 'CREATION_SUCCESS') ||
            (attempt.operation ===
              UnipileHostedAuthAttemptOperation.RECONNECT &&
              attempt.callbackStatus === 'RECONNECTED');

          if (
            attempt.status !== UnipileHostedAuthAttemptStatus.PROCESSING ||
            !attempt.callbackDigest ||
            !attempt.callbackAccountId ||
            !attempt.callbackStatus ||
            !hasExpectedStoredCallback ||
            !isExactReplay
          ) {
            throw new ConflictException(
              'Unable to process Hosted Auth callback',
            );
          }

          return this.finalizeProcessingAttempt(
            manager,
            attempt,
            terminalizeMissingAccount,
          );
        },
      );
    } catch (error) {
      if (!(error instanceof DeferredHostedAuthTerminalizationError)) {
        throw error;
      }

      await this.terminalizeDeferredFinalization(attemptId);

      return { error: error.originalError };
    }
  }

  private async terminalizeDeferredFinalization(
    attemptId: string,
  ): Promise<void> {
    await this.attemptRepository.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `unipile-hosted-auth-finalization:${attemptId}`,
      ]);

      const attempt = await manager.findOne(UnipileHostedAuthAttemptEntity, {
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!attempt) {
        throw new ConflictException('Unable to process Hosted Auth callback');
      }

      if (attempt.status === UnipileHostedAuthAttemptStatus.PROCESSING) {
        attempt.status = UnipileHostedAuthAttemptStatus.FAILED;
        attempt.processedAt = new Date();
        attempt.failureCode = 'ACCOUNT_FINALIZATION_REJECTED';
        attempt.failureReason =
          'Unable to finalize Instagram account connection';

        await manager.save(attempt);

        return;
      }

      if (
        attempt.status !== UnipileHostedAuthAttemptStatus.FAILED &&
        attempt.status !== UnipileHostedAuthAttemptStatus.COMPLETED
      ) {
        throw new ConflictException('Unable to process Hosted Auth callback');
      }
    });
  }

  private async finalizeProcessingAttempt(
    manager: EntityManager,
    attempt: UnipileHostedAuthAttemptEntity,
    terminalizeMissingAccount: boolean,
  ): Promise<{ error: unknown | null }> {
    if (!this.accountService || !attempt.callbackAccountId) {
      throw new ConflictException('Unable to process Hosted Auth callback');
    }

    try {
      const account = await this.client.getAccount(attempt.callbackAccountId);

      await this.accountService.finalizeHostedAuthConnection({
        attemptId: attempt.id,
        workspaceId: attempt.workspaceId,
        userWorkspaceId: attempt.userWorkspaceId,
        operation: attempt.operation,
        expectedBindingId: attempt.expectedBindingId,
        account,
        coreManager: manager,
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new DeferredHostedAuthTerminalizationError(error);
      }

      if (
        !this.isDeterministicFinalizationError(error, terminalizeMissingAccount)
      ) {
        throw error;
      }

      attempt.status = UnipileHostedAuthAttemptStatus.FAILED;
      attempt.processedAt = new Date();
      attempt.failureCode = 'ACCOUNT_FINALIZATION_REJECTED';
      attempt.failureReason = 'Unable to finalize Instagram account connection';

      await manager.save(attempt);

      return { error };
    }

    attempt.status = UnipileHostedAuthAttemptStatus.COMPLETED;
    attempt.processedAt = new Date();

    await manager.save(attempt);

    return { error: null };
  }

  private isDeterministicFinalizationError(
    error: unknown,
    terminalizeMissingAccount: boolean,
  ): boolean {
    if (
      error instanceof UnipileReadError &&
      error.status === 404 &&
      error.code === 'UNIPILE_ACCOUNT_NOT_FOUND'
    ) {
      return terminalizeMissingAccount;
    }

    return (
      error instanceof ConflictException ||
      (error instanceof UnipileReadError && !error.retryable)
    );
  }

  private isUniqueConstraintViolation(
    error: unknown,
  ): error is QueryFailedError {
    return (
      error instanceof QueryFailedError &&
      error.driverError instanceof Error &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }
}
