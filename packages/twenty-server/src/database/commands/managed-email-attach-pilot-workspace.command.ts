import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command, CommandRunner, Option } from 'nest-commander';
import { IsNull, type Repository } from 'typeorm';

import { CustomerAccountService } from 'src/engine/core-modules/customer-account/services/customer-account.service';
import { EventLogEmitterService } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.service';
import { MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT } from 'src/engine/core-modules/event-logs/emit/events/workspace-event/managed-email/managed-email-pilot-workspace-attached';
import { MyahTeamAuthorizationService } from 'src/engine/core-modules/myah/services/myah-team-authorization.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export type ManagedEmailAttachPilotWorkspaceOptions = {
  operatorEmail?: string;
  reason?: string;
  sourceWorkspaceId?: string;
  targetWorkspaceId?: string;
};

type ManagedEmailPilotWorkspaceAttachmentReceipt = {
  attachmentCreated: boolean;
  event: typeof MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT;
  operatorUserId: string;
  reason: string;
  receiptId: string;
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
};

@Command({
  name: 'managed-email:attach-pilot-workspace',
  description:
    'Attach one Myah-Team pilot workspace to an existing customer account and record an audit receipt. Idempotent.',
})
export class ManagedEmailAttachPilotWorkspaceCommand extends CommandRunner {
  private readonly logger = new Logger(
    ManagedEmailAttachPilotWorkspaceCommand.name,
  );

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly customerAccountService: CustomerAccountService,
    private readonly myahTeamAuthorizationService: MyahTeamAuthorizationService,
    private readonly eventLogEmitterService: EventLogEmitterService,
  ) {
    super();
  }

  @Option({
    flags: '--operator-email <email>',
    description: 'Verified Myah-Team operator email',
  })
  parseOperatorEmail(value: string): string {
    return value;
  }

  @Option({
    flags: '--source-workspace-id <workspace-id>',
    description: 'Workspace with the existing customer account installation',
  })
  parseSourceWorkspaceId(value: string): string {
    return value;
  }

  @Option({
    flags: '--target-workspace-id <workspace-id>',
    description: 'Pilot workspace to attach',
  })
  parseTargetWorkspaceId(value: string): string {
    return value;
  }

  @Option({
    flags: '--reason <reason>',
    description: 'Non-sensitive reason recorded in the audit receipt',
  })
  parseReason(value: string): string {
    return value;
  }

  async run(
    _passedParams: string[],
    options: ManagedEmailAttachPilotWorkspaceOptions,
  ): Promise<void> {
    const operatorEmail = this.required(
      options.operatorEmail,
      'Managed email pilot operator email is required',
    ).toLowerCase();
    const reason = this.required(
      options.reason,
      'Managed email pilot reason is required',
    );
    const sourceWorkspaceId = this.required(
      options.sourceWorkspaceId,
      'Managed email pilot source workspace ID is required',
    );
    const targetWorkspaceId = this.required(
      options.targetWorkspaceId,
      'Managed email pilot target workspace ID is required',
    );
    const operator = await this.userRepository.findOneBy({
      deletedAt: IsNull(),
      disabled: false,
      email: operatorEmail,
    });

    if (
      operator === null ||
      !this.myahTeamAuthorizationService.isMyahTeamMember(operator)
    ) {
      throw new Error('Managed email pilot operator is not authorized');
    }

    const [targetExists, sourceMembership, targetMembership] =
      await Promise.all([
        this.workspaceRepository.existsBy({ id: targetWorkspaceId }),
        this.userWorkspaceRepository.existsBy({
          deletedAt: IsNull(),
          userId: operator.id,
          workspaceId: sourceWorkspaceId,
        }),
        this.userWorkspaceRepository.existsBy({
          deletedAt: IsNull(),
          userId: operator.id,
          workspaceId: targetWorkspaceId,
        }),
      ]);

    if (!targetExists) {
      throw new Error('Managed email pilot target workspace was not found');
    }
    if (!sourceMembership || !targetMembership) {
      throw new Error(
        'Managed email pilot operator is not a member of both workspaces',
      );
    }

    const sourceInstallation =
      await this.customerAccountService.getWorkspaceInstallation(
        sourceWorkspaceId,
      );

    if (sourceInstallation === null) {
      throw new Error('Managed email pilot source installation was not found');
    }

    if (!this.eventLogEmitterService.isEnabled()) {
      throw new Error('Managed email pilot audit storage is disabled');
    }

    const { created: attachmentCreated } =
      await this.customerAccountService.attachWorkspace({
        customerAccountId: sourceInstallation.customerAccountId,
        workspaceId: targetWorkspaceId,
      });

    const receipt: ManagedEmailPilotWorkspaceAttachmentReceipt = {
      attachmentCreated,
      event: MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT,
      operatorUserId: operator.id,
      reason,
      receiptId: createHash('sha256')
        .update(
          JSON.stringify([
            'managed-email-pilot-workspace-attachment-v1',
            operator.id,
            sourceWorkspaceId,
            targetWorkspaceId,
            sourceInstallation.customerAccountId,
            reason,
          ]),
        )
        .digest('hex'),
      sourceWorkspaceId,
      targetWorkspaceId,
    };
    const eventResult = await this.eventLogEmitterService
      .createContext({
        userId: operator.id,
        workspaceId: targetWorkspaceId,
      })
      .insertWorkspaceEvent(MANAGED_EMAIL_PILOT_WORKSPACE_ATTACHED_EVENT, {
        attachmentCreated: receipt.attachmentCreated,
        reason,
        receiptId: receipt.receiptId,
        sourceWorkspaceId,
        targetWorkspaceId,
      });

    if (!eventResult.success) {
      throw new Error(
        'Managed email pilot audit receipt could not be recorded',
      );
    }

    this.logger.log(JSON.stringify(receipt));
  }

  private required(value: string | undefined, message: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new Error(message);
    }

    return normalized;
  }
}
