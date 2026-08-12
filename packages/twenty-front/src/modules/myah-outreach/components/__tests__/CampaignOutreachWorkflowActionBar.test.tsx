import { render, screen } from '@testing-library/react';

import { CampaignOutreachWorkflowActionBar } from '@/myah-outreach/components/CampaignOutreachWorkflowActionBar';

jest.mock('@/activities/hooks/useOpenCreateActivityDrawer', () => ({
  useOpenCreateActivityDrawer: () => jest.fn(),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));

jest.mock('@/workflow/hooks/useActivateWorkflowVersion', () => ({
  useActivateWorkflowVersion: () => ({ activateWorkflowVersion: jest.fn() }),
}));

jest.mock('@/workflow/hooks/useDeleteOneWorkflowVersion', () => ({
  useDeleteOneWorkflowVersion: () => ({ deleteOneWorkflowVersion: jest.fn() }),
}));

jest.mock('@/workflow/hooks/useRunWorkflowVersion', () => ({
  useRunWorkflowVersion: () => ({ runWorkflowVersion: jest.fn() }),
}));

jest.mock('@/workflow/hooks/useWorkflowWithCurrentVersion', () => ({
  useWorkflowWithCurrentVersion: () => ({
    currentVersion: {
      id: 'workflow-version-a',
      status: 'DRAFT',
      trigger: { type: 'MANUAL', settings: {} },
    },
    id: 'workflow-a',
  }),
}));

describe('CampaignOutreachWorkflowActionBar', () => {
  it.each(['Activate', 'Discard Draft', 'Test', 'Add a Note'])(
    'shows the native %s action',
    (label) => {
      render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

      expect(screen.getByRole('button', { name: label })).toBeVisible();
    },
  );

  it('does not render See Runs or any run navigation', () => {
    render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

    expect(
      screen.queryByRole('button', { name: /runs/i }),
    ).not.toBeInTheDocument();
  });
});
