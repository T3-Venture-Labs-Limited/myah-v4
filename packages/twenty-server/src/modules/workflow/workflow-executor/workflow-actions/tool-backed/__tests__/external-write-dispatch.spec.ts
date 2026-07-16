import { WorkflowActionType } from 'twenty-shared/workflow';

import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkflowActionFactory } from 'src/modules/workflow/workflow-executor/factories/workflow-action.factory';
import { CreateCalendarEventWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/create-calendar-event/create-calendar-event.workflow-action';
import { HttpRequestWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/http-request/http-request.workflow-action';
import { DraftEmailWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/draft-email.workflow-action';
import { SendEmailWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/send-email.workflow-action';
import { ToolBackedWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/tool-backed/tool-backed.workflow-action';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

const createTool = () => ({
  execute: jest.fn().mockResolvedValue({ result: { ok: true } }),
});

const workflowRunStepLogService = {
  setStepLog: jest.fn(),
} as never;

const buildInput = (type: WorkflowActionType) => ({
  currentStepId: 'step-1',
  steps: [
    {
      id: 'step-1',
      type,
      name: 'External write',
      valid: true,
      settings: {
        input: {
          url: 'https://example.com',
          method: 'POST',
          recipients: { to: 'person@example.com' },
          subject: 'Subject',
        },
        outputSchema: {},
        errorHandlingOptions: {
          retryOnFailure: { value: false },
          continueOnFailure: { value: false },
        },
      },
    } as WorkflowAction,
  ],
  context: {},
  runInfo: { workspaceId: 'workspace-id', workflowRunId: 'run-id' },
});

class TestToolBackedWorkflowAction extends ToolBackedWorkflowAction<never> {
  constructor(
    private readonly tool: { execute: jest.Mock },
    externalWritePolicyService: ExternalWritePolicyService,
  ) {
    super(
      TestToolBackedWorkflowAction.name,
      workflowRunStepLogService,
      externalWritePolicyService,
    );
  }

  protected getTool() {
    return this.tool as never;
  }

  protected getToolName(): string {
    return 'http_request';
  }

  protected assertStep(): void {}

  protected buildStepLog() {
    return {} as never;
  }
}

describe('workflow external write dispatch', () => {
  it('denies the tool-backed base action before Tool.execute', async () => {
    const tool = createTool();
    const externalWritePolicyService = new ExternalWritePolicyService({
      hasToolPermission: jest.fn().mockResolvedValue(true),
    } as never);
    const assertExecutable = jest.spyOn(
      externalWritePolicyService,
      'assertExecutable',
    );
    const action = new TestToolBackedWorkflowAction(
      tool,
      externalWritePolicyService,
    );

    await expect(
      action.execute({
        ...buildInput(WorkflowActionType.HTTP_REQUEST),
        steps: [
          {
            ...buildInput(WorkflowActionType.HTTP_REQUEST).steps[0],
            settings: {
              ...buildInput(WorkflowActionType.HTTP_REQUEST).steps[0].settings,
              input: {},
            },
          },
        ],
      }),
    ).rejects.toThrow('approval binding');

    expect(tool.execute).not.toHaveBeenCalled();
    expect(assertExecutable).toHaveBeenCalledWith({
      toolName: 'http_request',
      context: {
        workspaceId: 'workspace-id',
        roleId: '',
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
      },
    });
  });

  it.each([
    [WorkflowActionType.SEND_EMAIL],
    [WorkflowActionType.DRAFT_EMAIL],
    [WorkflowActionType.CREATE_CALENDAR_EVENT],
    [WorkflowActionType.HTTP_REQUEST],
  ])(
    'denies factory-created %s before Tool.execute',
    async (type) => {
      const tool = createTool();
      const globalWorkspaceOrmManager = {
        executeInWorkspaceContext: jest.fn(),
        getRepository: jest.fn(),
      } as never;
      const connectedAccountRepository = { findOne: jest.fn() } as never;
      const userWorkspaceRepository = { findOne: jest.fn() } as never;
      const externalWritePolicyService = new ExternalWritePolicyService({
        hasToolPermission: jest.fn().mockResolvedValue(true),
      } as never);
      const sendEmailWorkflowAction = new SendEmailWorkflowAction(
        tool as never,
        workflowRunStepLogService,
        externalWritePolicyService,
        globalWorkspaceOrmManager,
        connectedAccountRepository,
        userWorkspaceRepository,
      );
      const draftEmailWorkflowAction = new DraftEmailWorkflowAction(
        tool as never,
        workflowRunStepLogService,
        externalWritePolicyService,
        globalWorkspaceOrmManager,
        connectedAccountRepository,
        userWorkspaceRepository,
      );
      const createCalendarEventWorkflowAction =
        new CreateCalendarEventWorkflowAction(
          tool as never,
          workflowRunStepLogService,
          externalWritePolicyService,
        );
      const httpRequestWorkflowAction = new HttpRequestWorkflowAction(
        tool as never,
        workflowRunStepLogService,
        externalWritePolicyService,
      );
      const factory = new WorkflowActionFactory(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        httpRequestWorkflowAction,
        sendEmailWorkflowAction,
        draftEmailWorkflowAction,
        createCalendarEventWorkflowAction,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(factory.get(type).execute(buildInput(type))).rejects.toThrow(
        'approval binding',
      );

      expect(tool.execute).not.toHaveBeenCalled();
    },
  );
});
