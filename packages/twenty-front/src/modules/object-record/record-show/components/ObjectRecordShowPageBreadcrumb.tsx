import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { ObjectMetadataIcon } from '@/object-metadata/components/ObjectMetadataIcon';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useIsRecordFieldReadOnly } from '@/object-record/read-only/hooks/useIsRecordFieldReadOnly';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { useRecordShowContainerActions } from '@/object-record/record-show/hooks/useRecordShowContainerActions';
import { useRecordShowPageGroupByBreadcrumbInfo } from '@/object-record/record-show/hooks/useRecordShowPageGroupByBreadcrumbInfo';
import { useRecordShowPagePagination } from '@/object-record/record-show/hooks/useRecordShowPagePagination';
import { getRecordShowPageBreadcrumbPaginationLabel } from '@/object-record/record-show/utils/getRecordShowPageBreadcrumbPaginationLabel';
import { RecordTitleCell } from '@/object-record/record-title-cell/components/RecordTitleCell';
import { RecordTitleCellContainerType } from '@/object-record/record-title-cell/types/RecordTitleCellContainerType';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { FieldMetadataType } from 'twenty-shared/types';
import { IconChevronLeft } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledEditableTitleContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  overflow-x: hidden;
  width: 100%;
`;

const StyledEditableTitlePrefix = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  flex-direction: row;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledBreadcrumbPrefixObjectIcon = styled.div`
  display: flex;
  flex-shrink: 0;
  opacity: 0.64;
`;

const StyledCompactBackButton = styled.button`
  align-items: center;
  background: none;
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  display: flex;
  flex: 0 0 auto;
  padding: ${themeCssVariables.spacing[1]};

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.brand.focusRing};
  }
`;

const StyledTitle = styled.div<{ compactOnMobile: boolean }>`
  flex: ${({ compactOnMobile }) => (compactOnMobile ? '1 1 0' : 'initial')};
  max-width: 100%;
  min-width: ${({ compactOnMobile }) => (compactOnMobile ? '0' : 'auto')};
  overflow: hidden;
  width: fit-content;
`;

const StyledPaginationInformation = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

export const ObjectRecordShowPageBreadcrumb = ({
  objectNameSingular,
  objectRecordId,
  objectLabel,
  labelIdentifierFieldMetadataItem,
  compactOnMobile = false,
}: {
  objectNameSingular: string;
  objectRecordId: string;
  objectLabel: string;
  labelIdentifierFieldMetadataItem?: FieldMetadataItem;
  compactOnMobile?: boolean;
}) => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const { loading } = useFindOneRecord({
    objectNameSingular,
    objectRecordId,
    recordGqlFields: {
      [labelIdentifierFieldMetadataItem?.name ?? 'name']: true,
    },
  });

  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });

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

  const paginationInformation = getRecordShowPageBreadcrumbPaginationLabel({
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

  if (isInitialLoad && loading) {
    return null;
  }

  return (
    <StyledEditableTitleContainer data-testid="top-bar-title">
      {compactOnMobile ? (
        <StyledCompactBackButton
          type="button"
          aria-label={`Back to ${objectLabel}`}
          onClick={navigateToIndexView}
        >
          <IconChevronLeft size={themeCssVariables.icon.size.md} />
        </StyledCompactBackButton>
      ) : (
        <StyledEditableTitlePrefix onClick={navigateToIndexView}>
          <StyledBreadcrumbPrefixObjectIcon>
            <ObjectMetadataIcon objectMetadataItem={objectMetadataItem} />
          </StyledBreadcrumbPrefixObjectIcon>
          {objectLabel}
          <span>{' / '}</span>
        </StyledEditableTitlePrefix>
      )}
      <StyledTitle compactOnMobile={compactOnMobile}>
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
      </StyledTitle>
      {!compactOnMobile && (
        <StyledPaginationInformation>
          {paginationInformation}
        </StyledPaginationInformation>
      )}
    </StyledEditableTitleContainer>
  );
};
