import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'jotai';
import { type ReactNode } from 'react';
import type * as ReactModule from 'react';

import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { MyahCampaignRichTextSettings } from '@/page-layout/components/MyahCampaignRichTextSettings';
import { resetJotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

const mockUpdateOneRecord = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
const mockOpenModal = jest.fn();
const mockCloseModal = jest.fn();
const mockProceed = jest.fn();
const mockReset = jest.fn();

let mockRecordLoading = false;
let mockBlockerState: 'blocked' | 'proceeding' | 'unblocked' = 'unblocked';
let mockModalOpened = false;
let mockEditorBodies: Record<string, string> = {};
let mockEditorInstance = 0;
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

type SettingsField = {
  fieldName: string;
  placeholder: string;
  showFormattingControls: boolean;
};

type SettingsCopy = {
  keepEditing: string;
  saveError: string;
  saveSuccess: string;
  unsavedChangesSubtitle: string;
};

type UpdateOneRecordRequest = {
  idToUpdate: string;
  updateOneRecordInput: Record<string, { blocknote: string; markdown: null }>;
};

const settingsFields = [
  {
    fieldName: 'emailSignature',
    placeholder: 'Enter email signature',
    showFormattingControls: true,
  },
] as const;

const multiFieldSettingsFields = [
  ...settingsFields,
  {
    fieldName: 'campaignFooter',
    placeholder: 'Enter campaign footer',
    showFormattingControls: false,
  },
] as const;

const settingsCopy: SettingsCopy = {
  keepEditing: 'Keep editing',
  saveSuccess: 'Email signature saved.',
  saveError: 'Email signature could not be saved.',
  unsavedChangesSubtitle: 'Your Email signature changes have not been saved.',
};

const persistedBody = (fieldName: string) =>
  JSON.stringify([{ content: `Saved ${fieldName}`, type: 'paragraph' }]);

const draftBody = (content: string) =>
  JSON.stringify([{ content, type: 'paragraph' }]);

const firstDraftBody = draftBody('First signature draft');
const secondDraftBody = draftBody('Second signature draft');
const thirdDraftBody = draftBody('Third signature draft');
const emptyBlocknoteBody = JSON.stringify([
  {
    id: 'empty-signature',
    type: 'paragraph',
    props: {
      textColor: 'default',
      backgroundColor: 'default',
      textAlignment: 'left',
    },
    content: [],
    children: [],
  },
]);

const makeCampaign = (
  fields: readonly SettingsField[],
  bodyOverrides: Record<string, string> = {},
  campaignId = 'campaign-1',
) => ({
  __typename: 'Campaign',
  id: campaignId,
  ...Object.fromEntries(
    fields.map(({ fieldName }) => [
      fieldName,
      {
        blocknote: bodyOverrides[fieldName] ?? persistedBody(fieldName),
        markdown: null,
      },
    ]),
  ),
});

const makeCampaignMetadata = (fields: readonly SettingsField[]) => ({
  fields: fields.map(({ fieldName }) => ({
    description: `${fieldName} description`,
    id: `${fieldName}-field`,
    label:
      fieldName === 'emailSignature' ? 'Email signature' : 'Campaign footer',
    name: fieldName,
  })),
  id: 'campaign-object',
  nameSingular: 'campaign',
});

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
  () => {
    const React = jest.requireActual<typeof ReactModule>('react');

    const CampaignSettingsEditor = ({
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
    }) => {
      const [instance] = React.useState(() => ++mockEditorInstance);

      return (
        <button
          data-editor-instance={instance}
          data-editor-min-height={editorMinHeight}
          data-field-name={fieldName}
          data-object-name={objectNameSingular}
          data-placeholder={placeholder}
          data-record-id={recordId}
          data-should-persist={shouldPersistChanges}
          data-show-formatting-controls={showFormattingControls}
          data-testid="campaign-settings-editor"
          onClick={() =>
            onBodyChange?.(
              mockEditorBodies[fieldName] ?? draftBody(`Draft ${fieldName}`),
            )
          }
          type="button"
        >
          {`Edit ${fieldName}`}
        </button>
      );
    };

    return { RichTextFieldEditor: CampaignSettingsEditor };
  },
);

type RenderSettingsOptions = {
  campaignId?: string;
  contentBeforeFields?: ReactNode;
  fields?: readonly SettingsField[];
  record?: ReturnType<typeof makeCampaign> | null;
  useCampaignMetadata?: boolean;
};

