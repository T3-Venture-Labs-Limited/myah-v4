import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'jotai';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignAgent } from '@/page-layout/components/MyahCampaignAgent';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

const mockUpdateOneRecord = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockOpenModal = jest.fn();
const mockProceed = jest.fn();
const mockReset = jest.fn();

let mockRecordLoading = false;
let mockBlockerState: 'blocked' | 'proceeding' | 'unblocked' = 'unblocked';
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
  useModal: () => ({ openModal: mockOpenModal }),
}));

jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: ({
    onClose,
    onConfirmClick,
    title,
  }: {
    onClose?: () => void;
    onConfirmClick: () => void;
    title: string;
  }) =>
    mockBlockerState === 'blocked' ? (
      <div>
        <span>{title}</span>
        <button onClick={onClose} type="button">
          Keep editing
        </button>
        <button onClick={onConfirmClick} type="button">
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
      recordId,
      shouldPersistChanges,
      showFormattingControls,
    }: {
      editorMinHeight?: number;
      fieldName: string;
      objectNameSingular: string;
      onBodyChange?: (blocknote: string) => void;
      recordId: string;
      shouldPersistChanges?: boolean;
      showFormattingControls?: boolean;
    }) => (
      <button
        data-editor-min-height={editorMinHeight}
        data-field-name={fieldName}
        data-object-name={objectNameSingular}
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
) => {
  const store = resetJotaiStore();
  const recordAtom = recordStoreFamilyState.atomFamily('campaign-1');

  if (record !== null) {
    store.set(recordAtom, record);
  } else {
    store.set(recordAtom, null);
  }
  const view = render(
    <Provider store={store}>
      <MyahCampaignAgent campaignId="campaign-1" title="Campaign agent" />
    </Provider>,
  );

  return { store, view };
};

describe('MyahCampaignAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlockerState = 'unblocked';
    mockRecordLoading = false;
    mockUpdateOneRecord.mockResolvedValue(undefined);
    mockObjectMetadataItems = [
      {
        fields: campaignFields,
        id: 'campaign-object',
        nameSingular: 'campaign',
      },
    ];
  });

  it('renders five toolbar-free manual editors in metadata order', () => {
    renderAgent();

    expect(
      screen.getByRole('heading', { name: 'Campaign agent' }),
    ).toBeVisible();

    const editors = screen.getAllByTestId('campaign-agent-editor');

    expect(editors).toHaveLength(5);
    expect(editors.map((editor) => editor.dataset.fieldName)).toEqual([
      'campaignBrief',
      'communicationGuidelines',
      'replyRules',
      'escalationBoundaries',
      'additionalNotes',
    ]);

    for (const field of campaignFields) {
      const group = screen.getByRole('group', { name: field.label });
      const editor = within(group).getByTestId('campaign-agent-editor');

      expect(within(group).getByText(field.description)).toBeVisible();
      expect(editor).toHaveAttribute('data-editor-min-height', '80');
      expect(editor).toHaveAttribute('data-object-name', 'campaign');
      expect(editor).toHaveAttribute('data-record-id', 'campaign-1');
      expect(editor).toHaveAttribute('data-should-persist', 'false');
      expect(editor).toHaveAttribute('data-show-formatting-controls', 'false');
    }

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves only dirty fields when Save is clicked', async () => {
    renderAgent();

    fireEvent.click(screen.getByRole('button', { name: 'Edit campaignBrief' }));

    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenCalledWith({
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          campaignBrief: {
            blocknote: draftBody('campaignBrief'),
            markdown: null,
          },
        },
      });
    });

    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message: 'Campaign Agent settings saved.',
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps dirty drafts when Save fails', async () => {
    mockUpdateOneRecord.mockRejectedValueOnce(new Error('Write denied'));
    renderAgent();

    fireEvent.click(screen.getByRole('button', { name: 'Edit replyRules' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Campaign Agent settings could not be saved.',
      });
    });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('blocks in-app navigation and browser unload while dirty', async () => {
    const { store, view } = renderAgent();

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit additionalNotes' }),
    );

    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    mockBlockerState = 'blocked';
    view.rerender(
      <Provider store={store}>
        <MyahCampaignAgent campaignId="campaign-1" title="Campaign agent" />
      </Provider>,
    );

    await waitFor(() => {
      expect(mockOpenModal).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(mockReset).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(mockProceed).toHaveBeenCalled();
  });

  it.each([
    [
      'the record is loading',
      () => (mockRecordLoading = true),
      persistedCampaign,
    ],
    [
      'Campaign metadata is incomplete',
      () => (mockObjectMetadataItems = []),
      persistedCampaign,
    ],
    ['the Campaign record has not hydrated', () => undefined, null],
  ])('shows row placeholders while %s', (_description, arrange, record) => {
    arrange();
    renderAgent(record);

    expect(screen.getByTestId('campaign-agent-loading')).toBeVisible();
    expect(screen.queryAllByTestId('campaign-agent-editor')).toHaveLength(0);
  });
});
