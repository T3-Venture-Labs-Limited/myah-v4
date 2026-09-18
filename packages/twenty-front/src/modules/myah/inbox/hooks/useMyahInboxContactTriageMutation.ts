import { useMutation } from '@apollo/client/react';
import { useStore } from 'jotai';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { getGraphqlErrorExtensionsFromError } from '~/utils/get-graphql-error-extensions-from-error.util';
import {
  UpdateMyahInboxContactTriageDocument,
  type UpdateMyahInboxContactTriageInput as GeneratedUpdateMyahInboxContactTriageInput,
} from '~/generated/graphql';

export type UpdateMyahInboxContactTriageInput = {
  expectedWorkspaceId: string;
  contactId: string;
  expectedRevision: number;
  expectedIdentityGeneration: string;
  inboxOwnerId?: string | null;
  inboxState?: 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED';
  snoozedUntil?: string | null;
};

export type MyahInboxContactTriageMutationResult = {
  inboxOwnerId: string | null;
  inboxState: 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED';
  snoozedUntil: string | null;
  revision: number;
  identityGeneration: string;
};

export class MyahInboxContactTriageMutationError extends Error {
  constructor(
    message: string,
    public readonly triage?: MyahInboxContactTriageMutationResult,
  ) {
    super(message);
    this.name = 'MyahInboxContactTriageMutationError';
  }
}

const getConflictTriage = (
  error: unknown,
): MyahInboxContactTriageMutationResult | undefined => {
  const extensions = getGraphqlErrorExtensionsFromError(error);

  return extensions?.subCode === 'MYAH_INBOX_TRIAGE_CONFLICT'
    ? (extensions.triage as MyahInboxContactTriageMutationResult | undefined)
    : undefined;
};

export const useMyahInboxContactTriageMutation = () => {
  const store = useStore();
  const apolloCoreClient = useApolloCoreClient();
  const [updateTriageMutation] = useMutation(
    UpdateMyahInboxContactTriageDocument,
    { client: apolloCoreClient },
  );

  const updateTriage = async (input: UpdateMyahInboxContactTriageInput) => {
    if (
      !input.expectedWorkspaceId ||
      store.get(currentWorkspaceState.atom)?.id !== input.expectedWorkspaceId
    ) {
      throw new Error('Inbox workspace changed');
    }

    try {
      const result = await updateTriageMutation({
        variables: {
          input: input as GeneratedUpdateMyahInboxContactTriageInput,
        },
      });

      if (!result.data) {
        throw new Error('Inbox triage mutation returned no data');
      }

      return result.data.updateMyahInboxContactTriage;
    } catch (error) {
      const triage = getConflictTriage(error);

      if (triage) {
        throw new MyahInboxContactTriageMutationError(
          'This contact changed. Review the latest status and try again.',
          triage,
        );
      }

      throw new MyahInboxContactTriageMutationError(
        'Triage is unavailable with your current Inbox access.',
      );
    }
  };

  return { updateTriage };
};
