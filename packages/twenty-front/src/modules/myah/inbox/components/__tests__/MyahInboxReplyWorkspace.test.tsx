import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type * as ReactType from 'react';

import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';
import { type MyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxDraftAutosaveEntry } from '@/myah/inbox/types/MyahInboxDraftAutosave';

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'whitesmoke' } },
    border: { color: { light: 'lightgray' }, radius: { md: '8px' } },
    font: {
      color: { primary: 'black', secondary: 'gray' },
      size: { sm: '13px', xs: '11px' },
      weight: { medium: 500 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px' },
  },
}));

const mockUseFindOneRecord = jest.fn();
const mockController = {
  reconcile: jest.fn(),
  updateDraft: jest.fn(),
  flush: jest.fn(),
  retry: jest.fn(),
  reloadConflict: jest.fn(),
  applyProposal: jest.fn(),
  flushWorkspace: jest.fn(),
} as jest.Mocked<MyahInboxDraftAutosaveController>;

let mockCurrentWorkspace: { id: string } | null = { id: 'workspace-1' };
let mockDraftEntry: MyahInboxDraftAutosaveEntry | null = {
  localBody: { markdown: 'Saved draft', blocknote: null },
  confirmedBody: { markdown: 'Saved draft', blocknote: null },
  confirmedRevision: 3,
  dirty: false,
  status: 'idle',
  error: null,
  conflict: null,
  debounceVersion: 0,
  pendingDebounceVersion: null,
  editorVersion: 0,
};
let mockObjectMetadataItems = [{ nameSingular: 'messageThread' }];

type MockSendActionMode = 'deferred' | 'pending' | 'sending' | 'unknown';

let mockSendActionMode: MockSendActionMode = 'sending';
let mockIsGenerating = false;
let mockSendActionDeferred: {
  promise: Promise<void>;
  resolve: (value: void) => void;
} | null = null;

jest.mock('@/object-record/hooks/useFindOneRecord', () => ({
  useFindOneRecord: (...args: unknown[]) => mockUseFindOneRecord(...args),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => mockCurrentWorkspace,
}));

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useAtomValue: () => mockDraftEntry,
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxDraftAutosaveController', () => ({
  useMyahInboxDraftAutosaveControllerContext: () => mockController,
}));

jest.mock('@/myah/inbox/components/MyahInboxDraftEditor', () => ({
  MyahInboxDraftEditor: ({
    entry,
    onDraftChange,
    onRetry,
    onReloadConflict,
    actions,
    disabled,
  }: {
    entry: MyahInboxDraftAutosaveEntry;
    onDraftChange: (body: { markdown: string; blocknote: null }) => void;
    onRetry: () => void;
    onReloadConflict: () => void;
    actions: ReactType.ReactNode;
    disabled: boolean;
  }) => (
    <div aria-label="Shared reply draft editor">
      <output aria-label="Draft status">{entry.status}</output>
      <button
        disabled={disabled}
        onClick={() =>
          onDraftChange({ markdown: 'pending local edit', blocknote: null })
        }
      >
        Make pending local edit
      </button>
      <button onClick={onRetry}>Retry draft save</button>
      <button onClick={onReloadConflict}>Reload draft conflict</button>
      <div aria-label="Draft actions">{actions}</div>
    </div>
  ),
}));
jest.mock(
  '@/myah/inbox/components/MyahInboxReplySendAction',
  () => {
    const React = jest.requireActual('react') as typeof ReactType;

    return {
      MyahInboxReplySendAction: ({
        disabled,
        onSendingChange,
      }: {
        disabled?: boolean;
        onSendingChange: (sending: boolean) => void;
      }) => {
        const [isLocked, setIsLocked] = React.useState(false);
        const [isUnknown, setIsUnknown] = React.useState(false);

        const handleSend = () => {
          onSendingChange(true);

          if (mockSendActionMode === 'unknown') {
            setIsUnknown(true);
            setIsLocked(true);
          }
          if (
            mockSendActionMode === 'pending' ||
            mockSendActionMode === 'deferred'
          ) {
            setIsLocked(true);
          }
          if (mockSendActionMode === 'deferred') {
            void mockSendActionDeferred?.promise.finally(() =>
              onSendingChange(false),
            );
          }
        };

        return (
          <>
            <button
              data-variant="primary"
              disabled={disabled || isLocked}
              onClick={handleSend}
            >
              Send
            </button>
            {isUnknown && <span role="alert">Unknown delivery</span>}
          </>
        );
      },
    };
  },
  { virtual: true },
);

