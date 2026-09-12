import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CampaignSequence,
  type CampaignSequenceIssue,
  type WorkflowAttachment,
} from 'twenty-shared/workflow';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import {
  CAMPAIGN_SEQUENCE,
  PUBLISH_CAMPAIGN_SEQUENCE,
  SAVE_CAMPAIGN_SEQUENCE,
} from '@/myah-outreach/graphql/operations';

export type CampaignSequenceSnapshot = {
  campaignId: string;
  workflowId: string;
  versionId: string;
  sequence: CampaignSequence;
  lifecycleStatus: string | null;
  versionStatus: 'DRAFT' | 'ACTIVE' | 'DEACTIVATED' | 'ARCHIVED';
  editable: boolean;
  issues: CampaignSequenceIssue[];
};

export type CampaignSequenceLoadResult =
  | {
      __typename?: 'CampaignSequenceAbsent';
      kind: 'ABSENT';
      campaignId: string;
    }
  | {
      __typename?: 'CampaignSequenceLegacy';
      kind: 'LEGACY';
      campaignId: string;
      workflowId: string;
    }
  | {
      __typename?: 'CampaignSequencePresent';
      kind: 'SEQUENCE';
      snapshot: CampaignSequenceSnapshot;
    };

type CampaignSequenceQueryData = {
  campaignSequence: CampaignSequenceLoadResult;
};

type SaveCampaignSequenceData = {
  saveCampaignSequence: CampaignSequenceSnapshot;
};

type PublishCampaignSequenceData = {
  publishCampaignSequence: CampaignSequenceSnapshot;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Campaign sequence request failed.';
};

