import { CreatorListScopedCreatorIndex } from '@/myah/creator-crm/components/CreatorListScopedCreatorIndex';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { RecordIndexContainerGater } from '@/object-record/record-index/components/RecordIndexContainerGater';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledWorkspace = styled.div<{ hasSelection: boolean }>`
  display: grid;
  flex: 1;
  grid-template-columns: ${({ hasSelection }) =>
    hasSelection
      ? 'minmax(0, 1fr) minmax(0, 1fr)'
      : 'minmax(0, 1fr)'};
  min-height: 0;
  min-width: 0;
`;

const StyledPane = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;

  &:not(:last-child) {
    border-right: 1px solid ${themeCssVariables.border.color.light};
  }
`;

const StyledMobileWorkspace = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

const StyledSelectionStatus = styled.div`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

type ActivationControl =
  | { buttonIndex: number; type: 'row-button' }
  | { type: 'name-link' }
  | { type: 'record-board-card' };

const CreatorListSelectionStatus = ({
  creatorListId,
}: {
  creatorListId: string;
}) => {
  const {
    error: creatorListError,
    loading: isCreatorListLoading,
    record: creatorList,
  } = useFindOneRecord({
    objectNameSingular: 'creatorList',
    objectRecordId: creatorListId,
    recordGqlFields: { id: true, name: true },
  });
  const creatorListName = creatorList?.name?.trim();

  const selectionStatus = isCreatorListLoading
    ? `Loading Creator List ${creatorListId}.`
    : creatorListError
      ? `Unable to load Creator List ${creatorListId}.`
      : `Viewing Creators for Creator List ${creatorListName || creatorListId}.`;

  return (
    <StyledSelectionStatus role="status" aria-live="polite">
      {selectionStatus}
    </StyledSelectionStatus>
  );
};

export const CreatorListWorkspace = () => {
  const isMobile = useIsMobile();
  const [selectedCreatorListId, setSelectedCreatorListId] = useState<
    string | null
  >(null);
  const lastOpenRequestRef = useRef<RecordIndexOpenRequest | null>(null);
  const lastActivationControlRef = useRef<ActivationControl | null>(null);
  const scopedPaneRef = useRef<HTMLDivElement | null>(null);

  const creatorListShowUrl = useCallback(
    (creatorListId: string) =>
      getAppPath(AppPath.RecordShowPage, {
        objectNameSingular: 'creatorList',
        objectRecordId: creatorListId,
      }),
    [],
  );

  const handleOpenCreatorList = useCallback(
    (request: RecordIndexOpenRequest) => {
      const { activationElement, recordId, source } = request;
      const recordRow = activationElement?.closest<HTMLElement>(
        `[data-testid="row-id-${recordId}"]`,
      );
      const buttonIndex = recordRow
        ? Array.from(recordRow.querySelectorAll('button')).indexOf(
            activationElement as HTMLButtonElement,
          )
        : -1;

      lastOpenRequestRef.current = request;
      lastActivationControlRef.current =
        source === 'table-identifier-action'
          ? { buttonIndex: Math.max(buttonIndex, 0), type: 'row-button' }
          : source === 'record-board-card'
            ? { type: 'record-board-card' }
            : { type: 'name-link' };
      setSelectedCreatorListId(recordId);
    },
    [],
  );

  const handleCloseCreatorList = useCallback(() => {
    setSelectedCreatorListId(null);
  }, []);

  useEffect(() => {
    if (selectedCreatorListId) {
      if (!isMobile) {
        return;
      }

      const scopeTitle = scopedPaneRef.current?.querySelector('h2');

      if (scopeTitle instanceof HTMLElement) {
        scopeTitle.focus();
      } else {
        scopedPaneRef.current?.focus();
      }

      return;
    }

    if (!isMobile) {
      return;
    }

    const lastOpenRequest = lastOpenRequestRef.current;
    const lastActivationControl = lastActivationControlRef.current;

    if (lastOpenRequest?.activationElement?.isConnected) {
      lastOpenRequest.activationElement.focus();
      return;
    }

    const recordRow = document.querySelector<HTMLElement>(
      `[data-testid="row-id-${lastOpenRequest?.recordId}"]`,
    );
    const replacementActivationElement =
      lastActivationControl?.type === 'row-button'
        ? recordRow?.querySelectorAll<HTMLElement>('button')[
            lastActivationControl.buttonIndex
          ]
        : lastActivationControl?.type === 'record-board-card'
          ? document.querySelector<HTMLElement>(
              `[data-record-board-card-id="${lastOpenRequest?.recordId}"]`,
            )
          : document.querySelector<HTMLElement>(
              `a[href="${creatorListShowUrl(lastOpenRequest?.recordId ?? '')}"]`,
            );

    replacementActivationElement?.focus();
  }, [creatorListShowUrl, isMobile, selectedCreatorListId]);

  const creatorListIndex = (
    <StyledPane data-testid="creator-list-index">
      <RecordIndexContainerGater
        indexIdentifierUrl={creatorListShowUrl}
        onOpenRecordFromIndexView={handleOpenCreatorList}
      />
    </StyledPane>
  );

  const scopedCreatorIndex = selectedCreatorListId && (
    <StyledPane ref={scopedPaneRef} tabIndex={-1}>
      <CreatorListScopedCreatorIndex
        creatorListId={selectedCreatorListId}
        onClose={handleCloseCreatorList}
      />
    </StyledPane>
  );

  return (
    <>
      {selectedCreatorListId && (
        <CreatorListSelectionStatus creatorListId={selectedCreatorListId} />
      )}
      {isMobile ? (
        <StyledMobileWorkspace
          className="creator-list-mobile-pane"
          data-testid="creator-list-mobile-pane"
        >
          {selectedCreatorListId ? scopedCreatorIndex : creatorListIndex}
        </StyledMobileWorkspace>
      ) : (
        <StyledWorkspace
          data-testid="creator-list-workspace"
          hasSelection={selectedCreatorListId !== null}
        >
          {creatorListIndex}
          {scopedCreatorIndex}
        </StyledWorkspace>
      )}
    </>
  );
};
