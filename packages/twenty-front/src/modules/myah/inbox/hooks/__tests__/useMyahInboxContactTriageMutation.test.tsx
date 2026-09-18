import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { getDefaultStore } from 'jotai';
import { act, renderHook } from '@testing-library/react';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useMyahInboxContactTriageMutation } from '@/myah/inbox/hooks/useMyahInboxContactTriageMutation';

const mockMutation = jest.fn();
const mockApolloCoreClient = {};

jest.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutation],
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

describe('useMyahInboxContactTriageMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-1',
    } as never);
  });

  it('sends both revision and identity-generation tokens', async () => {
    mockMutation.mockResolvedValue({
      data: {
        updateMyahInboxContactTriage: {
          inboxOwnerId: null,
          inboxState: 'CLOSED',
          snoozedUntil: null,
          revision: 5,
          identityGeneration: '7',
        },
      },
    });
    const { result } = renderHook(() => useMyahInboxContactTriageMutation());

    await act(async () => {
      await result.current.updateTriage({
        expectedWorkspaceId: 'workspace-1',
        contactId: 'contact-1',
        expectedRevision: 4,
        expectedIdentityGeneration: '7',
        inboxState: 'CLOSED',
      });
    });

    expect(mockMutation).toHaveBeenCalledWith({
      variables: {
        input: {
          expectedWorkspaceId: 'workspace-1',
          contactId: 'contact-1',
          expectedRevision: 4,
          expectedIdentityGeneration: '7',
          inboxState: 'CLOSED',
        },
      },
    });
  });

  it('parses the conflict extension and never retries it', async () => {
    const latest = {
      inboxOwnerId: 'member-1',
      inboxState: 'NEEDS_REPLY' as const,
      snoozedUntil: null,
      revision: 5,
      identityGeneration: '7',
    };
    mockMutation.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Triage conflict',
            extensions: {
              subCode: 'MYAH_INBOX_TRIAGE_CONFLICT',
              triage: latest,
            },
          },
        ],
        data: null,
      }),
    );
    const { result } = renderHook(() => useMyahInboxContactTriageMutation());

    await expect(
      result.current.updateTriage({
        expectedWorkspaceId: 'workspace-1',
        contactId: 'contact-1',
        expectedRevision: 4,
        expectedIdentityGeneration: '7',
        inboxState: 'CLOSED',
      }),
    ).rejects.toMatchObject({
      message: 'This contact changed. Review the latest status and try again.',
      triage: latest,
    });
    expect(mockMutation).toHaveBeenCalledTimes(1);
  });

  it('maps unavailable errors to the generic unavailable message', async () => {
    mockMutation.mockRejectedValue({ graphQLErrors: [{ extensions: {} }] });
    const { result } = renderHook(() => useMyahInboxContactTriageMutation());

    await expect(
      result.current.updateTriage({
        expectedWorkspaceId: 'workspace-1',
        contactId: 'contact-1',
        expectedRevision: 4,
        expectedIdentityGeneration: '7',
        inboxState: 'CLOSED',
      }),
    ).rejects.toThrow('Triage is unavailable with your current Inbox access.');
  });
});
