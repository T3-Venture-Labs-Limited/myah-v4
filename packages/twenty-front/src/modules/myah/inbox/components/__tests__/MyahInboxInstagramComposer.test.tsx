/* oxlint-disable react/jsx-props-no-spreading -- Tests reuse a typed baseline prop fixture. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type * as ReactType from 'react';

import { MyahInboxInstagramComposer } from '@/myah/inbox/components/MyahInboxInstagramComposer';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { primary: 'white', transparent: { lighter: 'whitesmoke' } },
    border: {
      color: { light: 'gray', medium: 'gray' },
      radius: { md: '8px', sm: '4px' },
    },
    color: { pink: 'pink', sky: 'sky' },
    font: {
      color: { primary: 'black', secondary: 'gray', danger: 'red' },
      size: { md: '16px', sm: '13px', xs: '12px' },
    },
    spacing: { 2: '8px', 3: '12px', 6: '24px' },
  },
}));

jest.mock('twenty-ui/icon', () => ({
  useIcons: () => ({ getIcon: () => undefined }),
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

jest.mock('@/ui/input/components/Select', () => ({
  Select: ({
    ariaLabel,
    value,
    options,
    onChange,
    disabled,
    emptyOption,
  }: {
    ariaLabel: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
    disabled?: boolean;
    emptyOption?: { label: string; value: string };
  }) => (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {emptyOption && (
        <option value={emptyOption.value}>{emptyOption.label}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

jest.mock('@/ui/input/components/TextArea', () => ({
  TextArea: ({
    ariaLabel,
    disabled,
    onChange,
    value,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxRichDraftEditor', () => ({
  MyahInboxRichDraftEditor: ({
    ariaLabel,
    body,
    onDraftChange,
    mode,
  }: {
    ariaLabel: string;
    body: { markdown: string; blocknote: string | null };
    onDraftChange: (body: {
      markdown: string;
      blocknote: string | null;
    }) => void;
    mode: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      data-mode={mode}
      value={body.markdown}
      onChange={(event) =>
        onDraftChange({ markdown: event.target.value, blocknote: null })
      }
    />
  ),
}));

const renderComposer = (
  overrides: Partial<
    React.ComponentProps<typeof MyahInboxInstagramComposer>
  > = {},
) => {
  const defaultOnBodyChange = jest.fn();
  const defaultOnReviewAndSend = jest.fn();
  const {
    body = 'Existing draft',
    channelState = 'READY',
    disabled,
    editorVersion,
    error,
    provider,
    sending,
    username = 'creator',
    conflict,
    campaignOptions,
    selectedCampaignId,
    onSelectCampaign,
    campaignUnavailableReason,
    onOpenAiGuidance,
    guidanceUnavailableReason,
    onBodyChange = defaultOnBodyChange,
    onReloadConflict,
    onReviewAndSend = defaultOnReviewAndSend,
  } = overrides;
  render(
    <MyahInboxInstagramComposer
      body={body}
      channelState={channelState}
      disabled={disabled}
      editorVersion={editorVersion}
      error={error}
      provider={provider}
      sending={sending}
      username={username}
      conflict={conflict}
      campaignOptions={campaignOptions}
      selectedCampaignId={selectedCampaignId}
      onSelectCampaign={onSelectCampaign}
      campaignUnavailableReason={campaignUnavailableReason}
      onOpenAiGuidance={onOpenAiGuidance}
      guidanceUnavailableReason={guidanceUnavailableReason}
      onBodyChange={onBodyChange}
      onReloadConflict={onReloadConflict}
      onReviewAndSend={onReviewAndSend}
    />,
  );
  return { onBodyChange, onReviewAndSend };
};

describe('MyahInboxInstagramComposer', () => {
  it('uses the shared reply box with an inert preview and Instagram-specific slots', () => {
    renderComposer();
    expect(screen.getByTestId('myah-inbox-reply-box')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Reply draft preview' }),
    ).toHaveTextContent('Existing draft');
    expect(screen.queryByText('@creator · Instagram')).not.toBeInTheDocument();
    const aiActions = screen.getByRole('group', { name: 'AI actions' });
    expect(within(aiActions).getByText('14 / 1000')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /generate|subject/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open AI guidance' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thumbs up' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thumbs down' }),
    ).toBeInTheDocument();
  });

  it('shows a disabled same-footprint Campaign selector with an actionable reason when unavailable', () => {
    renderComposer({
      campaignUnavailableReason: 'No associated Campaigns yet.',
    });
    expect(
      screen.getByRole('group', { name: 'Campaign context' }),
    ).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Campaign context' });
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('No associated Campaigns yet.');
  });

  it('renders readable Campaign options and reports the selected choice', () => {
    const onSelectCampaign = jest.fn();
    renderComposer({
      campaignOptions: [
        { value: 'campaign-a', label: 'Alpha' },
        { value: 'campaign-b', label: 'Beta' },
      ],
      selectedCampaignId: null,
      onSelectCampaign,
    });
    const select = screen.getByRole('combobox', { name: 'Campaign context' });
    expect(select).toBeEnabled();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'campaign-b' } });
    expect(onSelectCampaign).toHaveBeenCalledWith('campaign-b');
  });

  it('invokes Open AI guidance and keeps mutually exclusive local thumbs feedback', () => {
    const onOpenAiGuidance = jest.fn();
    renderComposer({ onOpenAiGuidance });
    fireEvent.click(screen.getByRole('button', { name: 'Open AI guidance' }));
    expect(onOpenAiGuidance).toHaveBeenCalledTimes(1);

    const up = screen.getByRole('button', { name: 'Thumbs up' });
    const down = screen.getByRole('button', { name: 'Thumbs down' });
    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(down);
    expect(up).toHaveAttribute('aria-pressed', 'false');
    expect(down).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks unavailable guidance with an accessible reason instead of an enabled non-functional control', () => {
    renderComposer({
      guidanceUnavailableReason: 'Select a Campaign to open AI guidance.',
    });
    const guidance = screen.getByRole('button', { name: 'Open AI guidance' });
    expect(guidance).toHaveAttribute('aria-disabled', 'true');
    expect(mockAppTooltip).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Select a Campaign to open AI guidance.',
      }),
    );
  });

  it('maps plain-text edits and review actions through the shared surface', () => {
    const { onBodyChange, onReviewAndSend } = renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Edit reply' }));
    const editor = screen.getByRole('textbox', {
      name: 'Message @creator via Instagram',
    });
    expect(editor).toHaveAttribute('data-mode', 'plain-text');
    fireEvent.change(editor, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
    expect(onBodyChange).toHaveBeenCalledWith('Hello');
    expect(onReviewAndSend).toHaveBeenCalledTimes(1);
  });

  it.each([999, 1000])(
    'keeps the exact %i / 1000 byte copy enabled at the limit',
    (length) => {
      renderComposer({ body: 'a'.repeat(length) });
      expect(screen.getByText(`${length} / 1000`)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Review and send' }),
      ).toBeEnabled();
    },
  );

  it('prioritizes the 1001-byte actionable error and keeps multibyte measurement exact', () => {
    renderComposer({
      body: '\u{1F600}'.repeat(251),
      error: 'Could not save the Instagram draft',
    });
    expect(screen.getByText('1004 / 1000')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review and send' }),
    ).toBeDisabled();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
  });

  it('announces one conflict alert instead of duplicating the panel conflict error', () => {
    renderComposer({
      conflict: { revision: 4, body: 'Saved elsewhere' },
      error: 'This Instagram draft changed elsewhere.',
      onReloadConflict: jest.fn(),
    });

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Draft conflict at revision 4',
    );
  });

  it.each([
    [{ body: '' }],
    [{ disabled: true }],
    [{ sending: true }],
    [{ channelState: 'AMBIGUOUS' as const }],
    [{ provider: 'COMPOSIO_HISTORY' as const }],
  ])('disables review when input is blocked: %j', (overrides) => {
    renderComposer(overrides);
    expect(
      screen.getByRole('button', { name: 'Review and send' }),
    ).toBeDisabled();
  });
});
