import { CreatorListScopedCreatorIndex } from '@/myah/creator-crm/components/CreatorListScopedCreatorIndex';
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
  min-height: 0;
  min-width: 0;

  &:not(:last-child) {
    border-right: 1px solid ${themeCssVariables.border.color.light};
  }
`;

const StyledSelectionStatus = styled.div`
  background: ${themeCssVariables.background.primary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

export const CreatorListWorkspace = () => {
  const isMobile = useIsMobile();
  const [selectedCreatorListId, setSelectedCreatorListId] = useState<
    string | null
  >(null);
  const lastActivationElementRef = useRef<HTMLElement | null>(null);
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

  const handleOpenCreatorList = useCallback((creatorListId: string) => {
    lastActivationElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lastActivatedCreatorListIdRef.current = creatorListId;
    setSelectedCreatorListId(creatorListId);
  }, []);

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
    const lastActivationHref =
      lastActivatedCreatorListId &&
      creatorListShowUrl(lastActivatedCreatorListId);
    const replacementActivationElement = Array.from(
      document.querySelectorAll<HTMLElement>('a, button'),
    ).find((element) => element.getAttribute('href') === lastActivationHref);

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
        <StyledSelectionStatus role="status" aria-live="polite">
          Viewing Creators for the selected Creator List.
        </StyledSelectionStatus>
      )}
      {isMobile ? (
        selectedCreatorListId ? (
          scopedCreatorIndex
        ) : (
          creatorListIndex
        )
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
