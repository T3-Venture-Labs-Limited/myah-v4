import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { MyahInboxReplySendAction } from '@/myah/inbox/components/MyahInboxReplySendAction';
import { type MyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import {
  type MyahInboxDraftAutosaveEntry,
  type MyahInboxDraftAutosaveThread,
} from '@/myah/inbox/types/MyahInboxDraftAutosave';

const mockFlush = jest.fn();
const mockSend = jest.fn();
const mockUseMyahInboxReplySend = jest.fn();
const mockRefetchQueries = jest.fn();
const mockEnqueueSuccessSnackBar = jest.fn();
const mockEnqueueInfoSnackBar = jest.fn();
const mockEnqueueWarningSnackBar = jest.fn();
const mockEnqueueErrorSnackBar = jest.fn();
let mockReadiness: { status: string; reason: string | null } | null;
let mockReadinessLoading = false;
let mockSending = false;

jest.mock('twenty-ui/input', () => ({
  Button: ({
    title,
    accent,
    ariaLabel,
    variant,
    disabled,
    onClick,
  }: {
    title: string;
    accent?: string;
    ariaLabel?: string;
    variant: string;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      data-accent={accent}
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  ),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxDraftAutosaveController', () => ({
  useMyahInboxDraftAutosaveControllerContext: () =>
    ({ flush: mockFlush }) as Pick<MyahInboxDraftAutosaveController, 'flush'>,
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxReplySend', () => ({
  useMyahInboxReplySend: (...args: unknown[]) => {
    mockUseMyahInboxReplySend(...args);

    return {
      readiness: mockReadiness,
      readinessLoading: mockReadinessLoading,
      send: mockSend,
      sending: mockSending,
    };
  },
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ refetchQueries: mockRefetchQueries }),
}));

jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: mockEnqueueErrorSnackBar,
    enqueueInfoSnackBar: mockEnqueueInfoSnackBar,
    enqueueSuccessSnackBar: mockEnqueueSuccessSnackBar,
    enqueueWarningSnackBar: mockEnqueueWarningSnackBar,
  }),
}));

const draftKey = { workspaceId: 'workspace-1', threadId: 'thread-1' };

const confirmedEntry = (
  overrides: Partial<MyahInboxDraftAutosaveEntry> = {},
): MyahInboxDraftAutosaveEntry => ({
  localBody: { markdown: 'Confirmed draft', blocknote: null },
  confirmedBody: { markdown: 'Confirmed draft', blocknote: null },
  confirmedRevision: 3,
  dirty: false,
  status: 'idle',
  error: null,
  conflict: null,
  debounceVersion: 0,
  pendingDebounceVersion: null,
  editorVersion: 0,
  ...overrides,
});

const emptyEntry = confirmedEntry({
  localBody: { markdown: '', blocknote: null },
  confirmedBody: null,
});
const dirtyEntry = confirmedEntry({
  localBody: { markdown: 'Latest local draft', blocknote: null },
  dirty: true,
});
const savingEntry = confirmedEntry({
  localBody: { markdown: 'Latest local draft', blocknote: null },
  status: 'saving',
});
const firstSaveDirtyEntry = confirmedEntry({
  localBody: { markdown: 'First local draft', blocknote: null },
  confirmedBody: null,
  dirty: true,
});
const firstSaveSavingEntry = confirmedEntry({
  localBody: { markdown: 'First local draft', blocknote: null },
  confirmedBody: { markdown: '   ', blocknote: null },
  status: 'saving',
});
const errorEntry = confirmedEntry({ status: 'error', error: 'Save failed' });
const conflictEntry = confirmedEntry({
  status: 'conflict',
  conflict: {
    revision: 4,
    body: { markdown: 'Newer server draft', blocknote: null },
  },
});

