import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type Repository } from 'typeorm';

import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';
import { SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { EmailWorkflowActionBase } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/email-workflow-action.base';
import { isWorkflowSendEmailAction } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/guards/is-workflow-send-email-action.guard';
import { type EmailStepLogMode } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/utils/build-email-step-log.util';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

@Injectable()
export class SendEmailWorkflowAction extends EmailWorkflowActionBase {
  constructor(
    private readonly sendEmailTool: SendEmailTool,
    workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    externalWritePolicyService: ExternalWritePolicyService,
    globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {
    super(
      SendEmailWorkflowAction.name,
      workflowRunStepLogService,
      externalWritePolicyService,
      globalWorkspaceOrmManager,
      connectedAccountRepository,
      userWorkspaceRepository,
    );
  }

  protected getTool(): Tool {
    return this.sendEmailTool;
  }

  protected getToolName(): string {
    return 'send_email';
  }
  protected getMode(): EmailStepLogMode {
    return 'SEND';
  }

  protected assertStep(step: WorkflowAction): void {
    if (!isWorkflowSendEmailAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a send-email action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }
  }
}
