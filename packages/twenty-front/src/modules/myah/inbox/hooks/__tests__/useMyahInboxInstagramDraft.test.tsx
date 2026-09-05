import { act, renderHook } from '@testing-library/react';
import { useMutation } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useMyahInboxInstagramDraft } from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';

jest.mock('@apollo/client/react', () => ({ useMutation: jest.fn() }));
jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));

const mockUseMutation = jest.mocked(useMutation);
const mockUseApolloCoreClient = jest.mocked(useApolloCoreClient);
const saveDraftMutation = jest.fn();
const loadDraftQuery = jest.fn();

const workspaceId = '11111111-1111-4111-8111-111111111111';
let activeContactId = '22222222-2222-4222-8222-000000000000';
let scopeSequence = 0;
const creatorId = '33333333-3333-4333-8333-333333333333';
const conversationId = '44444444-4444-4444-8444-444444444444';

const renderDraft = (kind: 'FIRST_MESSAGE' | 'REPLY' = 'FIRST_MESSAGE') =>
  renderHook(() =>
    useMyahInboxInstagramDraft({
      workspaceId,
      contactId: activeContactId,
      kind,
      creatorRecordId: creatorId,
      conversationRecordId: conversationId,
    }),
  );

describe('useMyahInboxInstagramDraft', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    scopeSequence += 1;
    activeContactId = `22222222-2222-4222-8222-${String(scopeSequence).padStart(
      12,
      '0',
    )}`;
    loadDraftQuery.mockResolvedValue({
      data: { instagramMessageDraft: null },
    });
    mockUseApolloCoreClient.mockReturnValue({
      query: loadDraftQuery,
    } as never);
    mockUseMutation.mockReturnValue([
      saveDraftMutation,
      { loading: false },
    ] as never);
  });

  afterEach(() => jest.useRealTimers());

  it('autosaves a first message against the creator only', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 1,
          body: 'Hello',
        },
      },
    });
    const { result } = renderDraft();
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('Hello'));
    await act(async () => jest.advanceTimersByTimeAsync(750));

    expect(saveDraftMutation).toHaveBeenCalledWith({
      variables: {
        input: {
          draftId: expect.any(String),
          expectedRevision: 0,
          kind: 'FIRST_MESSAGE',
          body: 'Hello',
          creatorRecordId: creatorId,
          conversationRecordId: null,
        },
      },
    });
  });

  it('flushes a reply against the exact conversation only', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 1,
          body: 'Reply',
        },
      },
    });
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('Reply'));
    await act(async () => result.current.flush());

    expect(saveDraftMutation).toHaveBeenCalledWith({
      variables: {
        input: {
          draftId: expect.any(String),
          expectedRevision: 0,
          kind: 'REPLY',
          body: 'Reply',
          creatorRecordId: null,
          conversationRecordId: conversationId,
        },
      },
    });
  });

  it('does not save an empty draft', async () => {
    const { result } = renderDraft();
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('  '));
    await act(async () => jest.advanceTimersByTimeAsync(750));

    expect(saveDraftMutation).not.toHaveBeenCalled();
  });

  it('keeps local text and exposes a server conflict until reloaded', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'CONFLICT',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 3,
          body: 'Server draft',
        },
      },
    });
    const { result } = renderDraft();
    await act(async () => Promise.resolve());

    act(() => result.current.setBody('Local draft'));
    await act(async () => result.current.flush());

    expect(result.current.body).toBe('Local draft');
    expect(result.current.conflict).toEqual({
      revision: 3,
      body: 'Server draft',
    });

    act(() => result.current.reloadConflict());

    expect(result.current.body).toBe('Server draft');
    expect(result.current.revision).toBe(3);
    expect(result.current.conflict).toBeNull();
  });

  it('restores the server-owned draft after a full client reload', async () => {
    loadDraftQuery.mockResolvedValueOnce({
      data: {
        instagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 4,
          body: 'Server-owned draft',
          executionLocked: true,
        },
      },
    });
    const { result } = renderDraft('REPLY');

    await act(async () => Promise.resolve());

    expect(loadDraftQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            kind: 'REPLY',
            creatorRecordId: null,
            conversationRecordId: conversationId,
          },
        },
        fetchPolicy: 'no-cache',
      }),
    );
    expect(result.current.draftId).toBe('55555555-5555-4555-8555-555555555555');
    expect(result.current.body).toBe('Server-owned draft');
    expect(result.current.revision).toBe(4);
    expect(result.current.executionLocked).toBe(true);
  });

  it('preserves a newer dirty snapshot when server hydration returns', async () => {
    const serverDraft = {
      status: 'SAVED',
      draftId: '55555555-5555-4555-8555-555555555555',
      revision: 2,
      body: 'Older server body',
      executionLocked: false,
    };
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: serverDraft },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    act(() => first.result.current.setBody('Newer local body'));
    first.unmount();
    loadDraftQuery.mockResolvedValueOnce({
      data: { instagramMessageDraft: serverDraft },
    });

    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    expect(remounted.result.current.draftId).toBe(serverDraft.draftId);
    expect(remounted.result.current.body).toBe('Newer local body');
    expect(remounted.result.current.revision).toBe(2);
  });
  it('restores the keyed saved body and revision after remount', async () => {
    saveDraftMutation.mockResolvedValue({
      data: {
        saveInstagramMessageDraft: {
          status: 'SAVED',
          draftId: '55555555-5555-4555-8555-555555555555',
          revision: 1,
          body: 'Saved draft',
        },
      },
    });
    const first = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    act(() => first.result.current.setBody('Saved draft'));
    await act(async () => first.result.current.flush());
    const savedDraftId = first.result.current.draftId;
    first.unmount();

    const remounted = renderDraft('REPLY');
    await act(async () => Promise.resolve());

    expect(remounted.result.current.draftId).toBe(savedDraftId);
    expect(remounted.result.current.body).toBe('Saved draft');
    expect(remounted.result.current.revision).toBe(1);
  });

  it('rotates to a fresh empty draft after a successful send', async () => {
    const { result } = renderDraft('REPLY');
    await act(async () => Promise.resolve());
    const previousDraftId = result.current.draftId;

    act(() => result.current.setBody('Sent body'));
    act(() => result.current.resetAfterSend());

    expect(result.current.draftId).not.toBe(previousDraftId);
    expect(result.current.body).toBe('');
    expect(result.current.revision).toBe(0);
  });
});