const renderSettings = ({
  campaignId = 'campaign-1',
  contentBeforeFields = <div>Native Status</div>,
  fields = settingsFields,
  record = makeCampaign(fields, {}, campaignId),
  useCampaignMetadata = true,
}: RenderSettingsOptions = {}) => {
  const store = resetJotaiStore();
  store.set(recordStoreFamilyState.atomFamily(campaignId), record);

  const renderSurface = ({
    campaignId: nextCampaignId = campaignId,
    contentBeforeFields: nextContentBeforeFields = contentBeforeFields,
    fields: nextFields = fields,
    useCampaignMetadata: shouldUseCampaignMetadata = useCampaignMetadata,
  }: Omit<RenderSettingsOptions, 'record'> = {}) => {
    if (shouldUseCampaignMetadata) {
      mockObjectMetadataItems = [makeCampaignMetadata(nextFields)];
    }

    return (
      <Provider store={store}>
        <MyahCampaignRichTextSettings
          campaignId={nextCampaignId}
          contentBeforeFields={nextContentBeforeFields}
          copy={settingsCopy}
          fields={nextFields}
          modalIdPrefix="campaign-operations-unsaved-changes"
          title="Campaign operations"
        />
      </Provider>
    );
  };

  const view = render(renderSurface());

  return {
    store,
    view,
    rerender: (nextOptions: Omit<RenderSettingsOptions, 'record'> = {}) => {
      view.rerender(renderSurface(nextOptions));
    },
  };
};

