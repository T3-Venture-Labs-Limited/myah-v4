import { act, renderHook, waitFor } from '@testing-library/react';

import { useMyahInboxContactCreatorLink } from '@/myah/inbox/hooks/useMyahInboxContactCreatorLink';
import { LINK_MYAH_INBOX_CONTACT_CREATOR } from '@/myah/inbox/graphql/operations';

const mockMutate = jest.fn();
const mockApolloCoreClient = { mutate: mockMutate };

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => mockApolloCoreClient,
}));

describe('useMyahInboxContactCreatorLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutate.mockReset();
  });

  it('stores the successful result and refreshes after linking', async () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    mockMutate.mockResolvedValue({
      data: { linkMyahInboxContactCreator: 'creator-1' },
    });
    const hook = renderHook(() => useMyahInboxContactCreatorLink(refetch));

    let result: Awaited<ReturnType<typeof hook.result.current.linkCreator>>;
    await act(async () => {
      result = await hook.result.current.linkCreator({
        contactId: 'contact-1',
        creatorId: 'creator-1',
      });
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mutation: LINK_MYAH_INBOX_CONTACT_CREATOR,
        variables: {
          input: { contactId: 'contact-1', creatorId: 'creator-1' },
        },
      }),
    );
    expect(refetch).toHaveBeenCalledWith('creator-1');
    expect(result!).toBe('creator-1');
    expect(hook.result.current.result).toBe('creator-1');
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.linking).toBe(false);
  });

  it('exposes a failed link without refreshing', async () => {
    const refetch = jest.fn();
    mockMutate.mockRejectedValue(new Error('Creator is unavailable'));
    const hook = renderHook(() => useMyahInboxContactCreatorLink(refetch));

    await act(async () => {
      await expect(
        hook.result.current.linkCreator({
          contactId: 'contact-1',
          creatorId: 'creator-1',
        }),
      ).rejects.toThrow('Creator is unavailable');
    });

    await waitFor(() =>
      expect(hook.result.current.error).toEqual(
        new Error('Creator is unavailable'),
      ),
    );
    expect(refetch).not.toHaveBeenCalled();
    expect(hook.result.current.result).toBeNull();
    expect(hook.result.current.linking).toBe(false);
  });
});
