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
    proposalAction,
  }: {
    entry: MyahInboxDraftAutosaveEntry;
    onDraftChange: (body: { markdown: string; blocknote: null }) => void;
    onRetry: () => void;
    onReloadConflict: () => void;
    proposalAction: ReactType.ReactNode;
  }) => (
    <div aria-label="Shared reply draft editor">
      <output aria-label="Draft status">{entry.status}</output>
      <button
        onClick={() =>
          onDraftChange({ markdown: 'pending local edit', blocknote: null })
        }
      >
        Make pending local edit
      </button>
      <button onClick={onRetry}>Retry draft save</button>
      <button onClick={onReloadConflict}>Reload draft conflict</button>
      <div aria-label="Draft actions">{proposalAction}</div>
    </div>
  ),
}));

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
    ) => ReactType.ReactNode;
  }) =>
    renderGenerateAction(
      <button
        disabled={disabled}
        onClick={() =>
          onApply({ markdown: 'generated reply', blocknote: null })
        }
      >
        Generate Reply
      </button>,
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
