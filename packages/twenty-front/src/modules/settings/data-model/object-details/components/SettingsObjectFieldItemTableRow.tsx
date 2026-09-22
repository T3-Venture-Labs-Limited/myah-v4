import { useGetRelationMetadata } from '@/object-metadata/hooks/useGetRelationMetadata';
import { isLabelIdentifierField } from '@/object-metadata/utils/isLabelIdentifierField';
import { SettingsItemTypeTag } from '@/settings/components/SettingsItemTypeTag';
import { SettingsNameCellSecondaryLabel } from '@/settings/components/SettingsNameCellSecondaryLabel';
import { RELATION_TYPES } from '@/settings/data-model/constants/RelationTypes';
import { settingsObjectFieldsFamilyState } from '@/settings/data-model/object-details/states/settingsObjectFieldsFamilyState';
import { isFieldTypeSupportedInSettings } from '@/settings/data-model/utils/isFieldTypeSupportedInSettings';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { useContext, useMemo } from 'react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { useSetAtomFamilyState } from '@/ui/utilities/state/jotai/hooks/useSetAtomFamilyState';
import { FieldMetadataType, SettingsPath } from 'twenty-shared/types';
import { getSettingsPath, isDefined } from 'twenty-shared/utils';
import { IconMinus, IconPlus, useIcons } from 'twenty-ui/icon';
import { LightIconButton } from 'twenty-ui/input';
import { ThemeContext, themeCssVariables } from 'twenty-ui/theme-constants';
import { RelationType } from '~/generated-metadata/graphql';
import { type SettingsObjectDetailTableItem } from '~/pages/settings/data-model/types/SettingsObjectDetailTableItem';
import { SettingsObjectFieldDataType } from './SettingsObjectFieldDataType';

type SettingsObjectFieldItemTableRowProps = {
  settingsObjectDetailTableItem: SettingsObjectDetailTableItem;
  status: 'active' | 'disabled';
  mode: 'view' | 'new-field';
};

export const OBJECT_FIELD_TABLE_ROW_GRID_TEMPLATE_COLUMNS =
  'minmax(0, 1fr) 148px 148px 36px';

const StyledNameContainer = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledNameLabel = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SettingsObjectFieldItemTableRow = ({
  settingsObjectDetailTableItem,
  mode,
  status,
}: SettingsObjectFieldItemTableRowProps) => {
  const { theme } = useContext(ThemeContext);
  const { t } = useLingui();
  const { fieldMetadataItem, objectMetadataItem } =
    settingsObjectDetailTableItem;

  const { getIcon } = useIcons();
  const Icon = getIcon(fieldMetadataItem.icon);

  const getRelationMetadata = useGetRelationMetadata();

  const { relationObjectMetadataItem, relationType } =
    useMemo(
      () => getRelationMetadata({ fieldMetadataItem }),
      [fieldMetadataItem, getRelationMetadata],
    ) ?? {};
  const fieldType = fieldMetadataItem.type;
  const isFieldTypeSupported = isFieldTypeSupportedInSettings(fieldType);

  const RelationIcon = relationType
    ? RELATION_TYPES[relationType].Icon
    : undefined;

  const isLabelIdentifier = isLabelIdentifierField({
    fieldMetadataItem,
    objectMetadataItem,
  });

  const canToggleField = !isLabelIdentifier;

  const setSettingsObjectFields = useSetAtomFamilyState(
    settingsObjectFieldsFamilyState,
    { objectMetadataItemId: objectMetadataItem.id },
  );

  const handleToggleField = () => {
    setSettingsObjectFields((previousFields) => {
      const newFields = isDefined(previousFields)
        ? previousFields?.map((field) =>
            field.id === fieldMetadataItem.id
              ? { ...field, isActive: !field.isActive }
              : field,
          )
        : null;

      return newFields;
    });
  };

  if (!isFieldTypeSupported) return null;

  const isRelatedObjectLinkable = isDefined(
    relationObjectMetadataItem?.namePlural,
  );

  const morphRelationCount = fieldMetadataItem.morphRelations?.length;
  const morphRelationLabel =
    fieldMetadataItem.type === FieldMetadataType.MORPH_RELATION
      ? t`${morphRelationCount} Objects`
      : undefined;

  const label = morphRelationLabel
    ? morphRelationLabel
    : relationType === RelationType.MANY_TO_ONE
      ? relationObjectMetadataItem?.labelSingular
      : relationObjectMetadataItem?.labelPlural;

  return (
    <TableRow
      gridTemplateColumns={OBJECT_FIELD_TABLE_ROW_GRID_TEMPLATE_COLUMNS}
    >
      <TableCell
        color={themeCssVariables.font.color.primary}
        gap={themeCssVariables.spacing[2]}
      >
        {isDefined(Icon) && (
          <Icon
            style={{
              minWidth: theme.icon.size.md,
            }}
            size={theme.icon.size.md}
            stroke={theme.icon.stroke.sm}
          />
        )}
        <StyledNameContainer>
          <StyledNameLabel title={fieldMetadataItem.label}>
            {fieldMetadataItem.label}
          </StyledNameLabel>
          {!fieldMetadataItem.isActive && (
            <SettingsNameCellSecondaryLabel>
              {t`Deactivated`}
            </SettingsNameCellSecondaryLabel>
          )}
        </StyledNameContainer>
      </TableCell>

      <TableCell>
        <SettingsItemTypeTag
          item={{
            applicationId: fieldMetadataItem.applicationId,
          }}
        />
      </TableCell>
      <TableCell>
        <SettingsObjectFieldDataType
          Icon={RelationIcon}
          label={label}
          labelDetail={
            fieldMetadataItem.settings?.type === 'percentage' ? '%' : undefined
          }
          to={
            isRelatedObjectLinkable
              ? getSettingsPath(SettingsPath.ObjectDetail, {
                  objectNamePlural: relationObjectMetadataItem.namePlural,
                })
              : undefined
          }
          value={fieldType}
          onClick={(e) => {
            if (isRelatedObjectLinkable) {
              e.stopPropagation();
            }
          }}
        />
      </TableCell>
      <TableCell
        align="center"
        padding={`0 ${themeCssVariables.spacing[1]} 0 ${themeCssVariables.spacing[2]}`}
      >
        {mode === 'new-field' && canToggleField && (
          <LightIconButton
            Icon={status === 'active' ? IconMinus : IconPlus}
            accent="tertiary"
            onClick={handleToggleField}
          />
        )}
      </TableCell>
    </TableRow>
  );
};
