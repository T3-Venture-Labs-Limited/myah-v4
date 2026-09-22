import { type WorkflowCreateCalendarEventAction } from '@/workflow/types/Workflow';
import { WorkflowStepBody } from '@/workflow/workflow-steps/components/WorkflowStepBody';
import { WorkflowStepFooter } from '@/workflow/workflow-steps/components/WorkflowStepFooter';
import { t } from '@lingui/core/macro';
import { Callout } from 'twenty-ui/feedback';

type WorkflowEditActionCreateCalendarEventProps = {
  action: WorkflowCreateCalendarEventAction;
  actionOptions:
    | {
        readonly: true;
      }
    | {
        readonly?: false;
        onActionUpdate: (action: WorkflowCreateCalendarEventAction) => void;
      };
};

export const WorkflowEditActionCreateCalendarEvent = ({
  action,
  actionOptions,
}: WorkflowEditActionCreateCalendarEventProps) => (
  <>
    <WorkflowStepBody>
      <Callout
        variant="warning"
        title={t`Calendar event creation is no longer available`}
        description={t`This retired action is preserved for workflow history but can no longer be edited or executed.`}
      />
    </WorkflowStepBody>
    {!actionOptions.readonly && <WorkflowStepFooter stepId={action.id} />}
  </>
);
