import { useMutation } from '@apollo/client/react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import {
  GenerateMyahInboxReplyProposalDocument,
  SaveMyahInboxDraftDocument,
  UpdateMyahInboxThreadDocument,
  type GenerateMyahInboxReplyProposalInput,
  type SaveMyahInboxDraftInput,
  type UpdateMyahInboxThreadInput,
} from '~/generated/graphql';

export const useMyahInboxThreadMutations = () => {
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

  const updateThread = async (input: UpdateMyahInboxThreadInput) => {
    const result = await updateThreadMutation({ variables: { input } });

    if (!result.data) {
      throw new Error('Inbox triage mutation returned no data');
    }

    return result.data.updateMyahInboxThread;
  };

  const saveDraft = async (input: SaveMyahInboxDraftInput) => {
    const result = await saveDraftMutation({ variables: { input } });

    if (!result.data) {
      throw new Error('Inbox draft mutation returned no data');
    }

    return result.data.saveMyahInboxDraft;
  };

  const generateProposal = async (
    input: GenerateMyahInboxReplyProposalInput,
  ) => {
    const result = await generateProposalMutation({ variables: { input } });

    if (!result.data) {
      throw new Error('Inbox proposal mutation returned no data');
    }

    return result.data.generateMyahInboxReplyProposal;
  };

  return { updateThread, saveDraft, generateProposal };
};
