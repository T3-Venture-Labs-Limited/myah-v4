/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse a typed baseline prop fixture. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type * as ReactType from 'react';

import { MyahInboxDraftEditor } from '@/myah/inbox/components/MyahInboxDraftEditor';
import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxRichText,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { md: '8px', sm: '4px' },
    },
    color: { pink: 'pink', sky: 'sky' },
    font: {
      color: {
        primary: 'black',
        secondary: 'dimgray',
        tertiary: 'gray',
        danger: 'darkred',
      },
      size: { md: '16px', sm: '13px', xs: '11px' },
      weight: { regular: 400, semiBold: 600 },
    },
    spacing: { 2: '8px', 3: '12px' },
  },
}));

jest.mock(
  '@/object-record/record-field/ui/form-types/components/FormAdvancedTextFieldInput',
  () => {
    const React = jest.requireActual('react') as typeof ReactType;

    const FormAdvancedTextFieldInput = ({
      label,
      ariaLabel,
      defaultValue,
      onChange,
    }: {
      label?: string;
      ariaLabel?: string;
      defaultValue: string;
      onChange: (value: string) => void;
    }) => {
      const [value, setValue] = React.useState(defaultValue);
      const textarea = (
        <textarea
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onChange(`<p>${event.target.value}&nbsp;</p>`);
          }}
        />
      );

      return label ? (
        <label>
          {label}
          {textarea}
        </label>
      ) : (
        textarea
      );
    };

    return { FormAdvancedTextFieldInput };
  },
);

jest.mock('@/myah/inbox/components/MyahInboxRichDraftEditor', () => ({
  MyahInboxRichDraftEditor: ({
    autoFocus,
    body,
    disabled,
    onDraftChange,
  }: {
    autoFocus?: boolean;
    body: MyahInboxRichText;
    disabled: boolean;
    onDraftChange: (body: MyahInboxRichText) => void;
  }) => (
    <div data-main-reply-editor>
      <textarea
        aria-label="Shared reply draft"
        autoFocus={autoFocus}
        data-rich-draft={Boolean(body.blocknote)}
        disabled={disabled}
        value={body.markdown}
        onChange={(event) =>
          onDraftChange({ markdown: event.target.value, blocknote: null })
        }
      />
    </div>
  ),
}));

jest.mock('@/ui/input/components/TextArea', () => ({
  TextArea: ({
    ariaLabel,
    disabled,
    minRows,
    onChange,
    placeholder,
    readOnly,
    value,
  }: {
    ariaLabel?: string;
    minRows?: number;
    disabled?: boolean;
    onChange?: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={minRows}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    ariaLabel,
    value,
    options,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    options: Array<{
      label: string;
      value: string;
      contextualText?: string;
    }>;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
          {option.contextualText ? ` · ${option.contextualText}` : ''}
        </option>
      ))}
    </select>
  ),
}));

const mockAppTooltip = jest.fn((_props: unknown) => null);

jest.mock('twenty-ui/surfaces', () => ({
  AppTooltip: (props: unknown) => mockAppTooltip(props),
  TooltipDelay: { shortDelay: '300ms' },
  TooltipPosition: { Top: 'top' },
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
    ariaLabel,
    Icon,
    accent,
    variant,
    dataTestId,
    ...buttonProps
  }: {
    title?: string;
    onClick?: () => void;
    disabled?: boolean;
    ariaLabel?: string;
    Icon?: ReactType.ComponentType;
    accent?: string;
    variant?: string;
    dataTestId?: string;
  }) => (
    <button
      {...buttonProps}
      aria-label={ariaLabel}
      data-accent={accent}
      data-testid={dataTestId}
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
    >
      {Icon && <Icon />}
      {title}
    </button>
  ),
}));

const cleanEntry: MyahInboxDraftAutosaveEntry = {
  operation: null,
  editorOwner: null,
  localBody: { markdown: 'saved draft', blocknote: null },
  confirmedBody: { markdown: 'saved draft', blocknote: null },
  confirmedRevision: 2,
  dirty: false,
  status: 'idle',
  error: null,
  conflict: null,
  debounceVersion: 0,
  pendingDebounceVersion: null,
  editorVersion: 0,
};

