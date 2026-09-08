import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CampaignOutreachTab } from '@/myah-outreach/components/CampaignOutreachTab';
import {
  CAMPAIGN_SEQUENCE,
  CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
  REPLACE_LEGACY_CAMPAIGN_SEQUENCE,
} from '@/myah-outreach/graphql/operations';

const mockEnqueueErrorSnackBar = jest.fn();

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: mockEnqueueErrorSnackBar }),
}));

jest.mock('../CampaignOutreachWorkflowEditor', () => ({
  CampaignOutreachWorkflowEditor: ({
    sequenceState,
  }: {
    sequenceState: { snapshot: { versionId: string } };
  }) => (
    <div data-testid="campaign-outreach-workflow-editor">
      {sequenceState.snapshot.versionId}
    </div>
  ),
}));

const campaignId = 'a0000000-0000-4000-8000-000000000001';
const workflowId = 'b0000000-0000-4000-8000-000000000002';
const versionId = 'c0000000-0000-4000-8000-000000000003';

const loadResult = (kind: 'ABSENT' | 'LEGACY' | 'SEQUENCE') => {
  if (kind === 'ABSENT') {
    return {
      __typename: 'CampaignSequenceAbsent',
      kind,
      campaignId,
    };
  }
  if (kind === 'LEGACY') {
    return {
      __typename: 'CampaignSequenceLegacy',
      kind,
      campaignId,
      workflowId,
    };
  }
  return {
    __typename: 'CampaignSequencePresent',
    kind,
    snapshot: {
      __typename: 'CampaignSequenceSnapshot',
      campaignId,
      workflowId,
      versionId,
      sequence: { schemaVersion: 1, messages: [], delaysSeconds: [] },
      lifecycleStatus: 'DRAFT',
      editable: true,
      issues: [],
    },
  };
};

const loadMock = (kind: 'ABSENT' | 'LEGACY' | 'SEQUENCE'): MockedResponse => ({
  request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
  result: { data: { campaignSequence: loadResult(kind) } },
});

const renderTab = (mocks: MockedResponse[]) =>
  render(
    <MockedProvider mocks={mocks}>
      <CampaignOutreachTab campaignId={campaignId} />
    </MockedProvider>,
  );

describe('CampaignOutreachTab', () => {
  beforeEach(() => mockEnqueueErrorSnackBar.mockReset());

  it('loads ABSENT without a read-time write and creates only after explicit action', async () => {
    let createCalls = 0;
    const mocks: MockedResponse[] = [
      loadMock('ABSENT'),
      {
        request: {
          query: CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
          variables: { campaignId },
        },
        result: () => {
          createCalls += 1;
          return {
            data: {
              createCampaignOutreachWorkflow: {
                campaignId,
                currentVersionId: versionId,
                name: 'Campaign Outreach',
                workflowId,
              },
            },
          };
        },
      },
      loadMock('SEQUENCE'),
    ];
    renderTab(mocks);

    expect(
      await screen.findByRole('button', { name: 'Create Campaign sequence' }),
    ).toBeVisible();
    expect(createCalls).toBe(0);

    fireEvent.click(
      screen.getByRole('button', { name: 'Create Campaign sequence' }),
    );
    expect(
      await screen.findByTestId('campaign-outreach-workflow-editor'),
    ).toHaveTextContent(versionId);
    expect(createCalls).toBe(1);
  });

  it('requires explicit revision-bound replacement for LEGACY', async () => {
    let replacementCalls = 0;
    renderTab([
      loadMock('LEGACY'),
      {
        request: {
          query: REPLACE_LEGACY_CAMPAIGN_SEQUENCE,
          variables: { input: { campaignId, expectedWorkflowId: workflowId } },
        },
        result: () => {
          replacementCalls += 1;
          return {
            data: {
              replaceLegacyCampaignSequence: loadResult('SEQUENCE').snapshot,
            },
          };
        },
      },
      loadMock('SEQUENCE'),
    ]);

    expect(await screen.findByText('Legacy Campaign outreach')).toBeVisible();
    expect(replacementCalls).toBe(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Replace legacy outreach' }),
    );

    await screen.findByTestId('campaign-outreach-workflow-editor');
    expect(replacementCalls).toBe(1);
  });

  it('renders SEQUENCE and reports request failure without generic graph fallback', async () => {
    renderTab([loadMock('SEQUENCE')]);
    expect(
      await screen.findByTestId('campaign-outreach-workflow-editor'),
    ).toBeVisible();
    expect(screen.queryByText(/workflow canvas/i)).not.toBeInTheDocument();
  });

  it('keeps failed explicit creation recoverable', async () => {
    renderTab([
      loadMock('ABSENT'),
      {
        request: {
          query: CREATE_CAMPAIGN_OUTREACH_WORKFLOW,
          variables: { campaignId },
        },
        error: new Error('failed'),
      },
    ]);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Create Campaign sequence' }),
    );
    await waitFor(() =>
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Unable to create the Campaign sequence.',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Create Campaign sequence' }),
    ).toBeEnabled();
  });
});
