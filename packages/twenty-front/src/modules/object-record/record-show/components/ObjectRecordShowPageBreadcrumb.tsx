import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { ObjectMetadataIcon } from '@/object-metadata/components/ObjectMetadataIcon';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useIsRecordFieldReadOnly } from '@/object-record/read-only/hooks/useIsRecordFieldReadOnly';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useRecordShowContainerActions } from '@/object-record/record-show/hooks/useRecordShowContainerActions';
import { useRecordShowPageGroupByBreadcrumbInfo } from '@/object-record/record-show/hooks/useRecordShowPageGroupByBreadcrumbInfo';
import { useRecordShowPagePagination } from '@/object-record/record-show/hooks/useRecordShowPagePagination';
import { getRecordShowPageBreadcrumbPaginationLabel } from '@/object-record/record-show/utils/getRecordShowPageBreadcrumbPaginationLabel';
import { RecordTitleCell } from '@/object-record/record-title-cell/components/RecordTitleCell';
import { RecordTitleCellContainerType } from '@/object-record/record-title-cell/types/RecordTitleCellContainerType';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { FieldMetadataType } from 'twenty-shared/types';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

const StyledEditableTitleContainer = styled.div<{ compactOnMobile?: boolean }>`
  align-items: center;
  display: flex;
  flex-direction: row;
  overflow-x: hidden;
  width: 100%;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    gap: ${({ compactOnMobile }) =>
      compactOnMobile ? themeCssVariables.spacing[1] : '0'};
    min-width: ${({ compactOnMobile }) => (compactOnMobile ? '0' : 'auto')};
  }
`;

const StyledEditableTitlePrefix = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledBreadcrumbPrefixLabel = styled.span<{ compactOnMobile?: boolean }>`
  @media (max-width: ${MOBILE_VIEWPORT}px) {
    display: ${({ compactOnMobile }) => (compactOnMobile ? 'none' : 'inline')};
  }
`;

const StyledBreadcrumbPrefixObjectIcon = styled.div`
  display: flex;
  flex-shrink: 0;
  opacity: 0.64;
`;

const StyledTitle = styled.div<{ compactOnMobile?: boolean }>`
  max-width: 100%;
  overflow: hidden;
  width: fit-content;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    flex: ${({ compactOnMobile }) => (compactOnMobile ? '1 1 0' : 'initial')};
    min-width: ${({ compactOnMobile }) => (compactOnMobile ? '0' : 'auto')};
  }
`;

const StyledPaginationInformation = styled.span<{ compactOnMobile?: boolean }>`
  color: ${themeCssVariables.font.color.tertiary};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    max-width: ${({ compactOnMobile }) => (compactOnMobile ? '50%' : 'none')};
    min-width: ${({ compactOnMobile }) => (compactOnMobile ? '0' : 'auto')};
    overflow: ${({ compactOnMobile }) =>
      compactOnMobile ? 'hidden' : 'visible'};
    text-overflow: ellipsis;
    white-space: ${({ compactOnMobile }) =>
      compactOnMobile ? 'nowrap' : 'normal'};
  }
`;

