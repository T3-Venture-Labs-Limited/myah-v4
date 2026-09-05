import { act, renderHook, waitFor } from '@testing-library/react';

import { useMyahInboxContactEmailMessages } from '@/myah/inbox/hooks/useMyahInboxContactEmailMessages';
import { GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGES } from '@/myah/inbox/graphql/operations';
import { type MyahInboxContactEmailMessage } from '@/myah/inbox/types/MyahInboxContact';

const mockQuery = jest.fn();
const mockApolloCoreClient = { query: mockQuery };

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

type EmailHookProps = {
  workspaceId: string | null;
  contactId: string | null;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> =>
  (
    Promise as PromiseConstructor & {
      withResolvers<Value>(): Deferred<Value>;
    }
  ).withResolvers<T>();

const message = (
  id: string,
  receivedAt: string,
): MyahInboxContactEmailMessage => ({
  id,
  messageThreadId: 'thread-1',
  subject: 'Subject',
  text: id,
  receivedAt,
  direction: 'INCOMING',
  visibility: 'FULL',
  participants: [],
  attachmentFileIds: [],
});

const messagesResponse = (
  messages: MyahInboxContactEmailMessage[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
) => ({
  data: {
    myahInboxContactEmailMessages: {
      edges: messages.map((node, index) => ({
        cursor: `cursor-${index + 1}`,
        node,
      })),
      pageInfo,
    },
  },
});

describe('useMyahInboxContactEmailMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('loads every server page before publishing the chronological timeline', async () => {
    const sameTimestamp = '2026-09-05T11:00:00.000Z';
    mockQuery
      .mockResolvedValueOnce(
        messagesResponse(
          [
            message('older', '2026-09-05T10:00:00.000Z'),
            message('equal-1', sameTimestamp),
          ],
          { hasNextPage: true, endCursor: 'first-page-cursor' },
        ),
      )
      .mockResolvedValueOnce(
        messagesResponse(
          [
            message('equal-2', sameTimestamp),
            message('newest', '2026-09-05T12:00:00.000Z'),
          ],
          { hasNextPage: false, endCursor: 'second-page-cursor' },
        ),
      );

    const hook = renderHook(() =>
      useMyahInboxContactEmailMessages('workspace-1', 'contact-1'),
    );

    await waitFor(() => expect(hook.result.current.messages).toHaveLength(4));

    expect(mockQuery.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        query: GET_MYAH_INBOX_CONTACT_EMAIL_MESSAGES,
        variables: {
          contactId: 'contact-1',
          first: 50,
          after: 'first-page-cursor',
        },
        fetchPolicy: 'no-cache',
      }),
    );
    expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
      'older',
      'equal-1',
      'equal-2',
      'newest',
    ]);
  });

  it('resets by contact and ignores the stale contact completion', async () => {
    const firstContact = createDeferred<ReturnType<typeof messagesResponse>>();
    const secondContact = createDeferred<ReturnType<typeof messagesResponse>>();
    mockQuery
      .mockReturnValueOnce(firstContact.promise)
      .mockReturnValueOnce(secondContact.promise);

    const hook = renderHook(
      ({ workspaceId, contactId }: EmailHookProps) =>
        useMyahInboxContactEmailMessages(workspaceId, contactId),
      { initialProps: { workspaceId: 'workspace-1', contactId: 'contact-1' } },
    );

    hook.rerender({ workspaceId: 'workspace-1', contactId: 'contact-2' });
    secondContact.resolve(
      messagesResponse([message('contact-2', '2026-09-05T12:00:00.000Z')]),
    );

    await waitFor(() =>
      expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
        'contact-2',
      ]),
    );

    firstContact.resolve(
      messagesResponse([message('contact-1', '2026-09-05T12:00:00.000Z')]),
    );

    await waitFor(() => {
      expect(hook.result.current.messages.map(({ id }) => id)).toEqual([
        'contact-2',
      ]);
      expect(mockQuery.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          context: expect.objectContaining({
            queryDeduplication: false,
            fetchOptions: expect.objectContaining({
              signal: expect.any(AbortSignal),
            }),
          }),
        }),
      );
    });
  });

  it('replaces the contact timeline on explicit refresh', async () => {
    mockQuery
      .mockResolvedValueOnce(
        messagesResponse([message('before', '2026-09-05T10:00:00.000Z')]),
      )
      .mockResolvedValueOnce(
        messagesResponse([message('after', '2026-09-05T11:00:00.000Z')]),
      );
    const hook = renderHook(() =>
      useMyahInboxContactEmailMessages('workspace-1', 'contact-1'),
    );

    await waitFor(() =>
      expect(hook.result.current.messages[0]?.id).toBe('before'),
    );
    await act(async () => {
      await hook.result.current.refresh();
    });

    expect(hook.result.current.messages.map(({ id }) => id)).toEqual(['after']);
  });
});
