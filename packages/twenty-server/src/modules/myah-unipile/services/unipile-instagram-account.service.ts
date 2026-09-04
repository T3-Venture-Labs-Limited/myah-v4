import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, type EntityManager, type Repository } from 'typeorm';

import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { UnipileHostedAuthAttemptOperation } from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import {
  UnipileInstagramAccountBindingEntity,
  UnipileInstagramAccountBindingStatus,
} from 'src/modules/myah-unipile/entities/unipile-instagram-account-binding.entity';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';

import { UnipileInstagramAccountFinalizationLockService } from 'src/modules/myah-unipile/services/unipile-instagram-account-finalization-lock.service';
import { UnipileInstagramAccountProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-account-projection.service';
import {
  UnipileReadError,
  UnipileV1ClientService,
} from 'src/modules/myah-unipile/services/unipile-v1-client.service';
import { type UnipileInstagramAccount } from 'src/modules/myah-unipile/types/unipile-v1.type';
import { mapUnipileAccountStatus } from 'src/modules/myah-unipile/utils/map-unipile-account-status.util';

export type WorkspaceInstagramAccountStatus = {
  id: string;
  username: string | null;
  status: UnipileInstagramAccountBindingStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
};

@Injectable()
export class UnipileInstagramAccountService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- Provider identity checks and recovery cross workspace boundaries.
    @InjectRepository(UnipileInstagramAccountBindingEntity)
    private readonly bindingRepository: Repository<UnipileInstagramAccountBindingEntity>,
    private readonly projectionService: UnipileInstagramAccountProjectionService,
    private readonly accountClient: UnipileV1ClientService,
    private readonly finalizationLockService: UnipileInstagramAccountFinalizationLockService,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
  ) {}

  async getWorkspaceAccountStatus(
    workspaceId: string,
  ): Promise<WorkspaceInstagramAccountStatus | null> {
    this.availabilityService.assertEnabled();

    const binding =
      (await this.bindingRepository.findOne({
        where: { workspaceId, deactivatedAt: IsNull() },
      })) ??
      (await this.bindingRepository.findOne({
        where: {
          workspaceId,
          status: UnipileInstagramAccountBindingStatus.INACTIVE,
          deactivatedAt: Not(IsNull()),
        },
        order: { deactivatedAt: 'DESC' },
      }));

    if (!binding) {
      return null;
    }

    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new ConflictException('Unable to read Instagram account status');
    }

    const accountStatus = await this.projectionService.getAccountStatus({
      workspace,
      workspaceInstagramAccountRecordId:
        binding.workspaceInstagramAccountRecordId,
    });

    if (!accountStatus) {
      return null;
    }

    const { id, username, lastCheckedAt, lastError } = accountStatus;

    return {
      id,
      username,
      status: binding.status,
      lastCheckedAt,
      lastError,
    };
  }

  async finalizeHostedAuthConnection(input: {
    attemptId: string;
    workspaceId: string;
    userWorkspaceId: string | null;
    operation: UnipileHostedAuthAttemptOperation;
    expectedBindingId: string | null;
    account: UnipileInstagramAccount;
    coreManager?: EntityManager;
  }): Promise<void> {
    this.availabilityService.assertEnabled();

    return this.finalizationLockService.withLock(
      {
        workspaceId: input.workspaceId,
        unipileAccountId: input.account.accountId,
        instagramUserId: input.account.instagramUserId,
      },
      async (manager) => {
        const workspaceRepository = manager.getRepository(WorkspaceEntity);
        const bindingRepository = manager.getRepository(
          UnipileInstagramAccountBindingEntity,
        );
        if (input.operation === UnipileHostedAuthAttemptOperation.RECONNECT) {
          if (!input.expectedBindingId) {
            throw new ConflictException(
              'Unable to finalize Instagram account connection',
            );
          }

          const binding = await bindingRepository.findOne({
            where: { id: input.expectedBindingId },
          });

          if (
            !binding ||
            binding.workspaceId !== input.workspaceId ||
            binding.unipileAccountId !== input.account.accountId ||
            binding.instagramUserId !== input.account.instagramUserId ||
            binding.deactivatedAt !== null ||
            (binding.status !==
              UnipileInstagramAccountBindingStatus.NEEDS_RECONNECT &&
              binding.status !== UnipileInstagramAccountBindingStatus.ERROR)
          ) {
            throw new ConflictException(
              'Unable to finalize Instagram account connection',
            );
          }

          const workspace = await workspaceRepository.findOne({
            where: { id: input.workspaceId },
          });

          if (!workspace) {
            throw new ConflictException(
              'Unable to finalize Instagram account connection',
            );
          }

          const status = mapUnipileAccountStatus(input.account.sourceStatus);

          await this.projectionService.upsertVerifiedAccount({
            workspace,
            account: input.account,
            status,
          });

          binding.connectedByUserWorkspaceId = input.userWorkspaceId;
          binding.status = status;
          binding.deactivatedAt = null;

          await bindingRepository.save(binding);

          return;
        }

        if (input.operation !== UnipileHostedAuthAttemptOperation.CREATE) {
          throw new ConflictException(
            'Unable to finalize Instagram account connection',
          );
        }

        const workspace = await workspaceRepository.findOne({
          where: { id: input.workspaceId },
        });

        if (!workspace) {
          throw new ConflictException(
            'Unable to finalize Instagram account connection',
          );
        }

        const ownerBinding = await bindingRepository.findOne({
          where: {
            instagramUserId: input.account.instagramUserId,
            deactivatedAt: IsNull(),
          },
        });

        if (ownerBinding) {
          if (
            ownerBinding.workspaceId === input.workspaceId &&
            ownerBinding.unipileAccountId === input.account.accountId &&
            ownerBinding.instagramUserId === input.account.instagramUserId &&
            ownerBinding.deactivatedAt === null &&
            ownerBinding.status !==
              UnipileInstagramAccountBindingStatus.INACTIVE
          ) {
            return;
          }

          throw new ConflictException(
            'Unable to finalize Instagram account connection',
          );
        }

        const currentWorkspaceBinding = await bindingRepository.findOne({
          where: {
            workspaceId: input.workspaceId,
            deactivatedAt: IsNull(),
          },
        });

        if (currentWorkspaceBinding) {
          throw new ConflictException(
            'Unable to finalize Instagram account connection',
          );
        }

        const status = mapUnipileAccountStatus(input.account.sourceStatus);
        const workspaceInstagramAccountRecordId =
          await this.projectionService.upsertVerifiedAccount({
            workspace,
            account: input.account,
            status,
          });

        const binding = bindingRepository.create({
          workspaceId: input.workspaceId,
          workspaceInstagramAccountRecordId,
          unipileAccountId: input.account.accountId,
          instagramUserId: input.account.instagramUserId,
          connectedByUserWorkspaceId: input.userWorkspaceId,
          status,
          deactivatedAt: null,
        });

        await bindingRepository.save(binding);
      },
      input.coreManager,
    );
  }

  async disconnectAccount(input: {
    workspaceId: string;
    userWorkspaceId: string;
  }): Promise<{ status: 'DISCONNECTED' | 'PENDING_RECOVERY' }> {
    this.availabilityService.assertEnabled();

    const binding = await this.bindingRepository.findOne({
      where: {
        workspaceId: input.workspaceId,
        status: Not(UnipileInstagramAccountBindingStatus.INACTIVE),
        deactivatedAt: IsNull(),
      },
    });

    if (!binding) {
      throw new ConflictException('Unable to disconnect Instagram account');
    }

    return this.finalizationLockService.withSessionLock(
      {
        workspaceId: input.workspaceId,
        unipileAccountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
      },
      async (queryRunner) => {
        const marker = await queryRunner.manager.transaction(
          async (manager) => {
            const workspaceRepository = manager.getRepository(WorkspaceEntity);
            const bindingRepository = manager.getRepository(
              UnipileInstagramAccountBindingEntity,
            );
            const currentBinding = await bindingRepository.findOne({
              where: {
                id: binding.id,
                workspaceId: input.workspaceId,
                status: binding.status,
                deactivatedAt: IsNull(),
              },
            });

            if (
              !currentBinding ||
              currentBinding.unipileAccountId !== binding.unipileAccountId ||
              currentBinding.instagramUserId !== binding.instagramUserId
            ) {
              throw new ConflictException(
                'Unable to disconnect Instagram account',
              );
            }

            const workspace = await workspaceRepository.findOne({
              where: { id: input.workspaceId },
            });

            if (!workspace) {
              throw new ConflictException(
                'Unable to disconnect Instagram account',
              );
            }

            const disconnectMarkerPersisted =
              currentBinding.status ===
              UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN;

            if (!disconnectMarkerPersisted) {
              currentBinding.status =
                UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN;
              currentBinding.deactivatedAt = null;

              await bindingRepository.save(currentBinding);
            }

            return { binding: currentBinding, workspace };
          },
        );

        await this.projectionService.markAccountStatus({
          workspace: marker.workspace,
          workspaceInstagramAccountRecordId:
            marker.binding.workspaceInstagramAccountRecordId,
          status: UnipileInstagramAccountBindingStatus.ERROR,
          lastError: 'Unable to disconnect Instagram account',
        });

        const outcome = await this.accountClient.deleteAccount(
          marker.binding.unipileAccountId,
          {
            beforeDispatch: async () => {
              if (
                marker.binding.status !==
                UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN
              ) {
                throw new ConflictException(
                  'Unable to disconnect Instagram account',
                );
              }
            },
          },
        );

        const completeDisconnect = async (
          status: UnipileInstagramAccountBindingStatus,
          deactivatedAt: Date | null,
        ) => {
          await queryRunner.manager.transaction(async (manager) => {
            const bindingRepository = manager.getRepository(
              UnipileInstagramAccountBindingEntity,
            );
            const currentBinding = await bindingRepository.findOne({
              where: {
                id: marker.binding.id,
                workspaceId: input.workspaceId,
                status: UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN,
                deactivatedAt: IsNull(),
              },
            });

            if (
              !currentBinding ||
              currentBinding.unipileAccountId !==
                marker.binding.unipileAccountId ||
              currentBinding.instagramUserId !== marker.binding.instagramUserId
            ) {
              throw new ConflictException(
                'Unable to disconnect Instagram account',
              );
            }

            currentBinding.status = status;
            currentBinding.deactivatedAt = deactivatedAt;

            await bindingRepository.save(currentBinding);
          });
        };

        if (
          outcome.kind === 'ACCEPTED' ||
          (outcome.kind === 'KNOWN_REJECTION' && outcome.status === 404)
        ) {
          await this.projectionService.markAccountStatus({
            workspace: marker.workspace,
            workspaceInstagramAccountRecordId:
              marker.binding.workspaceInstagramAccountRecordId,
            status: UnipileInstagramAccountBindingStatus.INACTIVE,
            lastError: null,
          });
          await completeDisconnect(
            UnipileInstagramAccountBindingStatus.INACTIVE,
            new Date(),
          );

          return { status: 'DISCONNECTED' as const };
        }

        if (outcome.kind === 'UNKNOWN') {
          return { status: 'PENDING_RECOVERY' as const };
        }

        await this.projectionService.markAccountStatus({
          workspace: marker.workspace,
          workspaceInstagramAccountRecordId:
            marker.binding.workspaceInstagramAccountRecordId,
          status: UnipileInstagramAccountBindingStatus.ERROR,
          lastError: 'Unable to disconnect Instagram account',
        });
        await completeDisconnect(
          UnipileInstagramAccountBindingStatus.ERROR,
          null,
        );

        throw new ConflictException('Unable to disconnect Instagram account');
      },
    );
  }

  async reconcileUnknownDisconnect(bindingId: string): Promise<void> {
    this.availabilityService.assertEnabled();

    const binding = await this.bindingRepository.findOne({
      where: {
        id: bindingId,
        status: UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN,
      },
    });

    if (!binding) {
      return;
    }

    let accountStillExists = false;
    try {
      const account = await this.accountClient.getAccount(
        binding.unipileAccountId,
      );

      if (account.accountId !== binding.unipileAccountId) {
        return;
      }

      accountStillExists = true;
    } catch (error) {
      if (!this.isAccountNotFoundError(error)) {
        return;
      }

      accountStillExists = false;
    }

    return this.finalizationLockService.withLock(
      {
        workspaceId: binding.workspaceId,
        unipileAccountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
      },
      async (manager) => {
        const workspaceRepository = manager.getRepository(WorkspaceEntity);
        const bindingRepository = manager.getRepository(
          UnipileInstagramAccountBindingEntity,
        );
        const currentBinding = await bindingRepository.findOne({
          where: {
            id: bindingId,
            status: UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN,
          },
        });

        if (
          !currentBinding ||
          currentBinding.workspaceId !== binding.workspaceId ||
          currentBinding.unipileAccountId !== binding.unipileAccountId ||
          currentBinding.instagramUserId !== binding.instagramUserId ||
          currentBinding.deactivatedAt !== null
        ) {
          return;
        }

        const workspace = await workspaceRepository.findOne({
          where: { id: currentBinding.workspaceId },
        });

        if (!workspace) {
          return;
        }

        await this.markDisconnectStatus({
          bindingRepository,
          binding: currentBinding,
          workspace,
          status: accountStillExists
            ? UnipileInstagramAccountBindingStatus.ERROR
            : UnipileInstagramAccountBindingStatus.INACTIVE,
          deactivatedAt: accountStillExists ? null : new Date(),
          projectionStatus: accountStillExists
            ? UnipileInstagramAccountBindingStatus.ERROR
            : UnipileInstagramAccountBindingStatus.INACTIVE,
          lastError: accountStillExists
            ? 'Unable to disconnect Instagram account'
            : null,
        });
      },
    );
  }

  async reconcileConnectingAccount(bindingId: string): Promise<void> {
    this.availabilityService.assertEnabled();

    const binding = await this.bindingRepository.findOne({
      where: {
        id: bindingId,
        status: UnipileInstagramAccountBindingStatus.CONNECTING,
      },
    });

    if (!binding) {
      return;
    }

    let account: UnipileInstagramAccount | null = null;
    let shouldMarkError = false;
    try {
      account = await this.accountClient.getAccount(binding.unipileAccountId);
    } catch (error) {
      if (
        !this.isAccountNotFoundError(error) &&
        (!(error instanceof UnipileReadError) || error.retryable)
      ) {
        return;
      }

      shouldMarkError = true;
    }

    return this.finalizationLockService.withLock(
      {
        workspaceId: binding.workspaceId,
        unipileAccountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
      },
      async (manager) => {
        const workspaceRepository = manager.getRepository(WorkspaceEntity);
        const bindingRepository = manager.getRepository(
          UnipileInstagramAccountBindingEntity,
        );
        const currentBinding = await bindingRepository.findOne({
          where: {
            id: bindingId,
            status: UnipileInstagramAccountBindingStatus.CONNECTING,
          },
        });

        if (
          !currentBinding ||
          currentBinding.workspaceId !== binding.workspaceId ||
          currentBinding.unipileAccountId !== binding.unipileAccountId ||
          currentBinding.instagramUserId !== binding.instagramUserId ||
          currentBinding.deactivatedAt !== null
        ) {
          return;
        }

        const workspace = await workspaceRepository.findOne({
          where: { id: currentBinding.workspaceId },
        });

        if (!workspace) {
          return;
        }

        if (
          shouldMarkError ||
          !account ||
          account.accountId !== currentBinding.unipileAccountId ||
          account.instagramUserId !== currentBinding.instagramUserId
        ) {
          await this.markDisconnectStatus({
            bindingRepository,
            binding: currentBinding,
            workspace,
            status: UnipileInstagramAccountBindingStatus.ERROR,
            projectionStatus: UnipileInstagramAccountBindingStatus.ERROR,
            deactivatedAt: null,
            lastError: 'Unable to verify Instagram account connection',
          });

          return;
        }

        const status = mapUnipileAccountStatus(account.sourceStatus);
        await this.projectionService.upsertVerifiedAccount({
          workspace,
          account,
          status,
        });

        currentBinding.status = status;
        await bindingRepository.save(currentBinding);
      },
    );
  }

  private async markDisconnectStatus(input: {
    bindingRepository: Repository<UnipileInstagramAccountBindingEntity>;
    binding: UnipileInstagramAccountBindingEntity;
    workspace: WorkspaceEntity;
    status: UnipileInstagramAccountBindingStatus;
    projectionStatus: UnipileInstagramAccountBindingStatus;
    deactivatedAt: Date | null;
    lastError: string | null;
  }): Promise<void> {
    if (input.status === UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN) {
      input.binding.status = input.status;
      input.binding.deactivatedAt = input.deactivatedAt;

      await input.bindingRepository.save(input.binding);
    }

    await this.projectionService.markAccountStatus({
      workspace: input.workspace,
      workspaceInstagramAccountRecordId:
        input.binding.workspaceInstagramAccountRecordId,
      status: input.projectionStatus,
      lastError: input.lastError,
    });

    if (input.status !== UnipileInstagramAccountBindingStatus.DELETE_UNKNOWN) {
      input.binding.status = input.status;
      input.binding.deactivatedAt = input.deactivatedAt;

      await input.bindingRepository.save(input.binding);
    }
  }

  private isAccountNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const { status, code } = error as {
      status?: unknown;
      code?: unknown;
    };

    return status === 404 && code === 'UNIPILE_ACCOUNT_NOT_FOUND';
  }
}