export const ObjectRecordShowPageBreadcrumb = ({
  objectNameSingular,
  objectRecordId,
  objectLabel,
  labelIdentifierFieldMetadataItem,
  compactOnMobile = false,
  isRecordAvailable = true,
}: {
  objectNameSingular: string;
  objectRecordId: string;
  objectLabel: string;
  labelIdentifierFieldMetadataItem?: FieldMetadataItem;
  compactOnMobile?: boolean;
  isRecordAvailable?: boolean;
}) => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const { loading, hasReadPermission } = useFindOneRecord({
    objectNameSingular,
    objectRecordId,
    recordGqlFields: {
      [labelIdentifierFieldMetadataItem?.name ?? 'name']: true,
    },
  });

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { restrictedFields } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  const { useUpdateOneObjectRecordMutation } = useRecordShowContainerActions({
    objectNameSingular,
  });

  const isLabelIdentifierReadOnly = useIsRecordFieldReadOnly({
    recordId: objectRecordId,
    objectMetadataId: objectMetadataItem.id,
    fieldMetadataId: labelIdentifierFieldMetadataItem?.id ?? '',
  });

  const { navigateToIndexView, rankInView, totalCount } =
    useRecordShowPagePagination(objectNameSingular, objectRecordId);

  const { viewName, groupValueLabel, isGroupByActive, isGroupValueLoading } =
    useRecordShowPageGroupByBreadcrumbInfo({
      objectNameSingular,
      objectRecordId,
    });

  const { formatNumber } = useNumberFormat();

  const isCampaignReadDenied =
    objectNameSingular === 'campaign' &&
    (!hasReadPermission || !isRecordAvailable);
  const isCampaignNameReadDenied =
    objectNameSingular === 'campaign' &&
    (labelIdentifierFieldMetadataItem?.id === undefined ||
      restrictedFields[labelIdentifierFieldMetadataItem.id]?.canRead === false);

  const paginationInformation = isCampaignReadDenied
    ? ''
    : getRecordShowPageBreadcrumbPaginationLabel({
        rank: formatNumber(rankInView + 1),
        total: formatNumber(totalCount),
        isGroupByActive,
        viewName,
        isGroupValueLoading,
        groupValueLabel,
      });

  if (!loading && isInitialLoad) {
    setIsInitialLoad(false);
  }

  if (isInitialLoad && loading && isRecordAvailable) {
    return null;
  }

  return (
    <StyledEditableTitleContainer
      data-testid="top-bar-title"
      compactOnMobile={compactOnMobile}
    >
      <StyledEditableTitlePrefix
        aria-label={t`Back to ${objectLabel}`}
        role="button"
        tabIndex={0}
        onClick={() => navigateToIndexView()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            navigateToIndexView();
          }
        }}
      >
        <StyledBreadcrumbPrefixObjectIcon>
          <ObjectMetadataIcon objectMetadataItem={objectMetadataItem} />
        </StyledBreadcrumbPrefixObjectIcon>
        <StyledBreadcrumbPrefixLabel compactOnMobile={compactOnMobile}>
          {objectLabel}
          <span>{' / '}</span>
        </StyledBreadcrumbPrefixLabel>
      </StyledEditableTitlePrefix>
      <StyledTitle compactOnMobile={compactOnMobile}>
        {isCampaignReadDenied || isCampaignNameReadDenied ? (
          objectMetadataItem.labelSingular
        ) : (
          <FieldContext.Provider
            value={{
              recordId: objectRecordId,
              isLabelIdentifier: false,
              fieldDefinition: {
                type:
                  labelIdentifierFieldMetadataItem?.type ||
                  FieldMetadataType.TEXT,
                iconName: '',
                fieldMetadataId: labelIdentifierFieldMetadataItem?.id ?? '',
                label: labelIdentifierFieldMetadataItem?.label || '',
                metadata: {
                  fieldName: labelIdentifierFieldMetadataItem?.name || '',
                  objectMetadataNameSingular: objectNameSingular,
                },
                defaultValue: labelIdentifierFieldMetadataItem?.defaultValue,
              },
              useUpdateRecord: useUpdateOneObjectRecordMutation,
              isCentered: false,
              isDisplayModeFixHeight: true,
              isRecordFieldReadOnly: isLabelIdentifierReadOnly,
            }}
          >
            <RecordTitleCell
              sizeVariant="xs"
              containerType={RecordTitleCellContainerType.PageHeader}
            />
          </FieldContext.Provider>
        )}
      </StyledTitle>
      <StyledPaginationInformation
        compactOnMobile={compactOnMobile}
        title={compactOnMobile ? paginationInformation : undefined}
      >
        {paginationInformation}
      </StyledPaginationInformation>
    </StyledEditableTitleContainer>
  );
};
