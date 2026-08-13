import { createElement, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CampaignOutreachTab } from '@/myah-outreach/components/CampaignOutreachTab';
import {
  CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
  FIND_CAMPAIGN_OUTREACH_WORKFLOW,
} from '@/myah-outreach/graphql/operations';

const mockQuery = jest.fn();
const mockMutate = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockApolloCoreClient = {
  mutate: mockMutate,
  query: mockQuery,
};

type CampaignOutreachWorkflowQueryResult = {
  findCampaignOutreachWorkflow: {
    campaignId: string;
    currentVersionId: string | null;
    name: string | null;
    workflowId: string;
  } | null;
};

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
  }),
}));
jest.mock('@/myah-outreach/components/CampaignOutreachWorkflowEditor', () => ({
  CampaignOutreachWorkflowEditor: ({ workflowId }: { workflowId: string }) => (
    <div data-testid="campaign-outreach-workflow-editor">{workflowId}</div>
  ),
}));

jest.mock('@linaria/react', () => {
  const styled = new Proxy(
    {},
    {
      get: () => (strings: TemplateStringsArray) => {
        const css = strings.join('');
        const display = css.match(/display:\s*([^;]+)/)?.[1];
        const flex = css.match(/flex:\s*([^;]+)/)?.[1];
        const height = css.match(/height:\s*([^;]+)/)?.[1];
        const minHeight = css.match(/min-height:\s*([^;]+)/)?.[1];

        return ({ children, ...props }: { children?: ReactNode }) =>
          createElement(
            'div',
            {
              ...props,
              style: {
                display,
                flex,
                height,
                minHeight,
              },
            },
            children,
          );
      },
    },
  );

  return { styled, __esModule: true };
});

