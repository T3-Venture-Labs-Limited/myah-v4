import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignAgent } from '@/page-layout/components/MyahCampaignAgent';
import { MyahCampaignHome } from '@/page-layout/components/MyahCampaignHome';
import { requestPageLayoutSidePanelTabChange } from '@/page-layout/constants/PageLayoutSidePanelTabChangeEvent';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

const mockUpdateOneRecord = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockProceed = jest.fn();
const mockReset = jest.fn();

let mockRecordLoading = false;
let mockFactsCanUpdate = true;
let mockFactsEditMode = false;
let mockIsInSidePanel = false;
let mockBlockerState: 'blocked' | 'proceeding' | 'unblocked' = 'unblocked';
let mockModalOpened = false;
let mockObjectMetadataItems: Array<{
  fields: Array<{
    description: string;
    id: string;
    label: string;
    name: string;
  }>;
  id: string;
  nameSingular: string;
}> = [];

const campaignFields = [
  {
    description:
      'The detailed campaign-specific brief: outcome, offer/context, intended creator work, and relevant operating context.',
    id: 'campaign-brief',
    label: 'Detailed Campaign brief',
    name: 'campaignBrief',
  },
  {
    description:
      'Voice, claims, tone, channel, and communication constraints for campaign drafting.',
    id: 'communication-guidelines',
    label: 'Communication guidelines',
    name: 'communicationGuidelines',
  },
  {
    description:
      'Reply boundaries, approved answer patterns, and situations requiring a draft instead of action.',
    id: 'reply-rules',
    label: 'Reply rules and approved answers',
    name: 'replyRules',
  },
  {
    description:
      'Situations that must be escalated to an operator and campaign-specific escalation constraints.',
    id: 'escalation-boundaries',
    label: 'Escalation boundaries',
    name: 'escalationBoundaries',
  },
  {
    description:
      'Campaign-specific material not represented by another guided section.',
    id: 'additional-notes',
    label: 'Additional notes',
    name: 'additionalNotes',
  },
];

const persistedBodies = {
  additionalNotes: JSON.stringify([
    { content: 'Saved notes', type: 'paragraph' },
  ]),
  campaignBrief: JSON.stringify([
    { content: 'Saved brief', type: 'paragraph' },
  ]),
  communicationGuidelines: JSON.stringify([
    { content: 'Saved guidelines', type: 'paragraph' },
  ]),
  escalationBoundaries: JSON.stringify([
    { content: 'Saved escalation', type: 'paragraph' },
  ]),
  replyRules: JSON.stringify([{ content: 'Saved rules', type: 'paragraph' }]),
};

const draftBody = (fieldName: string) =>
  JSON.stringify([{ content: `Draft ${fieldName}`, type: 'paragraph' }]);

const persistedCampaign = {
  __typename: 'Campaign',
  additionalNotes: {
    blocknote: persistedBodies.additionalNotes,
    markdown: null,
  },
  campaignBrief: { blocknote: persistedBodies.campaignBrief, markdown: null },
  communicationGuidelines: {
    blocknote: persistedBodies.communicationGuidelines,
    markdown: null,
  },
  escalationBoundaries: {
    blocknote: persistedBodies.escalationBoundaries,
    markdown: null,
  },
  id: 'campaign-1',
  replyRules: { blocknote: persistedBodies.replyRules, markdown: null },
};

jest.mock('@/myah/agent/components/MyahCampaignAgentSettings', () => ({
  MyahCampaignAgentSettings: ({ campaignId }: { campaignId: string }) => (
    <div data-testid="campaign-agent-settings" data-campaign-id={campaignId} />
  ),
}));
jest.mock('@/ui/layout/contexts/LayoutRenderingContext', () => ({
  useLayoutRenderingContext: () => ({ isInSidePanel: mockIsInSidePanel }),
}));
jest.mock('@/page-layout/components/MyahCampaignActivity', () => ({
  MyahCampaignActivity: () => null,
}));
jest.mock('@/page-layout/components/MyahCampaignReadiness', () => ({
  MyahCampaignReadiness: () => null,
}));
jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canReadObjectRecords: true,
    canUpdateObjectRecords: mockFactsCanUpdate,
    restrictedFields: {},
  }),
}));
jest.mock('@/page-layout/hooks/useIsPageLayoutInEditMode', () => ({
  useIsPageLayoutInEditMode: () => mockFactsEditMode,
}));
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerData',
  () => ({
    useRecordShowContainerData: () => ({ recordLoading: mockRecordLoading }),
  }),
);

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
  }),
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({
    closeModal: mockCloseModal,
    openModal: mockOpenModal,
  }),
}));

jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    cancelButtonText,
    loading,
    onClose,
    onConfirmClick,
    title,
  }: {
    cancelButtonText?: string;
    loading?: boolean;
    onClose?: () => void;
    onConfirmClick: () => void;
    title: string;
  }) =>
    mockBlockerState === 'blocked' || mockModalOpened ? (
      <div>
        <span>{title}</span>
        <button onClick={onClose} type="button">
          {cancelButtonText ?? 'Cancel'}
        </button>
        <button disabled={loading} onClick={onConfirmClick} type="button">
          Discard changes
        </button>
      </div>
    ) : null,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useBlocker: () => ({
    proceed: mockProceed,
    reset: mockReset,
    state: mockBlockerState,
  }),
}));

jest.mock(
  '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor',
  () => ({
    RichTextFieldEditor: ({
      editorMinHeight,
      fieldName,
      objectNameSingular,
      onBodyChange,
      placeholder,
      recordId,
      shouldPersistChanges,
      showFormattingControls,
    }: {
      editorMinHeight?: number;
      fieldName: string;
      objectNameSingular: string;
      onBodyChange?: (blocknote: string) => void;
      placeholder?: string;
      recordId: string;
      shouldPersistChanges?: boolean;
      showFormattingControls?: boolean;
    }) => (
      <button
        data-editor-min-height={editorMinHeight}
        data-field-name={fieldName}
        data-object-name={objectNameSingular}
        data-placeholder={placeholder}
        data-record-id={recordId}
        data-should-persist={shouldPersistChanges}
        data-show-formatting-controls={showFormattingControls}
        data-testid="campaign-agent-editor"
        onClick={() => onBodyChange?.(draftBody(fieldName))}
        type="button"
      >
        {`Edit ${fieldName}`}
      </button>
    ),
  }),
);

const renderAgent = (
  record: typeof persistedCampaign | null = persistedCampaign,
  navigationState?: {
    myahCampaignAgentGuidanceFocusCampaignId: string;
  },
) => {
  const store = resetJotaiStore();
  const recordAtom = recordStoreFamilyState.atomFamily('campaign-1');

  if (record !== null) {
    store.set(recordAtom, record);
  } else {
    store.set(recordAtom, null);
  }
  const view = render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/object/campaign/campaign-1', state: navigationState },
      ]}
    >
      <Provider store={store}>
        <MyahCampaignAgent campaignId="campaign-1" title="Campaign agent" />
      </Provider>
    </MemoryRouter>,
  );

  return { store, view };
};