const createDeferred = <Value,>() => {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

const renderAction = ({
  entry = confirmedEntry(),
  readiness = 'READY',
  readinessLoading = false,
  sending = false,
  onDraftReconciled = jest.fn(),
  onSendingChange = jest.fn(),
}: {
  entry?: MyahInboxDraftAutosaveEntry;
  readiness?: string | null;
  readinessLoading?: boolean;
  sending?: boolean;
  onDraftReconciled?: (thread: MyahInboxDraftAutosaveThread) => void;
  onSendingChange?: (sending: boolean) => void;
} = {}) => {
  mockReadiness = readiness ? { status: readiness, reason: null } : null;
  mockReadinessLoading = readinessLoading;
  mockSending = sending;

  const rendered = render(
    <MyahInboxReplySendAction
      draftKey={draftKey}
      entry={entry}
      onDraftReconciled={onDraftReconciled}
      onSendingChange={onSendingChange}
    />,
  );

  return { ...rendered, onDraftReconciled, onSendingChange };
};

describe('MyahInboxReplySendAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadiness = { status: 'READY', reason: null };
    mockReadinessLoading = false;
    mockSending = false;
    mockFlush.mockResolvedValue(confirmedEntry());
    mockSend.mockResolvedValue({
      outcome: 'SENT',
      receiptId: 'receipt-1',
      revision: 4,
      body: { markdown: 'Server-confirmed draft', blocknote: null },
      error: null,
    });
    mockRefetchQueries.mockResolvedValue(undefined);
  });

  it.each([
    ['empty', emptyEntry],
    ['error', errorEntry],
    ['conflict', conflictEntry],
  ])('disables Send for %s draft state', (_name, entry) => {
    renderAction({ entry, readiness: 'READY' });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it.each([
    ['dirty', dirtyEntry],
    ['saving', savingEntry],
  ])('enables Send immediately for a non-empty %s edit', (_name, entry) => {
    renderAction({ entry, readiness: 'READY' });

    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it.each([
    ['dirty with no confirmed body', firstSaveDirtyEntry],
    ['saving with a whitespace confirmed body', firstSaveSavingEntry],
  ])(
    'enables Send immediately for a non-empty first-save %s',
    (_name, entry) => {
      renderAction({ entry, readiness: 'THREAD_UNAVAILABLE' });

      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    },
  );

  it.each([
    ['dirty', dirtyEntry],
    ['saving', savingEntry],
  ])(
    'does not bypass THREAD_UNAVAILABLE for an already confirmed %s draft',
    (_name, entry) => {
      renderAction({ entry, readiness: 'THREAD_UNAVAILABLE' });

      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    },
  );

  it.each([
    'SENDER_UNAVAILABLE',
    'RECIPIENT_UNAVAILABLE',
    'RECONNECT_REQUIRED',
    'MAILBOX_INELIGIBLE',
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
  ])(
    'does not bypass hard %s readiness for a first-save draft',
    (readiness) => {
      renderAction({ entry: firstSaveDirtyEntry, readiness });

      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    },
  );

  it('uses the native primary brand treatment', () => {
    renderAction();

    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'data-accent',
      'brand',
    );
  });

  it('passes the confirmed draft revision to readiness', () => {
    renderAction({ entry: confirmedEntry({ confirmedRevision: 7 }) });

    expect(mockUseMyahInboxReplySend).toHaveBeenCalledWith('thread-1', 7);
  });

  it.each([
    'RECONNECT_REQUIRED',
    'MAILBOX_INELIGIBLE',
    'OUTCOME_PENDING',
    'OUTCOME_UNKNOWN',
  ])('disables Send while readiness is %s', (readiness) => {
    renderAction({ readiness });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('disables Send while readiness loads or the send hook is executing', () => {
    const loading = renderAction({ readinessLoading: true });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

    loading.unmount();
    renderAction({ sending: true });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('flushes then sends the returned confirmed revision and reconciles the server draft', async () => {
    const flushed = confirmedEntry({
      confirmedRevision: 7,
      confirmedBody: { markdown: 'Final confirmed draft', blocknote: null },
    });
    const onDraftReconciled = jest.fn();
    mockFlush.mockResolvedValue(flushed);

    renderAction({ onDraftReconciled });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({
        threadId: 'thread-1',
        expectedDraftRevision: 7,
      }),
    );
    expect(mockFlush).toHaveBeenCalledWith(draftKey);
    expect(onDraftReconciled).toHaveBeenCalledWith({
      key: draftKey,
      revision: 4,
      body: { markdown: 'Server-confirmed draft', blocknote: null },
    });
    expect(mockEnqueueSuccessSnackBar).toHaveBeenCalledWith({
      message: 'Email sent',
    });
    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: [
        'MyahInboxThreads',
        'FindManyMessages',
        'FindManyMessageParticipants',
        'FindManyMessageChannelMessageAssociations',
      ],
    });
  });

  it.each([
    ['dirty persisted edit', dirtyEntry, 'READY'],
    ['saving persisted edit', savingEntry, 'READY'],
    ['dirty first save', firstSaveDirtyEntry, 'THREAD_UNAVAILABLE'],
    ['saving first save', firstSaveSavingEntry, 'THREAD_UNAVAILABLE'],
  ])(
    'flushes a non-empty %s and sends only the returned revision',
    async (_name, entry, readiness) => {
      mockFlush.mockResolvedValue(
        confirmedEntry({
          confirmedRevision: 7,
          confirmedBody: {
            markdown: 'Latest persisted draft',
            blocknote: null,
          },
        }),
      );

      renderAction({ entry, readiness });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() =>
        expect(mockSend).toHaveBeenCalledWith({
          threadId: 'thread-1',
          expectedDraftRevision: 7,
        }),
      );
      expect(mockFlush).toHaveBeenCalledWith(draftKey);
      expect(mockFlush.mock.invocationCallOrder[0]).toBeLessThan(
        mockSend.mock.invocationCallOrder[0],
      );
    },
  );
  it('reconciles the canonical empty draft after a sent receipt', async () => {
    const onDraftReconciled = jest.fn();
    mockSend.mockResolvedValue({
      outcome: 'SENT',
      receiptId: 'receipt-1',
      revision: 8,
      body: null,
      error: null,
    });
    renderAction({ onDraftReconciled });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(onDraftReconciled).toHaveBeenCalledWith({
        key: draftKey,
        revision: 8,
        body: null,
      }),
    );
  });

  it.each(['STALE', 'UNKNOWN'])(
    'preserves a typed draft for a non-authoritative %s result without a body',
    async (outcome) => {
      const onDraftReconciled = jest.fn();
      mockSend.mockResolvedValue({
        outcome,
        receiptId: null,
        revision: 4,
        body: null,
        error: null,
      });
      renderAction({ onDraftReconciled });

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
      expect(onDraftReconciled).not.toHaveBeenCalled();
    },
  );

  it('does not send when the flushed draft is unsafe', async () => {
    mockFlush.mockResolvedValue(dirtyEntry);
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockFlush).toHaveBeenCalledWith(draftKey));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends once when Send is clicked twice during a pending flush', async () => {
    const flush = createDeferred<MyahInboxDraftAutosaveEntry>();
    mockFlush.mockReturnValue(flush.promise);
    const onSendingChange = jest.fn();
    renderAction({ onSendingChange });

    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();

    await act(async () => {
      flush.resolve(confirmedEntry());
      await flush.promise;
    });

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(onSendingChange).toHaveBeenNthCalledWith(1, true);
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    [
      'STALE',
      mockEnqueueWarningSnackBar,
      'Draft changed. Review and send again.',
    ],
    [
      'FAILED',
      mockEnqueueErrorSnackBar,
      'Email was not sent. Your draft is still available.',
    ],
    [
      'SENDING',
      mockEnqueueInfoSnackBar,
      'Email accepted. Confirming delivery record…',
    ],
  ])('announces the safe %s outcome', async (outcome, enqueue, message) => {
    mockSend.mockResolvedValue({
      outcome,
      receiptId: null,
      revision: 4,
      body: null,
      error: null,
    });
    renderAction();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(enqueue).toHaveBeenCalledWith({ message }));
  });
  it('keeps the shared execution lock while delivery remains pending', async () => {
    const onSendingChange = jest.fn();
    mockSend.mockResolvedValue({
      outcome: 'SENDING',
      receiptId: 'receipt-1',
      revision: 4,
      body: { markdown: 'Confirmed draft', blocknote: null },
      error: null,
    });
    renderAction({ onSendingChange });

    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);

    await waitFor(() =>
      expect(mockEnqueueInfoSnackBar).toHaveBeenCalledWith({
        message: 'Email accepted. Confirming delivery record…',
      }),
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(onSendingChange).toHaveBeenCalledTimes(1);
    expect(onSendingChange).toHaveBeenCalledWith(true);
  });

  it('keeps an unknown outcome inline and locks Send against another click', async () => {
    const onSendingChange = jest.fn();
    mockSend.mockResolvedValue({
      outcome: 'UNKNOWN',
      receiptId: null,
      revision: 4,
      body: null,
      error: 'safe unknown',
    });
    renderAction({ onSendingChange });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Delivery outcome is unknown. This draft is locked to prevent a duplicate send.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(onSendingChange).toHaveBeenCalledTimes(1);
    expect(onSendingChange).toHaveBeenCalledWith(true);
    expect(mockEnqueueWarningSnackBar).toHaveBeenCalledWith({
      message:
        'Delivery outcome is unknown. This draft is locked to prevent a duplicate send.',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Approve & send')).not.toBeInTheDocument();
  });
});
