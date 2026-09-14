import { CreatorListScopedCreatorIndex } from '@/myah/creator-crm/components/CreatorListScopedCreatorIndex';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useResetFocusStackToRecordIndex } from '@/object-record/record-index/hooks/useResetFocusStackToRecordIndex';
import { RecordIndexContainerGater } from '@/object-record/record-index/components/RecordIndexContainerGater';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { styled } from '@linaria/react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledWorkspace = styled.div<{ hasSelection: boolean }>`
  display: grid;
  flex: 1;
  grid-template-columns: ${({ hasSelection }) =>
    hasSelection ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)'};
  min-height: 0;
  min-width: 0;
`;

const StyledPane = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledMobileWorkspace = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

type ActivationControl =
  | { buttonIndex: number; type: 'row-button' }
  | { type: 'name-link' }
  | { type: 'record-board-card' };

type LastOpenNavigation = {
  activationControl: ActivationControl;
  request: RecordIndexOpenRequest;
};

export const CreatorListWorkspace = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [selectedCreatorListId, setSelectedCreatorListId] = useState<
    string | null
  >(searchParams.get('creatorListId'));
  const [lastOpenNavigation, setLastOpenNavigation] =
    useState<LastOpenNavigation | null>(null);
  const [scopedPaneElement, setScopedPaneElement] =
    useState<HTMLDivElement | null>(null);
  const [previousIsMobile, setPreviousIsMobile] = useState(isMobile);
  const { resetFocusStackToRecordIndex } = useResetFocusStackToRecordIndex();

  const creatorListShowUrl = useCallback(
    (creatorListId: string) =>
      getAppPath(AppPath.RecordShowPage, {
        objectNameSingular: 'creatorList',
        objectRecordId: creatorListId,
      }),
    [],
  );

  const focusLastActivationControl = useCallback(() => {
    const lastOpenRequest = lastOpenNavigation?.request;
    const lastActivationControl = lastOpenNavigation?.activationControl;

    if (!lastOpenRequest || !lastActivationControl) {
      return false;
    }

    if (lastOpenRequest.activationElement?.isConnected) {
      lastOpenRequest.activationElement.focus();
      return true;
    }

    const recordRow = document.querySelector<HTMLElement>(
      `[data-testid="row-id-${lastOpenRequest.recordId}"]`,
    );
    const replacementActivationElement =
      lastActivationControl.type === 'row-button'
        ? recordRow?.querySelectorAll<HTMLElement>('button')[
            lastActivationControl.buttonIndex
          ]
        : lastActivationControl.type === 'record-board-card'
          ? document.querySelector<HTMLElement>(
              `[data-record-board-card-id="${lastOpenRequest.recordId}"]`,
            )
          : document.querySelector<HTMLElement>(
              `a[href="${creatorListShowUrl(lastOpenRequest.recordId)}"]`,
            );

    if (!replacementActivationElement) {
      return false;
    }

    replacementActivationElement.focus();
    return true;
  }, [creatorListShowUrl, lastOpenNavigation]);

  const handleCloseCreatorList = useCallback(() => {
    resetFocusStackToRecordIndex();
    setSelectedCreatorListId(null);
  }, [resetFocusStackToRecordIndex]);

  const handleOpenCreatorList = useCallback(
    (request: RecordIndexOpenRequest) => {
      const { activationElement, recordId, source } = request;
      const recordRow = activationElement?.closest<HTMLElement>(
        `[data-testid="row-id-${recordId}"]`,
      );
      const buttonIndex =
        recordRow && activationElement
          ? Array.from(
              recordRow.querySelectorAll<HTMLElement>('button'),
            ).indexOf(activationElement)
          : -1;

      setLastOpenNavigation({
        request,
        activationControl:
          source === 'table-identifier-action'
            ? { buttonIndex: Math.max(buttonIndex, 0), type: 'row-button' }
            : source === 'record-board-card'
              ? { type: 'record-board-card' }
              : { type: 'name-link' },
      });
      if (selectedCreatorListId === recordId) {
        handleCloseCreatorList();
      } else {
        if (selectedCreatorListId !== null) {
          resetFocusStackToRecordIndex();
        }
        setSelectedCreatorListId(recordId);
      }
    },
    [
      handleCloseCreatorList,
      resetFocusStackToRecordIndex,
      selectedCreatorListId,
    ],
  );

  useEffect(() => {
    if (!selectedCreatorListId) {
      if (previousIsMobile !== isMobile) {
        setPreviousIsMobile(isMobile);
      }
      return;
    }

    if (!scopedPaneElement?.isConnected) {
      return;
    }

    if (isMobile) {
      const scopeBackButton = scopedPaneElement.querySelector<HTMLElement>(
        '[data-testid="creator-list-pane-back"]',
      );

      (scopeBackButton ?? scopedPaneElement).focus();
      if (!previousIsMobile) {
        setPreviousIsMobile(true);
      }
      return;
    }

    if (previousIsMobile) {
      if (!focusLastActivationControl()) {
        scopedPaneElement.focus();
      }
      setPreviousIsMobile(false);
    }
  }, [
    focusLastActivationControl,
    isMobile,
    previousIsMobile,
    scopedPaneElement,
    selectedCreatorListId,
  ]);

  useEffect(() => {
    if (!selectedCreatorListId) {
      focusLastActivationControl();
    }
  }, [focusLastActivationControl, selectedCreatorListId]);

  const creatorListIndex = (
    <StyledPane data-testid="creator-list-index">
      <RecordIndexContainerGater
        indexIdentifierUrl={creatorListShowUrl}
        onOpenRecordFromIndexView={handleOpenCreatorList}
      />
    </StyledPane>
  );

  const scopedCreatorIndex = selectedCreatorListId && (
    <StyledPane ref={setScopedPaneElement} tabIndex={-1}>
      <CreatorListScopedCreatorIndex
        creatorListId={selectedCreatorListId}
        onClose={handleCloseCreatorList}
      />
    </StyledPane>
  );

  return isMobile ? (
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
  );
};