describe('MyahCampaignAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlockerState = 'unblocked';
    mockModalOpened = false;
    mockOpenModal.mockImplementation(() => {
      mockModalOpened = true;
    });
    mockCloseModal.mockImplementation(() => {
      mockModalOpened = false;
    });
    mockRecordLoading = false;
    mockFactsCanUpdate = true;
    mockFactsEditMode = false;
    mockIsInSidePanel = false;
    mockUpdateOneRecord.mockResolvedValue(undefined);
    mockObjectMetadataItems = [
      {
        fields: campaignFields,
        id: 'campaign-object',
        nameSingular: 'campaign',
      },
    ];
  });

  it('focuses a non-editing guidance region once for an exact Campaign navigation state', () => {
    const focus = jest.spyOn(HTMLElement.prototype, 'focus');
    renderAgent(persistedCampaign, {
      myahCampaignAgentGuidanceFocusCampaignId: 'campaign-1',
    });

    const region = screen.getByRole('region', {
      name: 'Campaign agent',
    });
    expect(region).toHaveFocus();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('campaign-agent-settings')).toHaveAttribute(
      'data-campaign-id',
      'campaign-1',
    );
    focus.mockRestore();
  });

  it.each([
    ['absent', undefined],
    ['mismatched', { myahCampaignAgentGuidanceFocusCampaignId: 'campaign-2' }],
  ] as const)(
    'does not focus guidance for %s navigation state',
    (_label, state) => {
      renderAgent(persistedCampaign, state);

      expect(
        screen.getByRole('region', { name: 'Campaign agent' }),
      ).not.toHaveFocus();
    },
  );

  it('keeps Campaign facts drafts on failed writes and blocks unsaved tab navigation', async () => {
    const store = resetJotaiStore();
    store.set(
      recordStoreFamilyState.atomFamily('campaign-1'),
      persistedCampaign,
    );
    const home = () => (
      <MemoryRouter initialEntries={['/object/campaign/campaign-1']}>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>
    );
    const view = render(home());
    expect(
      screen
        .getAllByTestId('campaign-agent-editor')
        .map((editor) => editor.dataset.fieldName),
    ).toEqual(['campaignBrief', 'additionalNotes']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit campaignBrief' }));
    mockUpdateOneRecord.mockRejectedValueOnce(new Error('Write denied'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save brief and notes' }),
    );
    await waitFor(() =>
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Campaign facts could not be saved.',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Save brief and notes' }),
    ).toBeEnabled();
    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);
    mockBlockerState = 'blocked';
    view.rerender(home());
    await waitFor(() => expect(mockOpenModal).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole('button', { name: 'Save brief and notes' }),
    );
    await waitFor(() =>
      expect(mockUpdateOneRecord).toHaveBeenLastCalledWith({
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          campaignBrief: {
            blocknote: draftBody('campaignBrief'),
            markdown: null,
          },
        },
      }),
    );
    await waitFor(() => expect(mockProceed).toHaveBeenCalled());
  });

  it('keeps side-panel facts on Keep editing and resumes only after Discard', async () => {
    mockIsInSidePanel = true;
    const store = resetJotaiStore();
    store.set(
      recordStoreFamilyState.atomFamily('campaign-1'),
      persistedCampaign,
    );
    const view = render(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit campaignBrief' }));
    const resume = jest.fn();
    const request = () =>
      requestPageLayoutSidePanelTabChange({
        currentTabId: 'home',
        nextTabId: 'agent',
        resume,
      });
    expect(request()).toBe(false);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'campaign-facts-unsaved-changes-campaign-1',
    );
    expect(resume).not.toHaveBeenCalled();
    view.rerender(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(resume).not.toHaveBeenCalled();
    expect(request()).toBe(false);
    view.rerender(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(resume).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Save brief and notes' }),
    ).toBeDisabled();
    view.unmount();
    expect(request()).toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('keeps editing after a canceled tab change so Save can fail and retry before navigating', async () => {
    mockIsInSidePanel = true;
    const store = resetJotaiStore();
    store.set(
      recordStoreFamilyState.atomFamily('campaign-1'),
      persistedCampaign,
    );
    const view = render(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit additionalNotes' }),
    );
    const resume = jest.fn();
    const request = () =>
      requestPageLayoutSidePanelTabChange({
        currentTabId: 'home',
        nextTabId: 'agent',
        resume,
      });
    expect(request()).toBe(false);
    view.rerender(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    mockUpdateOneRecord.mockRejectedValueOnce(new Error('Write denied'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save brief and notes' }),
    );
    await waitFor(() => expect(mockEnqueueErrorSnackBar).toHaveBeenCalled());
    expect(request()).toBe(false);
    view.rerender(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Save brief and notes' }),
    );
    await waitFor(() => expect(mockEnqueueSuccessSnackBar).toHaveBeenCalled());
    await waitFor(() => expect(request()).toBe(true));
    expect(resume).not.toHaveBeenCalled();
  });

  it('does not mount writable Campaign facts for read-only access or layout edit mode', () => {
    const store = resetJotaiStore();
    store.set(
      recordStoreFamilyState.atomFamily('campaign-1'),
      persistedCampaign,
    );
    mockFactsCanUpdate = false;
    const view = render(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    expect(
      screen.queryByTestId('campaign-rich-text-settings-surface'),
    ).not.toBeInTheDocument();
    mockFactsCanUpdate = true;
    mockFactsEditMode = true;
    view.rerender(
      <MemoryRouter>
        <Provider store={store}>
          <MyahCampaignHome campaignId="campaign-1" />
        </Provider>
      </MemoryRouter>,
    );
    expect(
      screen.queryByTestId('campaign-rich-text-settings-surface'),
    ).not.toBeInTheDocument();
  });
});
