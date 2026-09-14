import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { MyahInboxRichDraftEditor } from '@/myah/inbox/components/MyahInboxRichDraftEditor';

const mockDocToBlocks = jest.fn();

jest.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: jest.fn(() => ({})) },
  defaultBlockSpecs: {
    paragraph: {},
    bulletListItem: {},
    numberedListItem: {},
  },
  defaultInlineContentSpecs: {},
  defaultStyleSpecs: { bold: {}, italic: {}, underline: {}, strike: {} },
  docToBlocks: (...args: unknown[]) => mockDocToBlocks(...args),
}));

const mockRemoveBeforeChange = jest.fn();
const mockRemoveChange = jest.fn();
const mockPushFocusItemToFocusStack = jest.fn();
const mockRemoveFocusItemFromFocusStackById = jest.fn();
const mockFontLoad = jest.fn();
const originalFontsDescriptor = Object.getOwnPropertyDescriptor(
  document,
  'fonts',
);

const mockEditor = {
  document: [] as unknown[],
  focus: jest.fn(),
  insertInlineContent: jest.fn(),
  isWithinEditor: jest.fn(),
  onBeforeChange: jest.fn(),
  onChange: jest.fn(),
  pmSchema: {},
};

type RichEditorOptions = {
  links: { isValidLink: (href: string) => boolean };
  pasteHandler: (context: {
    event: { clipboardData: { getData: (type: string) => string } };
    editor: typeof mockEditor;
  }) => boolean;
};

const mockUseCreateBlockNote = jest.fn(
  (_options: RichEditorOptions) => mockEditor,
);

jest.mock('@blocknote/react', () => ({
  BasicTextStyleButton: () => null,
  BlockTypeSelect: () => null,
  CreateLinkButton: () => null,
  FormattingToolbar: ({ children }: { children: ReactNode }) => <>{children}</>,
  FormattingToolbarController: () => (
    <button data-testid="floating-toolbar">Formatting toolbar</button>
  ),
  useCreateBlockNote: (options: RichEditorOptions) =>
    mockUseCreateBlockNote(options),
}));

jest.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({
    children,
    editable,
    onBlur,
    onFocus,
  }: {
    children: ReactNode;
    editable?: boolean;
    onBlur?: () => void;
    onFocus?: () => void;
  }) => (
    <>
      <div
        aria-label="Shared reply draft"
        contentEditable={editable}
        onBlur={onBlur}
        onFocus={onFocus}
        role="textbox"
      />
      {children}
    </>
  ),
}));

jest.mock('@/ui/utilities/focus/hooks/usePushFocusItemToFocusStack', () => ({
  usePushFocusItemToFocusStack: () => ({
    pushFocusItemToFocusStack: mockPushFocusItemToFocusStack,
  }),
}));

jest.mock(
  '@/ui/utilities/focus/hooks/useRemoveFocusItemFromFocusStackById',
  () => ({
    useRemoveFocusItemFromFocusStackById: () => ({
      removeFocusItemFromFocusStackById: mockRemoveFocusItemFromFocusStackById,
    }),
  }),
);

const plainBlocks = (text: string) => [
  {
    type: 'paragraph',
    props: {},
    content: [{ type: 'text', text, styles: {} }],
    children: [],
  },
];

const renderEditor = ({
  body = { markdown: 'reply', blocknote: null },
  autoFocus = false,
  onDraftChange = jest.fn(),
  presentation = 'default',
}: {
  body?: { markdown: string; blocknote: string | null };
  autoFocus?: boolean;
  onDraftChange?: (body: {
    markdown: string;
    blocknote: string | null;
  }) => void;
  presentation?: 'default' | 'main';
} = {}) =>
  render(
    <MyahInboxRichDraftEditor
      ariaLabel="Shared reply draft"
      autoFocus={autoFocus}
      body={body}
      disabled={false}
      editorVersion={1}
      focusId="workspace:thread:1"
      onDraftChange={onDraftChange}
      presentation={presentation}
    />,
  );

