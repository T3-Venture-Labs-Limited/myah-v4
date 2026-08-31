import { render, screen } from '@testing-library/react';

import { CampaignOutreachWorkflowEditor } from '@/myah-outreach/components/CampaignOutreachWorkflowEditor';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { CampaignOutreachWorkflowGraph } from '@/myah-outreach/components/CampaignOutreachWorkflowGraph';

const mockWorkflowVisualizerEffect = jest.fn(
  (_props: { workflowId: string }) => null,
);
const mockWorkflowSSESubscribeEffect = jest.fn(
  (_props: { workflowId: string }) => null,
);
const mockWorkflowDiagramEffect = jest.fn(() => null);
const mockWorkflowDiagramCanvasEditable = jest.fn(() => (
  <div>Native editable workflow canvas</div>
));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({ title, tag }: { title: string; tag: React.ReactNode }) => (
    <header>
      {title}
      {tag}
    </header>
  ),
}));
jest.mock('@/information-banner/components/InformationBannerWrapper', () => ({
  InformationBannerWrapper: () => <div>Page-level information banner</div>,
}));

jest.mock(
  '@/myah-outreach/components/CampaignOutreachWorkflowActionBar',
  () => ({
    CampaignOutreachWorkflowActionBar: () => <div>Campaign actions</div>,
  }),
);

jest.mock('@/workflow/hooks/useWorkflowWithCurrentVersion', () => ({
  useWorkflowWithCurrentVersion: () => ({
    currentVersion: { status: 'DRAFT' },
  }),
}));

jest.mock('@/workflow/utils/getWorkflowVisualizerComponentInstanceId', () => ({
  getWorkflowVisualizerComponentInstanceId: ({
    recordId,
  }: {
    recordId: string;
  }) => `instance-${recordId}`,
}));

jest.mock(
  '@/workflow/workflow-diagram/components/WorkflowVisualizerEffect',
  () => ({
    WorkflowVisualizerEffect: (props: { workflowId: string }) => {
      mockWorkflowVisualizerEffect(props);

      return null;
    },
  }),
);

jest.mock(
  '@/workflow/workflow-diagram/components/WorkflowSSESubscribeEffect',
  () => ({
    WorkflowSSESubscribeEffect: (props: { workflowId: string }) => {
      mockWorkflowSSESubscribeEffect(props);

      return null;
    },
  }),
);

jest.mock(
  '@/workflow/workflow-diagram/components/WorkflowDiagramEffect',
  () => ({
    WorkflowDiagramEffect: () => {
      mockWorkflowDiagramEffect();

      return null;
    },
  }),
);

jest.mock(
  '@/workflow/workflow-diagram/components/WorkflowDiagramCanvasEditable',
  () => ({
    WorkflowDiagramCanvasEditable: () => {
      mockWorkflowDiagramCanvasEditable();

      return <div>Native editable workflow canvas</div>;
    },
  }),
);

describe('CampaignOutreachWorkflowEditor', () => {
  beforeEach(() => {
    mockWorkflowVisualizerEffect.mockClear();
    mockWorkflowSSESubscribeEffect.mockClear();
    mockWorkflowDiagramEffect.mockClear();
    mockWorkflowDiagramCanvasEditable.mockClear();
  });

  it('mounts the editable native graph for the verified Outreach workflow ID', () => {
    render(<CampaignOutreachWorkflowGraph workflowId="workflow-a" />);

    expect(mockWorkflowVisualizerEffect).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'workflow-a' }),
    );
    expect(mockWorkflowSSESubscribeEffect).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'workflow-a' }),
    );
    expect(mockWorkflowDiagramEffect).toHaveBeenCalled();
    expect(mockWorkflowDiagramCanvasEditable).toHaveBeenCalled();
  });

  it('renders the Campaign-scoped editor host and Draft badge', () => {
    render(
      <CampaignOutreachWorkflowEditor
        campaignId="campaign-a"
        workflowId="workflow-a"
      />,
    );

    expect(
      screen.getByTestId('campaign-outreach-workflow-editor'),
    ).toBeVisible();
    expect(screen.getByText('Campaign Outreach')).toBeVisible();
    expect(screen.getByText('Draft')).toBeVisible();
  });

  it('keeps page-level information banners enabled by default', () => {
    render(
      <PageCardLayout header={<div>Page header</div>}>
        <div>Page content</div>
      </PageCardLayout>,
    );

    expect(screen.getByText('Page-level information banner')).toBeVisible();
  });

  it('does not repeat the page-level information banner inside Outreach', () => {
    render(
      <CampaignOutreachWorkflowEditor
        campaignId="campaign-a"
        workflowId="workflow-a"
      />,
    );

    expect(
      screen.queryByText('Page-level information banner'),
    ).not.toBeInTheDocument();
  });
});
