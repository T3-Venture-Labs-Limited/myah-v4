import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

const mockUpdateOneRecord = jest.fn();
const mockBlockNoteEditor = {
  document: [{ content: 'Draft', type: 'paragraph' }],
  domElement: { blur: jest.fn() },
};

let mockIsRecordFieldReadOnly = true;
const editorInput = 'Updated signature';

const campaignMetadata = {
  fields: [
    {
      description: 'A sign-off included in outgoing campaign email.',
      id: 'email-signature-field',
      label: 'Email signature',
      name: 'emailSignature',
    },
  ],
  id: 'campaign-object',
  nameSingular: 'campaign',
};

const persistedCampaign = {
  __typename: 'Campaign',
  emailSignature: {
    blocknote: JSON.stringify([
      {
        content: 'Saved signature',
        type: 'paragraph',
      },
    ]),
    markdown: null,
  },
  id: 'campaign-1',
};

jest.mock('@/blocknote-editor/blocks/Schema', () => ({
  BLOCK_SCHEMA: {},
}));

jest.mock('@/blocknote-editor/components/BlockEditor', () => ({
  BlockEditor: ({
    editor,
    onChange,
    readonly,
  }: {
    editor: typeof mockBlockNoteEditor;
    onChange?: () => void;
    readonly?: boolean;
  }) => (
    <div
      contentEditable={!readonly}
      onInput={(event) => {
        if (readonly) {
          return;
        }

        editor.document = [
          {
            content: event.currentTarget.textContent ?? '',
            type: 'paragraph',
          },
        ];
        onChange?.();
      }}
      role="textbox"
    />
  ),
}));

jest.mock('@/blocknote-editor/hooks/useAttachmentSync', () => ({
  useAttachmentSync: () => ({ syncAttachments: jest.fn() }),
}));

jest.mock('@/blocknote-editor/hooks/useReplaceBlockEditorContent', () => ({
  useReplaceBlockEditorContent: () => ({
    replaceBlockEditorContent: jest.fn(),
  }),
}));

jest.mock('@/blocknote-editor/utils/parseInitialBlocknote', () => ({
  parseInitialBlocknote: () => undefined,
}));

jest.mock('@/blocknote-editor/utils/prepareBodyWithSignedUrls', () => ({
  prepareBodyWithSignedUrls: (blocknote: string) => blocknote,
}));

jest.mock('@/activities/files/hooks/useUploadAttachmentFile', () => ({
  useUploadAttachmentFile: () => ({ uploadAttachmentFile: jest.fn() }),
}));

jest.mock('@/activities/utils/getActivityTargetObjectFieldIdName', () => ({
  doesActivityTargetObjectSupportAttachments: () => false,
  getActivityTargetObjectFieldIdName: () => 'campaignId',
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [campaignMetadata],
  }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem:
      objectNameSingular === 'attachment'
        ? { fields: [], id: 'attachment-object', nameSingular: 'attachment' }
        : campaignMetadata,
  }),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({ records: [] }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => mockIsRecordFieldReadOnly,
}));

jest.mock(
  '@/object-record/record-show/hooks/useRecordShowContainerData',
  () => ({
    useRecordShowContainerData: () => ({ recordLoading: false }),
  }),
);

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useBlocker: () => ({
    proceed: jest.fn(),
    reset: jest.fn(),
    state: 'unblocked',
  }),
}));

jest.mock('@/ui/layout/modal/components/ConfirmationModal', () => ({
  ConfirmationModal: () => null,
}));

jest.mock('@/ui/layout/modal/hooks/useModal', () => ({
  useModal: () => ({
    closeModal: jest.fn(),
    openModal: jest.fn(),
  }),
}));

jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: jest.fn(),
  }),
}));

jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: jest.fn(),
    }),
  }),
);

jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: jest.fn(),
}));

jest.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => mockBlockNoteEditor,
}));

jest.mock('use-debounce', () => ({
  useDebouncedCallback: <Callback extends (...args: never[]) => unknown>(
    callback: Callback,
  ) => callback,
}));

const renderReadOnlySettings = () => {
  const store = resetJotaiStore();
  store.set(recordStoreFamilyState.atomFamily('campaign-1'), persistedCampaign);

  render(
    <Provider store={store}>
      <MyahCampaignRichTextSettings
        campaignId="campaign-1"
        copy={{
          keepEditing: 'Keep editing',
          saveSuccess: 'Email signature saved.',
          saveError: 'Email signature could not be saved.',
          unsavedChangesSubtitle:
            'Your Email signature changes have not been saved.',
        }}
        fields={[
          {
            fieldName: 'emailSignature',
            placeholder: 'Enter email signature',
            showFormattingControls: false,
          },
        ]}
        modalIdPrefix="campaign-operations-unsaved-changes"
        title="Campaign operations"
      />
    </Provider>,
  );
};

describe('MyahCampaignRichTextSettings read-only editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlockNoteEditor.document = [{ content: 'Draft', type: 'paragraph' }];
    mockIsRecordFieldReadOnly = true;
  });

  it('allows an editable field to become dirty through the BlockEditor harness', () => {
    mockIsRecordFieldReadOnly = false;
    renderReadOnlySettings();

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveAttribute('contenteditable', 'true');

    fireEvent.input(editor, { target: { textContent: editorInput } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
  });

  it('passes permission-derived readonly to BlockEditor without allowing a mutation', () => {
    renderReadOnlySettings();

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveAttribute('contenteditable', 'false');

    fireEvent.input(editor, { target: { textContent: editorInput } });

    expect(mockBlockNoteEditor.document).toEqual([
      { content: 'Draft', type: 'paragraph' },
    ]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
  });
});
