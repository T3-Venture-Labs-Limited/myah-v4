import { useCallback, useState } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import { LINK_MYAH_INBOX_CONTACT_CREATOR } from '@/myah/inbox/graphql/operations';

export type LinkMyahInboxContactCreatorInput = {
  contactId: string;
  creatorId?: string | null;
};

type LinkMyahInboxContactCreatorMutation = {
  linkMyahInboxContactCreator: string;
};

type UseMyahInboxContactCreatorLinkOnLinked = (
  resultingContactId: string,
) => void | Promise<void>;

export const useMyahInboxContactCreatorLink = (
  onLinked?: UseMyahInboxContactCreatorLinkOnLinked,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const linkCreator = useCallback(
    async (input: LinkMyahInboxContactCreatorInput) => {
      setLinking(true);
      setError(null);
      setResult(null);

      try {
        const mutationResult = await apolloCoreClient.mutate<
          LinkMyahInboxContactCreatorMutation,
          { input: LinkMyahInboxContactCreatorInput }
        >({
          mutation: LINK_MYAH_INBOX_CONTACT_CREATOR,
          variables: { input },
        });
        const linkedContactId =
          mutationResult.data?.linkMyahInboxContactCreator;

        if (!linkedContactId) {
          throw new Error('Inbox contact link returned no result.');
        }

        await onLinked?.(linkedContactId);
        setResult(linkedContactId);

        return linkedContactId;
      } catch (reason: unknown) {
        const linkError =
          reason instanceof Error
            ? reason
            : new Error('Could not link Inbox contact.');
        setError(linkError);
        throw linkError;
      } finally {
        setLinking(false);
      }
    },
    [apolloCoreClient, onLinked],
  );

  return { linkCreator, linking, error, result };
};
