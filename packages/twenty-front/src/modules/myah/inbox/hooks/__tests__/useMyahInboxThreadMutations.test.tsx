import { getDefaultStore } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { act, renderHook } from '@testing-library/react';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';

const mockUseMutation = jest.fn();
const mockUpdate = jest.fn();
const mockSave = jest.fn();
const mockGenerate = jest.fn();
const mockApolloCoreClient = { name: 'core-client' };

jest.mock('@apollo/client/react', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

jest.mock('~/generated/graphql', () => ({
  UpdateMyahInboxThreadDocument: { name: 'UpdateMyahInboxThread' },
  SaveMyahInboxDraftDocument: { name: 'SaveMyahInboxDraft' },
  GenerateMyahInboxReplyProposalDocument: {
    name: 'GenerateMyahInboxReplyProposal',
  },
}));

describe('useMyahInboxThreadMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-1',
    } as never);
    mockUseMutation.mockImplementation((document: { name: string }) => {
      if (document.name === 'UpdateMyahInboxThread') {
        return [mockUpdate, { loading: false }];
      }
      if (document.name === 'SaveMyahInboxDraft') {
        return [mockSave, { loading: false }];
      }
      return [mockGenerate, { loading: false }];
    });
  });

  it('rejects captured-workspace operations before transport if the workspace switches', async () => {
    const { result } = renderHook(() => useMyahInboxThreadMutations());
    const captured = {
      expectedWorkspaceId: 'workspace-1',
      threadId: 'thread-1',
    };
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-2',
    } as never);
    await expect(
      result.current.saveDraft({
        ...captured,
        expectedRevision: 2,
        body: { markdown: 'recovery', blocknote: null },
      }),
    ).rejects.toThrow('workspace');
    await expect(
      result.current.generateProposal({
        ...captured,
        operatorInstructions: 'draft',
      }),
    ).rejects.toThrow('workspace');
    await expect(result.current.updateThread(captured)).rejects.toThrow(
      'workspace',
    );
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('uses only the Task 4 triage and draft mutations with the supplied inputs', async () => {
    const updatedThread = { id: 'thread-1', state: 'CLOSED' };
    mockUpdate.mockResolvedValue({
      data: { updateMyahInboxThread: updatedThread },
    });
    const savedDraft = {
      status: 'SAVED',
      revision: 3,
      body: { markdown: 'draft', blocknote: null },
    };
    mockSave.mockResolvedValue({ data: { saveMyahInboxDraft: savedDraft } });

    const { result } = renderHook(() => useMyahInboxThreadMutations());
    expect(mockUseMutation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'UpdateMyahInboxThread' }),
      { client: mockApolloCoreClient },
    );
    expect(mockUseMutation).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SaveMyahInboxDraft' }),
      { client: mockApolloCoreClient },
    );

    let updateResult;
    await act(async () => {
      updateResult = await result.current.updateThread({
        expectedWorkspaceId: 'workspace-1',
        threadId: 'thread-1',
        creatorId: 'creator-1',
      });
    });
    expect(updateResult).toEqual(updatedThread);
    expect(mockUpdate).toHaveBeenCalledWith({
      variables: {
        input: {
          expectedWorkspaceId: 'workspace-1',
          threadId: 'thread-1',
          creatorId: 'creator-1',
        },
      },
    });

    let saveResult;
    await act(async () => {
      saveResult = await result.current.saveDraft({
        expectedWorkspaceId: 'workspace-1',
        threadId: 'thread-1',
        expectedRevision: 2,
        body: { markdown: 'draft', blocknote: null },
      });
    });
    expect(saveResult).toEqual(savedDraft);
    expect(mockSave).toHaveBeenCalledWith({
      variables: {
        input: {
          expectedWorkspaceId: 'workspace-1',
          threadId: 'thread-1',
          expectedRevision: 2,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
  });

  it('generates a proposal body and does not expose a send operation', async () => {
    const proposal = {
      body: { markdown: 'Proposal', blocknote: null },
    };
    mockGenerate.mockResolvedValue({
      data: { generateMyahInboxReplyProposal: proposal },
    });

    const { result } = renderHook(() => useMyahInboxThreadMutations());

    let proposalResult;
    await act(async () => {
      proposalResult = await result.current.generateProposal({
        expectedWorkspaceId: 'workspace-1',
        threadId: 'thread-1',
        operatorInstructions: 'Keep it concise',
      });
    });
    expect(proposalResult).toEqual(proposal);
    expect(mockGenerate).toHaveBeenCalledWith({
      variables: {
        input: {
          expectedWorkspaceId: 'workspace-1',
          threadId: 'thread-1',
          operatorInstructions: 'Keep it concise',
        },
      },
    });
    expect(result.current).not.toHaveProperty('send');
  });
});
