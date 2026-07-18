import { Module } from '@nestjs/common';

import { ToolModule } from 'src/engine/core-modules/tool/tool.module';
import { ToolProviderModule } from 'src/engine/core-modules/tool-provider/tool-provider.module';
import { CreateCalendarEventWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/create-calendar-event/create-calendar-event.workflow-action';
import { WorkflowRunModule } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.module';

@Module({
  imports: [ToolModule, ToolProviderModule, WorkflowRunModule],
  providers: [CreateCalendarEventWorkflowAction],
  exports: [CreateCalendarEventWorkflowAction],
})
export class CreateCalendarEventActionModule {}
