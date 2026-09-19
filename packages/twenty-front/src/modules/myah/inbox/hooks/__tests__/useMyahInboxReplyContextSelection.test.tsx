import { act, renderHook } from '@testing-library/react';
import { useMyahInboxReplyContextSelection } from '@/myah/inbox/hooks/useMyahInboxReplyContextSelection';
import { type MyahInboxDraftAutosaveController } from '@/myah/inbox/hooks/useMyahInboxDraftAutosaveController';
import { type MyahInboxDraftAutosaveKey } from '@/myah/inbox/types/MyahInboxDraftAutosave';
import { ReplyContextKind } from '~/generated/graphql';

const a = { kind: ReplyContextKind.CAMPAIGN, campaignId: 'a' };
const b = { kind: ReplyContextKind.CAMPAIGN, campaignId: 'b' };
const key: MyahInboxDraftAutosaveKey = {
  workspaceId: 'workspace',
  contactAnchorKind: 'CREATOR',
  contactAnchorId: 'anchor',
  channel: 'EMAIL',
  deliveryTargetId: 'thread',
  contextKind: 'CAMPAIGN',
  campaignId: 'a',
};

describe('useMyahInboxReplyContextSelection', () => {
  it.each(['cas', 'rejected'])(
    'retains selection and exact outgoing key on %s flush failure',
    async (failure) => {
      const flushKeys =
        failure === 'cas'
          ? jest.fn().mockResolvedValue(false)
          : jest.fn().mockRejectedValue(new Error('offline'));
      const controller = {
        flushKeys,
      } as unknown as MyahInboxDraftAutosaveController;
      const { result } = renderHook(() =>
        useMyahInboxReplyContextSelection('scope', a, key, controller),
      );
      await act(async () =>
        expect(result.current.select(b)).resolves.toBe(false),
      );
      expect(result.current.replyContext).toEqual(a);
      expect(flushKeys).toHaveBeenCalledWith([key]);
    },
  );

  it('rejects an outgoing flush completion after scope A/B/A navigation', async () => {
    let resolve!: (value: boolean) => void;
    const controller = {
      flushKeys: jest.fn().mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      ),
    } as unknown as MyahInboxDraftAutosaveController;
    const { result, rerender } = renderHook(
      ({ scope }) =>
        useMyahInboxReplyContextSelection(scope, a, key, controller),
      { initialProps: { scope: 'a' } },
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.select(b);
    });
    rerender({ scope: 'b' });
    rerender({ scope: 'a' });
    await act(async () => {
      resolve(true);
      expect(await pending).toBe(false);
    });
    expect(result.current.replyContext).toEqual(a);
  });

  it('commits selection only after a successful outgoing flush', async () => {
    let resolve!: (value: boolean) => void;
    const flushKeys = jest.fn().mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const controller = {
      flushKeys,
    } as unknown as MyahInboxDraftAutosaveController;
    const { result } = renderHook(() =>
      useMyahInboxReplyContextSelection('scope', a, key, controller),
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.select(b);
    });
    expect(result.current.replyContext).toEqual(a);
    await act(async () => {
      resolve(true);
      await pending;
    });
    expect(result.current.replyContext).toEqual(b);
  });
});
