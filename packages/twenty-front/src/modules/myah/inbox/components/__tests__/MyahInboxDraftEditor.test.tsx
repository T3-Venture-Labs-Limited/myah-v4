/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse a typed baseline prop fixture. */
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
    background: { transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { sm: '4px' },
    },
    font: {
      color: {
        primary: 'black',
        secondary: 'dimgray',
        tertiary: 'gray',
        danger: 'darkred',
      },
      size: { sm: '13px', xs: '11px' },
      weight: { semiBold: 600 },
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
            onChange(event.target.value);
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

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    onClick,
    disabled,
  }: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

const cleanEntry: MyahInboxDraftAutosaveEntry = {
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
}: {
  draftEntry?: MyahInboxDraftAutosaveEntry;
  onDraftChange?: (body: MyahInboxRichText) => void;
  retry?: () => void;
  reloadConflict?: () => void;
  actions?: ReactType.ReactNode;
} = {}) =>
  render(
    <MyahInboxDraftEditor
      entry={draftEntry}
      onDraftChange={onDraftChange}
      onRetry={retry}
      onReloadConflict={reloadConflict}
      actions={actions}
    />,
  );

describe('MyahInboxDraftEditor', () => {
  it('keeps the shared reply draft name accessible without a visible label', () => {
    renderEditor();

    expect(screen.queryByText('Shared reply draft')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Shared reply draft' }),
    ).toBeInTheDocument();
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

  it('delegates rich-text changes to the controller while conflicted', () => {
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
});
