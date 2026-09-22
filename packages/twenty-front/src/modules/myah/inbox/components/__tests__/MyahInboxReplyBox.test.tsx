import { fireEvent, render, screen } from '@testing-library/react';

import { MyahInboxReplyBox } from '@/myah/inbox/components/MyahInboxReplyBox';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'lightgray', medium: 'gray' },
      radius: { md: '8px', sm: '4px' },
    },
    color: { pink: 'pink', sky: 'sky' },
    font: {
      color: { primary: 'black', secondary: 'gray', danger: 'red' },
      size: { md: '16px', xs: '12px' },
    },
    spacing: { 2: '8px', 3: '12px', 6: '24px' },
  },
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    ariaLabel,
    onClick,
    disabled,
  }: {
    title: string;
    ariaLabel?: string;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {title}
    </button>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxRichDraftEditor', () => ({
  MyahInboxRichDraftEditor: ({
    ariaLabel,
    body,
    onDraftChange,
  }: {
    ariaLabel: string;
    body: { markdown: string; blocknote: string | null };
    onDraftChange: (body: {
      markdown: string;
      blocknote: string | null;
    }) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={body.markdown}
      onChange={(event) =>
        onDraftChange({ markdown: event.target.value, blocknote: null })
      }
    />
  ),
}));

describe('MyahInboxReplyBox', () => {
  const renderReplyBox = (
    overrides: Partial<React.ComponentProps<typeof MyahInboxReplyBox>> = {},
  ) => {
    const defaultOnBodyChange = jest.fn();
    const {
      body = { markdown: 'Saved reply', blocknote: null },
      bodyAriaLabel = 'Message @ada via Instagram',
      centerContext = <span>@ada · Instagram</span>,
      conflict,
      disabled,
      editorMode,
      editorVersion = 1,
      error,
      isEditing,
      onBodyChange = defaultOnBodyChange,
      onEditingChange,
      onReloadConflict,
      onRetry,
      presentation,
      primaryActions = <button>Review and send</button>,
      previewScope,
      reloadConflictLabel,
      trailingActions = <span>11 / 1000</span>,
    } = overrides;
    render(
      <MyahInboxReplyBox
        body={body}
        bodyAriaLabel={bodyAriaLabel}
        centerContext={centerContext}
        conflict={conflict}
        disabled={disabled}
        editorMode={editorMode}
        editorVersion={editorVersion}
        error={error}
        isEditing={isEditing}
        onBodyChange={onBodyChange}
        onEditingChange={onEditingChange}
        onReloadConflict={onReloadConflict}
        onRetry={onRetry}
        presentation={presentation}
        primaryActions={primaryActions}
        previewScope={previewScope}
        reloadConflictLabel={reloadConflictLabel}
        trailingActions={trailingActions}
      />,
    );
    return onBodyChange;
  };

  it('renders the shared finalized frame, focusable preview, and generic three-area footer', () => {
    renderReplyBox();
    expect(screen.getByTestId('myah-inbox-reply-box')).toHaveAttribute(
      'data-main-reply-card',
    );
    expect(
      screen.getByRole('region', { name: 'Reply draft preview' }),
    ).toHaveAttribute('tabindex', '0');
    expect(screen.getByText('@ada · Instagram')).toBeInTheDocument();
    expect(screen.getByText('11 / 1000')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit reply' }),
    ).toBeInTheDocument();
  });

  it('keeps Edit visible for empty drafts and changes mode without writing the draft', () => {
    const onBodyChange = renderReplyBox({
      body: { markdown: '', blocknote: null },
    });
    expect(
      screen.getByRole('button', { name: 'Edit reply' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('myah-inbox-reply-box-body'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    expect(
      screen.getByRole('textbox', { name: 'Message @ada via Instagram' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('myah-inbox-reply-box-body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(
      screen.queryByTestId('myah-inbox-reply-box-body'),
    ).not.toBeInTheDocument();
    expect(onBodyChange).not.toHaveBeenCalled();
  });

  it('uses one focused common conflict alert with adapter supplied recovery copy', () => {
    const reload = jest.fn();
    renderReplyBox({
      conflict: { revision: 2, body: { markdown: 'saved', blocknote: null } },
      onReloadConflict: reload,
      reloadConflictLabel: 'Reload saved Instagram draft',
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved Instagram draft' }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus again when the same conflict is reconstructed', () => {
    const props = {
      body: { markdown: 'local', blocknote: null },
      bodyAriaLabel: 'Message @ada via Instagram',
      editorVersion: 1,
      onBodyChange: jest.fn(),
      primaryActions: <button>Review and send</button>,
      conflict: {
        revision: 2,
        body: { markdown: 'saved', blocknote: null },
      },
      onReloadConflict: jest.fn(),
      reloadConflictLabel: 'Reload saved Instagram draft',
    };
    const { rerender } = render(
      <MyahInboxReplyBox
        body={props.body}
        bodyAriaLabel={props.bodyAriaLabel}
        editorVersion={props.editorVersion}
        onBodyChange={props.onBodyChange}
        primaryActions={props.primaryActions}
        conflict={props.conflict}
        onReloadConflict={props.onReloadConflict}
        reloadConflictLabel={props.reloadConflictLabel}
      />,
    );
    const reloadButton = screen.getByRole('button', {
      name: 'Reload saved Instagram draft',
    });
    reloadButton.focus();

    rerender(
      <MyahInboxReplyBox
        body={props.body}
        bodyAriaLabel={props.bodyAriaLabel}
        editorVersion={props.editorVersion}
        onBodyChange={props.onBodyChange}
        primaryActions={props.primaryActions}
        conflict={{
          revision: 2,
          body: { markdown: 'saved', blocknote: null },
        }}
        onReloadConflict={props.onReloadConflict}
        reloadConflictLabel={props.reloadConflictLabel}
      />,
    );

    expect(reloadButton).toHaveFocus();
  });

  it('renders a single common save error and exposes bounded body/footer regions', () => {
    renderReplyBox({ error: 'Could not save the draft.' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the draft.',
    );
    expect(screen.getByTestId('myah-inbox-reply-box-body')).toBeInTheDocument();
    expect(
      screen.getByTestId('myah-inbox-reply-box-footer'),
    ).toBeInTheDocument();
  });
});
