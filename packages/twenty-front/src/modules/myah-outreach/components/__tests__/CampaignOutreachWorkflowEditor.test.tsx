import { render, screen } from '@testing-library/react';
import { type CampaignSequence } from 'twenty-shared/workflow';

import { CampaignOutreachWorkflowEditor } from '@/myah-outreach/components/CampaignOutreachWorkflowEditor';
import { type CampaignSequenceSnapshot } from '@/myah-outreach/hooks/useCampaignSequence';
import { PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT } from '@/page-layout/constants/PageLayoutSidePanelTabChangeEvent';

const mockBlocker = {
  state: 'unblocked' as 'unblocked' | 'blocked',
  proceed: jest.fn(),
  reset: jest.fn(),
};

jest.mock('react-router-dom', () => ({
  useBlocker: () => ({ ...mockBlocker }),
}));

jest.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: ({
    actionButton,
    tag,
    title,
  }: {
    actionButton: React.ReactNode;
    tag: React.ReactNode;
    title: string;
  }) => (
    <header>
      {title}
      {tag}
      {actionButton}
    </header>
  ),
}));

jest.mock('@/information-banner/components/InformationBannerWrapper', () => ({
  InformationBannerWrapper: () => <div>Page-level information banner</div>,
}));

jest.mock('@/myah-outreach/components/CampaignSequenceMessageEditor', () => ({
  CampaignSequenceMessageEditor: ({ editable }: { editable: boolean }) => (
    <div>Message editor {editable ? 'editable' : 'read only'}</div>
  ),
}));

const mockSequenceEditor = jest.fn(({ editable }: { editable: boolean }) => (
  <div>Sequence editor {editable ? 'editable' : 'read only'}</div>
));
jest.mock('@/myah-outreach/components/CampaignSequenceEditor', () => ({
  CampaignSequenceEditor: (props: { editable: boolean }) =>
    mockSequenceEditor(props),
}));

jest.mock(
  '@/myah-outreach/components/CampaignOutreachWorkflowActionBar',
  () => ({
    CampaignOutreachWorkflowActionBar: () => (
      <div>Restricted Campaign actions</div>
    ),
  }),
);

const campaignId = 'a0000000-0000-4000-8000-000000000001';
const messageId = 'b0000000-0000-4000-8000-000000000002';
const sequence: CampaignSequence = {
  schemaVersion: 1,
  messages: [
    {
      id: messageId,
      channel: 'EMAIL',
      subject: 'Hello',
      body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
      files: [],
      replyToThread: false,
    },
  ],
  delaysSeconds: [],
};

const makeState = ({ dirty = false, editable = true } = {}) => {
  const snapshot: CampaignSequenceSnapshot = {
    campaignId,
    workflowId: 'c0000000-0000-4000-8000-000000000003',
    versionId: 'd0000000-0000-4000-8000-000000000004',
    sequence,
    lifecycleStatus: editable ? 'DRAFT' : 'ACTIVE',
    versionStatus: 'DRAFT',
    editable,
    issues: [],
  };

  return {
    snapshot,
    draft: sequence,
    selectedMessageId: messageId,
    loading: false,
    saving: false,
    publishing: false,
    dirty,
    error: null,
    loadResult: { kind: 'SEQUENCE' as const, snapshot },
    reloadGeneration: 0,
    setDraft: jest.fn(),
    addAttachments: jest.fn(),
    selectMessage: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
  };
};

const renderEditor = (state = makeState()) =>
  render(
    <CampaignOutreachWorkflowEditor
      campaignId={campaignId}
      sequenceState={state}
    />,
  );

describe('CampaignOutreachWorkflowEditor', () => {
  beforeEach(() => {
    mockSequenceEditor.mockClear();
    mockBlocker.state = 'unblocked';
    mockBlocker.proceed.mockClear();
    mockBlocker.reset.mockClear();
  });

  it('renders the restricted vertical editor without the generic canvas', () => {
    renderEditor();

    expect(
      screen.getByTestId('campaign-outreach-workflow-editor'),
    ).toBeVisible();
    expect(screen.getByText('Campaign Outreach')).toBeVisible();
    expect(screen.getByText('Sequence editor editable')).toBeVisible();
    expect(screen.getByText('Message editor editable')).toBeVisible();
    expect(
      screen.queryByText(/native editable workflow canvas/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Activate' }),
    ).not.toBeInTheDocument();
  });

  it('passes non-editable lifecycle state through every authoring surface', () => {
    renderEditor(makeState({ editable: false }));

    expect(screen.getByText('ACTIVE')).toBeVisible();
    expect(screen.getByText('Sequence editor read only')).toBeVisible();
    expect(screen.getByText('Message editor read only')).toBeVisible();
    expect(
      screen.getByText(/Stop Campaign outreach before editing/i),
    ).toBeVisible();
  });

  it('blocks a dirty side-panel tab transition unless discard is confirmed', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const state = makeState({ dirty: true });
    render(
      <CampaignOutreachWorkflowEditor
        campaignId={campaignId}
        isInSidePanel
        sequenceState={state}
      />,
    );

    const cancelled = !window.dispatchEvent(
      new CustomEvent(PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT, {
        cancelable: true,
      }),
    );

    expect(cancelled).toBe(true);
    expect(
      screen.getByTestId('campaign-outreach-workflow-editor'),
    ).toBeVisible();
    expect(state.draft).toEqual(sequence);

    confirm.mockReturnValue(true);
    const permitted = window.dispatchEvent(
      new CustomEvent(PAGE_LAYOUT_SIDE_PANEL_TAB_CHANGE_EVENT, {
        cancelable: true,
      }),
    );
    expect(permitted).toBe(true);
    confirm.mockRestore();
  });

  it('blocks router navigation while dirty and requires explicit discard confirmation', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockBlocker.state = 'blocked';
    const { rerender } = renderEditor(makeState({ dirty: true }));

    expect(confirm).toHaveBeenCalled();
    expect(mockBlocker.reset).toHaveBeenCalledTimes(1);
    expect(mockBlocker.proceed).not.toHaveBeenCalled();

    mockBlocker.state = 'unblocked';
    rerender(
      <CampaignOutreachWorkflowEditor
        campaignId={campaignId}
        sequenceState={makeState({ dirty: true })}
      />,
    );
    confirm.mockReturnValue(true);
    mockBlocker.state = 'blocked';
    rerender(
      <CampaignOutreachWorkflowEditor
        campaignId={campaignId}
        sequenceState={makeState({ dirty: true })}
      />,
    );
    expect(mockBlocker.proceed).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