describe('MyahCampaignRichTextSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlockerState = 'unblocked';
    mockModalOpened = false;
    mockEditorBodies = {};
    mockEditorInstance = 0;
    mockOpenModal.mockImplementation(() => {
      mockModalOpened = true;
    });
    mockCloseModal.mockImplementation(() => {
      mockModalOpened = false;
    });
    mockRecordLoading = false;
    mockUpdateOneRecord.mockResolvedValue(undefined);
    mockObjectMetadataItems = [makeCampaignMetadata(settingsFields)];
  });

  it('places caller content before the metadata-resolved editor with its requested configuration', () => {
    renderSettings();

    const status = screen.getByText('Native Status');
    const group = screen.getByRole('group', { name: 'Email signature' });
    const editor = screen.getByTestId('campaign-settings-editor');

    expect(status).toBeVisible();
    expect(status.nextElementSibling).toBe(group);
    expect(group).toBeVisible();
    expect(screen.getByText('emailSignature description')).toBeVisible();
    expect(editor).toHaveAttribute('data-editor-min-height', '80');
    expect(editor).toHaveAttribute('data-object-name', 'campaign');
    expect(editor).toHaveAttribute('data-placeholder', 'Enter email signature');
    expect(editor).toHaveAttribute('data-record-id', 'campaign-1');
    expect(editor).toHaveAttribute('data-should-persist', 'false');
    expect(editor).toHaveAttribute('data-show-formatting-controls', 'true');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('persists only on Save, updates baselines between saves, and clears canonically', async () => {
    const { store, view } = renderSettings();
    mockUpdateOneRecord.mockImplementation(
      ({ idToUpdate, updateOneRecordInput }: UpdateOneRecordRequest) => {
        const recordAtom = recordStoreFamilyState.atomFamily(idToUpdate);
        const currentRecord = store.get(recordAtom);
        if (!currentRecord) {
          throw new Error('Expected seeded Campaign record');
        }

        store.set(recordAtom, {
          ...currentRecord,
          ...updateOneRecordInput,
        });

        return Promise.resolve();
      },
    );
    const editor = screen.getByTestId('campaign-settings-editor');

    mockEditorBodies.emailSignature = firstDraftBody;
    fireEvent.click(editor);

    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenNthCalledWith(1, {
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: firstDraftBody,
            markdown: null,
          },
        },
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    mockEditorBodies.emailSignature = secondDraftBody;
    fireEvent.click(screen.getByTestId('campaign-settings-editor'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenNthCalledWith(2, {
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: secondDraftBody,
            markdown: null,
          },
        },
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    mockEditorBodies.emailSignature = thirdDraftBody;
    fireEvent.click(screen.getByTestId('campaign-settings-editor'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenNthCalledWith(3, {
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: thirdDraftBody,
            markdown: null,
          },
        },
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    mockEditorBodies.emailSignature = emptyBlocknoteBody;
    fireEvent.click(screen.getByTestId('campaign-settings-editor'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenNthCalledWith(4, {
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: emptyBlocknoteBody,
            markdown: null,
          },
        },
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    view.unmount();
    renderSettings({
      record: makeCampaign(settingsFields, {
        emailSignature: emptyBlocknoteBody,
      }),
    });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves only the dirty field when configured with multiple fields', async () => {
    renderSettings({ fields: multiFieldSettingsFields });
    mockEditorBodies.emailSignature = firstDraftBody;

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenCalledWith({
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: firstDraftBody,
            markdown: null,
          },
        },
      });
    });
  });

  it('prevents a second Save while the first request is pending', () => {
    let resolveSave: (() => void) | undefined;
    mockUpdateOneRecord.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderSettings();
    mockEditorBodies.emailSignature = firstDraftBody;

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpdateOneRecord).toHaveBeenCalledTimes(1);
    expect(resolveSave).toBeDefined();
  });

  it('reconciles an external change into a clean draft', async () => {
    const externalBody = draftBody('External signature');
    const { store } = renderSettings();

    await act(async () => {
      store.set(
        recordStoreFamilyState.atomFamily('campaign-1'),
        makeCampaign(settingsFields, { emailSignature: externalBody }),
      );
    });

    mockEditorBodies.emailSignature = externalBody;
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('preserves a dirty draft when the same field changes externally', async () => {
    const dirtyBody = draftBody('Local signature');
    const externalBody = draftBody('External signature');
    const { store } = renderSettings();

    mockEditorBodies.emailSignature = dirtyBody;
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );

    await act(async () => {
      store.set(
        recordStoreFamilyState.atomFamily('campaign-1'),
        makeCampaign(settingsFields, { emailSignature: externalBody }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenCalledWith({
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: dirtyBody,
            markdown: null,
          },
        },
      });
    });
  });

  it('keeps the draft through an optimistic rollback and retries its exact body', async () => {
    const dirtyBody = draftBody('Rollback-safe signature');
    let rejectSave: ((error: Error) => void) | undefined;
    const { store } = renderSettings();

    mockUpdateOneRecord.mockImplementationOnce(() => {
      store.set(
        recordStoreFamilyState.atomFamily('campaign-1'),
        makeCampaign(settingsFields, { emailSignature: dirtyBody }),
      );

      return new Promise<void>((_resolve, reject) => {
        rejectSave = reject;
      });
    });
    mockEditorBodies.emailSignature = dirtyBody;

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      store.set(
        recordStoreFamilyState.atomFamily('campaign-1'),
        makeCampaign(settingsFields),
      );
      rejectSave?.(new Error('Write denied'));
    });

    await waitFor(() => {
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Email signature could not be saved.',
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenLastCalledWith({
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: dirtyBody,
            markdown: null,
          },
        },
      });
    });
  });

  it('keeps a failed Save retryable with the custom error copy', async () => {
    mockUpdateOneRecord
      .mockRejectedValueOnce(new Error('Write denied'))
      .mockResolvedValue(undefined);
    renderSettings();
    mockEditorBodies.emailSignature = firstDraftBody;

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockEnqueueErrorSnackBar).toHaveBeenCalledWith({
        message: 'Email signature could not be saved.',
      });
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenNthCalledWith(2, {
        idToUpdate: 'campaign-1',
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: firstDraftBody,
            markdown: null,
          },
        },
      });
      expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
        message: 'Email signature saved.',
      });
    });
  });

  it('blocks browser and router navigation, then keeps or discards the local draft', async () => {
    const { view, rerender } = renderSettings();
    mockEditorBodies.emailSignature = firstDraftBody;

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );

    const beforeUnloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    mockBlockerState = 'blocked';
    rerender();

    await waitFor(() => {
      expect(mockOpenModal).toHaveBeenCalledWith(
        'campaign-operations-unsaved-changes-campaign-1',
      );
    });

    expect(
      screen.getByRole('button', { name: settingsCopy.keepEditing }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: settingsCopy.keepEditing }),
    );
    expect(mockReset).toHaveBeenCalled();

    const editor = screen.getByTestId('campaign-settings-editor');
    const firstEditorInstance = editor.getAttribute('data-editor-instance');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(mockProceed).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(
        screen.getByTestId('campaign-settings-editor'),
      ).not.toHaveAttribute('data-editor-instance', firstEditorInstance);
    });

    view.unmount();
  });

  it('proceeds through a blocked navigation after saving the dirty draft', async () => {
    const { rerender } = renderSettings();
    mockEditorBodies.emailSignature = firstDraftBody;

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );
    mockBlockerState = 'blocked';
    rerender();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockProceed).toHaveBeenCalled();
      expect(mockCloseModal).toHaveBeenCalledWith(
        'campaign-operations-unsaved-changes-campaign-1',
      );
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });

  it.each([
    [
      'the record is loading',
      () => (mockRecordLoading = true),
      makeCampaign(settingsFields),
    ],
    [
      'Campaign metadata is incomplete',
      () => (mockObjectMetadataItems = []),
      makeCampaign(settingsFields),
    ],
    ['the Campaign record has not hydrated', () => undefined, null],
  ])(
    'keeps caller content mounted and Save disabled while %s',
    (_description, arrange, record) => {
      arrange();
      renderSettings({
        record,
        useCampaignMetadata: mockObjectMetadataItems.length > 0,
      });

      expect(
        screen.getByTestId('campaign-rich-text-settings-surface'),
      ).toBeVisible();
      expect(screen.getByText('Native Status')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(screen.queryAllByTestId('campaign-settings-editor')).toHaveLength(
        0,
      );
    },
  );

  it('reinitializes its state when the campaign record changes', async () => {
    const { rerender, store } = renderSettings();
    const secondCampaignId = 'campaign-2';
    const secondCampaignBody = draftBody('Second campaign saved signature');
    const secondDraft = draftBody('Second campaign draft signature');

    store.set(
      recordStoreFamilyState.atomFamily(secondCampaignId),
      makeCampaign(
        settingsFields,
        { emailSignature: secondCampaignBody },
        secondCampaignId,
      ),
    );
    rerender({ campaignId: secondCampaignId });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    mockEditorBodies.emailSignature = secondDraft;
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit emailSignature' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdateOneRecord).toHaveBeenCalledWith({
        idToUpdate: secondCampaignId,
        objectNameSingular: 'campaign',
        updateOneRecordInput: {
          emailSignature: {
            blocknote: secondDraft,
            markdown: null,
          },
        },
      });
    });
  });
});
