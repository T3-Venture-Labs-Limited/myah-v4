import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';

import { RichTextFieldEditor } from '@/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

const mockUpdateOneRecord = jest.fn();
const mockModifyRecordFromCache = jest.fn();
const mockBlockNoteEditor = {
  document: [{ content: 'Draft', type: 'paragraph' }],
  domElement: { blur: jest.fn() },
};
const mockUseCreateBlockNote = jest.fn(
  (_options: unknown) => mockBlockNoteEditor,
);

const mockCampaignObjectMetadataItem = {
  fields: [{ id: 'campaign-brief-field', name: 'campaignBrief' }],
  id: 'campaign-object',
  nameSingular: 'campaign',
};

const mockAttachmentObjectMetadataItem = {
  fields: [],
  id: 'attachment-object',
  nameSingular: 'attachment',
};

jest.mock('@/activities/utils/getActivityTargetObjectFieldIdName', () => ({
  doesActivityTargetObjectSupportAttachments: () => false,
  getActivityTargetObjectFieldIdName: () => 'activityId',
}));

jest.mock('@/blocknote-editor/blocks/Schema', () => ({
  BLOCK_SCHEMA: {},
}));

jest.mock('@/blocknote-editor/components/BlockEditor', () => ({
  BlockEditor: ({
    editorMinHeight,
    onChange,
    showFormattingControls,
  }: {
    editorMinHeight?: number;
    onChange: () => void;
    showFormattingControls?: boolean;
  }) => (
    <button
      data-editor-min-height={editorMinHeight}
      data-show-formatting-controls={showFormattingControls}
      onClick={onChange}
      type="button"
    >
      Change body
    </button>
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

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ cache: {} }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    objectMetadataItem:
      objectNameSingular === 'attachment'
        ? mockAttachmentObjectMetadataItem
        : mockCampaignObjectMetadataItem,
  }),
}));

jest.mock('@/object-record/cache/utils/modifyRecordFromCache', () => ({
  modifyRecordFromCache: (...args: never[]) =>
    mockModifyRecordFromCache(...args),
}));

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: () => ({ records: [] }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

jest.mock('@/object-record/read-only/hooks/useIsRecordFieldReadOnly', () => ({
  useIsRecordFieldReadOnly: () => false,
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
  useCreateBlockNote: (options: unknown) => mockUseCreateBlockNote(options),
}));

jest.mock('use-debounce', () => ({
  useDebouncedCallback: <Callback extends (...args: never[]) => unknown>(
    callback: Callback,
  ) => callback,
}));

describe('RichTextFieldEditor', () => {
  const recordId = '20202020-0000-0000-0000-000000000001';
  const persistedRecord = {
    __typename: 'Campaign',
    campaignBrief: {
      blocknote: JSON.stringify([{ content: 'Persisted', type: 'paragraph' }]),
      markdown: null,
    },
    id: recordId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the persisted rich-text value when the native record update is rejected', async () => {
    const store = resetJotaiStore();
    const recordAtom = recordStoreFamilyState.atomFamily(recordId);
    store.set(recordAtom, persistedRecord);
    mockUpdateOneRecord.mockRejectedValueOnce(
      new Error('Campaign write denied'),
    );

    render(
      <Provider store={store}>
        <RichTextFieldEditor
          fieldName="campaignBrief"
          objectNameSingular="campaign"
          recordId={recordId}
        />
      </Provider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change body' }));
      await Promise.resolve();
    });

    expect(mockUpdateOneRecord).toHaveBeenCalledWith({
      idToUpdate: recordId,
      objectNameSingular: 'campaign',
      updateOneRecordInput: {
        campaignBrief: {
          blocknote: JSON.stringify(mockBlockNoteEditor.document),
          markdown: null,
        },
      },
    });
    expect(mockModifyRecordFromCache).not.toHaveBeenCalled();
    expect(store.get(recordAtom)).toEqual(persistedRecord);
  });

  it('passes a requested minimum editor height to BlockEditor', () => {
    const store = resetJotaiStore();
    const recordAtom = recordStoreFamilyState.atomFamily(recordId);
    store.set(recordAtom, persistedRecord);

    render(
      <Provider store={store}>
        <RichTextFieldEditor
          editorMinHeight={80}
          fieldName="campaignBrief"
          objectNameSingular="campaign"
          recordId={recordId}
        />
      </Provider>,
    );

    expect(screen.getByRole('button', { name: 'Change body' })).toHaveAttribute(
      'data-editor-min-height',
      '80',
    );
  });

  it('reports manual draft changes without persisting or showing formatting controls', () => {
    const store = resetJotaiStore();
    const recordAtom = recordStoreFamilyState.atomFamily(recordId);
    const onBodyChange = jest.fn();
    store.set(recordAtom, persistedRecord);

    render(
      <Provider store={store}>
        <RichTextFieldEditor
          fieldName="campaignBrief"
          objectNameSingular="campaign"
          onBodyChange={onBodyChange}
          placeholder="Enter instructions"
          recordId={recordId}
          shouldPersistChanges={false}
          showFormattingControls={false}
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change body' }));

    expect(onBodyChange).toHaveBeenCalledWith(
      JSON.stringify(mockBlockNoteEditor.document),
    );
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Change body' })).toHaveAttribute(
      'data-show-formatting-controls',
      'false',
    );
    expect(mockUseCreateBlockNote).toHaveBeenCalledWith(
      expect.objectContaining({
        placeholders: { default: 'Enter instructions' },
      }),
    );
  });
});
