import { useStore } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useMutation } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import {
  ReviewMyahInboxReplyContextDocument,
  type ReviewMyahInboxReplyContextInput,
  GenerateMyahInboxReplyProposalDocument,
  SaveMyahInboxDraftDocument,
  UpdateMyahInboxThreadDocument,
  type GenerateMyahInboxReplyProposalInput,
  type SaveMyahInboxDraftInput,
  type UpdateMyahInboxThreadInput,
} from '~/generated/graphql';

export const useMyahInboxThreadMutations = () => {
  const store = useStore();
  const assertWorkspace = (expectedWorkspaceId: string) => {
    if (
      !expectedWorkspaceId ||
      store.get(currentWorkspaceState.atom)?.id !== expectedWorkspaceId
    )
      throw new Error('Inbox workspace changed');
  };
  const apolloCoreClient = useApolloCoreClient();
  const [updateThreadMutation] = useMutation(UpdateMyahInboxThreadDocument, {
    client: apolloCoreClient,
  });
  const [saveDraftMutation] = useMutation(SaveMyahInboxDraftDocument, {
    client: apolloCoreClient,
  });
  const [generateProposalMutation] = useMutation(
    GenerateMyahInboxReplyProposalDocument,
    { client: apolloCoreClient },
  );

  const [reviewContextMutation] = useMutation(
    ReviewMyahInboxReplyContextDocument,
    { client: apolloCoreClient },
  );

  const reviewContext = async (input: ReviewMyahInboxReplyContextInput) => {
    assertWorkspace(input.expectedWorkspaceId);
    const result = await reviewContextMutation({ variables: { input } });
    if (!result.data) throw new Error('Inbox review mutation returned no data');
    return result.data.reviewMyahInboxReplyContext;
  };

  const updateThread = async (
    input: UpdateMyahInboxThreadInput & { expectedWorkspaceId: string },
  ) => {
    assertWorkspace(input.expectedWorkspaceId);
    const result = await updateThreadMutation({ variables: { input } });

    if (!result.data) {
      throw new Error('Inbox triage mutation returned no data');
    }

    return result.data.updateMyahInboxThread;
  };

  const saveDraft = async (
    input: SaveMyahInboxDraftInput & { expectedWorkspaceId: string },
  ) => {
    assertWorkspace(input.expectedWorkspaceId);
    const result = await saveDraftMutation({ variables: { input } });

    if (!result.data) {
      throw new Error('Inbox draft mutation returned no data');
    }

    return result.data.saveMyahInboxDraft;
  };

  const generateProposal = async (
    input: GenerateMyahInboxReplyProposalInput & {
      expectedWorkspaceId: string;
    },
  ) => {
    assertWorkspace(input.expectedWorkspaceId);
    const result = await generateProposalMutation({ variables: { input } });

    if (!result.data) {
      throw new Error('Inbox proposal mutation returned no data');
    }

    return result.data.generateMyahInboxReplyProposal;
  };

  return { updateThread, saveDraft, generateProposal, reviewContext };
};