const renderEditor = ({
  draftEntry = cleanEntry,
  onDraftChange = jest.fn(),
  retry = jest.fn(),
  reloadConflict = jest.fn(),
  actions = (
    <>
      <button>Generate Reply</button>
      <button>Send</button>
    </>
  ),
  presentation = 'default',
  subject,
  subjectOptions,
  subjectValue,
  onSubjectChange,
}: {
  draftEntry?: MyahInboxDraftAutosaveEntry;
  onDraftChange?: (body: MyahInboxRichText) => void;
  retry?: () => void;
  reloadConflict?: () => void;
  actions?: ReactType.ReactNode;
  presentation?: 'default' | 'main';
  subject?: string;
  subjectOptions?: Array<{
    label: string;
    value: string;
    contextualText?: string;
  }>;
  subjectValue?: string;
  onSubjectChange?: (value: string) => void;
} = {}) =>
  render(
    <MyahInboxDraftEditor
      entry={draftEntry}
      onDraftChange={onDraftChange}
      onRetry={retry}
      onReloadConflict={reloadConflict}
      actions={actions}
      presentation={presentation}
      subject={subject}
      subjectOptions={subjectOptions}
      subjectValue={subjectValue}
      onSubjectChange={onSubjectChange}
    />,
  );

describe('MyahInboxDraftEditor', () => {
  it('adapts Email state through the shared reply-box seam', () => {
    const source = readFileSync(
      resolve(__dirname, '../MyahInboxDraftEditor.tsx'),
      'utf8',
    );
    expect(source).toContain('MyahInboxReplyBox');
  });

  it('keeps the shared reply draft name accessible without a visible label', () => {
    renderEditor();

    expect(screen.queryByText('Shared reply draft')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Shared reply draft' }),
    ).toBeInTheDocument();
  });

  it('keeps the reply composer at its intended minimum height', () => {
    renderEditor();

    expect(
      screen.getByRole('textbox', { name: 'Shared reply draft' }),
    ).toHaveAttribute('rows', '6');
  });

  it('keeps autosave progress silent while retaining the draft actions', () => {
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        status: 'saving',
        localBody: { markdown: 'operator copy', blocknote: null },
      },
    });

    expect(
      screen.queryByRole('button', { name: 'Save draft' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Saving')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate Reply' }),
    ).toBeVisible();
  });

  it('does not announce successful autosaves', () => {
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        status: 'saved',
      },
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps failed text and delegates an explicit retry', () => {
    const retry = jest.fn();
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        localBody: { markdown: 'do not lose', blocknote: null },
        status: 'error',
        error: 'Could not save the draft. Your changes are still here.',
      },
      retry,
    });

    expect(screen.getByLabelText('Shared reply draft')).toHaveValue(
      'do not lose',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the draft. Your changes are still here.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps local conflict text and moves focus to explicit reload recovery', async () => {
    const reloadConflict = jest.fn();
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        localBody: { markdown: 'my local copy', blocknote: null },
        status: 'conflict',
        conflict: {
          revision: 4,
          body: { markdown: 'newer server copy', blocknote: null },
        },
      },
      reloadConflict,
    });

    expect(screen.getByLabelText('Shared reply draft')).toHaveValue(
      'my local copy',
    );
    expect(screen.getByLabelText('Current saved draft')).toHaveTextContent(
      'newer server copy',
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reload saved draft and discard local changes',
      }),
    );
    expect(reloadConflict).toHaveBeenCalledTimes(1);
  });

  it('delegates plain-text changes without editor HTML', () => {
    const onDraftChange = jest.fn();
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        status: 'conflict',
        conflict: {
          revision: 4,
          body: { markdown: 'newer server copy', blocknote: null },
        },
      },
      onDraftChange,
    });

    fireEvent.change(screen.getByLabelText('Shared reply draft'), {
      target: { value: 'still editing locally' },
    });

    expect(onDraftChange).toHaveBeenCalledWith({
      markdown: 'still editing locally',
      blocknote: null,
    });
  });

  it('renders supplied draft actions once in their supplied order', () => {
    renderEditor();

    const actions = screen.getByLabelText('Draft actions');
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Generate Reply', 'Send']);
    expect(
      within(actions).queryByRole('button', { name: 'Save draft' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the full long reply in a keyboard-accessible body with its footer outside in both modes', () => {
    const markdown =
      'A longer reply paragraph with campaign details.\n\n'.repeat(100);
    const { rerender } = render(
      <MyahInboxDraftEditor
        entry={{ ...cleanEntry, localBody: { markdown, blocknote: null } }}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    const preview = screen.getByRole('region', { name: 'Reply draft preview' });
    expect(preview.textContent).toBe(markdown);
    expect(preview).toHaveAttribute('tabindex', '0');
    expect(preview).not.toContainElement(
      screen.getByLabelText('Draft actions'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    const editor = screen.getByRole('textbox', { name: 'Shared reply draft' });
    expect(editor).toHaveValue(markdown);
    expect(editor).toHaveFocus();
    const boundedEditor = editor.closest('[data-main-reply-editor]');
    expect(boundedEditor).not.toBeNull();
    expect(boundedEditor).not.toContainElement(
      screen.getByLabelText('Draft actions'),
    );

    rerender(
      <MyahInboxDraftEditor
        entry={cleanEntry}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send</button>}
      />,
    );
    expect(
      screen.getByRole('textbox').closest('[data-main-reply-editor]'),
    ).toBeNull();
  });

  it('keeps the shared body and native main editor viewport-bounded with hidden scrollbars', () => {
    // JSDOM does not lay out Linaria CSS; guard the scroll contract separately from DOM behavior.
    const replyBoxSource = readFileSync(
      resolve(__dirname, '../MyahInboxReplyBox.tsx'),
      'utf8',
    );
    expect(replyBoxSource).toMatch(
      /const StyledBody = styled\.div`[\s\S]*?max-height: min\(240px, 40vh\)[\s\S]*?overflow-y: auto[\s\S]*?scrollbar-width: none[\s\S]*?&::-webkit-scrollbar\s*\{\s*display: none/,
    );
    const richEditorSource = readFileSync(
      resolve(__dirname, '../MyahInboxRichDraftEditor.tsx'),
      'utf8',
    );
    expect(richEditorSource).toContain('&[data-main-reply-editor] {');
    expect(richEditorSource).toContain('max-height: min(240px, 40vh)');
  });

  it('separates main reply actions from AI guidance and feedback without changing tab order', () => {
    render(
      <MyahInboxDraftEditor
        entry={cleanEntry}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    const replyActions = screen.getByRole('group', { name: 'Reply actions' });
    const aiActions = screen.getByRole('group', { name: 'AI actions' });
    expect(within(replyActions).getAllByRole('button')).toEqual([
      screen.getByRole('button', { name: 'Send reply' }),
      screen.getByRole('button', { name: 'Edit reply' }),
    ]);
    expect(within(aiActions).getAllByRole('button')).toEqual([
      screen.getByRole('button', { name: 'Open AI guidance' }),
      screen.getByRole('button', { name: 'Thumbs up' }),
      screen.getByRole('button', { name: 'Thumbs down' }),
    ]);
    expect(
      within(screen.getByLabelText('Draft actions')).getAllByRole('button'),
    ).toEqual([
      ...within(replyActions).getAllByRole('button'),
      ...within(aiActions).getAllByRole('button'),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    expect(
      within(replyActions).getByRole('button', { name: 'Done editing' }),
    ).toBeVisible();
  });

  it('centers the main reply subject selector and switches to its exact Campaign thread', () => {
    const onSubjectChange = jest.fn();
    renderEditor({
      actions: <button>Send reply</button>,
      presentation: 'main',
      subject: 'September partnership',
      subjectValue: 'thread-1',
      subjectOptions: [
        {
          value: 'thread-1',
          label: 'September partnership',
          contextualText: 'Spring Campaign',
        },
        {
          value: 'thread-2',
          label: 'Holiday collaboration',
          contextualText: 'Holiday Campaign',
        },
      ],
      onSubjectChange,
    });

    const footer = screen.getByLabelText('Draft actions');
    const replyActions = screen.getByRole('group', { name: 'Reply actions' });
    const subject = screen.getByRole('combobox', {
      name: 'Reply subject',
    });
    const aiActions = screen.getByRole('group', { name: 'AI actions' });
    expect(subject).toHaveValue('thread-1');
    expect(subject).toHaveTextContent(
      'September partnership · Spring Campaign',
    );
    expect([...footer.children]).toEqual([
      replyActions,
      subject.parentElement?.parentElement,
      aiActions.parentElement,
    ]);

    fireEvent.change(subject, { target: { value: 'thread-2' } });
    expect(onSubjectChange).toHaveBeenCalledWith('thread-2');
    expect(screen.getAllByLabelText('Reply subject')).toHaveLength(1);
  });

  it('uses shared inherited typography and a container-responsive balanced footer', () => {
    const replyBoxSource = readFileSync(
      resolve(__dirname, '../MyahInboxReplyBox.tsx'),
      'utf8',
    );

    expect(replyBoxSource).toMatch(
      /const StyledPreview = styled\.div`[\s\S]*?font-size: \$\{themeCssVariables\.font\.size\.md\};[\s\S]*?line-height: inherit/,
    );
    const richEditorSource = readFileSync(
      resolve(__dirname, '../MyahInboxRichDraftEditor.tsx'),
      'utf8',
    );
    expect(richEditorSource).toMatch(
      /&\[data-main-reply-editor\] \.bn-editor \{[\s\S]*?line-height: inherit/,
    );
    expect(replyBoxSource).toContain('container-type: inline-size');
    expect(replyBoxSource).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
    );
    expect(replyBoxSource).toContain('@container (max-width: 480px)');
    expect(replyBoxSource).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
    );
  });

  it('renders the AI actions and center context through the shared channel-neutral components', () => {
    const source = readFileSync(
      resolve(__dirname, '../MyahInboxDraftEditor.tsx'),
      'utf8',
    );

    expect(source).toContain(
      "import { MyahInboxReplyAiActions } from '@/myah/inbox/components/MyahInboxReplyAiActions';",
    );
    expect(source).toContain(
      "import { StyledMyahInboxReplyCenterContext } from '@/myah/inbox/components/MyahInboxReplyCenterContext';",
    );
    expect(source).not.toMatch(/const StyledReplySubject = styled\.div/);
    expect(source).not.toContain("ariaLabel: 'Thumbs up'");
    expect(source).not.toContain('IconThumbUp');
  });

  it('keeps the main card as an inert draft preview until editing is requested', () => {
    mockAppTooltip.mockClear();
    render(
      <MyahInboxDraftEditor
        entry={cleanEntry}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    expect(screen.getByText('saved draft')).toBeVisible();
    expect(
      screen.queryByRole('textbox', { name: 'Shared reply draft' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit reply' })).toHaveAttribute(
      'data-variant',
      'tertiary',
    );
    const guidance = screen.getByRole('button', {
      name: 'Open AI guidance',
    });
    // MYAH-338 accessibility: an unavailable guidance control stays focusable
    // and announces itself rather than being natively disabled.
    expect(guidance).toHaveAttribute('aria-disabled', 'true');
    expect(guidance).toHaveAttribute('data-variant', 'tertiary');
    expect(screen.queryByRole('button', { name: 'Generate reply' })).toBeNull();
    // The guidance tooltip is driven by guidanceUnavailableReason, which this
    // render does not supply, so only the feedback tooltip is registered here.
    expect(mockAppTooltip).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Feedback is a local preview and is not saved.',
      }),
    );
    expect(screen.getByRole('button', { name: 'Thumbs up' })).toHaveAttribute(
      'aria-describedby',
    );
    expect(screen.getByRole('button', { name: 'Thumbs down' })).toHaveAttribute(
      'aria-describedby',
    );
  });

  it('opens and closes main Edit without creating an autosave callback', () => {
    const onDraftChange = jest.fn();
    render(
      <MyahInboxDraftEditor
        entry={cleanEntry}
        onDraftChange={onDraftChange}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('persists main Edit mode through the owning workspace callback', () => {
    const onEditingChange = jest.fn();
    render(
      <MyahInboxDraftEditor
        entry={cleanEntry}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
        onEditingChange={onEditingChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    expect(onEditingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reopens supported structured inline drafts with the rich adapter', () => {
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        localBody: {
          markdown: 'formatted draft',
          blocknote:
            '[{"type":"paragraph","content":[{"type":"text","text":"formatted draft","styles":{"bold":true}}],"children":[]}]',
        },
      },
    });

    expect(screen.getByLabelText('Shared reply draft')).toHaveAttribute(
      'data-rich-draft',
      'true',
    );
  });

  it('warns before explicitly recovering unsupported structured drafts as plain text', () => {
    const onDraftChange = jest.fn();
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        localBody: { markdown: 'recover me', blocknote: '{"unknown":true}' },
      },
      onDraftChange,
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This formatted draft cannot be edited safely.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use plain text' }));
    expect(onDraftChange).toHaveBeenCalledWith({
      markdown: 'recover me',
      blocknote: null,
    });
  });

  it('preserves explicit malformed-rich-body recovery in the main shared reply box', () => {
    const onDraftChange = jest.fn();
    renderEditor({
      draftEntry: {
        ...cleanEntry,
        localBody: { markdown: 'recover me', blocknote: '{"unknown":true}' },
      },
      onDraftChange,
      presentation: 'main',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This formatted draft cannot be edited safely.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use plain text' }));
    expect(onDraftChange).toHaveBeenCalledWith({
      markdown: 'recover me',
      blocknote: null,
    });
  });

  it('focuses the existing textarea and returns the updated operator edit to preview without saving', () => {
    const onDraftChange = jest.fn();
    const editorProps = {
      onDraftChange,
      onRetry: jest.fn(),
      onReloadConflict: jest.fn(),
      actions: <button>Send reply</button>,
      presentation: 'main' as const,
    };
    const { rerender } = render(
      <MyahInboxDraftEditor entry={cleanEntry} {...editorProps} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    const editor = screen.getByRole('textbox', { name: 'Shared reply draft' });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: 'operator edit' } });
    expect(onDraftChange).toHaveBeenCalledWith({
      markdown: 'operator edit',
      blocknote: null,
    });
    rerender(
      <MyahInboxDraftEditor
        entry={{
          ...cleanEntry,
          localBody: { markdown: 'operator edit', blocknote: null },
        }}
        {...editorProps}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByText('operator edit')).toBeVisible();
    expect(onDraftChange).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('textbox', { name: 'Shared reply draft' }),
    ).not.toBeInTheDocument();
  });

  it('keeps error and conflict recovery visible while the main card previews the draft', () => {
    const { rerender } = render(
      <MyahInboxDraftEditor
        entry={{
          ...cleanEntry,
          status: 'error',
          error: 'Could not save the draft. Your changes are still here.',
        }}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the draft. Your changes are still here.',
    );
    rerender(
      <MyahInboxDraftEditor
        entry={{
          ...cleanEntry,
          status: 'conflict',
          conflict: {
            revision: 4,
            body: { markdown: 'newer server copy', blocknote: null },
          },
        }}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    expect(screen.getByLabelText('Current saved draft')).toHaveTextContent(
      'newer server copy',
    );
    expect(
      screen.queryByRole('textbox', { name: 'Shared reply draft' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('does not fabricate an %s main-card draft', (_name, markdown) => {
    render(
      <MyahInboxDraftEditor
        entry={{
          ...cleanEntry,
          localBody: { markdown, blocknote: null },
          confirmedBody: null,
        }}
        onDraftChange={jest.fn()}
        onRetry={jest.fn()}
        onReloadConflict={jest.fn()}
        actions={<button>Send reply</button>}
        presentation="main"
      />,
    );

    expect(screen.queryByText('No reply draft yet.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Reply draft preview' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps feedback mutually exclusive, reversible, and local to its draft text', () => {
    const props = {
      onDraftChange: jest.fn(),
      onRetry: jest.fn(),
      onReloadConflict: jest.fn(),
      actions: <button>Send reply</button>,
      presentation: 'main' as const,
      previewScope: 'workspace-1:thread-1',
    };
    const { rerender } = render(
      <MyahInboxDraftEditor entry={cleanEntry} {...props} />,
    );

    const up = screen.getByRole('button', { name: 'Thumbs up' });
    const down = screen.getByRole('button', { name: 'Thumbs down' });
    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    expect(up).toHaveAttribute('data-selected', 'true');
    expect(up).toHaveAttribute('data-variant', 'secondary');
    expect(up).toHaveAttribute('data-accent', 'brand');
    expect(down).toHaveAttribute('aria-pressed', 'false');
    expect(down).not.toHaveAttribute('data-selected');
    expect(down).toHaveAttribute('data-variant', 'tertiary');
    fireEvent.click(down);
    expect(up).toHaveAttribute('aria-pressed', 'false');
    expect(up).not.toHaveAttribute('data-selected');
    expect(down).toHaveAttribute('aria-pressed', 'true');
    expect(down).toHaveAttribute('data-selected', 'true');
    expect(down).toHaveAttribute('data-variant', 'secondary');
    expect(down).toHaveAttribute('data-accent', 'brand');
    fireEvent.click(down);
    expect(down).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(up);
    rerender(
      <MyahInboxDraftEditor
        entry={{
          ...cleanEntry,
          localBody: { markdown: 'changed draft', blocknote: null },
        }}
        {...props}
      />,
    );
    expect(up).toHaveAttribute('aria-pressed', 'false');
  });

  it.each(['pending', 'unknown'] as const)(
    'disables every main-card action for a received %s operation lock',
    (kind) => {
      const draftEntry = {
        ...cleanEntry,
        operation: { token: Symbol(kind), kind },
      };
      render(
        <MyahInboxDraftEditor
          entry={draftEntry}
          onDraftChange={jest.fn()}
          onRetry={jest.fn()}
          onReloadConflict={jest.fn()}
          actions={<button disabled>Send reply</button>}
          disabled={Boolean(draftEntry.operation)}
          presentation="main"
        />,
      );

      expect(screen.getByRole('button', { name: 'Edit reply' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Thumbs up' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Thumbs down' }),
      ).toBeDisabled();
    },
  );
});
