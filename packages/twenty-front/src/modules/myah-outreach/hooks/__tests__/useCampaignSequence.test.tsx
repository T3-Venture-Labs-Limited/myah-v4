import { act, renderHook, waitFor } from '@testing-library/react';
import { type MockedResponse } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { GraphQLError } from 'graphql';
import { type PropsWithChildren } from 'react';
import { type CampaignSequence } from 'twenty-shared/workflow';

import {
  CAMPAIGN_SEQUENCE,
  PUBLISH_CAMPAIGN_SEQUENCE,
  SAVE_CAMPAIGN_SEQUENCE,
} from '@/myah-outreach/graphql/operations';
import { useCampaignSequence } from '@/myah-outreach/hooks/useCampaignSequence';

const campaignA = 'a0000000-0000-4000-8000-000000000001';
const campaignB = 'b0000000-0000-4000-8000-000000000002';
const workflowId = 'c0000000-0000-4000-8000-000000000003';
const versionOne = 'd0000000-0000-4000-8000-000000000004';
const versionTwo = 'e0000000-0000-4000-8000-000000000005';
const versionThree = '10000000-0000-4000-8000-000000000007';
const versionFour = '20000000-0000-4000-8000-000000000008';
const messageId = 'f0000000-0000-4000-8000-000000000006';

const sequenceEmail: Extract<
  CampaignSequence['messages'][number],
  { channel: 'EMAIL' }
> = {
  id: messageId,
  channel: 'EMAIL',
  subject: 'Original',
  body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}',
  files: [],
  replyToThread: false,
};

const sequence: CampaignSequence = {
  schemaVersion: 1,
  messages: [sequenceEmail],
  delaysSeconds: [],
};

const sequenceWithSubject = (subject: string): CampaignSequence => ({
  ...sequence,
  messages: [{ ...sequenceEmail, subject }],
});

const snapshot = (
  campaignId: string,
  versionId: string,
  nextSequence = sequence,
) => ({
  __typename: 'CampaignSequenceSnapshot',
  campaignId,
  workflowId,
  versionId,
  sequence: nextSequence,
  lifecycleStatus: 'DRAFT',
  versionStatus: 'DRAFT',
  editable: true,
  issues: [],
});

const loadMock = (
  campaignId: string,
  versionId = versionOne,
  delay = 0,
): MockedResponse => ({
  request: { query: CAMPAIGN_SEQUENCE, variables: { campaignId } },
  delay,
  result: {
    data: {
      campaignSequence: {
        __typename: 'CampaignSequencePresent',
        kind: 'SEQUENCE',
        snapshot: snapshot(campaignId, versionId),
      },
    },
  },
});

const wrapperFor = (mocks: MockedResponse[]) =>
  function Wrapper({ children }: PropsWithChildren) {
    return <MockedProvider mocks={mocks}>{children}</MockedProvider>;
  };