export const useCampaignSequence = (campaignId: string) => {
  const apolloCoreClient = useApolloCoreClient();
  const [loadResult, setLoadResult] =
    useState<CampaignSequenceLoadResult | null>(null);
  const [snapshot, setSnapshot] = useState<CampaignSequenceSnapshot | null>(
    null,
  );
  const [draft, setDraftState] = useState<CampaignSequence | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadGeneration, setReloadGeneration] = useState(0);
  // These refs are request/generation tokens. State remains React-owned above.
  // oxlint-disable-next-line twenty/no-state-useref
  const mountedRef = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref
  const campaignIdRef = useRef(campaignId);
  // oxlint-disable-next-line twenty/no-state-useref
  const requestGenerationRef = useRef(0);
  // Campaign-session identity must differ even when navigation returns A → B → A.
  // oxlint-disable-next-line twenty/no-state-useref
  const campaignSessionGenerationRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const saveRequestIdentityRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const activeSaveRequestRef = useRef<{
    campaignSessionGeneration: number;
    requestIdentity: number;
  } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const publishRequestIdentityRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const activePublishRequestRef = useRef<{
    campaignSessionGeneration: number;
    requestIdentity: number;
  } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const editGenerationRef = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref
  const snapshotRef = useRef<CampaignSequenceSnapshot | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const draftRef = useRef<CampaignSequence | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const dirtyRef = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref
  const savingRef = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref
  const publishingRef = useRef(false);

  campaignIdRef.current = campaignId;
  snapshotRef.current = snapshot;
  draftRef.current = draft;
  dirtyRef.current = dirty;

  const applyLoadResult = useCallback(
    (
      result: CampaignSequenceLoadResult,
      requestCampaignId: string,
      requestGeneration: number,
    ) => {
      if (
        !mountedRef.current ||
        campaignIdRef.current !== requestCampaignId ||
        requestGenerationRef.current !== requestGeneration
      ) {
        return;
      }

      setLoadResult(result);
      setError(null);

      if (result.kind !== 'SEQUENCE') {
        setSnapshot(null);
        setDraftState(null);
        setSelectedMessageId(null);
        setDirty(false);
        dirtyRef.current = false;
        return;
      }

      setSnapshot(result.snapshot);
      snapshotRef.current = result.snapshot;
      setDraftState(result.snapshot.sequence);
      draftRef.current = result.snapshot.sequence;
      setSelectedMessageId((selectedId) =>
        result.snapshot.sequence.messages.some(({ id }) => id === selectedId)
          ? selectedId
          : (result.snapshot.sequence.messages[0]?.id ?? null),
      );
      setDirty(false);
      dirtyRef.current = false;
      editGenerationRef.current += 1;
      setReloadGeneration((generation) => generation + 1);
    },
    [],
  );

  const load = useCallback(
    async (requestCampaignId: string) => {
      const requestGeneration = ++requestGenerationRef.current;
      setLoading(true);
      setError(null);

      try {
        const { data } =
          await apolloCoreClient.query<CampaignSequenceQueryData>({
            fetchPolicy: 'network-only',
            query: CAMPAIGN_SEQUENCE,
            variables: { campaignId: requestCampaignId },
          });

        if (!data) {
          throw new Error('Campaign sequence query returned no data.');
        }

        applyLoadResult(
          data.campaignSequence,
          requestCampaignId,
          requestGeneration,
        );
      } catch (loadError) {
        if (
          mountedRef.current &&
          campaignIdRef.current === requestCampaignId &&
          requestGenerationRef.current === requestGeneration
        ) {
          setError(errorMessage(loadError));
        }
      } finally {
        if (
          mountedRef.current &&
          campaignIdRef.current === requestCampaignId &&
          requestGenerationRef.current === requestGeneration
        ) {
          setLoading(false);
        }
      }
    },
    [apolloCoreClient, applyLoadResult],
  );

  useEffect(() => {
    mountedRef.current = true;
    requestGenerationRef.current += 1;
    campaignSessionGenerationRef.current += 1;
    activeSaveRequestRef.current = null;
    activePublishRequestRef.current = null;
    snapshotRef.current = null;
    draftRef.current = null;
    dirtyRef.current = false;
    setLoadResult(null);
    setSnapshot(null);
    setDraftState(null);
    setSelectedMessageId(null);
    setDirty(false);
    setError(null);
    setSaving(false);
    savingRef.current = false;
    setPublishing(false);
    publishingRef.current = false;
    void load(campaignId);

    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, [campaignId, load]);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const setDraft = useCallback((nextDraft: CampaignSequence) => {
    draftRef.current = nextDraft;
    editGenerationRef.current += 1;
    dirtyRef.current = true;
    setDraftState(nextDraft);
    setDirty(true);
    setSelectedMessageId((selectedId) =>
      nextDraft.messages.some(({ id }) => id === selectedId)
        ? selectedId
        : (nextDraft.messages[0]?.id ?? null),
    );
  }, []);

  const addAttachments = useCallback(
    (messageId: string, attachments: WorkflowAttachment[]) => {
      if (attachments.length === 0) {
        return;
      }

      const currentDraft = draftRef.current;
      const messageIndex =
        currentDraft?.messages.findIndex(({ id }) => id === messageId) ?? -1;
      const currentMessage = currentDraft?.messages[messageIndex];

      if (
        !currentDraft ||
        messageIndex < 0 ||
        currentMessage?.channel !== 'EMAIL'
      ) {
        return;
      }

      const messages = [...currentDraft.messages];
      messages[messageIndex] = {
        ...currentMessage,
        files: [...currentMessage.files, ...attachments],
      };
      setDraft({ ...currentDraft, messages });
    },
    [setDraft],
  );

  const selectMessage = useCallback((messageId: string | null) => {
    setSelectedMessageId(messageId);
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const capturedCampaignId = campaignIdRef.current;
    const capturedCampaignSessionGeneration =
      campaignSessionGenerationRef.current;
    const capturedSnapshot = snapshotRef.current;
    const capturedDraft = draftRef.current;
    const capturedEditGeneration = editGenerationRef.current;

    if (
      !capturedSnapshot ||
      !capturedDraft ||
      savingRef.current ||
      publishingRef.current ||
      !dirtyRef.current
    ) {
      return;
    }

    const requestIdentity = ++saveRequestIdentityRef.current;
    const capturedSaveRequest = {
      campaignSessionGeneration: capturedCampaignSessionGeneration,
      requestIdentity,
    };
    const ownsCurrentSaveRequest = () =>
      mountedRef.current &&
      campaignIdRef.current === capturedCampaignId &&
      campaignSessionGenerationRef.current ===
        capturedCampaignSessionGeneration &&
      activeSaveRequestRef.current?.campaignSessionGeneration ===
        capturedCampaignSessionGeneration &&
      activeSaveRequestRef.current.requestIdentity === requestIdentity;

    activeSaveRequestRef.current = capturedSaveRequest;
    savingRef.current = true;
    setSaving(true);
    setError(null);

    try {
      const { data } = await apolloCoreClient.mutate<SaveCampaignSequenceData>({
        mutation: SAVE_CAMPAIGN_SEQUENCE,
        refetchQueries: ['CampaignOutreachAudienceReview'],
        variables: {
          input: {
            campaignId: capturedCampaignId,
            expectedVersionId: capturedSnapshot.versionId,
            sequence: capturedDraft,
          },
        },
      });

      if (!data) {
        throw new Error('Campaign sequence save returned no data.');
      }

      if (!ownsCurrentSaveRequest()) {
        return;
      }

      const savedSnapshot = data.saveCampaignSequence;
      setSnapshot(savedSnapshot);
      snapshotRef.current = savedSnapshot;
      setLoadResult({ kind: 'SEQUENCE', snapshot: savedSnapshot });

      if (editGenerationRef.current === capturedEditGeneration) {
        setDraftState(savedSnapshot.sequence);
        draftRef.current = savedSnapshot.sequence;
        setDirty(false);
        dirtyRef.current = false;
      }
    } catch (saveError) {
      if (ownsCurrentSaveRequest()) {
        setError(errorMessage(saveError));
      }
    } finally {
      if (ownsCurrentSaveRequest()) {
        activeSaveRequestRef.current = null;
        savingRef.current = false;
        setSaving(false);
      }
    }
  }, [apolloCoreClient]);

  const publish = useCallback(async (): Promise<void> => {
    const capturedCampaignId = campaignIdRef.current;
    const capturedCampaignSessionGeneration =
      campaignSessionGenerationRef.current;
    const current = snapshotRef.current;
    if (
      !current ||
      dirtyRef.current ||
      publishingRef.current ||
      savingRef.current ||
      current.versionStatus !== 'DRAFT'
    )
      return;

    const requestIdentity = ++publishRequestIdentityRef.current;
    const ownsCurrentPublishRequest = () =>
      mountedRef.current &&
      campaignIdRef.current === capturedCampaignId &&
      campaignSessionGenerationRef.current ===
        capturedCampaignSessionGeneration &&
      activePublishRequestRef.current?.campaignSessionGeneration ===
        capturedCampaignSessionGeneration &&
      activePublishRequestRef.current.requestIdentity === requestIdentity;

    activePublishRequestRef.current = {
      campaignSessionGeneration: capturedCampaignSessionGeneration,
      requestIdentity,
    };
    publishingRef.current = true;
    setPublishing(true);
    setError(null);
    try {
      const { data } =
        await apolloCoreClient.mutate<PublishCampaignSequenceData>({
          mutation: PUBLISH_CAMPAIGN_SEQUENCE,
          refetchQueries: ['CampaignOutreachAudienceReview'],
          variables: {
            input: {
              campaignId: capturedCampaignId,
              expectedVersionId: current.versionId,
            },
          },
        });
      if (!data)
        throw new Error('Campaign sequence publication returned no data.');
      if (!ownsCurrentPublishRequest()) return;
      const published = data.publishCampaignSequence;
      setSnapshot(published);
      snapshotRef.current = published;
      setLoadResult({ kind: 'SEQUENCE', snapshot: published });
    } catch (publishError) {
      if (ownsCurrentPublishRequest()) setError(errorMessage(publishError));
    } finally {
      if (ownsCurrentPublishRequest()) {
        activePublishRequestRef.current = null;
        publishingRef.current = false;
        setPublishing(false);
      }
    }
  }, [apolloCoreClient]);

  const reload = useCallback(async (): Promise<void> => {
    if (publishingRef.current) return;
    if (
      dirtyRef.current &&
      !window.confirm(
        'Reloading will discard your unsaved Campaign sequence changes. Continue?',
      )
    ) {
      return;
    }

    await load(campaignIdRef.current);
  }, [load]);

  return {
    snapshot,
    draft,
    selectedMessageId,
    loading,
    saving,
    publishing,
    dirty,
    error,
    loadResult,
    reloadGeneration,
    setDraft,
    addAttachments,
    selectMessage,
    save,
    publish,
    reload,
  };
};
