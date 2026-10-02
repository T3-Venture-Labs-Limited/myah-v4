import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { useOpenCreateActivityDrawer } from '@/activities/hooks/useOpenCreateActivityDrawer';
import { NoteList } from '@/activities/notes/components/NoteList';
import { useNotes } from '@/activities/notes/hooks/useNotes';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
} from 'twenty-ui/feedback';

const StyledNotesContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: auto;
`;

export const NotesCard = () => {
  const targetRecord = useTargetRecord();
  const {
    notes,
    loading,
    totalCountNotes,
    fetchMoreNotes,
    hasNextPage,
    error,
    hasReadPermission,
  } = useNotes(targetRecord);

  const handleLastRowVisible = async () => {
    if (hasNextPage) {
      await fetchMoreNotes();
    }
  };

  const openCreateActivity = useOpenCreateActivityDrawer({
    activityObjectNameSingular: CoreObjectNameSingular.Note,
  });

  const isNotesEmpty = notes.length === 0;

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: targetRecord.targetObjectNameSingular,
  });

  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  const hasObjectUpdatePermissions = objectPermissions.canUpdateObjectRecords;
  const isReadDenied =
    !objectPermissions.canReadObjectRecords ||
    !hasReadPermission ||
    (CombinedGraphQLErrors.is(error) &&
      error.errors.some(
        ({ extensions }) =>
          extensions?.code === 'FORBIDDEN' ||
          extensions?.code === 'UNAUTHENTICATED',
      ));

  if (isReadDenied) {
    return (
      <AnimatedPlaceholderEmptyContainer>
        <AnimatedPlaceholder type="errorIndex" />
        <AnimatedPlaceholderEmptyTextContainer>
          <AnimatedPlaceholderEmptyTitle>
            {t`Notes are not available`}
          </AnimatedPlaceholderEmptyTitle>
          <AnimatedPlaceholderEmptySubTitle>
            {t`You don't have permission to view notes.`}
          </AnimatedPlaceholderEmptySubTitle>
        </AnimatedPlaceholderEmptyTextContainer>
      </AnimatedPlaceholderEmptyContainer>
    );
  }

  if (loading && isNotesEmpty) {
    return <SkeletonLoader />;
  }

  if (error && isNotesEmpty) {
    return (
      <AnimatedPlaceholderEmptyContainer>
        <AnimatedPlaceholder type="errorIndex" />
        <AnimatedPlaceholderEmptyTextContainer>
          <AnimatedPlaceholderEmptyTitle>
            {t`Notes couldn't be loaded`}
          </AnimatedPlaceholderEmptyTitle>
          <AnimatedPlaceholderEmptySubTitle>
            {t`Please refresh the page.`}
          </AnimatedPlaceholderEmptySubTitle>
        </AnimatedPlaceholderEmptyTextContainer>
      </AnimatedPlaceholderEmptyContainer>
    );
  }

  if (isNotesEmpty) {
    return (
      <AnimatedPlaceholderEmptyContainer>
        <AnimatedPlaceholder type="noNote" />
        <AnimatedPlaceholderEmptyTextContainer>
          <AnimatedPlaceholderEmptyTitle>
            {t`No notes`}
          </AnimatedPlaceholderEmptyTitle>
          <AnimatedPlaceholderEmptySubTitle>
            {t`There are no associated notes with this record.`}
          </AnimatedPlaceholderEmptySubTitle>
        </AnimatedPlaceholderEmptyTextContainer>
        {hasObjectUpdatePermissions && (
          <Button
            Icon={IconPlus}
            title={t`New note`}
            variant="secondary"
            onClick={() =>
              openCreateActivity({
                targetableObjects: [targetRecord],
              })
            }
          />
        )}
      </AnimatedPlaceholderEmptyContainer>
    );
  }

  return (
    <StyledNotesContainer>
      {error && (
        <div role="alert">
          <strong>{t`Notes couldn't be loaded`}</strong>{' '}
          {t`Please refresh the page.`}
        </div>
      )}
      <NoteList
        title={t`All`}
        notes={notes}
        totalCount={totalCountNotes}
        button={
          hasObjectUpdatePermissions && (
            <Button
              Icon={IconPlus}
              size="small"
              variant="secondary"
              title={t`Add note`}
              onClick={() =>
                openCreateActivity({
                  targetableObjects: [targetRecord],
                })
              }
            />
          )
        }
      />
      <CustomResolverFetchMoreLoader
        loading={loading}
        onLastRowVisible={handleLastRowVisible}
      />
    </StyledNotesContainer>
  );
};