describe('useCampaignSequence', () => {
  it('ignores a late Publish response after switching Campaigns', async () => {
    const publishedA = {
      ...snapshot(campaignA, versionOne),
      versionStatus: 'ACTIVE',
    };
    const mocks: MockedResponse[] = [
      loadMock(campaignA),
      {
        request: {
          query: PUBLISH_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId: campaignA,
              expectedVersionId: versionOne,
            },
          },
        },
        delay: 40,
        result: { data: { publishCampaignSequence: publishedA } },
      },
      loadMock(campaignB, versionTwo),
    ];
    const { result, rerender } = renderHook(
      ({ campaignId }) => useCampaignSequence(campaignId),
      {
        initialProps: { campaignId: campaignA },
        wrapper: wrapperFor(mocks),
      },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    let publishPromise: Promise<void> = Promise.resolve();
    act(() => {
      publishPromise = result.current.publish();
    });
    rerender({ campaignId: campaignB });
    await waitFor(() =>
      expect(result.current.snapshot?.campaignId).toBe(campaignB),
    );
    await act(async () => publishPromise);

    expect(result.current.snapshot?.campaignId).toBe(campaignB);
    expect(result.current.snapshot?.versionId).toBe(versionTwo);
    expect(result.current.draft?.messages[0]).toMatchObject({
      channel: 'EMAIL',
      subject: 'Original',
    });
  });

  it('keeps failed saves recoverable and retries with the same persisted token', async () => {
    const edited = sequenceWithSubject('Local edit');
    const mutationVariables = {
      input: {
        campaignId: campaignA,
        expectedVersionId: versionOne,
        sequence: edited,
      },
    };
    const mocks: MockedResponse[] = [
      loadMock(campaignA),
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: mutationVariables,
        },
        error: new Error('network failed'),
      },
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: mutationVariables,
        },
        result: {
          data: {
            saveCampaignSequence: snapshot(campaignA, versionTwo, edited),
          },
        },
      },
    ];
    const { result } = renderHook(() => useCampaignSequence(campaignA), {
      wrapper: wrapperFor(mocks),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setDraft(edited));
    await act(async () => result.current.save());

    expect(result.current.draft).toEqual(edited);
    expect(result.current.dirty).toBe(true);
    expect(result.current.error).toMatch(/network failed/i);

    await act(async () => result.current.save());
    expect(result.current.snapshot?.versionId).toBe(versionTwo);
    expect(result.current.dirty).toBe(false);
  });

  it('preserves edits made during save and advances the expected version generation', async () => {
    const firstEdit = sequenceWithSubject('First edit');
    const laterEdit = sequenceWithSubject('Later edit');
    const mocks: MockedResponse[] = [
      loadMock(campaignA),
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId: campaignA,
              expectedVersionId: versionOne,
              sequence: firstEdit,
            },
          },
        },
        delay: 20,
        result: {
          data: {
            saveCampaignSequence: snapshot(campaignA, versionTwo, firstEdit),
          },
        },
      },
    ];
    const { result } = renderHook(() => useCampaignSequence(campaignA), {
      wrapper: wrapperFor(mocks),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setDraft(firstEdit));
    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.save();
    });
    act(() => result.current.setDraft(laterEdit));
    await act(async () => savePromise);

    expect(result.current.snapshot?.versionId).toBe(versionTwo);
    expect(result.current.draft).toEqual(laterEdit);
    expect(result.current.dirty).toBe(true);
  });

  it('requires discard confirmation before stale reload and never silently merges', async () => {
    const edited = sequenceWithSubject('Unsaved');
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const mocks: MockedResponse[] = [
      loadMock(campaignA),
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId: campaignA,
              expectedVersionId: versionOne,
              sequence: edited,
            },
          },
        },
        result: {
          errors: [new GraphQLError('Sequence changed. Reload before saving.')],
        },
      },
      loadMock(campaignA, versionTwo),
    ];
    const { result } = renderHook(() => useCampaignSequence(campaignA), {
      wrapper: wrapperFor(mocks),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setDraft(edited));
    await act(async () => result.current.save());
    expect(result.current.draft).toEqual(edited);

    await act(async () => result.current.reload());
    expect(confirm).toHaveBeenCalled();
    expect(result.current.draft).toEqual(edited);

    confirm.mockReturnValue(true);
    await act(async () => result.current.reload());
    expect(result.current.snapshot?.versionId).toBe(versionTwo);
    expect(result.current.dirty).toBe(false);
    confirm.mockRestore();
  });

  it('ignores late loads after a Campaign switch and protects dirty browser navigation', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ campaignId }) => useCampaignSequence(campaignId),
      {
        initialProps: { campaignId: campaignA },
        wrapper: wrapperFor([
          loadMock(campaignA, versionOne, 40),
          loadMock(campaignB, versionTwo),
        ]),
      },
    );

    rerender({ campaignId: campaignB });
    await waitFor(() =>
      expect(result.current.snapshot?.campaignId).toBe(campaignB),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(result.current.snapshot?.campaignId).toBe(campaignB);

    act(() => {
      result.current.setDraft(sequenceWithSubject('Dirty'));
    });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    unmount();
  });

  it('ignores an old save after switching Campaigns', async () => {
    const edited = sequenceWithSubject('Campaign A edit');
    const mocks: MockedResponse[] = [
      loadMock(campaignA),
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId: campaignA,
              expectedVersionId: versionOne,
              sequence: edited,
            },
          },
        },
        delay: 40,
        result: {
          data: {
            saveCampaignSequence: snapshot(campaignA, versionTwo, edited),
          },
        },
      },
      loadMock(campaignB, versionTwo),
    ];
    const { result, rerender } = renderHook(
      ({ campaignId }) => useCampaignSequence(campaignId),
      {
        initialProps: { campaignId: campaignA },
        wrapper: wrapperFor(mocks),
      },
    );

    await waitFor(() =>
      expect(result.current.snapshot?.campaignId).toBe(campaignA),
    );
    act(() => result.current.setDraft(edited));
    let savePromise: Promise<void> = Promise.resolve();
    act(() => {
      savePromise = result.current.save();
    });
    rerender({ campaignId: campaignB });

    await waitFor(() =>
      expect(result.current.snapshot?.campaignId).toBe(campaignB),
    );
    await act(async () => savePromise);
    expect(result.current.snapshot?.campaignId).toBe(campaignB);
    expect(result.current.draft).toEqual(sequence);
  });

  it('keeps an obsolete A save from owning a new A session or its saving lock', async () => {
    const oldAEdit = sequenceWithSubject('Old A edit');
    const newARevision = sequenceWithSubject('New A revision');
    const newAEdit = sequenceWithSubject('New A edit');
    const mocks: MockedResponse[] = [
      loadMock(campaignA),
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId: campaignA,
              expectedVersionId: versionOne,
              sequence: oldAEdit,
            },
          },
        },
        delay: 200,
        result: {
          data: {
            saveCampaignSequence: snapshot(campaignA, versionTwo, oldAEdit),
          },
        },
      },
      loadMock(campaignB, versionTwo),
      {
        request: {
          query: CAMPAIGN_SEQUENCE,
          variables: { campaignId: campaignA },
        },
        result: {
          data: {
            campaignSequence: {
              __typename: 'CampaignSequencePresent',
              kind: 'SEQUENCE',
              snapshot: snapshot(campaignA, versionThree, newARevision),
            },
          },
        },
      },
      {
        request: {
          query: SAVE_CAMPAIGN_SEQUENCE,
          variables: {
            input: {
              campaignId: campaignA,
              expectedVersionId: versionThree,
              sequence: newAEdit,
            },
          },
        },
        delay: 400,
        result: {
          data: {
            saveCampaignSequence: snapshot(campaignA, versionFour, newAEdit),
          },
        },
      },
    ];
    const { result, rerender } = renderHook(
      ({ campaignId }) => useCampaignSequence(campaignId),
      {
        initialProps: { campaignId: campaignA },
        wrapper: wrapperFor(mocks),
      },
    );

    await waitFor(() =>
      expect(result.current.snapshot?.versionId).toBe(versionOne),
    );
    act(() => result.current.setDraft(oldAEdit));
    let oldSavePromise: Promise<void> = Promise.resolve();
    act(() => {
      oldSavePromise = result.current.save();
    });

    rerender({ campaignId: campaignB });
    await waitFor(() =>
      expect(result.current.snapshot?.campaignId).toBe(campaignB),
    );
    rerender({ campaignId: campaignA });
    await waitFor(() =>
      expect(result.current.snapshot?.versionId).toBe(versionThree),
    );

    act(() => result.current.setDraft(newAEdit));
    let newSavePromise: Promise<void> = Promise.resolve();
    act(() => {
      newSavePromise = result.current.save();
    });

    await act(async () => oldSavePromise);
    expect(result.current.snapshot?.versionId).toBe(versionThree);
    expect(result.current.draft).toEqual(newAEdit);
    expect(result.current.saving).toBe(true);

    await act(async () => newSavePromise);
    expect(result.current.snapshot?.versionId).toBe(versionFour);
    expect(result.current.dirty).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('does not apply a request that resolves after unmount', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const { unmount } = renderHook(() => useCampaignSequence(campaignA), {
      wrapper: wrapperFor([loadMock(campaignA, versionOne, 30)]),
    });

    unmount();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
