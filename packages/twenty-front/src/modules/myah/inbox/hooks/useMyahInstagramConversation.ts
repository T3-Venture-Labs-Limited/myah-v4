import { useMemo } from 'react';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type MyahInstagramConversationMessage } from '@/myah/inbox/types/MyahInboxContact';
import { isDefined } from 'twenty-shared/utils';

const MESSAGE_LIMIT = 100;

type MyahSocialMessageRecord = ObjectRecord &
  Omit<MyahInstagramConversationMessage, 'providerCreatedAt' | 'createdAt'> & {
    providerCreatedAt: string | null;
    createdAt: string;
  };

const messageFields = {
  id: true,
  text: true,
  direction: true,
  sentVia: true,
  provider: true,
  deliveryState: true,
  providerCreatedAt: true,
  createdAt: true,
  hasAttachments: true,
  attachmentCount: true,
};

export const useMyahInstagramConversation = (conversationId: string | null) => {
  const {
    fetchMoreRecords,
    isFetchingMoreRecords,
    error: readError,
    loading,
    objectMetadataItem,
    pageInfo,
    records,
    refetch,
  } = useFindManyRecords<MyahSocialMessageRecord>({
    objectNameSingular: 'myahSocialMessage',
    filter: { conversationId: { eq: conversationId ?? '' } },
    recordGqlFields: messageFields,
    limit: MESSAGE_LIMIT,
    skip: !conversationId,
  });

  const messages = useMemo(
    () =>
      records
        .map((record) => ({
          id: record.id,
          text: record.text ?? null,
          direction: record.direction ?? 'UNKNOWN',
          sentVia: record.sentVia ?? 'UNKNOWN',
          provider: record.provider ?? 'COMPOSIO_HISTORY',
          deliveryState: record.deliveryState ?? 'UNKNOWN',
          providerCreatedAt: record.providerCreatedAt ?? null,
          createdAt: record.createdAt,
          hasAttachments: record.hasAttachments ?? false,
          attachmentCount: record.attachmentCount ?? 0,
        }))
        .sort((first, second) => {
          const firstTimestamp = Date.parse(
            first.providerCreatedAt ?? first.createdAt,
          );
          const secondTimestamp = Date.parse(
            second.providerCreatedAt ?? second.createdAt,
          );

          return (
            firstTimestamp - secondTimestamp ||
            first.id.localeCompare(second.id)
          );
        }),
    [records],
  );

  const error =
    readError?.message ??
    (!loading && conversationId && !isDefined(objectMetadataItem)
      ? 'Instagram message metadata is unavailable.'
      : null);
  return {
    messages,
    loading,
    error,
    refetch,
    hasNextPage: pageInfo?.hasNextPage ?? false,
    loadingMore: isFetchingMoreRecords,
    loadMore: fetchMoreRecords,
  };
};
