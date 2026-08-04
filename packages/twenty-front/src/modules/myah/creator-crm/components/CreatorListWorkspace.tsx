import { CreatorListScopedCreatorIndex } from '@/myah/creator-crm/components/CreatorListScopedCreatorIndex';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
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
  | { type: 'name-link' }
  | { buttonIndex: number; type: 'row-button' };

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
  const lastActivationElementRef = useRef<HTMLElement | null>(null);
  const lastActivationControlRef = useRef<ActivationControl | null>(null);
  const lastActivatedCreatorListIdRef = useRef<string | null>(null);
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
    (creatorListId: string) => {
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      let activationControl: ActivationControl | null = null;

      if (
        activeElement instanceof HTMLAnchorElement &&
        activeElement.getAttribute('href') === creatorListShowUrl(creatorListId)
      ) {
        activationControl = { type: 'name-link' };
      } else if (activeElement instanceof HTMLButtonElement) {
        const recordRow = activeElement.closest<HTMLElement>(
          `[data-testid="row-id-${creatorListId}"]`,
        );
        const buttonIndex = recordRow
          ? Array.from(recordRow.querySelectorAll('button')).indexOf(
              activeElement,
            )
          : -1;

        if (buttonIndex !== -1) {
          activationControl = { buttonIndex, type: 'row-button' };
        }
      }

      lastActivationElementRef.current = activeElement;
      lastActivationControlRef.current = activationControl;
      lastActivatedCreatorListIdRef.current = creatorListId;
      setSelectedCreatorListId(creatorListId);
    },
    [creatorListShowUrl],
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

    const lastActivationElement = lastActivationElementRef.current;

    if (lastActivationElement?.isConnected) {
      lastActivationElement.focus();
      return;
    }

    const lastActivatedCreatorListId = lastActivatedCreatorListIdRef.current;
    const lastActivationControl = lastActivationControlRef.current;
    const recordRow = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid]'),
    ).find(
      (element) =>
        element.dataset.testid === `row-id-${lastActivatedCreatorListId}`,
    );
    const replacementActivationElement =
      lastActivationControl?.type === 'row-button'
        ? recordRow?.querySelectorAll<HTMLElement>('button')[
            lastActivationControl.buttonIndex
          ]
        : Array.from(document.querySelectorAll<HTMLElement>('a')).find(
            (element) =>
              element.getAttribute('href') ===
              (lastActivatedCreatorListId &&
                creatorListShowUrl(lastActivatedCreatorListId)),
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