jest.mock('@/myah/inbox/components/MyahInboxProposalPreview', () => ({
  MyahInboxProposalPreview: ({
    disabled,
    onApply,
    renderGenerateAction,
  }: {
    disabled: boolean;
    onApply: (body: { markdown: string; blocknote: null }) => void;
    renderGenerateAction: (
      generateAction: ReactType.ReactNode,
      isGenerating: boolean,
    ) => ReactType.ReactNode;
  }) =>
    renderGenerateAction(
      <button
        data-variant="secondary"
        disabled={disabled || mockIsGenerating}
        onClick={() =>
          onApply({ markdown: 'generated reply', blocknote: null })
        }
      >
        Generate Reply
      </button>,
      mockIsGenerating,
    ),
}));
const thread = {
  id: 'thread-1',
  lastActivityAt: '2026-07-24T12:00:00.000Z',
  subject: 'First conversation',
  lastMessagePreview: 'First preview',
  lastMessageSender: 'Ada',
  state: 'NEEDS_REPLY' as const,
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Ada Creator' },
  campaign: null,
  inboxOwner: { id: 'member-1', name: 'Zachary' },
};

const createDeferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

describe('MyahInboxReplyWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentWorkspace = { id: 'workspace-1' };
    mockSendActionMode = 'sending';
    mockIsGenerating = false;
    mockSendActionDeferred = null;
    mockDraftEntry = {
      localBody: { markdown: 'Saved draft', blocknote: null },
      confirmedBody: { markdown: 'Saved draft', blocknote: null },
      confirmedRevision: 3,
      dirty: false,
      status: 'idle',
      error: null,
      conflict: null,
      debounceVersion: 0,
      pendingDebounceVersion: null,
      editorVersion: 0,
    };
    mockObjectMetadataItems = [{ nameSingular: 'messageThread' }];
    mockUseFindOneRecord.mockReturnValue({
      record: {
        id: 'thread-1',
        __typename: 'MessageThread',
        myahReplyDraftBody: { markdown: 'Saved draft', blocknote: null },
        myahReplyDraftRevision: 3,
      },
      loading: false,
    });
  });

  it('defers the draft lookup until MessageThread metadata is available', () => {
    mockObjectMetadataItems = [];

    render(<MyahInboxReplyWorkspace thread={thread} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading shared draft',
    );
    expect(mockUseFindOneRecord).not.toHaveBeenCalled();
  });

  it('reconciles native draft reads with the workspace-scoped controller entry', async () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    await waitFor(() =>
      expect(mockController.reconcile).toHaveBeenCalledWith({
        key: { workspaceId: 'workspace-1', threadId: 'thread-1' },
        revision: 3,
        body: { markdown: 'Saved draft', blocknote: null },
      }),
    );
    expect(mockUseFindOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'messageThread',
      objectRecordId: 'thread-1',
      recordGqlFields: {
        id: true,
        myahReplyDraftBody: { markdown: true, blocknote: true },
        myahReplyDraftRevision: true,
      },
      skip: false,
    });
  });

  it('delegates editor transitions to the workspace-scoped controller', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Make pending local edit' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry draft save' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload draft conflict' }),
    );

    const key = { workspaceId: 'workspace-1', threadId: 'thread-1' };
    expect(mockController.updateDraft).toHaveBeenCalledWith({
      key,
      body: { markdown: 'pending local edit', blocknote: null },
    });
    expect(mockController.retry).toHaveBeenCalledWith(key);
    expect(mockController.reloadConflict).toHaveBeenCalledWith(key);
  });

  it('renders Generate Reply then Send as the only normal action row controls', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    const buttons = within(screen.getByLabelText('Draft actions')).getAllByRole(
      'button',
    );

    expect(buttons.map((button) => button.textContent)).toEqual([
      'Generate Reply',
      'Send',
    ]);
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary');
    expect(buttons[1]).toHaveAttribute('data-variant', 'primary');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Approve & send')).not.toBeInTheDocument();
  });

  it('locks Send and draft mutation while reply generation is active', () => {
    mockIsGenerating = true;

    render(<MyahInboxReplyWorkspace thread={thread} />);

    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    ).toBeDisabled();
    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Send',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Make pending local edit' }),
    ).toBeDisabled();
  });

  it('locks generation and draft mutation while direct delivery is unresolved', () => {
    render(<MyahInboxReplyWorkspace thread={thread} />);

    fireEvent.click(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Send',
      }),
    );

    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Make pending local edit' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Make pending local edit' }),
    );
    expect(mockController.updateDraft).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'pending'] as const)(
    'resets the %s delivery lock when the same thread enters another workspace',
    (mode) => {
      mockSendActionMode = mode;
      const workspace = render(<MyahInboxReplyWorkspace thread={thread} />);

      fireEvent.click(
        within(screen.getByLabelText('Draft actions')).getByRole('button', {
          name: 'Send',
        }),
      );
      expect(
        screen.getByRole('button', { name: 'Make pending local edit' }),
      ).toBeDisabled();

      mockCurrentWorkspace = { id: 'workspace-2' };
      workspace.rerender(<MyahInboxReplyWorkspace thread={thread} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Make pending local edit' }),
      ).toBeEnabled();
    },
  );

  it('keeps a new workspace delivery locked when an old send completes', async () => {
    const oldSend = createDeferred<void>();
    mockSendActionMode = 'deferred';
    mockSendActionDeferred = oldSend;
    const workspace = render(<MyahInboxReplyWorkspace thread={thread} />);

    fireEvent.click(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Send',
      }),
    );

    mockCurrentWorkspace = { id: 'workspace-2' };
    mockSendActionMode = 'pending';
    workspace.rerender(<MyahInboxReplyWorkspace thread={thread} />);
    fireEvent.click(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Send',
      }),
    );

    await act(async () => {
      oldSend.resolve(undefined);
      await oldSend.promise;
    });

    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Make pending local edit' }),
    ).toBeDisabled();
  });

  it('serializes direct generated replies through the autosave controller', async () => {
    const application = createDeferred<boolean>();
    mockController.applyProposal.mockReturnValue(application.promise);

    render(<MyahInboxReplyWorkspace thread={thread} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Make pending local edit' }),
    );
    fireEvent.click(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    );

    expect(mockController.updateDraft).toHaveBeenCalledWith({
      key: { workspaceId: 'workspace-1', threadId: 'thread-1' },
      body: { markdown: 'pending local edit', blocknote: null },
    });
    expect(mockController.applyProposal).toHaveBeenCalledTimes(1);
    expect(mockController.applyProposal).toHaveBeenCalledWith({
      key: { workspaceId: 'workspace-1', threadId: 'thread-1' },
      body: { markdown: 'generated reply', blocknote: null },
    });
    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    ).toBeDisabled();

    await act(async () => {
      application.resolve(false);
      await application.promise;
    });

    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    ).toBeEnabled();
    expect(
      within(screen.getByLabelText('Draft actions')).getByRole('button', {
        name: 'Generate Reply',
      }),
    ).toBeVisible();
  });

  it.each(['saving', 'error', 'conflict'] as const)(
    'disables generation while the draft controller reports %s',
    (status) => {
      mockDraftEntry = {
        localBody: { markdown: 'Saved draft', blocknote: null },
        confirmedBody: { markdown: 'Saved draft', blocknote: null },
        confirmedRevision: 3,
        dirty: false,
        status,
        error: status === 'error' ? 'Draft save failed' : null,
        conflict:
          status === 'conflict'
            ? {
                revision: 4,
                body: { markdown: 'Newer saved draft', blocknote: null },
              }
            : null,
        debounceVersion: 0,
        pendingDebounceVersion: null,
        editorVersion: 0,
      };

      render(<MyahInboxReplyWorkspace thread={thread} />);

      expect(
        within(screen.getByLabelText('Draft actions')).getByRole('button', {
          name: 'Generate Reply',
        }),
      ).toBeDisabled();
    },
  );
});
