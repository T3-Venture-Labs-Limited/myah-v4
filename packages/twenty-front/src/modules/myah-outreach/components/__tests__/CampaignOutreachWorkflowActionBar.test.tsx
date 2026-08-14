import { render, screen } from '@testing-library/react';

import { useWorkflowWithCurrentVersion } from '@/workflow/hooks/useWorkflowWithCurrentVersion';
import { CampaignOutreachWorkflowActionBar } from '@/myah-outreach/components/CampaignOutreachWorkflowActionBar';

const mockUseWorkflowWithCurrentVersion = jest.mocked(
  useWorkflowWithCurrentVersion,
);

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
  useWorkflowWithCurrentVersion: jest.fn(),
}));

describe('CampaignOutreachWorkflowActionBar', () => {
  beforeEach(() => {
    mockUseWorkflowWithCurrentVersion.mockReturnValue({
      currentVersion: {
        id: 'workflow-version-a',
        name: 'Draft',
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
        workflowId: 'workflow-a',
        __typename: 'WorkflowVersion',
        status: 'DRAFT',
        trigger: { type: 'MANUAL', settings: { outputSchema: {} } },
        steps: [],
      },
      id: 'workflow-a',
      __typename: 'Workflow',
      name: 'Outreach',
      versions: [],
      lastPublishedVersionId: null,
      statuses: [],
    });
  });
  it.each(['Activate', 'Discard Draft', 'Test', 'Add a Note'])(
    'shows the native %s action',
    (label) => {
      render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

      expect(screen.getByRole('button', { name: label })).toBeVisible();
    },
  );

  it('keeps the initial empty draft recoverable', () => {
    render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Discard Draft' }),
    ).toBeDisabled();
  });

  it('disables testing a database event trigger', () => {
    mockUseWorkflowWithCurrentVersion.mockReturnValue({
      currentVersion: {
        id: 'workflow-version-a',
        name: 'Draft',
        createdAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T00:00:00.000Z',
        workflowId: 'workflow-a',
        __typename: 'WorkflowVersion',
        status: 'DRAFT',
        trigger: {
          type: 'DATABASE_EVENT',
          settings: { eventName: 'campaign.created', outputSchema: {} },
        },
        steps: [],
      },
      id: 'workflow-a',
      __typename: 'Workflow',
      name: 'Outreach',
      versions: [],
      lastPublishedVersionId: null,
      statuses: [],
    });

    render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
  });

  it('disables testing until the Outreach workflow has a current version', () => {
    mockUseWorkflowWithCurrentVersion.mockReturnValue(undefined);

    render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();
  });

  it('does not render See Runs or any run navigation', () => {
    render(<CampaignOutreachWorkflowActionBar workflowId="workflow-a" />);

    expect(
      screen.queryByRole('button', { name: /runs/i }),
    ).not.toBeInTheDocument();
  });
});
