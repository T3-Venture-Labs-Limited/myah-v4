import { useEffect, useMemo, useState } from 'react';

import { useActivities } from '@/activities/hooks/useActivities';
import { currentNotesQueryVariablesState } from '@/activities/notes/states/currentNotesQueryVariablesState';
import { type Note } from '@/activities/types/Note';
import {
  CoreObjectNameSingular,
  type RecordGqlOperationVariables,
} from 'twenty-shared/types';
import { isDeeplyEqual } from '~/utils/isDeeplyEqual';

import { type ActivityTargetableObject } from '@/activities/types/ActivityTargetableEntity';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

export const useNotes = (targetableObject: ActivityTargetableObject) => {
  const { objectMetadataItem: noteMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.Note,
  });
  const { canReadObjectRecords: canReadNotes } = useObjectPermissionsForObject(
    noteMetadataItem.id,
  );
  const [fetchMoreFailure, setFetchMoreFailure] = useState<{
    targetId: string;
    error: Error;
  }>();

  const notesQueryVariables = useMemo(
    () =>
      ({
        orderBy: [
          {
            note: {
              createdAt: 'DescNullsFirst',
            },
          },
        ],
      }) as RecordGqlOperationVariables,
    [],
  );

  const {
    activities,
    loading,
    totalCountActivities,
    fetchMoreActivities,
    hasNextPage,
    error,
    hasReadPermission,
  } = useActivities<Note>({
    objectNameSingular: CoreObjectNameSingular.Note,
    activityTargetsOrderByVariables: notesQueryVariables.orderBy ?? [{}],
    targetableObjects: [targetableObject],
    skip: !canReadNotes,
    limit: 10,
  });

  const [currentNotesQueryVariables, setCurrentNotesQueryVariables] =
    useAtomState(currentNotesQueryVariablesState);

  // TODO: fix useEffect, remove with better pattern
  useEffect(() => {
    if (!isDeeplyEqual(notesQueryVariables, currentNotesQueryVariables)) {
      setCurrentNotesQueryVariables(notesQueryVariables);
    }
  }, [
    notesQueryVariables,
    currentNotesQueryVariables,
    setCurrentNotesQueryVariables,
  ]);

  const canReadLinkedNotes = canReadNotes && hasReadPermission;

  const fetchMoreNotes = async () => {
    try {
      const moreNotes = await fetchMoreActivities();

      setFetchMoreFailure(undefined);
      return moreNotes;
    } catch (error) {
      setFetchMoreFailure({
        targetId: targetableObject.id,
        error:
          error instanceof Error ? error : new Error('Unable to load notes'),
      });
      return [];
    }
  };

  return {
    notes: canReadLinkedNotes ? (activities as Note[]) : [],
    loading,
    totalCountNotes: canReadLinkedNotes ? totalCountActivities : 0,
    fetchMoreNotes,
    hasNextPage: canReadLinkedNotes && hasNextPage,
    error: canReadLinkedNotes
      ? (error ??
        (fetchMoreFailure?.targetId === targetableObject.id
          ? fetchMoreFailure.error
          : undefined))
      : undefined,
    hasReadPermission: canReadLinkedNotes,
  };
};