describe('CampaignOutreachTab', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockMutate.mockReset();
    mockEnqueueErrorSnackBar.mockReset();
  });

  it('creates the only Outreach workflow from the empty state', async () => {
    mockQuery.mockResolvedValue({
      data: { findCampaignOutreachWorkflow: null },
    });
    mockMutate.mockResolvedValue({
      data: {
        createCampaignOutreachWorkflow: {
          campaignId: 'campaign-a',
          currentVersionId: 'workflow-version-1',
          name: 'New outreach workflow',
          workflowId: 'outreach-workflow-1',
        },
      },
    });
    const user = userEvent.setup();

    render(<CampaignOutreachTab campaignId="campaign-a" />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Create outreach workflow',
      }),
    );

    await waitFor(() =>
      expect(mockMutate).toHaveBeenCalledWith({
        mutation: CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
        variables: { campaignId: 'campaign-a' },
      }),
    );
    expect(
      await screen.findByTestId('campaign-outreach-workflow-editor'),
    ).toHaveTextContent('outreach-workflow-1');
  });

  it('fills the native Campaign tab pane when the workflow editor is rendered', async () => {
    mockQuery.mockResolvedValue({
      data: {
        findCampaignOutreachWorkflow: {
          campaignId: 'campaign-a',
          currentVersionId: 'workflow-version-1',
          name: 'Campaign Outreach',
          workflowId: 'outreach-workflow-1',
        },
      },
    });

    render(<CampaignOutreachTab campaignId="campaign-a" />);

    await screen.findByTestId('campaign-outreach-workflow-editor');

    expect(screen.getByTestId('campaign-outreach-tab')).toHaveStyle({
      display: 'flex',
      flex: '1',
      height: '100%',
      minHeight: '0',
    });
  });

  it('renders native loading and request-error feedback', async () => {
    mockQuery.mockRejectedValue(new Error('Network unavailable'));

    render(<CampaignOutreachTab campaignId="campaign-a" />);

    expect(screen.getByLabelText('Loading Campaign Outreach')).toBeVisible();
    expect(
      await screen.findByText('Campaign Outreach could not load. Retry.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeVisible();
  });

  it('renders permission feedback when Campaign Outreach is forbidden', async () => {
    mockQuery.mockRejectedValue({ code: 'FORBIDDEN' });

    render(<CampaignOutreachTab campaignId="campaign-a" />);

    expect(
      await screen.findByText(
        "You don't have permission to view Campaign Outreach.",
      ),
    ).toBeVisible();
  });

  it('does not render a General source picker or Copy action', async () => {
    mockQuery.mockResolvedValue({
      data: { findCampaignOutreachWorkflow: null },
    });

    render(<CampaignOutreachTab campaignId="campaign-a" />);

    await screen.findByRole('button', { name: 'Create outreach workflow' });

    expect(screen.queryByText(/copy general/i)).not.toBeInTheDocument();
  });

  it('loads only the requested Campaign Outreach workflow', async () => {
    mockQuery.mockResolvedValue({
      data: { findCampaignOutreachWorkflow: null },
    });

    render(<CampaignOutreachTab campaignId="campaign-a" />);

    await waitFor(() =>
      expect(mockQuery).toHaveBeenCalledWith({
        query: FIND_CAMPAIGN_OUTREACH_WORKFLOW,
        variables: { campaignId: 'campaign-a' },
      }),
    );
  });

  it('ignores a stale response after navigating to another Campaign', async () => {
    let resolveCampaignA:
      | ((result: CampaignOutreachWorkflowQueryResult) => void)
      | undefined;
    let resolveCampaignB:
      | ((result: CampaignOutreachWorkflowQueryResult) => void)
      | undefined;
    mockQuery
      .mockImplementationOnce(
        () =>
          new Promise<{ data: CampaignOutreachWorkflowQueryResult }>(
            (resolve) => {
              resolveCampaignA = ({ findCampaignOutreachWorkflow }) =>
                resolve({ data: { findCampaignOutreachWorkflow } });
            },
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ data: CampaignOutreachWorkflowQueryResult }>(
            (resolve) => {
              resolveCampaignB = ({ findCampaignOutreachWorkflow }) =>
                resolve({ data: { findCampaignOutreachWorkflow } });
            },
          ),
      );
    const { rerender } = render(
      <CampaignOutreachTab campaignId="campaign-a" />,
    );

    rerender(<CampaignOutreachTab campaignId="campaign-b" />);

    await act(async () => {
      resolveCampaignB?.({
        findCampaignOutreachWorkflow: {
          campaignId: 'campaign-b',
          currentVersionId: 'version-b',
          name: 'Campaign B Outreach',
          workflowId: 'workflow-b',
        },
      });
    });
    expect(
      await screen.findByTestId('campaign-outreach-workflow-editor'),
    ).toHaveTextContent('workflow-b');

    await act(async () => {
      resolveCampaignA?.({
        findCampaignOutreachWorkflow: {
          campaignId: 'campaign-a',
          currentVersionId: 'version-a',
          name: 'Campaign A Outreach',
          workflowId: 'workflow-a',
        },
      });
    });

    expect(
      screen.getByTestId('campaign-outreach-workflow-editor'),
    ).toHaveTextContent('workflow-b');
  });

  it('ignores a failed creation after navigating to another Campaign', async () => {
    let rejectCreate: (error: Error) => void = () => {};
    const createResult = new Promise<unknown>((_resolve, reject) => {
      rejectCreate = reject;
    });

    mockQuery.mockResolvedValue({
      data: { findCampaignOutreachWorkflow: null },
    });
    mockMutate.mockReturnValueOnce(createResult);
    const user = userEvent.setup();
    const { rerender } = render(
      <CampaignOutreachTab campaignId="campaign-a" />,
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Create outreach workflow',
      }),
    );
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

    rerender(<CampaignOutreachTab campaignId="campaign-b" />);

    await act(async () => {
      rejectCreate(new Error('Campaign A failed'));
    });

    expect(mockEnqueueErrorSnackBar).not.toHaveBeenCalled();
  });
});
