import { RecordIndexCommandMenu } from '@/command-menu-item/components/RecordIndexCommandMenu';
import { MyahCreatorBulkActions } from '@/myah/creator-crm/components/MyahCreatorBulkActions';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { contextStoreNumberOfSelectedRecordsComponentState } from '@/context-store/states/contextStoreNumberOfSelectedRecordsComponentState';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { useFilteredObjectMetadataItems } from '@/object-metadata/hooks/useFilteredObjectMetadataItems';
import { RecordIndexPageHeaderIcon } from '@/object-record/record-index/components/RecordIndexPageHeaderIcon';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { SidePanelToggleButton } from '@/side-panel/components/SidePanelToggleButton';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTitleWithSelectedRecords = styled.div`
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  padding-right: ${themeCssVariables.spacing['0.5']};
`;

const StyledSelectedRecordsCount = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  padding-left: ${themeCssVariables.spacing['0.5']};
`;

const StyledCampaignTitle = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]} 0;
  > span:first-child {
    font-size: ${themeCssVariables.font.size.xl};
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    > span:first-child {
      font-size: ${themeCssVariables.font.size.md};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    > span:not(:first-child) {
      display: none;
    }
  }
`;

const StyledCampaignSubtitle = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.regular};
`;

export type RecordIndexPageHeaderProps = {
  contextStoreInstanceId: string;
  headerTitle?: string;
  headerLeadingAction?: ReactNode;
  campaignCreationAction?: ReactNode;
};

export const RecordIndexPageHeader = ({
  contextStoreInstanceId,
  headerTitle,
  headerLeadingAction,
  campaignCreationAction,
}: RecordIndexPageHeaderProps) => {
  const { findObjectMetadataItemByNamePlural } =
    useFilteredObjectMetadataItems();

  const contextStoreNumberOfSelectedRecords = useAtomComponentStateValue(
    contextStoreNumberOfSelectedRecordsComponentState,
  );

  const { formatNumber } = useNumberFormat();

  const { objectNamePlural, embeddedSurfaceOptions } =
    useRecordIndexContextOrThrow();

  const objectMetadataItem =
    findObjectMetadataItemByNamePlural(objectNamePlural);

  const metadataLabel = objectMetadataItem?.labelPlural ?? objectNamePlural;

  const pageHeaderTitle =
    contextStoreNumberOfSelectedRecords > 0 ? (
      <StyledTitleWithSelectedRecords>
        <StyledTitle>{headerTitle ?? metadataLabel}</StyledTitle>
        <>{'->'}</>
        <StyledSelectedRecordsCount>
          {t`${formatNumber(contextStoreNumberOfSelectedRecords)} selected`}
        </StyledSelectedRecordsCount>
      </StyledTitleWithSelectedRecords>
    ) : isDefined(campaignCreationAction) ? (
      <StyledCampaignTitle>
        <span>{headerTitle ?? metadataLabel}</span>
        <StyledCampaignSubtitle>
          {t`Your campaigns, from first draft to outreach. Search, filter and open campaigns in the list below.`}
        </StyledCampaignSubtitle>
      </StyledCampaignTitle>
    ) : (
      (headerTitle ?? metadataLabel)
    );

  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const isLayoutCustomizationModeEnabled = useAtomStateValue(
    isLayoutCustomizationModeEnabledState,
  );

  return (
    <PageCardHeader
      leadingAction={headerLeadingAction}
      icon={
        <RecordIndexPageHeaderIcon objectMetadataItem={objectMetadataItem} />
      }
      title={pageHeaderTitle}
      actionButton={
        (!embeddedSurfaceOptions || isDefined(campaignCreationAction)) &&
        isDefined(contextStoreCurrentViewId) ? (
          <>
            <MyahCreatorBulkActions
              contextStoreInstanceId={contextStoreInstanceId}
            />
            <RecordIndexCommandMenu
              hideCreateNewRecord={isDefined(campaignCreationAction)}
            />
            {campaignCreationAction}
            {!isLayoutCustomizationModeEnabled && <SidePanelToggleButton />}
          </>
        ) : undefined
      }
      showTitleOnMobile={
        isDefined(headerLeadingAction) || isDefined(campaignCreationAction)
      }
    />
  );
};
