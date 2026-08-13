import { useOpenCreateActivityDrawer } from '@/activities/hooks/useOpenCreateActivityDrawer';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useActivateWorkflowVersion } from '@/workflow/hooks/useActivateWorkflowVersion';
import { useDeleteOneWorkflowVersion } from '@/workflow/hooks/useDeleteOneWorkflowVersion';
import { useRunWorkflowVersion } from '@/workflow/hooks/useRunWorkflowVersion';
import { useWorkflowWithCurrentVersion } from '@/workflow/hooks/useWorkflowWithCurrentVersion';
import { getTestPayloadFromTrigger } from '@/workflow/workflow-trigger/utils/getTestPayloadFromTrigger';
import { styled } from '@linaria/react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { Button } from 'twenty-ui/input';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledActionBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
`;

type CampaignOutreachWorkflowActionBarProps = {
  workflowId: string;
};

export const CampaignOutreachWorkflowActionBar = ({
  workflowId,
}: CampaignOutreachWorkflowActionBarProps) => {
  const workflow = useWorkflowWithCurrentVersion(workflowId);
  const { activateWorkflowVersion } = useActivateWorkflowVersion();
  const { deleteOneWorkflowVersion } = useDeleteOneWorkflowVersion();
  const { runWorkflowVersion } = useRunWorkflowVersion();
  const openCreateNote = useOpenCreateActivityDrawer({
    activityObjectNameSingular: CoreObjectNameSingular.Note,
  });
  const { enqueueErrorSnackBar } = useSnackBar();
  const currentVersion = workflow?.currentVersion;
  const canManageDraft = currentVersion?.status === 'DRAFT';
  const canActivate =
    canManageDraft &&
    currentVersion.trigger !== null &&
    isNonEmptyArray(currentVersion.steps);
  const canDiscardDraft =
    canManageDraft && isDefined(workflow?.lastPublishedVersionId);
  const canTest =
    currentVersion?.trigger !== null && currentVersion !== undefined;

  const handleActionFailure = (message: string) => {
    enqueueErrorSnackBar({ message });
  };

  const handleActivate = () => {
    if (!currentVersion) {
      return;
    }

    void activateWorkflowVersion({
      workflowId,
      workflowVersionId: currentVersion.id,
    }).catch(() => handleActionFailure('Unable to activate the workflow.'));
  };

  const handleDiscardDraft = () => {
    if (!currentVersion) {
      return;
    }

    void deleteOneWorkflowVersion({
      workflowVersionId: currentVersion.id,
    }).catch(() => handleActionFailure('Unable to discard the draft.'));
  };

  const handleTest = () => {
    if (!currentVersion?.trigger) {
      return;
    }

    void runWorkflowVersion({
      payload: getTestPayloadFromTrigger(currentVersion.trigger),
      workflowId,
      workflowVersionId: currentVersion.id,
    }).catch(() => handleActionFailure('Unable to test the workflow.'));
  };

  const handleAddNote = () => {
    void openCreateNote({
      targetableObjects: [
        {
          id: workflowId,
          targetObjectNameSingular: CoreObjectNameSingular.Workflow,
        },
      ],
    }).catch(() => handleActionFailure('Unable to add a note.'));
  };

  return (
    <StyledActionBar>
      <Button
        ariaLabel="Activate"
        disabled={!canActivate}
        onClick={handleActivate}
        title="Activate"
        variant="primary"
      />
      <Button
        ariaLabel="Discard Draft"
        disabled={!canDiscardDraft}
        onClick={handleDiscardDraft}
        title="Discard Draft"
        variant="secondary"
      />
      <Button
        ariaLabel="Test"
        disabled={!canTest}
        onClick={handleTest}
        title="Test"
        variant="secondary"
      />
      <Button
        ariaLabel="Add a Note"
        onClick={handleAddNote}
        title="Add a Note"
        variant="secondary"
      />
    </StyledActionBar>
  );
};