describe('MyahInboxRichDraftEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditor.document = plainBlocks('reply');
    mockEditor.isWithinEditor.mockReturnValue(false);
    mockEditor.onBeforeChange.mockReturnValue(mockRemoveBeforeChange);
    mockEditor.onChange.mockReturnValue(mockRemoveChange);
    mockDocToBlocks.mockReturnValue(plainBlocks('reply'));
    mockFontLoad.mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: mockFontLoad },
    });
  });

  afterEach(() => {
    if (originalFontsDescriptor) {
      Object.defineProperty(document, 'fonts', originalFontsDescriptor);
    } else {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('prewarms Inter 700 only when the main editor opens', () => {
    const onDraftChange = jest.fn();
    const { rerender } = renderEditor({ onDraftChange });

    expect(mockFontLoad).not.toHaveBeenCalled();
    expect(onDraftChange).not.toHaveBeenCalled();

    rerender(
      <MyahInboxRichDraftEditor
        ariaLabel="Shared reply draft"
        body={{ markdown: 'reply', blocknote: null }}
        disabled={false}
        editorVersion={1}
        focusId="workspace:thread:1"
        onDraftChange={onDraftChange}
        presentation="main"
      />,
    );
    expect(mockFontLoad).toHaveBeenCalledWith('700 13px Inter');

    mockEditor.document = [
      {
        ...plainBlocks('reply')[0],
        content: [{ type: 'text', text: 'reply', styles: { bold: true } }],
      },
    ];
    act(() => mockEditor.onChange.mock.calls[0][0](mockEditor));
    expect(onDraftChange).toHaveBeenCalledTimes(1);
    expect(mockFontLoad).toHaveBeenCalledTimes(1);

    rerender(
      <MyahInboxRichDraftEditor
        ariaLabel="Shared reply draft"
        body={{ markdown: 'updated reply', blocknote: null }}
        disabled={false}
        editorVersion={1}
        focusId="workspace:thread:1"
        onDraftChange={onDraftChange}
        presentation="main"
      />,
    );
    expect(mockFontLoad).toHaveBeenCalledTimes(1);
  });

  it('skips unavailable font APIs and contains prewarm rejections', async () => {
    Reflect.deleteProperty(document, 'fonts');
    const onDraftChange = jest.fn();
    expect(() =>
      renderEditor({ onDraftChange, presentation: 'main' }),
    ).not.toThrow();
    expect(onDraftChange).not.toHaveBeenCalled();

    mockFontLoad.mockRejectedValueOnce(new Error('font unavailable'));
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: mockFontLoad },
    });
    renderEditor({ onDraftChange, presentation: 'main' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFontLoad).toHaveBeenCalledWith('700 13px Inter');
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('does not write on mount, but persists a mark-only native transaction', () => {
    const onDraftChange = jest.fn();
    renderEditor({ onDraftChange });

    act(() => mockEditor.onChange.mock.calls[0][0](mockEditor));
    expect(onDraftChange).not.toHaveBeenCalled();

    const markedBlocks = [
      {
        ...plainBlocks('reply')[0],
        content: [{ type: 'text', text: 'reply', styles: { bold: true } }],
      },
    ];
    mockEditor.document = markedBlocks;
    act(() => mockEditor.onChange.mock.calls[0][0](mockEditor));

    expect(onDraftChange).toHaveBeenCalledWith({
      markdown: 'reply',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"reply","styles":{"bold":true}}],"children":[]}]',
    });
  });

  it('accepts only safe links and pastes visible plain text', () => {
    renderEditor();

    const options = (
      mockUseCreateBlockNote.mock.calls as unknown as Array<[RichEditorOptions]>
    ).at(-1)?.[0];
    if (!options) throw new Error('BlockNote options were not captured');
    expect(options.links.isValidLink('https://example.com')).toBe(true);
    const unsafeLink = ['java', 'script:alert(1)'].join('');
    expect(options.links.isValidLink(unsafeLink)).toBe(false);
    options.pasteHandler({
      event: { clipboardData: { getData: () => '<img src=x>Visible text' } },
      editor: mockEditor,
    });
    expect(mockEditor.insertInlineContent).toHaveBeenCalledWith(
      '<img src=x>Visible text',
    );
  });

  it('keeps default inline native chrome while scoping frameless rules to main Edit', () => {
    const source = readFileSync(
      resolve(__dirname, '../MyahInboxRichDraftEditor.tsx'),
      'utf8',
    );

    expect(source).toContain('&[data-main-reply-editor] .bn-container');
    expect(source).toContain(
      '&[data-main-reply-editor] .bn-editor:focus-within',
    );
    expect(source).toMatch(
      /&\[data-main-reply-editor\] \.bn-editor \{[\s\S]*?padding: 0/,
    );
    expect(source).toMatch(
      /&\[data-main-reply-editor\] \.bn-toolbar\.bn-formatting-toolbar \{[\s\S]*?box-shadow: none/,
    );
    expect(source).not.toMatch(/^  & \.bn-container,/m);
  });

  it('rejects an over-limit transaction before mutation and keeps the last valid draft through reopen', () => {
    const onDraftChange = jest.fn();
    const props = { onDraftChange };
    const { unmount } = renderEditor(props);
    const beforeChange = mockEditor.onBeforeChange.mock.calls[0][0];

    mockDocToBlocks.mockReturnValue(plainBlocks('x'.repeat(100_001)));
    let changeAllowed: boolean | void = undefined;
    act(() => {
      changeAllowed = beforeChange({ tr: { doc: {}, docChanged: true } });
    });
    expect(changeAllowed).toBe(false);
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(mockEditor.document).toEqual(plainBlocks('reply'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This change was not applied',
    );

    unmount();
    renderEditor(props);
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('accepts a valid edit after rejection and emits the complete current body synchronously', () => {
    const onDraftChange = jest.fn();
    renderEditor({ onDraftChange });
    const beforeChange = mockEditor.onBeforeChange.mock.calls[0][0];

    mockDocToBlocks.mockReturnValue(plainBlocks('x'.repeat(100_001)));
    let rejectedChangeAllowed: boolean | void = undefined;
    act(() => {
      rejectedChangeAllowed = beforeChange({
        tr: { doc: {}, docChanged: true },
      });
    });
    expect(rejectedChangeAllowed).toBe(false);

    const markedBlocks = [
      {
        ...plainBlocks('reply')[0],
        content: [{ type: 'text', text: 'reply', styles: { italic: true } }],
      },
    ];
    mockDocToBlocks.mockReturnValue(markedBlocks);
    let acceptedChangeAllowed: boolean | void = undefined;
    act(() => {
      acceptedChangeAllowed = beforeChange({
        tr: { doc: {}, docChanged: true },
      });
    });
    expect(acceptedChangeAllowed).toBe(true);
    mockEditor.document = markedBlocks;
    act(() => mockEditor.onChange.mock.calls[0][0](mockEditor));

    expect(onDraftChange).toHaveBeenLastCalledWith({
      markdown: 'reply',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"reply","styles":{"italic":true}}],"children":[]}]',
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('serializes undo, empty documents, and trailing paragraphs without selection writes', () => {
    const onDraftChange = jest.fn();
    renderEditor({ onDraftChange });
    const beforeChange = mockEditor.onBeforeChange.mock.calls[0][0];
    const onChange = mockEditor.onChange.mock.calls[0][0];

    let selectionChangeAllowed: boolean | void = undefined;
    act(() => {
      selectionChangeAllowed = beforeChange({
        tr: { doc: {}, docChanged: false },
      });
    });
    expect(selectionChangeAllowed).toBe(true);
    expect(onDraftChange).not.toHaveBeenCalled();

    const markedBlocks = [
      {
        ...plainBlocks('reply')[0],
        content: [{ type: 'text', text: 'reply', styles: { strike: true } }],
      },
    ];
    mockEditor.document = markedBlocks;
    act(() => onChange(mockEditor));
    mockEditor.document = plainBlocks('reply');
    act(() => onChange(mockEditor));
    expect(onDraftChange).toHaveBeenLastCalledWith({
      markdown: 'reply',
      blocknote:
        '[{"type":"paragraph","content":[{"type":"text","text":"reply","styles":{}}],"children":[]}]',
    });

    mockEditor.document = plainBlocks('');
    act(() => onChange(mockEditor));
    expect(onDraftChange).toHaveBeenLastCalledWith({
      markdown: '',
      blocknote: null,
    });

    mockEditor.document = [...plainBlocks('reply'), ...plainBlocks('')];
    act(() => onChange(mockEditor));
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ markdown: 'reply\n' }),
    );
  });

  it('autofocuses natively, cleans up subscriptions, and retains focus-stack ownership through the toolbar', () => {
    jest.useFakeTimers();
    const { unmount } = renderEditor({ autoFocus: true });
    const editorElement = screen.getByRole('textbox', {
      name: 'Shared reply draft',
    });
    const toolbar = screen.getByTestId('floating-toolbar');

    expect(mockEditor.focus).toHaveBeenCalledTimes(1);
    fireEvent.focus(editorElement);
    expect(mockPushFocusItemToFocusStack).toHaveBeenCalledWith(
      expect.objectContaining({ focusId: 'workspace:thread:1' }),
    );
    mockEditor.isWithinEditor.mockImplementation(
      (element: Element) => element === toolbar,
    );
    fireEvent.blur(editorElement);
    toolbar.focus();
    act(() => jest.runOnlyPendingTimers());
    expect(mockRemoveFocusItemFromFocusStackById).not.toHaveBeenCalled();

    unmount();
    expect(mockRemoveBeforeChange).toHaveBeenCalledTimes(1);
    expect(mockRemoveChange).toHaveBeenCalledTimes(1);
    expect(mockRemoveFocusItemFromFocusStackById).toHaveBeenCalledWith({
      focusId: 'workspace:thread:1',
    });
    jest.useRealTimers();
  });

  it('removes native formatting controls while locked', () => {
    render(
      <MyahInboxRichDraftEditor
        ariaLabel="Shared reply draft"
        body={{ markdown: '', blocknote: null }}
        disabled
        editorVersion={1}
        focusId="workspace:thread:1"
        onDraftChange={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Shared reply draft' }),
    ).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByTestId('floating-toolbar')).not.toBeInTheDocument();
  });
});
