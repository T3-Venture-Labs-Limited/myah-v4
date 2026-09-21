import { act, renderHook, waitFor } from '@testing-library/react';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useMyahInboxReplyContextOptions } from '@/myah/inbox/hooks/useMyahInboxReplyContextOptions';
import { ReplyChannel, ReplyContextKind } from '~/generated/graphql';

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: jest.fn(),
}));
const input = {
  expectedWorkspaceId: 'workspace',
  target: {
    channel: ReplyChannel.EMAIL,
    contactId: 'opaque-contact',
    threadId: 'thread',
  },
};
const page = (ids: string[], hasNextPage = false) => ({
  data: {
    myahInboxReplyContextOptions: {
      edges: ids.map((id) => ({ cursor: id, node: { id, name: 'Same name' } })),
      pageInfo: { hasNextPage, endCursor: ids.at(-1) },
      generalAvailable: true,
      defaultContext: {
        kind: ReplyContextKind.CAMPAIGN,
        campaignId: 'a',
        campaignName: 'Same name',
      },
    },
  },
});

describe('useMyahInboxReplyContextOptions', () => {
  it('loads all pages and dedupes exact IDs, not duplicate labels', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(page(['a'], true))
      .mockResolvedValueOnce(page(['a', 'b']));
    jest.mocked(useApolloCoreClient).mockReturnValue({ query } as never);
    const { result } = renderHook(() => useMyahInboxReplyContextOptions(input));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.options.map((option) => option.value)).toEqual([
      'CAMPAIGN:a',
      'CAMPAIGN:b',
      'GENERAL',
    ]);
    expect(query.mock.calls[1][0].variables.input).toEqual({
      ...input,
      after: 'a',
    });
  });

  it('does not expose or merge late A pages after target B', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    const query = jest
      .fn()
      .mockReturnValueOnce(
        new Promise((r) => {
          resolve = r;
        }),
      )
      .mockResolvedValueOnce(page(['b']));
    jest.mocked(useApolloCoreClient).mockReturnValue({ query } as never);
    const { result, rerender } = renderHook(
      ({ value }) => useMyahInboxReplyContextOptions(value),
      { initialProps: { value: input } },
    );
    rerender({
      value: { ...input, target: { ...input.target, threadId: 'b' } },
    });
    expect(result.current.options).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => resolve(page(['a'], true)));
    expect(result.current.options.map((option) => option.value)).toEqual([
      'CAMPAIGN:b',
      'GENERAL',
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed on a repeated pagination cursor', async () => {
    const query = jest.fn().mockResolvedValue(page(['a'], true));
    jest.mocked(useApolloCoreClient).mockReturnValue({ query } as never);
    const { result } = renderHook(() => useMyahInboxReplyContextOptions(input));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.options).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
