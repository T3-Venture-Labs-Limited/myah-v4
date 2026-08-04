import { act, renderHook } from '@testing-library/react';

import { useMyahInboxThreadMutations } from '@/myah/inbox/hooks/useMyahInboxThreadMutations';
import { type UpdateMyahInboxThreadInput } from '~/generated/graphql';

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
        threadId: 'thread-1',
        inboxState: 'CLOSED' as UpdateMyahInboxThreadInput['inboxState'],
      });
    });
    expect(updateResult).toEqual(updatedThread);
    expect(mockUpdate).toHaveBeenCalledWith({
      variables: {
        input: { threadId: 'thread-1', inboxState: 'CLOSED' },
      },
    });

    let saveResult;
    await act(async () => {
      saveResult = await result.current.saveDraft({
        threadId: 'thread-1',
        expectedRevision: 2,
        body: { markdown: 'draft', blocknote: null },
      });
    });
    expect(saveResult).toEqual(savedDraft);
    expect(mockSave).toHaveBeenCalledWith({
      variables: {
        input: {
          threadId: 'thread-1',
          expectedRevision: 2,
          body: { markdown: 'draft', blocknote: null },
        },
      },
    });
  });

  it('calls Task 5 for a proposal and does not expose a send operation', async () => {
    const proposal = {
      subject: 'Re: Spring campaign',
      body: { markdown: 'Proposal', blocknote: null },
    };
    mockGenerate.mockResolvedValue({
      data: { generateMyahInboxReplyProposal: proposal },
    });

    const { result } = renderHook(() => useMyahInboxThreadMutations());

    let proposalResult;
    await act(async () => {
      proposalResult = await result.current.generateProposal({
        threadId: 'thread-1',
        operatorInstructions: 'Keep it concise',
      });
    });
    expect(proposalResult).toEqual(proposal);
    expect(mockGenerate).toHaveBeenCalledWith({
      variables: {
        input: {
          threadId: 'thread-1',
          operatorInstructions: 'Keep it concise',
        },
      },
    });
    expect(result.current).not.toHaveProperty('send');
  });
});
