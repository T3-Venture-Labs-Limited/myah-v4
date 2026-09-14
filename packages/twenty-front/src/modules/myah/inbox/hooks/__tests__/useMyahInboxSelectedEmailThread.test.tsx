import { act, renderHook, waitFor } from '@testing-library/react';

import { useMyahInboxSelectedEmailThread } from '@/myah/inbox/hooks/useMyahInboxSelectedEmailThread';

const query = jest.fn();

type Resolvers<Value> = {
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
  reject: (reason?: unknown) => void;
};

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ query }),
}));

const thread = {
  id: 'thread-1',
  lastActivityAt: '2026-09-05T10:00:00.000Z',
  subject: 'Campaign terms',
  lastMessagePreview: 'Latest message',
  lastMessageSender: 'creator@example.com',
  state: 'NEEDS_REPLY',
  snoozedUntil: null,
  creator: { id: 'creator-1', name: 'Creator One' },
  campaign: { id: 'campaign-1', name: 'Launch' },
  inboxOwner: null,
};

describe('useMyahInboxSelectedEmailThread', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('rejects a mismatched exact-thread response rather than exposing another action target', async () => {
    query.mockResolvedValue({
      data: {
        myahInboxThreads: { edges: [{ node: { ...thread, id: 'other' } }] },
      },
    });
    const { result } = renderHook(() =>
      useMyahInboxSelectedEmailThread('workspace-1', 'thread-1'),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.thread).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ errorPolicy: 'none' }),
    );
  });

  it('masks and re-reads a same-ID summary on authorization generation change', async () => {
    query
      .mockResolvedValueOnce({
        data: { myahInboxThreads: { edges: [{ node: thread }] } },
      })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const { result, rerender } = renderHook(
      ({ authorization }) =>
        useMyahInboxSelectedEmailThread(
          'workspace-1',
          'thread-1',
          authorization,
        ),
      { initialProps: { authorization: 'member-full' } },
    );
    await waitFor(() => expect(result.current.thread).toEqual(thread));
    rerender({ authorization: 'member-restricted' });
    expect(result.current.thread).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('loads the exact native thread summary and refreshes it', async () => {
    query.mockResolvedValue({
      data: {
        myahInboxThreads: {
          edges: [{ node: thread }],
        },
      },
    });
    const { result } = renderHook(() =>
      useMyahInboxSelectedEmailThread('workspace-1', 'thread-1'),
    );

    await waitFor(() => expect(result.current.thread).toEqual(thread));
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          first: 1,
          threadId: 'thread-1',
          expectedWorkspaceId: 'workspace-1',
        },
        fetchPolicy: 'no-cache',
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('clears stale data when workspace or exact thread changes', async () => {
    const firstRequest = (
      Promise as PromiseConstructor & {
        withResolvers<Value>(): Resolvers<Value>;
      }
    ).withResolvers<{
      data: {
        myahInboxThreads: {
          edges: Array<{ node: typeof thread }>;
        };
      };
    }>();

    query.mockReturnValueOnce(firstRequest.promise).mockResolvedValueOnce({
      data: { myahInboxThreads: { edges: [{ node: thread }] } },
    });
    const { result, rerender } = renderHook(
      ({ workspaceId, threadId }) =>
        useMyahInboxSelectedEmailThread(workspaceId, threadId),
      {
        initialProps: {
          workspaceId: 'workspace-1' as string | null,
          threadId: 'thread-old' as string | null,
        },
      },
    );

    rerender({ workspaceId: 'workspace-2', threadId: 'thread-1' });
    await waitFor(() => expect(result.current.thread).toEqual(thread));

    await act(async () => {
      firstRequest.resolve({
        data: {
          myahInboxThreads: {
            edges: [{ node: { ...thread, id: 'old' } }],
          },
        },
      });
    });
    expect(result.current.thread).toEqual(thread);

    rerender({ workspaceId: 'workspace-2', threadId: null });
    expect(result.current.thread).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
